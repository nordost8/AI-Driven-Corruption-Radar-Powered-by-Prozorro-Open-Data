import type { RiskSeverity } from "./types";

export const severityWeight: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5,
};

export function recencyMultiplier(date: Date) {
  const ageHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  if (ageHours <= 24) return 1.12;
  if (ageHours <= 7 * 24) return 1.06;
  if (ageHours <= 30 * 24) return 1;
  return 0.92;
}

export function valueBoost(value: number) {
  if (!value) return 0;
  return Math.min(12, Math.log10(value + 1) * 1.6);
}

export function calculateTenderRiskScore(
  signals: { score: number; severity: RiskSeverity }[],
  valueAmount: number,
) {
  if (!signals.length) return 0;

  let weightedScore = 0;
  let weightSum = 0;
  for (const signal of signals) {
    const weight = severityWeight[signal.severity];
    weightedScore += (signal.score + valueBoost(valueAmount)) * weight;
    weightSum += weight;
  }

  return Math.min(100, Math.round(weightedScore / Math.max(1, weightSum)));
}
