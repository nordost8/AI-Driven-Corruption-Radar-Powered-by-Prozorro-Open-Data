import assert from "node:assert/strict";
import test from "node:test";

import { and, desc, eq, inArray } from "@acme/db";
import { db, dbPool } from "@acme/db/client";
import {
  ProzorroScanRun,
  ProzorroTenderSnapshot,
  RiskAlert,
  RiskSignal,
} from "@acme/db/schema";

import type { ProzorroTenderData } from "./types";
import { getRiskDashboard } from "./analytics";
import {
  ensureFreshProzorroScan,
  scanProzorroRiskSignals,
  shouldStartScan,
} from "./scanner";

function toFetchUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

void test("Prozorro risk scan behaves like a dashboard user flow and writes DB artifacts", async (t) => {
  const originalFetch = globalThis.fetch;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenderUid = `it-risk-${suffix}`;
  const tenderId = `UA-IT-${suffix}`;
  const relatedTenderUid1 = `it-related-1-${suffix}`;
  const relatedTenderUid2 = `it-related-2-${suffix}`;
  const relatedTenderId1 = `UA-IT-RELATED-1-${suffix}`;
  const relatedTenderId2 = `UA-IT-RELATED-2-${suffix}`;
  const violationReportUid = `it-report-${suffix}`;
  const violationReportId = `UA-D-IT-${suffix}`;
  const supplierId = `SUPPLIER-${suffix.slice(0, 8)}`;
  const supplierName = "Тестовий повторюваний постачальник";
  const dateModified = "2026-05-14T08:30:00.000Z";
  const scanRunIds: string[] = [];
  const calls: string[] = [];

  const tender: ProzorroTenderData = {
    id: tenderUid,
    tenderID: tenderId,
    dateModified,
    publicModified: dateModified,
    status: "active.auction",
    procurementMethodType: "aboveThresholdUA",
    numberOfBids: 1,
    value: { amount: 220_000, currency: "UAH" },
    buyer: {
      name: "Інтеграційний тестовий замовник",
      identifier: { id: `EDRPOU-${suffix.slice(0, 8)}` },
      address: {
        region: "Харківська область",
        locality: "Харків",
      },
    },
    awards: [
      {
        status: "active",
        value: { amount: 219_000, currency: "UAH" },
        suppliers: [
          {
            name: supplierName,
            identifier: { id: supplierId },
          },
        ],
        complaints: [{ id: "award-complaint-1", status: "accepted" }],
      },
    ],
    complaints: [{ id: "complaint-1", status: "pending" }],
    items: [{ classification: { id: "45000000-7" } }],
  };

  await db.insert(ProzorroTenderSnapshot).values([
    {
      tenderUid: relatedTenderUid1,
      tenderId: relatedTenderId1,
      dateModified: new Date("2026-05-12T08:30:00.000Z"),
      publicModified: new Date("2026-05-12T08:30:00.000Z"),
      buyerId: tender.buyer?.identifier?.id,
      buyerName: tender.buyer?.name,
      buyerRegion: tender.buyer?.address?.region,
      buyerLocality: tender.buyer?.address?.locality,
      procurementMethodType: "reporting",
      status: "complete",
      cpvPrefix: "45",
      valueAmount: "190000.00",
      valueCurrency: "UAH",
      rawJson: {
        id: relatedTenderUid1,
        tenderID: relatedTenderId1,
        awards: [
          {
            status: "active",
            suppliers: [
              {
                name: supplierName,
                identifier: { id: supplierId },
              },
            ],
          },
        ],
      },
      analyzedAt: new Date("2026-05-12T08:30:00.000Z"),
    },
    {
      tenderUid: relatedTenderUid2,
      tenderId: relatedTenderId2,
      dateModified: new Date("2026-05-10T08:30:00.000Z"),
      publicModified: new Date("2026-05-10T08:30:00.000Z"),
      buyerId: tender.buyer?.identifier?.id,
      buyerName: tender.buyer?.name,
      buyerRegion: tender.buyer?.address?.region,
      buyerLocality: tender.buyer?.address?.locality,
      procurementMethodType: "reporting",
      status: "complete",
      cpvPrefix: "45",
      valueAmount: "180000.00",
      valueCurrency: "UAH",
      rawJson: {
        id: relatedTenderUid2,
        tenderID: relatedTenderId2,
        awards: [
          {
            status: "active",
            suppliers: [
              {
                name: supplierName,
                identifier: { id: supplierId },
              },
            ],
          },
        ],
      },
      analyzedAt: new Date("2026-05-10T08:30:00.000Z"),
    },
  ]);

  globalThis.fetch = (input) => {
    const url = toFetchUrl(input);
    calls.push(url);

    if (url.includes(`/violation_reports/${violationReportUid}`)) {
      return Promise.resolve(
        Response.json({
          data: {
            id: violationReportUid,
            violationReportID: violationReportId,
            status: "satisfied",
            tender_id: tenderUid,
            contract_id: `contract-${suffix}`,
            dateModified,
            details: {
              reason: "contractBreach",
              description: "Постачальник не виконав умови договору.",
            },
            authority: {
              name: "Тестовий орган",
              identifier: { id: "authority-test-id" },
            },
            defendants: [
              {
                name: "Тестовий постачальник",
                identifier: { id: "supplier-test-id" },
              },
            ],
            decisions: [{ resolution: "satisfied", status: "active" }],
          },
        }),
      );
    }

    if (url.includes("/violation_reports")) {
      return Promise.resolve(
        Response.json({
          data: [{ id: violationReportUid, dateModified }],
        }),
      );
    }

    if (url.includes("/tenders/") && !url.endsWith("/tenders")) {
      return Promise.resolve(Response.json({ data: tender }));
    }

    return Promise.resolve(
      Response.json({
        data: [{ id: tenderUid, dateModified }],
      }),
    );
  };

  t.after(async () => {
    globalThis.fetch = originalFetch;
    await db.delete(RiskAlert).where(eq(RiskAlert.tenderUid, tenderUid));
    await db.delete(RiskSignal).where(eq(RiskSignal.tenderUid, tenderUid));
    await db
      .delete(ProzorroTenderSnapshot)
      .where(
        inArray(ProzorroTenderSnapshot.tenderUid, [
          tenderUid,
          relatedTenderUid1,
          relatedTenderUid2,
        ]),
      );
    if (scanRunIds.length) {
      await db
        .delete(ProzorroScanRun)
        .where(inArray(ProzorroScanRun.id, scanRunIds));
    }
    await dbPool.end();
  });

  const firstRun = await scanProzorroRiskSignals(db, { limit: 1 });
  scanRunIds.push(firstRun.id);

  assert.equal(firstRun.status, "completed");
  assert.equal(firstRun.scannedCount, 1);
  assert.equal(firstRun.fetchedCount, 1);
  assert.equal(firstRun.analyzedCount, 1);
  assert.equal(firstRun.signalCount, 6);
  assert.ok(calls.some((url) => url.includes(`/tenders/${tenderUid}`)));
  assert.ok(
    calls.some((url) =>
      url.includes(`/violation_reports/${violationReportUid}`),
    ),
  );

  const snapshot = await db.query.ProzorroTenderSnapshot.findFirst({
    where: eq(ProzorroTenderSnapshot.tenderUid, tenderUid),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.tenderId, tenderId);
  assert.equal(snapshot.buyerLocality, "Харків");
  assert.equal(snapshot.valueAmount, "220000.00");

  const signals = await db.query.RiskSignal.findMany({
    where: eq(RiskSignal.tenderUid, tenderUid),
  });
  assert.equal(signals.length, 6);
  assert.deepEqual(signals.map((signal) => signal.code).sort(), [
    "COMPLAINT_ACTIVITY",
    "LOW_COMPETITION",
    "LOW_SAVINGS",
    "PROCUREMENT_SPLITTING",
    "REPEATED_BUYER_SUPPLIER",
    "VIOLATION_REPORT_MATCH",
  ]);
  const complaintSignal = signals.find(
    (signal) => signal.code === "COMPLAINT_ACTIVITY",
  );
  assert.ok(complaintSignal);
  assert.deepEqual(complaintSignal.evidenceJson.statuses, ["accepted"]);
  assert.deepEqual(complaintSignal.evidenceJson.sources, ["award"]);
  const violationSignal = signals.find(
    (signal) => signal.code === "VIOLATION_REPORT_MATCH",
  );
  assert.ok(violationSignal);
  assert.equal(violationSignal.severity, "critical");
  assert.equal(violationSignal.evidenceJson.reportUid, violationReportUid);
  assert.equal(violationSignal.evidenceJson.reportStatus, "satisfied");
  assert.deepEqual(violationSignal.evidenceJson.decisionResolutions, [
    "satisfied",
  ]);
  const splittingSignal = signals.find(
    (signal) => signal.code === "PROCUREMENT_SPLITTING",
  );
  assert.ok(splittingSignal);
  assert.equal(splittingSignal.severity, "high");
  assert.equal(splittingSignal.evidenceJson.groupCount, 3);
  assert.equal(splittingSignal.evidenceJson.groupTotalValue, 590000);
  assert.deepEqual(
    [...(splittingSignal.evidenceJson.relatedTenderUids as string[])].sort(),
    [relatedTenderUid1, relatedTenderUid2, tenderUid].sort(),
  );
  const repeatedSupplierSignal = signals.find(
    (signal) => signal.code === "REPEATED_BUYER_SUPPLIER",
  );
  assert.ok(repeatedSupplierSignal);
  assert.equal(repeatedSupplierSignal.severity, "high");
  assert.equal(repeatedSupplierSignal.evidenceJson.supplierId, supplierId);
  assert.equal(repeatedSupplierSignal.evidenceJson.groupCount, 3);
  assert.equal(repeatedSupplierSignal.evidenceJson.sameCpvCount, 3);
  assert.equal(repeatedSupplierSignal.evidenceJson.groupTotalValue, 590000);
  assert.ok(signals.every((signal) => signal.scanRunId === firstRun.id));

  const alert = await db.query.RiskAlert.findFirst({
    where: eq(RiskAlert.tenderUid, tenderUid),
  });
  assert.ok(alert);
  assert.equal(alert.status, "drafted");
  assert.equal(alert.recipient, "НАБУ / САП");
  assert.equal(alert.signalCount, 6);
  assert.ok(alert.riskScore >= 75);
  assert.match(alert.body, new RegExp(tenderId));
  assert.equal(alert.evidenceJson.tenderUid, tenderUid);

  const previousFetchCount = calls.length;
  const previousTenderDetailCount = calls.filter((url) =>
    url.includes(`/tenders/${tenderUid}`),
  ).length;
  const secondRun = await scanProzorroRiskSignals(db, { limit: 1 });
  scanRunIds.push(secondRun.id);

  assert.equal(secondRun.status, "completed");
  assert.equal(secondRun.scannedCount, 1);
  assert.equal(secondRun.fetchedCount, 0);
  assert.equal(secondRun.analyzedCount, 0);
  assert.equal(secondRun.signalCount, 0);
  assert.ok(calls.length > previousFetchCount);
  assert.equal(
    calls.filter((url) => url.includes(`/tenders/${tenderUid}`)).length,
    previousTenderDetailCount,
  );

  const signalsAfterCachedRun = await db.query.RiskSignal.findMany({
    where: eq(RiskSignal.tenderUid, tenderUid),
  });
  assert.equal(signalsAfterCachedRun.length, 6);

  assert.equal(await shouldStartScan(db), false);
  globalThis.fetch = () =>
    Promise.reject(new Error("ensureFreshProzorroScan should use cached scan"));
  const cachedRun = await ensureFreshProzorroScan(db);
  assert.equal(cachedRun?.id, secondRun.id);

  const dashboard = await getRiskDashboard(db, "all");
  assert.ok(dashboard.metrics.riskIndex > 0);
  assert.ok(dashboard.metrics.riskIndex <= 100);
  const analyzedProcurement = dashboard.recentAnalyzedProcurements.find(
    (procurement) => procurement.tenderUid === tenderUid,
  );
  assert.ok(analyzedProcurement);
  assert.ok(analyzedProcurement.score >= 75);
  assert.equal(analyzedProcurement.alertDraft?.status, "drafted");
  assert.equal(analyzedProcurement.detectedSignals.length, 6);
  assert.equal(
    analyzedProcurement.detectedSignals.find(
      (signal) => signal.code === "VIOLATION_REPORT_MATCH",
    )?.confidence,
    "high",
  );
  assert.equal(
    analyzedProcurement.detectedSignals.find(
      (signal) => signal.code === "PROCUREMENT_SPLITTING",
    )?.confidence,
    "high",
  );
  assert.equal(
    analyzedProcurement.detectedSignals.find(
      (signal) => signal.code === "REPEATED_BUYER_SUPPLIER",
    )?.confidence,
    "high",
  );
  assert.ok(
    analyzedProcurement.detectedSignals.every((signal) =>
      ["low", "medium", "high"].includes(signal.confidence),
    ),
  );

  const radarSignal = dashboard.radarSignals.find(
    (signal) => signal.tenderUid === tenderUid,
  );
  assert.ok(radarSignal);
  assert.equal(radarSignal.city, "Харків");
  assert.equal(radarSignal.region, "Харківська область");

  const region = dashboard.regionalStatistics.find(
    (item) => item.region === "Харківська область",
  );
  if (region) {
    assert.equal(typeof region.rank, "number");
    assert.ok(["new", "up", "down", "flat"].includes(region.trend));
  }

  const filteredDashboard = await getRiskDashboard(db, "all", [
    "VIOLATION_REPORT_MATCH",
  ]);
  const filteredProcurement = filteredDashboard.recentAnalyzedProcurements.find(
    (procurement) => procurement.tenderUid === tenderUid,
  );
  assert.ok(filteredProcurement);
  assert.equal(filteredProcurement.detectedSignals.length, 1);
  assert.equal(
    filteredProcurement.detectedSignals[0]?.code,
    "VIOLATION_REPORT_MATCH",
  );
  assert.ok(
    filteredDashboard.latestDetections.every(
      (signal) => signal.code === "VIOLATION_REPORT_MATCH",
    ),
  );

  const repeatedSupplierDashboard = await getRiskDashboard(db, "all", [
    "REPEATED_BUYER_SUPPLIER",
  ]);
  const repeatedSupplierProcurement =
    repeatedSupplierDashboard.recentAnalyzedProcurements.find(
      (procurement) => procurement.tenderUid === tenderUid,
    );
  assert.ok(repeatedSupplierProcurement);
  assert.equal(repeatedSupplierProcurement.detectedSignals.length, 1);
  assert.equal(
    repeatedSupplierProcurement.detectedSignals[0]?.code,
    "REPEATED_BUYER_SUPPLIER",
  );
  assert.ok(
    repeatedSupplierDashboard.latestDetections.every(
      (signal) => signal.code === "REPEATED_BUYER_SUPPLIER",
    ),
  );

  const forcedError = `integration forced failure ${suffix}`;
  globalThis.fetch = () => Promise.reject(new Error(forcedError));
  await assert.rejects(
    () => scanProzorroRiskSignals(db, { limit: 1 }),
    new RegExp(forcedError),
  );
  const failedRun = await db.query.ProzorroScanRun.findFirst({
    where: and(
      eq(ProzorroScanRun.status, "failed"),
      eq(ProzorroScanRun.error, forcedError),
    ),
    orderBy: desc(ProzorroScanRun.startedAt),
  });
  assert.ok(failedRun);
  scanRunIds.push(failedRun.id);
  assert.equal(failedRun.status, "failed");
  assert.equal(failedRun.error, forcedError);
});
