import type {
  ProzorroTenderData,
  ProzorroViolationReportData,
  TenderRiskSignal,
} from "./types";

const COMPETITIVE_METHODS = new Set([
  "aboveThreshold",
  "aboveThresholdUA",
  "aboveThresholdEU",
  "competitiveDialogueUA",
  "competitiveDialogueEU",
  "esco",
  "openProcedure",
  "simple",
  "simple.defense",
]);

const DIRECT_METHODS = new Set([
  "reporting",
  "negotiation",
  "negotiation.quick",
]);

const ACTIVE_AWARD_STATUSES = new Set(["active", "successful"]);
const RELEVANT_COMPLAINT_STATUSES = new Set([
  "accepted",
  "satisfied",
  "resolved",
  "stopping",
]);
const RISKY_CANCELLATION_REASONS = new Set(["unFixable", "noOffer"]);

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAwardAmount(tender: ProzorroTenderData) {
  const amounts = tender.awards
    ?.filter((award) => award.status && ACTIVE_AWARD_STATUSES.has(award.status))
    .map((award) => numeric(award.value?.amount))
    .filter((amount): amount is number => amount !== null);

  if (!amounts?.length) return null;
  return Math.max(...amounts);
}

function getBidsCount(tender: ProzorroTenderData) {
  const declaredBids = numeric(tender.numberOfBids);
  if (declaredBids !== null) return declaredBids;

  const activeBids = tender.bids?.filter(
    (bid) => bid.status === "active" || bid.status === "pending",
  );
  return activeBids?.length ?? null;
}

function collectRelevantComplaints(tender: ProzorroTenderData) {
  const complaints: { status: string; source: "tender" | "award" }[] = [];

  for (const complaint of tender.complaints ?? []) {
    if (complaint.status && RELEVANT_COMPLAINT_STATUSES.has(complaint.status)) {
      complaints.push({ status: complaint.status, source: "tender" });
    }
  }

  for (const award of tender.awards ?? []) {
    for (const complaint of award.complaints ?? []) {
      if (
        complaint.status &&
        RELEVANT_COMPLAINT_STATUSES.has(complaint.status)
      ) {
        complaints.push({ status: complaint.status, source: "award" });
      }
    }
  }

  return complaints;
}

function complaintScore(
  complaints: { status: string; source: "tender" | "award" }[],
) {
  if (complaints.some((complaint) => complaint.status === "satisfied")) {
    return { severity: "high" as const, score: 70 };
  }
  if (
    complaints.some(
      (complaint) =>
        complaint.status === "accepted" || complaint.status === "stopping",
    )
  ) {
    return { severity: "medium" as const, score: 58 };
  }
  return { severity: "medium" as const, score: 45 };
}

