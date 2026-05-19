import type { db as database } from "@acme/db/client";
import { and, desc, eq, gte, inArray, lte, sql } from "@acme/db";
import {
  ProzorroScanRun,
  ProzorroTenderSnapshot,
  RiskAlert,
  RiskSignal,
} from "@acme/db/schema";

import type {
  JsonRecord,
  ProzorroTenderData,
  ProzorroTenderSummary,
  ProzorroViolationReportData,
  TenderRiskSignal,
} from "./types";
import { buildRiskAlertDraft } from "./alerts";
import {
  fetchLatestTenderSummaries,
  fetchLatestViolationReportSummaries,
  fetchTenderDetails,
  fetchViolationReportDetails,
  getTenderPublicUrl,
} from "./prozorro-client";
import { analyzeTenderRisk, analyzeViolationReportMatch } from "./risk-rules";

type Database = typeof database;

const DEFAULT_SCAN_LIMIT = 80;
const DEFAULT_VIOLATION_REPORT_LIMIT = 100;
const SCAN_TTL_MS = 15 * 60 * 1000;
const SPLITTING_PERIOD_DAYS = 7;
const SPLITTING_VALUE_THRESHOLD = 500_000;
const SPLITTING_MIN_TENDERS = 3;
const REPEATED_SUPPLIER_PERIOD_DAYS = 30;
const REPEATED_SUPPLIER_MIN_TENDERS = 3;

let backgroundScanPromise: Promise<unknown> | null = null;

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumericString(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : null;
}

