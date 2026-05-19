import type { db as database } from "@acme/db/client";
import { and, desc, gte, inArray, lt } from "@acme/db";
import { ProzorroScanRun, RiskAlert, RiskSignal } from "@acme/db/schema";

import type { RiskPeriod, RiskSeverity, RiskSignalCode } from "./types";
import { asRiskAlertStatus, buildRiskAlertDraft } from "./alerts";
import { resolveLocation } from "./geo";
import { recencyMultiplier, severityWeight, valueBoost } from "./risk-scoring";

type Database = typeof database;
type RiskConfidence = "low" | "medium" | "high";
const MAX_ANALYZED_PROCUREMENTS = 120;

const periodLabels: Record<RiskPeriod, string> = {
  today: "Сьогодні",
  yesterday: "Вчора",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getPeriodRange(period: RiskPeriod) {
  const now = new Date();
  const today = startOfDay(now);

  if (period === "today") return { since: today, until: null };
  if (period === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { since: yesterday, until: today };
  }
  if (period === "week") {
    const since = new Date(now);
    since.setDate(since.getDate() - 7);
    return { since, until: null };
  }
  if (period === "month") {
    const since = new Date(now);
    since.setMonth(since.getMonth() - 1);
    return { since, until: null };
  }
  if (period === "year") {
    const since = new Date(now);
    since.setFullYear(since.getFullYear() - 1);
    return { since, until: null };
  }

  return { since: null, until: null };
}

function getSignalWhere(period: RiskPeriod, signalCodes: RiskSignalCode[]) {
  const range = getPeriodRange(period);
  const rangeWhere = getSignalWhereForRange(range);
  const codeWhere = signalCodes.length
    ? inArray(RiskSignal.code, signalCodes)
    : undefined;

  if (rangeWhere && codeWhere) return and(rangeWhere, codeWhere);
  return rangeWhere ?? codeWhere;
}

function getSignalWhereForRange(range: {
  since: Date | null;
  until: Date | null;
}) {
  if (range.since && range.until) {
    return and(
      gte(RiskSignal.createdAt, range.since),
      lt(RiskSignal.createdAt, range.until),
    );
  }
  if (range.since) {
    return gte(RiskSignal.createdAt, range.since);
  }
  return undefined;
}

function getPreviousSignalWhere(
  period: RiskPeriod,
  signalCodes: RiskSignalCode[],
) {
  if (period === "all") return null;

  const range = getPeriodRange(period);
  if (!range.since) return null;

  const until = range.since;
  const currentUntil = range.until ?? new Date();
  const durationMs = currentUntil.getTime() - range.since.getTime();
  const since = new Date(until.getTime() - durationMs);

  const rangeWhere = getSignalWhereForRange({ since, until });
  const codeWhere = signalCodes.length
    ? inArray(RiskSignal.code, signalCodes)
    : undefined;

  if (rangeWhere && codeWhere) return and(rangeWhere, codeWhere);
  return rangeWhere ?? codeWhere;
}

function valueAsNumber(value: string | null) {
  if (!value) return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function asSeverity(value: string): RiskSeverity {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
  ) {
    return value;
  }

  return "low";
}

const confidenceWeight: Record<RiskConfidence, number> = {
  low: 0.62,
  medium: 0.82,
  high: 1,
};

const signalTypeWeight: Record<string, number> = {
  VIOLATION_REPORT_MATCH: 1.28,
  PROCUREMENT_SPLITTING: 1.18,
  REPEATED_BUYER_SUPPLIER: 1.08,
  HIGH_VALUE_DIRECT: 1.05,
  LOW_COMPETITION: 0.98,
  RISKY_CANCELLATION: 0.92,
  COMPLAINT_ACTIVITY: 0.8,
  LOW_SAVINGS: 0.55,
};

function evidenceNumber(evidence: Record<string, unknown>, key: string) {
  const value = evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evidenceStrings(evidence: Record<string, unknown>, key: string) {
  const value = evidence[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function signalConfidence(
  code: string,
  evidence: Record<string, unknown>,
): RiskConfidence {
  if (code === "VIOLATION_REPORT_MATCH") {
    const resolutions = evidenceStrings(evidence, "decisionResolutions");
    return evidence.reportStatus === "satisfied" ||
      resolutions.includes("satisfied")
      ? "high"
      : "medium";
  }

  if (code === "PROCUREMENT_SPLITTING") {
    const groupCount = evidenceNumber(evidence, "groupCount") ?? 0;
    const groupTotalValue = evidenceNumber(evidence, "groupTotalValue") ?? 0;
    const threshold = evidenceNumber(evidence, "threshold") ?? 500_000;
    return groupCount >= 3 && groupTotalValue >= threshold ? "high" : "medium";
  }

  if (code === "REPEATED_BUYER_SUPPLIER") {
    const groupCount = evidenceNumber(evidence, "groupCount") ?? 0;
    const sameCpvCount = evidenceNumber(evidence, "sameCpvCount") ?? 0;
    const groupTotalValue = evidenceNumber(evidence, "groupTotalValue") ?? 0;
    return groupCount >= 3 && (sameCpvCount >= 3 || groupTotalValue >= 500_000)
      ? "high"
      : "medium";
  }

  if (code === "HIGH_VALUE_DIRECT") return "high";
  if (code === "LOW_COMPETITION") return "medium";
  if (code === "RISKY_CANCELLATION") return "medium";

  if (code === "COMPLAINT_ACTIVITY") {
    return evidenceStrings(evidence, "statuses").includes("satisfied")
      ? "high"
      : "medium";
  }

  if (code === "LOW_SAVINGS") {
    const numberOfBids = evidenceNumber(evidence, "numberOfBids");
    const awardRatio = evidenceNumber(evidence, "awardRatio") ?? 0;
    return numberOfBids !== null && numberOfBids <= 2 && awardRatio >= 0.995
      ? "medium"
      : "low";
  }

  return "low";
}

function adjustedSignalScore(input: {
  code: string;
  score: number;
  evidence: Record<string, unknown>;
  valueAmount: number;
}) {
  const confidence = signalConfidence(input.code, input.evidence);
  const typeWeight = signalTypeWeight[input.code] ?? 0.75;
  return Math.min(
    100,
    (input.score + valueBoost(input.valueAmount)) *
      typeWeight *
      confidenceWeight[confidence],
  );
}

function computeRiskIndex(
  signals: {
    code: string;
    score: number;
    evidenceJson: Record<string, unknown>;
    valueAmount: string | null;
    tenderUid: string;
  }[],
) {
  if (!signals.length) return 0;
  const adjustedScores = signals
    .map((signal) =>
      adjustedSignalScore({
        code: signal.code,
        score: signal.score,
        evidence: signal.evidenceJson,
        valueAmount: valueAsNumber(signal.valueAmount),
      }),
    )
    .sort((left, right) => right - left);
  const topScores = adjustedScores.slice(0, 10);
  const topAverage =
    topScores.reduce((sum, score) => sum + score, 0) / topScores.length;
  const overallAverage =
    adjustedScores.reduce((sum, score) => sum + score, 0) /
    adjustedScores.length;
  const uniqueTenderCount = new Set(signals.map((signal) => signal.tenderUid))
    .size;
  const volumeBoost = Math.min(8, Math.log10(uniqueTenderCount + 1) * 5);
  const strongSignalBoost = Math.min(
    8,
    signals.filter(
      (signal) =>
        signal.code === "VIOLATION_REPORT_MATCH" ||
        signal.code === "PROCUREMENT_SPLITTING" ||
        signal.code === "REPEATED_BUYER_SUPPLIER",
    ).length * 2,
  );

  return Math.min(
    100,
    Math.round(
      topAverage * 0.65 +
        overallAverage * 0.25 +
        volumeBoost +
        strongSignalBoost,
    ),
  );
}

export async function getRiskDashboard(
  db: Database,
  period: RiskPeriod,
  signalCodes: RiskSignalCode[] = [],
) {
  const uniqueSignalCodes = [...new Set(signalCodes)];
  const previousSignalWhere = getPreviousSignalWhere(period, uniqueSignalCodes);
  const [signals, previousSignals, scanHistory, alertHistory] =
    await Promise.all([
      db.query.RiskSignal.findMany({
        where: getSignalWhere(period, uniqueSignalCodes),
        orderBy: desc(RiskSignal.createdAt),
        limit: 500,
      }),
      previousSignalWhere === null
        ? Promise.resolve([])
        : db.query.RiskSignal.findMany({
            where: previousSignalWhere,
            orderBy: desc(RiskSignal.createdAt),
            limit: 500,
          }),
      db.query.ProzorroScanRun.findMany({
        orderBy: desc(ProzorroScanRun.startedAt),
        limit: 8,
      }),
      db.query.RiskAlert.findMany({
        orderBy: desc(RiskAlert.createdAt),
        limit: 500,
      }),
    ]);
  const latestAlertByTender = new Map(
    alertHistory.map((alert) => [alert.tenderUid, alert]),
  );

  const severityDistribution: Record<RiskSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const regionScores = new Map<
    string,
    {
      region: string;
      score: number;
      signalCount: number;
      valueAmount: number;
      lastSignalAt: Date;
      weightSum: number;
      lat: number;
      lon: number;
    }
  >();
  const tenderScores = new Map<
    string,
    {
      tenderUid: string;
      tenderId: string | null;
      buyerName: string | null;
      region: string | null;
      score: number;
      signalCount: number;
      valueAmount: number;
      prozorroUrl: string | null;
      lastSignalAt: Date;
      weightSum: number;
      detectedSignals: {
        id: string;
        code: string;
        title: string;
        severity: RiskSeverity;
        score: number;
        explanation: string;
        evidence: Record<string, unknown>;
        createdAt: Date;
        confidence: RiskConfidence;
      }[];
    }
  >();
  const activity = new Map<string, number>();

  for (const signal of signals) {
    const severity = asSeverity(signal.severity);
    severityDistribution[severity] += 1;

    const dateKey = signal.createdAt.toISOString().slice(0, 10);
    activity.set(dateKey, (activity.get(dateKey) ?? 0) + 1);

    const location = resolveLocation({
      region: signal.buyerRegion,
      locality: signal.buyerLocality,
    });
    if (location) {
      const signalValue = valueAsNumber(signal.valueAmount);
      const adjustedScore = adjustedSignalScore({
        code: signal.code,
        score: signal.score,
        evidence: signal.evidenceJson,
        valueAmount: signalValue,
      });
      const weight =
        severityWeight[severity] * recencyMultiplier(signal.createdAt);
      const region = location.region;
      const current = regionScores.get(region) ?? {
        region,
        score: 0,
        signalCount: 0,
        valueAmount: 0,
        lastSignalAt: signal.createdAt,
        weightSum: 0,
        lat: location.lat,
        lon: location.lon,
      };
      current.signalCount += 1;
      current.score += adjustedScore * weight;
      current.weightSum += weight;
      current.valueAmount += signalValue;
      if (signal.createdAt > current.lastSignalAt)
        current.lastSignalAt = signal.createdAt;
      regionScores.set(region, current);
    }

    const tender = tenderScores.get(signal.tenderUid) ?? {
      tenderUid: signal.tenderUid,
      tenderId: signal.tenderId,
      buyerName: signal.buyerName,
      region: signal.buyerRegion,
      score: 0,
      signalCount: 0,
      valueAmount: valueAsNumber(signal.valueAmount),
      prozorroUrl: signal.prozorroUrl,
      lastSignalAt: signal.createdAt,
      weightSum: 0,
      detectedSignals: [],
    };
    const tenderValue = valueAsNumber(signal.valueAmount);
    const adjustedScore = adjustedSignalScore({
      code: signal.code,
      score: signal.score,
      evidence: signal.evidenceJson,
      valueAmount: tenderValue,
    });
    const tenderWeight =
      severityWeight[severity] * recencyMultiplier(signal.createdAt);
    tender.score += adjustedScore * tenderWeight;
    tender.weightSum += tenderWeight;
    tender.signalCount += 1;
    tender.lastSignalAt =
      signal.createdAt > tender.lastSignalAt
        ? signal.createdAt
        : tender.lastSignalAt;
    tender.detectedSignals.push({
      id: signal.id,
      code: signal.code,
      title: signal.title,
      severity,
      score: signal.score,
      explanation: signal.explanation,
      evidence: signal.evidenceJson,
      createdAt: signal.createdAt,
      confidence: signalConfidence(signal.code, signal.evidenceJson),
    });
    tenderScores.set(signal.tenderUid, tender);
  }

  const previousRegionScores = new Map<
    string,
    { region: string; score: number; weightSum: number; valueAmount: number }
  >();
  for (const signal of previousSignals) {
    const location = resolveLocation({
      region: signal.buyerRegion,
      locality: signal.buyerLocality,
    });
    if (!location) continue;

    const severity = asSeverity(signal.severity);
    const signalValue = valueAsNumber(signal.valueAmount);
    const adjustedScore = adjustedSignalScore({
      code: signal.code,
      score: signal.score,
      evidence: signal.evidenceJson,
      valueAmount: signalValue,
    });
    const weight =
      severityWeight[severity] * recencyMultiplier(signal.createdAt);
    const current = previousRegionScores.get(location.region) ?? {
      region: location.region,
      score: 0,
      weightSum: 0,
      valueAmount: 0,
    };
    current.score += adjustedScore * weight;
    current.weightSum += weight;
    current.valueAmount += signalValue;
    previousRegionScores.set(location.region, current);
  }
  const previousRegionRanks = new Map(
    [...previousRegionScores.values()]
      .map((region) => ({
        ...region,
        score: Math.min(
          100,
          Math.round(region.score / Math.max(1, region.weightSum)),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .map((region, index) => [region.region, index + 1]),
  );

  const regionalStatistics = [...regionScores.values()]
    .map((region) => ({
      ...region,
      score: Math.min(
        100,
        Math.round(region.score / Math.max(1, region.weightSum)),
      ),
    }))
    .sort((left, right) => right.score - left.score)
    .map((region, index) => {
      const rank = index + 1;
      const previousRank = previousRegionRanks.get(region.region) ?? null;
      const trendDelta = previousRank === null ? null : previousRank - rank;
      const trend: "new" | "up" | "down" | "flat" =
        trendDelta === null
          ? "new"
          : trendDelta > 0
            ? "up"
            : trendDelta < 0
              ? "down"
              : "flat";

      return {
        ...region,
        rank,
        trendDelta,
        trend,
      };
    })
    .slice(0, 10);

  const radarSignals = signals
    .map((signal) => {
      const location = resolveLocation({
        region: signal.buyerRegion,
        locality: signal.buyerLocality,
      });
      if (!location) return null;
      const city =
        "city" in location && typeof location.city === "string"
          ? location.city
          : location.region;

      return {
        id: signal.id,
        tenderUid: signal.tenderUid,
        city,
        region: location.region,
        lat: location.lat,
        lon: location.lon,
        severity: asSeverity(signal.severity),
        score: signal.score,
        title: signal.title,
        tenderId: signal.tenderId,
        buyerName: signal.buyerName,
        createdAt: signal.createdAt,
        isNew: Date.now() - signal.createdAt.getTime() <= 24 * 60 * 60 * 1000,
      };
    })
    .filter((signal): signal is NonNullable<typeof signal> => signal !== null)
    .slice(0, 80);

  const analyzedProcurements = [...tenderScores.values()]
    .map((tender) => {
      const score = Math.min(
        100,
        Math.round(tender.score / Math.max(1, tender.weightSum)),
      );
      const detectedSignals = tender.detectedSignals.sort(
        (left, right) => right.score - left.score,
      );
      const savedAlert = latestAlertByTender.get(tender.tenderUid);
      const fallbackAlert = buildRiskAlertDraft({
        tenderUid: tender.tenderUid,
        tenderId: tender.tenderId,
        buyerName: tender.buyerName,
        region: tender.region,
        valueAmount: tender.valueAmount,
        prozorroUrl: tender.prozorroUrl,
        signals: detectedSignals,
      });

      return {
        ...tender,
        score,
        detectedSignals,
        alertDraft: savedAlert
          ? {
              status: asRiskAlertStatus(savedAlert.status),
              recipient: savedAlert.recipient,
              subject: savedAlert.subject,
              body: savedAlert.body,
            }
          : fallbackAlert
            ? {
                status: fallbackAlert.status,
                recipient: fallbackAlert.recipient,
                subject: fallbackAlert.subject,
                body: fallbackAlert.body,
              }
            : null,
      };
    })
    .sort(
      (left, right) =>
        right.lastSignalAt.getTime() - left.lastSignalAt.getTime(),
    )
    .slice(0, MAX_ANALYZED_PROCUREMENTS);

  return {
    period,
    periodLabel: periodLabels[period],
    lastScan: scanHistory[0] ?? null,
    metrics: {
      scannedTenders: scanHistory[0]?.scannedCount ?? 0,
      fetchedTenders: scanHistory[0]?.fetchedCount ?? 0,
      analyzedTenders: scanHistory[0]?.analyzedCount ?? 0,
      riskSignals: signals.length,
      riskIndex: computeRiskIndex(signals),
    },
    latestDetections: signals.slice(0, 8).map((signal) => ({
      id: signal.id,
      createdAt: signal.createdAt,
      code: signal.code,
      severity: asSeverity(signal.severity),
      score: signal.score,
      title: signal.title,
      explanation: signal.explanation,
      tenderUid: signal.tenderUid,
      tenderId: signal.tenderId,
      buyerName: signal.buyerName,
      buyerRegion: signal.buyerRegion,
      buyerLocality: signal.buyerLocality,
      prozorroUrl: signal.prozorroUrl,
    })),
    severityDistribution,
    riskActivity: [...activity.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ date, count })),
    regionalStatistics,
    radarSignals,
    topRiskyTenders: [...tenderScores.values()]
      .map((tender) => ({
        ...tender,
        score: Math.min(
          100,
          Math.round(tender.score / Math.max(1, tender.weightSum)),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 8),
    analyzedProcurements,
    recentAnalyzedProcurements: analyzedProcurements.slice(0, 10),
    scanHistory: scanHistory.map((scan) => ({
      id: scan.id,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      status: scan.status,
      scannedCount: scan.scannedCount,
      fetchedCount: scan.fetchedCount,
      analyzedCount: scan.analyzedCount,
      signalCount: scan.signalCount,
      error: scan.error,
    })),
  };
}
