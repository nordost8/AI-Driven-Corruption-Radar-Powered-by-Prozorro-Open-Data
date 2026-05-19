import type { RiskSeverity, TenderRiskSignal } from "./types";
import { calculateTenderRiskScore, severityWeight } from "./risk-scoring";

export type RiskAlertStatus = "drafted" | "test_sent" | "failed" | "disabled";

const ALERT_THRESHOLD = 75;
const ALERT_RECIPIENT = "НАБУ / САП";

function dominantSeverity(
  signals: { severity: RiskSeverity; score: number }[],
) {
  return [...signals].sort((left, right) => {
    const severityDelta =
      severityWeight[right.severity] - severityWeight[left.severity];
    return severityDelta || right.score - left.score;
  })[0]?.severity;
}

export function buildRiskAlertDraft(input: {
  tenderUid: string;
  tenderId: string | null;
  buyerName: string | null;
  region: string | null;
  valueAmount: number;
  prozorroUrl: string | null;
  signals: TenderRiskSignal[];
}) {
  const riskScore = calculateTenderRiskScore(input.signals, input.valueAmount);
  if (riskScore < ALERT_THRESHOLD) return null;

  const signalLines = input.signals
    .map(
      (signal) =>
        `- ${signal.code} (${signal.severity}, ${signal.score}/100): ${signal.explanation}`,
    )
    .join("\n");
  const evidenceJson = {
    tenderUid: input.tenderUid,
    tenderId: input.tenderId,
    buyerName: input.buyerName,
    region: input.region,
    valueAmount: input.valueAmount,
    prozorroUrl: input.prozorroUrl,
    signals: input.signals.map((signal) => ({
      code: signal.code,
      severity: signal.severity,
      score: signal.score,
      evidence: signal.evidence,
    })),
  };

  return {
    status: "drafted" as const satisfies RiskAlertStatus,
    recipient: ALERT_RECIPIENT,
    testRecipientEmail: process.env.RISK_ALERT_TEST_EMAIL ?? null,
    subject: `Risk alert: ${input.tenderId ?? "закупівля без tenderID"}`,
    body: [
      "Автоматично сформований draft для тестового перегляду.",
      "",
      `Закупівля: ${input.tenderId ?? "невідомо"}`,
      `Замовник: ${input.buyerName ?? "невідомо"}`,
      `Регіон: ${input.region ?? "невідомо"}`,
      `Risk score: ${riskScore}/100`,
      `Очікувана/зафіксована сума: ${Math.round(input.valueAmount)} UAH`,
      `Prozorro URL: ${input.prozorroUrl ?? "немає"}`,
      "",
      "Виявлені risk signals:",
      signalLines || "- немає деталізованих сигналів",
      "",
      "Evidence JSON:",
      JSON.stringify(evidenceJson),
      "",
      "Примітка: це не юридична заява, а автоматичний аналітичний draft для MVP.",
    ].join("\n"),
    riskScore,
    severity: dominantSeverity(input.signals) ?? "low",
    signalCount: input.signals.length,
    evidenceJson,
  };
}

export function asRiskAlertStatus(value: string): RiskAlertStatus {
  if (
    value === "drafted" ||
    value === "test_sent" ||
    value === "failed" ||
    value === "disabled"
  ) {
    return value;
  }

  return "drafted";
}