function numericStringToNumber(value: string | null) {
  if (!value) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getAwardSuppliers(tender: ProzorroTenderData) {
  const suppliers = new Map<
    string,
    { supplierId: string; supplierName: string | null }
  >();

  for (const award of tender.awards ?? []) {
    if (
      award.status &&
      award.status !== "active" &&
      award.status !== "successful"
    ) {
      continue;
    }

    for (const supplier of award.suppliers ?? []) {
      const supplierId = supplier.identifier?.id?.trim();
      if (!supplierId) continue;

      suppliers.set(supplierId, {
        supplierId,
        supplierName: supplier.name ?? null,
      });
    }
  }

  return [...suppliers.values()];
}

function getCpvPrefix(tender: ProzorroTenderData) {
  const cpv = tender.items?.[0]?.classification?.id;
  return cpv?.slice(0, 2) ?? null;
}

function getSnapshotValues(tender: ProzorroTenderData) {
  const buyer = tender.buyer ?? tender.procuringEntity;
  const buyerAddress = buyer?.address;

  return {
    tenderUid: tender.id ?? tender.tenderID ?? crypto.randomUUID(),
    tenderId: tender.tenderID ?? null,
    dateModified: parseDate(tender.dateModified),
    publicModified: parseDate(tender.publicModified),
    buyerId: buyer?.identifier?.id ?? null,
    buyerName: buyer?.name ?? null,
    buyerRegion: buyerAddress?.region ?? null,
    buyerLocality: buyerAddress?.locality ?? null,
    procurementMethodType: tender.procurementMethodType ?? null,
    status: tender.status ?? null,
    cpvPrefix: getCpvPrefix(tender),
    valueAmount: asNumericString(tender.value?.amount),
    valueCurrency: tender.value?.currency ?? null,
    rawJson: tender as JsonRecord,
    analyzedAt: new Date(),
  };
}

type TenderSnapshotValues = ReturnType<typeof getSnapshotValues>;

function summaryDate(summaryDateModified: string | undefined) {
  const date = parseDate(summaryDateModified);
  return date?.toISOString() ?? null;
}

function upsertSummary(
  summariesByUid: Map<string, ProzorroTenderSummary>,
  summary: ProzorroTenderSummary,
) {
  const current = summariesByUid.get(summary.id);
  if (!current) {
    summariesByUid.set(summary.id, summary);
    return;
  }

  const currentDate = parseDate(current.dateModified)?.getTime() ?? 0;
  const nextDate = parseDate(summary.dateModified)?.getTime() ?? 0;
  if (nextDate > currentDate) {
    summariesByUid.set(summary.id, summary);
  }
}

async function fetchStrongViolationReports(limit: number) {
  try {
    const summaries = await fetchLatestViolationReportSummaries(limit);
    const reports: ProzorroViolationReportData[] = [];

    for (const summary of summaries) {
      try {
        const report = await fetchViolationReportDetails(summary.id);
        if (report.tender_id && analyzeViolationReportMatch(report)) {
          reports.push(report);
        }
      } catch {
        continue;
      }
    }

    return reports;
  } catch {
    return [];
  }
}

function buildProcurementSplittingSignal(
  snapshot: TenderSnapshotValues,
  relatedSnapshots: {
    tenderUid: string;
    tenderId: string | null;
    buyerId: string | null;
    buyerName: string | null;
    cpvPrefix: string | null;
    valueAmount: string | null;
    dateModified: Date | null;
  }[],
) {
  const eligibleSnapshots = relatedSnapshots
    .map((item) => ({
      ...item,
      valueAmountNumber: numericStringToNumber(item.valueAmount),
    }))
    .filter(
      (item) =>
        item.valueAmountNumber > 0 &&
        item.valueAmountNumber < SPLITTING_VALUE_THRESHOLD,
    );
  const groupTotalValue = eligibleSnapshots.reduce(
    (sum, item) => sum + item.valueAmountNumber,
    0,
  );

  if (
    eligibleSnapshots.length < SPLITTING_MIN_TENDERS ||
    groupTotalValue < SPLITTING_VALUE_THRESHOLD ||
    !eligibleSnapshots.some((item) => item.tenderUid === snapshot.tenderUid)
  ) {
    return null;
  }

  return {
    code: "PROCUREMENT_SPLITTING",
    severity: "high",
    score: 76,
    title: "Можливе дроблення закупівлі",
    explanation:
      "Один замовник має кілька малих закупівель з однаковим CPV prefix у короткий період, а їх сумарна вартість переходить MVP поріг ризику.",
    evidence: {
      tenderId: snapshot.tenderId,
      buyerId: snapshot.buyerId,
      buyerName: snapshot.buyerName,
      cpvPrefix: snapshot.cpvPrefix,
      periodDays: SPLITTING_PERIOD_DAYS,
      groupCount: eligibleSnapshots.length,
      groupTotalValue: Number(groupTotalValue.toFixed(2)),
      currentValueAmount: numericStringToNumber(snapshot.valueAmount),
      threshold: SPLITTING_VALUE_THRESHOLD,
      relatedTenderIds: eligibleSnapshots
        .map((item) => item.tenderId)
        .filter((id): id is string => Boolean(id)),
      relatedTenderUids: eligibleSnapshots.map((item) => item.tenderUid),
    },
  } satisfies TenderRiskSignal;
}

async function findProcurementSplittingSignal(
  db: Database,
  snapshot: TenderSnapshotValues,
) {
  const currentValue = numericStringToNumber(snapshot.valueAmount);
  if (
    !snapshot.buyerId ||
    !snapshot.cpvPrefix ||
    !snapshot.dateModified ||
    currentValue <= 0 ||
    currentValue >= SPLITTING_VALUE_THRESHOLD
  ) {
    return null;
  }

  const periodStart = new Date(snapshot.dateModified);
  periodStart.setDate(periodStart.getDate() - SPLITTING_PERIOD_DAYS);
  const periodEnd = new Date(snapshot.dateModified);
  periodEnd.setDate(periodEnd.getDate() + SPLITTING_PERIOD_DAYS);

  const relatedSnapshots = await db.query.ProzorroTenderSnapshot.findMany({
    where: and(
      eq(ProzorroTenderSnapshot.buyerId, snapshot.buyerId),
      eq(ProzorroTenderSnapshot.cpvPrefix, snapshot.cpvPrefix),
      gte(ProzorroTenderSnapshot.dateModified, periodStart),
      lte(ProzorroTenderSnapshot.dateModified, periodEnd),
    ),
    orderBy: desc(ProzorroTenderSnapshot.dateModified),
    limit: 25,
  });

  return buildProcurementSplittingSignal(snapshot, relatedSnapshots);
}

function buildRepeatedBuyerSupplierSignal(
  snapshot: TenderSnapshotValues,
  relatedSnapshots: {
    tenderUid: string;
    tenderId: string | null;
    buyerId: string | null;
    buyerName: string | null;
    cpvPrefix: string | null;
    valueAmount: string | null;
    dateModified: Date | null;
    rawJson: Record<string, unknown>;
  }[],
) {
  const currentSuppliers = getAwardSuppliers(snapshot.rawJson);
  if (!currentSuppliers.length) return null;

  const candidates = currentSuppliers
    .map((supplier) => {
      const group = relatedSnapshots
        .filter((item) =>
          getAwardSuppliers(item.rawJson).some(
            (candidate) => candidate.supplierId === supplier.supplierId,
          ),
        )
        .map((item) => ({
          ...item,
          valueAmountNumber: numericStringToNumber(item.valueAmount),
        }));
      const groupTotalValue = group.reduce(
        (sum, item) => sum + item.valueAmountNumber,
        0,
      );
      const sameCpvCount = group.filter(
        (item) => item.cpvPrefix && item.cpvPrefix === snapshot.cpvPrefix,
      ).length;

      return {
        ...supplier,
        group,
        groupTotalValue,
        sameCpvCount,
      };
    })
    .filter(
      (candidate) => candidate.group.length >= REPEATED_SUPPLIER_MIN_TENDERS,
    )
    .sort((left, right) => {
      const countDelta = right.group.length - left.group.length;
      return (
        countDelta ||
        right.sameCpvCount - left.sameCpvCount ||
        right.groupTotalValue - left.groupTotalValue
      );
    });

  const strongest = candidates[0];
  if (!strongest) return null;

  return {
    code: "REPEATED_BUYER_SUPPLIER",
    severity: strongest.sameCpvCount >= 3 ? "high" : "medium",
    score: strongest.sameCpvCount >= 3 ? 72 : 62,
    title: "Повторюваний зв'язок замовник-постачальник",
    explanation:
      "Один замовник має щонайменше три закупівлі з тим самим постачальником за короткий період, що потребує додаткової перевірки.",
    evidence: {
      tenderId: snapshot.tenderId,
      buyerId: snapshot.buyerId,
      buyerName: snapshot.buyerName,
      supplierId: strongest.supplierId,
      supplierName: strongest.supplierName,
      periodDays: REPEATED_SUPPLIER_PERIOD_DAYS,
      groupCount: strongest.group.length,
      sameCpvCount: strongest.sameCpvCount,
      groupTotalValue: Number(strongest.groupTotalValue.toFixed(2)),
      currentCpvPrefix: snapshot.cpvPrefix,
      cpvPrefixes: [
        ...new Set(
          strongest.group
            .map((item) => item.cpvPrefix)
            .filter((prefix): prefix is string => Boolean(prefix)),
        ),
      ],
      relatedTenderIds: strongest.group
        .map((item) => item.tenderId)
        .filter((id): id is string => Boolean(id)),
      relatedTenderUids: strongest.group.map((item) => item.tenderUid),
    },
  } satisfies TenderRiskSignal;
}

async function findRepeatedBuyerSupplierSignal(
  db: Database,
  snapshot: TenderSnapshotValues,
) {
  if (
    !snapshot.buyerId ||
    !snapshot.dateModified ||
    !getAwardSuppliers(snapshot.rawJson).length
  ) {
    return null;
  }

  const periodStart = new Date(snapshot.dateModified);
  periodStart.setDate(periodStart.getDate() - REPEATED_SUPPLIER_PERIOD_DAYS);
  const periodEnd = new Date(snapshot.dateModified);

  const relatedSnapshots = await db.query.ProzorroTenderSnapshot.findMany({
    where: and(
      eq(ProzorroTenderSnapshot.buyerId, snapshot.buyerId),
      gte(ProzorroTenderSnapshot.dateModified, periodStart),
      lte(ProzorroTenderSnapshot.dateModified, periodEnd),
    ),
    orderBy: desc(ProzorroTenderSnapshot.dateModified),
    limit: 100,
  });

  return buildRepeatedBuyerSupplierSignal(snapshot, relatedSnapshots);
}

export async function getLastCompletedScan(db: Database) {
  return db.query.ProzorroScanRun.findFirst({
    where: eq(ProzorroScanRun.status, "completed"),
    orderBy: desc(ProzorroScanRun.finishedAt),
  });
}

export async function getRecentRunningScan(db: Database) {
  return db.query.ProzorroScanRun.findFirst({
    where: and(
      eq(ProzorroScanRun.status, "running"),
      gte(ProzorroScanRun.startedAt, new Date(Date.now() - SCAN_TTL_MS)),
    ),
    orderBy: desc(ProzorroScanRun.startedAt),
  });
}

export async function shouldStartScan(db: Database) {
  const lastScan = await getLastCompletedScan(db);
  if (!lastScan?.finishedAt) return true;

  return Date.now() - lastScan.finishedAt.getTime() > SCAN_TTL_MS;
}

export async function scanProzorroRiskSignals(
  db: Database,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? DEFAULT_SCAN_LIMIT;
  const [scanRun] = await db
    .insert(ProzorroScanRun)
    .values({ scanLimit: limit, status: "running" })
    .returning();

  if (!scanRun) {
    throw new Error("Failed to create Prozorro scan run");
  }

  try {
    const [tenderSummaries, violationReports] = await Promise.all([
      fetchLatestTenderSummaries(limit),
      fetchStrongViolationReports(DEFAULT_VIOLATION_REPORT_LIMIT),
    ]);
    const summariesByUid = new Map<string, ProzorroTenderSummary>();
    for (const summary of tenderSummaries) {
      upsertSummary(summariesByUid, summary);
    }

    const violationReportsByTenderUid = new Map<
      string,
      ProzorroViolationReportData[]
    >();
    for (const report of violationReports) {
      if (!report.tender_id) continue;

      upsertSummary(summariesByUid, {
        id: report.tender_id,
        dateModified: report.dateModified,
      });

      const current = violationReportsByTenderUid.get(report.tender_id) ?? [];
      current.push(report);
      violationReportsByTenderUid.set(report.tender_id, current);
    }

    const summaries = [...summariesByUid.values()];
    const tenderUids = summaries.map((summary) => summary.id).filter(Boolean);
    const existingSnapshots = tenderUids.length
      ? await db.query.ProzorroTenderSnapshot.findMany({
          where: inArray(ProzorroTenderSnapshot.tenderUid, tenderUids),
        })
      : [];
    const existingByUid = new Map(
      existingSnapshots.map((snapshot) => [snapshot.tenderUid, snapshot]),
    );

    let fetchedCount = 0;
    let analyzedCount = 0;
    let signalCount = 0;
    const analyzedSnapshots: TenderSnapshotValues[] = [];
    const signalsByTenderUid = new Map<string, TenderRiskSignal[]>();

    for (const summary of summaries) {
      const existing = existingByUid.get(summary.id);
      const existingModified = existing?.dateModified?.toISOString() ?? null;
      if (existing && existingModified === summaryDate(summary.dateModified)) {
        continue;
      }

      const tender = await fetchTenderDetails(summary.id);
      fetchedCount += 1;

      const snapshot = getSnapshotValues(tender);
      await db
        .insert(ProzorroTenderSnapshot)
        .values(snapshot)
        .onConflictDoUpdate({
          target: ProzorroTenderSnapshot.tenderUid,
          set: {
            ...snapshot,
            updatedAt: sql`now()`,
          },
        });

      analyzedCount += 1;
      analyzedSnapshots.push(snapshot);
      await db
        .delete(RiskSignal)
        .where(eq(RiskSignal.tenderUid, snapshot.tenderUid));

      const violationSignals = (
        violationReportsByTenderUid.get(snapshot.tenderUid) ?? []
      )
        .map((report) => analyzeViolationReportMatch(report))
        .filter((signal): signal is NonNullable<typeof signal> =>
          Boolean(signal),
        );
      const signals = [...analyzeTenderRisk(tender), ...violationSignals];
      signalsByTenderUid.set(snapshot.tenderUid, signals);
    }

    for (const snapshot of analyzedSnapshots) {
      const splittingSignal = await findProcurementSplittingSignal(
        db,
        snapshot,
      );
      const repeatedSupplierSignal = await findRepeatedBuyerSupplierSignal(
        db,
        snapshot,
      );
      const historicalSignals: TenderRiskSignal[] = [];
      if (splittingSignal) historicalSignals.push(splittingSignal);
      if (repeatedSupplierSignal) {
        historicalSignals.push(repeatedSupplierSignal);
      }
      if (!historicalSignals.length) continue;

      const currentSignals = signalsByTenderUid.get(snapshot.tenderUid) ?? [];
      signalsByTenderUid.set(snapshot.tenderUid, [
        ...currentSignals,
        ...historicalSignals,
      ]);
    }

    for (const snapshot of analyzedSnapshots) {
      const signals = signalsByTenderUid.get(snapshot.tenderUid) ?? [];
      if (!signals.length) continue;

      await db.insert(RiskSignal).values(
        signals.map((signal) => ({
          scanRunId: scanRun.id,
          tenderUid: snapshot.tenderUid,
          tenderId: snapshot.tenderId,
          code: signal.code,
          severity: signal.severity,
          score: signal.score,
          title: signal.title,
          explanation: signal.explanation,
          evidenceJson: signal.evidence,
          buyerName: snapshot.buyerName,
          buyerRegion: snapshot.buyerRegion,
          buyerLocality: snapshot.buyerLocality,
          valueAmount: snapshot.valueAmount,
          valueCurrency: snapshot.valueCurrency,
          procurementMethodType: snapshot.procurementMethodType,
          prozorroUrl: getTenderPublicUrl(snapshot.tenderUid),
        })),
      );
      signalCount += signals.length;

      const alertDraft = buildRiskAlertDraft({
        tenderUid: snapshot.tenderUid,
        tenderId: snapshot.tenderId,
        buyerName: snapshot.buyerName,
        region: snapshot.buyerRegion,
        valueAmount: numericStringToNumber(snapshot.valueAmount),
        prozorroUrl: getTenderPublicUrl(snapshot.tenderUid),
        signals,
      });
      if (alertDraft) {
        await db
          .insert(RiskAlert)
          .values({
            scanRunId: scanRun.id,
            tenderUid: snapshot.tenderUid,
            tenderId: snapshot.tenderId,
            status: alertDraft.status,
            recipient: alertDraft.recipient,
            testRecipientEmail: alertDraft.testRecipientEmail,
            subject: alertDraft.subject,
            body: alertDraft.body,
            riskScore: alertDraft.riskScore,
            severity: alertDraft.severity,
            signalCount: alertDraft.signalCount,
            evidenceJson: alertDraft.evidenceJson,
          })
          .onConflictDoUpdate({
            target: [RiskAlert.scanRunId, RiskAlert.tenderUid],
            set: {
              status: alertDraft.status,
              recipient: alertDraft.recipient,
              testRecipientEmail: alertDraft.testRecipientEmail,
              subject: alertDraft.subject,
              body: alertDraft.body,
              riskScore: alertDraft.riskScore,
              severity: alertDraft.severity,
              signalCount: alertDraft.signalCount,
              evidenceJson: alertDraft.evidenceJson,
              updatedAt: sql`now()`,
            },
          });
      }
    }

    const [completedRun] = await db
      .update(ProzorroScanRun)
      .set({
        finishedAt: new Date(),
        status: "completed",
        scannedCount: summaries.length,
        fetchedCount,
        analyzedCount,
        signalCount,
      })
      .where(eq(ProzorroScanRun.id, scanRun.id))
      .returning();

    return completedRun ?? scanRun;
  } catch (error) {
    await db
      .update(ProzorroScanRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown scan error",
      })
      .where(eq(ProzorroScanRun.id, scanRun.id));

    throw error;
  }
}

export async function ensureFreshProzorroScan(db: Database) {
  if (await shouldStartScan(db)) {
    const runningScan = await getRecentRunningScan(db);
    if (runningScan) {
      return (await getLastCompletedScan(db)) ?? runningScan;
    }

    return scanProzorroRiskSignals(db);
  }

  return getLastCompletedScan(db);
}

export function refreshProzorroScanInBackground(db: Database) {
  if (backgroundScanPromise) return backgroundScanPromise;

  backgroundScanPromise = ensureFreshProzorroScan(db)
    .catch((error: unknown) => {
      console.error(
        "Background Prozorro scan failed",
        error instanceof Error ? error.message : error,
      );
    })
    .finally(() => {
      backgroundScanPromise = null;
    });

  return backgroundScanPromise;
}