export function analyzeTenderRisk(tender: ProzorroTenderData) {
  const signals: TenderRiskSignal[] = [];
  const expectedValue = numeric(tender.value?.amount);
  const awardValue = getAwardAmount(tender);
  const method = tender.procurementMethodType;
  const numberOfBids = getBidsCount(tender);
  const tenderId = tender.tenderID ?? tender.id ?? "unknown";

  if (
    method &&
    COMPETITIVE_METHODS.has(method) &&
    numberOfBids !== null &&
    numberOfBids <= 1
  ) {
    signals.push({
      code: "LOW_COMPETITION",
      severity: "critical",
      score: 82,
      title: "Низька конкуренція",
      explanation:
        "Конкурентна процедура має одну або нуль публічних пропозицій, що є сильним сигналом ризику.",
      evidence: { tenderId, procurementMethodType: method, numberOfBids },
    });
  }

  if (
    method &&
    COMPETITIVE_METHODS.has(method) &&
    expectedValue !== null &&
    awardValue !== null &&
    numberOfBids !== null &&
    numberOfBids <= 2 &&
    expectedValue > 0 &&
    awardValue / expectedValue >= 0.985
  ) {
    signals.push({
      code: "LOW_SAVINGS",
      severity: "medium",
      score: 48,
      title: "Майже нульова економія",
      explanation:
        "Сума award майже дорівнює очікуваній вартості, тому закупівля потребує додаткової перевірки.",
      evidence: {
        tenderId,
        expectedValue,
        awardValue,
        awardRatio: Number((awardValue / expectedValue).toFixed(4)),
        numberOfBids,
        procurementMethodType: method,
      },
    });
  }

  if (
    method &&
    DIRECT_METHODS.has(method) &&
    expectedValue !== null &&
    expectedValue >= 500_000
  ) {
    signals.push({
      code: "HIGH_VALUE_DIRECT",
      severity: expectedValue >= 1_000_000 ? "critical" : "high",
      score: expectedValue >= 1_000_000 ? 78 : 66,
      title: "Прямий договір високої вартості",
      explanation:
        "Закупівля проведена звітним або переговорним методом і має високу очікувану вартість.",
      evidence: {
        tenderId,
        procurementMethodType: method,
        valueAmount: expectedValue,
        valueCurrency: tender.value?.currency,
        threshold: 500_000,
      },
    });
  }

  const riskyCancellation = tender.cancellations?.find(
    (item) =>
      item.status === "active" &&
      item.reasonType &&
      RISKY_CANCELLATION_REASONS.has(item.reasonType),
  );
  if (riskyCancellation) {
    signals.push({
      code: "RISKY_CANCELLATION",
      severity: "high",
      score: 63,
      title: "Скасування з ризиковою причиною",
      explanation:
        "Закупівля завершилась неуспішно через причину, яку замовник позначив як неможливу до усунення.",
      evidence: {
        tenderId,
        tenderStatus: tender.status,
        cancellationStatus: riskyCancellation.status,
        reasonType: riskyCancellation.reasonType,
        reason: riskyCancellation.reason,
      },
    });
  }

  const relevantComplaints = collectRelevantComplaints(tender);
  if (relevantComplaints.length > 0) {
    const complaintRisk = complaintScore(relevantComplaints);
    signals.push({
      code: "COMPLAINT_ACTIVITY",
      severity: complaintRisk.severity,
      score: complaintRisk.score,
      title: "Активність скарг",
      explanation:
        "У закупівлі є скарги зі статусом, який вказує на суттєву конфліктність процедури.",
      evidence: {
        tenderId,
        relevantComplaintsCount: relevantComplaints.length,
        statuses: [...new Set(relevantComplaints.map((item) => item.status))],
        sources: [...new Set(relevantComplaints.map((item) => item.source))],
      },
    });
  }

  return signals;
}

export function analyzeViolationReportMatch(
  report: ProzorroViolationReportData,
) {
  const decisionResolutions =
    report.decisions
      ?.map((decision) => decision.resolution)
      .filter((resolution): resolution is string => Boolean(resolution)) ?? [];
  const isSatisfied =
    report.status === "satisfied" || decisionResolutions.includes("satisfied");

  if (!isSatisfied) return null;

  return {
    code: "VIOLATION_REPORT_MATCH",
    severity: "critical",
    score: 88,
    title: "Офіційний report про порушення",
    explanation:
      "Для цієї закупівлі або контракту є офіційний Prozorro violation report зі статусом або рішенням satisfied.",
    evidence: {
      reportUid: report.id,
      violationReportId: report.violationReportID,
      reportStatus: report.status,
      tenderUid: report.tender_id,
      contractId: report.contract_id,
      reason: report.details?.reason,
      description: report.details?.description,
      authorityName: report.authority?.name,
      authorityId: report.authority?.identifier?.id,
      defendantIds: report.defendants
        ?.map((defendant) => defendant.identifier?.id)
        .filter((id): id is string => Boolean(id)),
      decisionResolutions,
    },
  } satisfies TenderRiskSignal;
}
