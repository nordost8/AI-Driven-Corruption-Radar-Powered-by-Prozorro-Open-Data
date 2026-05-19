import type { ReactNode } from "react";
import Link from "next/link";

import { appRouter, createPublicTRPCContext } from "@acme/api";

import type { UkraineRadarSignal } from "./_components/ukraine-radar-map";
import { SonarAudioControl } from "./_components/sonar-audio-control";
import { TargetedProcurementOpener } from "./_components/targeted-procurement-opener";
import { UkraineRadarMap } from "./_components/ukraine-radar-map";

export const revalidate = 60;

type Period = "today" | "yesterday" | "week" | "month" | "year" | "all";
type Severity = "low" | "medium" | "high" | "critical";
type Confidence = "low" | "medium" | "high";
type SignalCode =
  | "LOW_COMPETITION"
  | "LOW_SAVINGS"
  | "HIGH_VALUE_DIRECT"
  | "RISKY_CANCELLATION"
  | "COMPLAINT_ACTIVITY"
  | "VIOLATION_REPORT_MATCH"
  | "PROCUREMENT_SPLITTING"
  | "REPEATED_BUYER_SUPPLIER";

const PROCUREMENTS_PAGE_SIZE = 10;
const DASHBOARD_CACHE_MS = 60_000;
const dashboardCache = new Map<
  string,
  {
    expiresAt: number;
    data: Awaited<ReturnType<typeof loadDashboard>>;
  }
>();

const periods: { value: Period; label: string }[] = [
  { value: "today", label: "Сьогодні" },
  { value: "yesterday", label: "Вчора" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "year", label: "Рік" },
  { value: "all", label: "Весь час" },
];

const signalOptions: { code: SignalCode; label: string }[] = [
  { code: "LOW_COMPETITION", label: "Низька конкуренція" },
  { code: "LOW_SAVINGS", label: "Нульова економія" },
  { code: "HIGH_VALUE_DIRECT", label: "Прямі договори" },
  { code: "RISKY_CANCELLATION", label: "Скасування" },
  { code: "COMPLAINT_ACTIVITY", label: "Скарги" },
  { code: "VIOLATION_REPORT_MATCH", label: "Violation reports" },
  { code: "PROCUREMENT_SPLITTING", label: "Дроблення" },
  { code: "REPEATED_BUYER_SUPPLIER", label: "Повторний постачальник" },
];

const toneDot = {
  low: "bg-emerald-400",
  medium: "bg-yellow-300",
  high: "bg-orange-400",
  critical: "bg-red-500",
};

const toneText = {
  low: "text-emerald-300",
  medium: "text-yellow-300",
  high: "text-orange-300",
  critical: "text-red-400",
};

const severityLabel = {
  low: "Низький",
  medium: "Помірний",
  high: "Високий",
  critical: "Критичний",
};

const confidenceText = {
  low: "text-slate-500",
  medium: "text-sky-300",
  high: "text-emerald-300",
};

export default async function HomePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const selectedPeriod = parsePeriod(searchParams?.period);
  const selectedSignalCodes = parseSignalCodes(searchParams?.signals);
  const selectedPage = parsePage(searchParams?.page);
  const dashboard = await getCachedDashboard(
    selectedPeriod,
    selectedSignalCodes,
  );
  const procurementPage = paginateProcurements(
    dashboard.analyzedProcurements,
    selectedPage,
    PROCUREMENTS_PAGE_SIZE,
  );
  const lastScanTime =
    dashboard.lastScan?.finishedAt ?? dashboard.lastScan?.startedAt;

  return (
    <main className="min-h-screen overflow-hidden bg-[#03090d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(22,163,74,0.22),transparent_34%),radial-gradient(circle_at_85%_12%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#02060a_0%,#041017_55%,#020609_100%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1560px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="radar-panel flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-lg text-emerald-300">
              UA
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.28em] text-emerald-300/80 uppercase">
                Prozorro Open Data
              </p>
              <h1 className="text-xl font-semibold tracking-normal text-white md:text-2xl">
                Корупційний радар
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-2 items-stretch gap-3 text-xs sm:grid-cols-5">
            <Metric
              label="Оновлено"
              value={formatShortDate(lastScanTime)}
              detail={formatShortTime(lastScanTime)}
            />
            <Metric
              label="Зріз"
              value={String(dashboard.metrics.scannedTenders)}
              detail="тендерів"
            />
            <Metric
              label="Сигнали"
              value={String(dashboard.metrics.riskSignals)}
              detail={dashboard.periodLabel}
            />
            <Metric label="Джерело" value="2.5" detail="public API" />
            <SonarAudioControl
              riskIndex={dashboard.metrics.riskIndex}
              riskSignals={dashboard.metrics.riskSignals}
            />
          </div>
        </header>

        <section className="grid flex-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_310px]">
          <aside className="flex flex-col gap-4">
            <Panel title="Індекс ризику">
              <div className="flex items-end gap-2">
                <span className="text-6xl font-semibold text-emerald-300">
                  {dashboard.metrics.riskIndex}
                </span>
                <span className="pb-2 text-lg text-slate-400">/100</span>
              </div>
              <p className="mt-2 text-sm font-medium text-yellow-300 uppercase">
                {riskIndexLabel(dashboard.metrics.riskIndex)}
              </p>
              <div className="mt-5 h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-orange-500"
                  style={{ width: `${dashboard.metrics.riskIndex}%` }}
                />
              </div>
            </Panel>

            <Panel title="Динаміка індексу">
              <Sparkline data={dashboard.riskActivity} />
            </Panel>

            <Panel title="Найбільші ризики">
              <div className="space-y-3">
                {dashboard.topRiskyTenders.slice(0, 5).map((tender, index) => (
                  <div
                    key={tender.tenderUid}
                    className="grid grid-cols-[24px_1fr_34px] items-center gap-2 text-sm"
                  >
                    <span className="grid size-6 place-items-center rounded bg-slate-800 text-xs text-slate-300">
                      {index + 1}
                    </span>
                    <span className="truncate text-slate-300">
                      {tender.buyerName ?? tender.tenderId ?? tender.tenderUid}
                    </span>
                    <span className={scoreTone(tender.score)}>
                      {tender.score}
                    </span>
                  </div>
                ))}
                {!dashboard.topRiskyTenders.length && <EmptyState />}
              </div>
            </Panel>

            <Panel title="Підозріла активність">
              <div className="space-y-3">
                {dashboard.latestDetections.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="grid grid-cols-[42px_1fr_10px] gap-2 border-b border-slate-800/80 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="font-mono text-xs text-slate-400">
                      {formatShortTime(alert.createdAt)}
                    </span>
                    <span>
                      <span className="block text-sm text-slate-200">
                        {alert.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {alert.buyerLocality ??
                          alert.buyerRegion ??
                          alert.tenderId}
                      </span>
                    </span>
                    <span
                      className={`mt-1 size-2 rounded-full ${toneDot[alert.severity]}`}
                    />
                  </div>
                ))}
                {!dashboard.latestDetections.length && <EmptyState />}
              </div>
            </Panel>
          </aside>

          <section className="radar-panel relative min-h-[620px] overflow-hidden p-4 md:p-6">
            <div className="absolute top-5 left-5 z-10">
              <p className="text-[11px] tracking-[0.24em] text-slate-500 uppercase">
                Risk signal scan
              </p>
              <h2 className="text-lg font-semibold text-white">Україна</h2>
            </div>
            <div className="absolute top-5 right-5 z-20 flex max-w-[360px] flex-wrap justify-end gap-2">
              {periods.map((period) => {
                const active = selectedPeriod === period.value;
                const className = `rounded-md border px-2.5 py-1.5 text-xs ${
                  active
                    ? "border-emerald-400/60 bg-emerald-400/12 text-emerald-200"
                    : "border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-300"
                }`;

                return active ? (
                  <span
                    key={period.value}
                    aria-current="page"
                    className={className}
                  >
                    {period.label}
                  </span>
                ) : (
                  <Link
                    key={period.value}
                    className={className}
                    href={buildDashboardHref(period.value, selectedSignalCodes)}
                  >
                    {period.label}
                  </Link>
                );
              })}
            </div>
            <RadarDisplay signals={dashboard.radarSignals} />
            <TargetedProcurementOpener />
            <AnalyzedProcurements
              pagination={procurementPage}
              procurements={procurementPage.items}
              selectedPeriod={selectedPeriod}
              selectedSignalCodes={selectedSignalCodes}
            />
          </section>

          <aside className="flex flex-col gap-4">
            <Panel title="Рівень ризику">
              <Legend distribution={dashboard.severityDistribution} />
            </Panel>

            <Panel title="Ризики за регіонами">
              <div className="space-y-4">
                {dashboard.regionalStatistics.map((region) => (
                  <div
                    key={region.region}
                    className="grid grid-cols-[1fr_44px_46px] items-center gap-3 text-sm"
                  >
                    <span className="truncate text-slate-300">
                      {region.region}
                    </span>
                    <span className="flex items-center justify-end gap-2 font-mono">
                      <span
                        className={`size-2 rounded-full ${scoreDot(region.score)}`}
                      />
                      <span className={scoreTone(region.score)}>
                        {region.score}
                      </span>
                    </span>
                    <TrendBadge
                      delta={region.trendDelta}
                      trend={region.trend}
                    />
                  </div>
                ))}
                {!dashboard.regionalStatistics.length && <EmptyState />}
              </div>
            </Panel>

            <Panel title="Типи сигналів">
              <div className="grid gap-5 sm:grid-cols-[120px_1fr] xl:grid-cols-1 2xl:grid-cols-[120px_1fr]">
                <div
                  className="mx-auto size-28 rounded-full p-6"
                  style={{
                    background: severityConicGradient(
                      dashboard.severityDistribution,
                    ),
                  }}
                >
                  <div className="size-full rounded-full bg-[#071117]" />
                </div>
                <div className="space-y-3 text-sm">
                  {(Object.keys(severityLabel) as Severity[]).map(
                    (severity) => (
                      <LegendRow
                        key={severity}
                        label={severityLabel[severity]}
                        value={String(dashboard.severityDistribution[severity])}
                        tone={severity}
                      />
                    ),
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Фільтри сигналів">
              <SignalFilters
                selectedCodes={selectedSignalCodes}
                selectedPeriod={selectedPeriod}
              />
            </Panel>

            <Panel title="Scan history">
              <div className="space-y-3 text-sm">
                {dashboard.scanHistory.slice(0, 4).map((scan) => (
                  <div
                    key={scan.id}
                    className="grid grid-cols-[1fr_68px] gap-3 border-b border-slate-800/80 pb-3 last:border-0 last:pb-0"
                  >
                    <span>
                      <span className="block text-slate-300">
                        {formatShortDate(scan.startedAt)}{" "}
                        {formatShortTime(scan.startedAt)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {scan.analyzedCount} analyzed, {scan.signalCount}{" "}
                        signals
                      </span>
                    </span>
                    <span className="text-right font-mono text-xs text-emerald-300">
                      {scan.status}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

async function loadDashboard(period: Period, signalCodes: SignalCode[]) {
  const caller = appRouter.createCaller(createPublicTRPCContext());
  return caller.prozorroRisk.dashboard({
    period,
    signalCodes,
  });
}

async function getCachedDashboard(period: Period, signalCodes: SignalCode[]) {
  const cacheKey = `${period}:${[...signalCodes].sort().join(",")}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await loadDashboard(period, signalCodes);
  dashboardCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + DASHBOARD_CACHE_MS,
  });
  return data;
}

function parsePeriod(value: string | string[] | undefined): Period {
  const period = Array.isArray(value) ? value[0] : value;
  return periods.some((item) => item.value === period)
    ? (period as Period)
    : "today";
}

function parseSignalCodes(value: string | string[] | undefined): SignalCode[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];

  const allowedCodes = new Set(signalOptions.map((item) => item.code));
  return [
    ...new Set(
      raw
        .split(",")
        .filter((code): code is SignalCode =>
          allowedCodes.has(code as SignalCode),
        ),
    ),
  ];
}

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function paginateProcurements<T>(
  items: T[],
  requestedPage: number,
  pageSize: number,
) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    items: pageItems,
    page,
    pageSize,
    totalItems,
    totalPages,
    startItem: totalItems ? startIndex + 1 : 0,
    endItem: startIndex + pageItems.length,
  };
}

function buildDashboardHref(
  period: Period,
  signalCodes: SignalCode[],
  page = 1,
) {
  const params = new URLSearchParams();
  if (period !== "today") params.set("period", period);
  if (signalCodes.length && signalCodes.length < signalOptions.length) {
    params.set("signals", signalCodes.join(","));
  }
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function getActiveSignalCodes(selectedCodes: SignalCode[]) {
  return selectedCodes.length
    ? selectedCodes
    : signalOptions.map((item) => item.code);
}

function nextSignalCodes(selectedCodes: SignalCode[], code: SignalCode) {
  const activeCodes = getActiveSignalCodes(selectedCodes);
  const nextCodes = activeCodes.includes(code)
    ? activeCodes.filter((item) => item !== code)
    : [...activeCodes, code];

  if (!nextCodes.length || nextCodes.length === signalOptions.length) {
    return [];
  }

  return nextCodes;
}

function Metric(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] tracking-[0.18em] text-slate-500 uppercase">
        {props.label}
      </p>
      <p className="mt-1 font-mono text-lg text-emerald-300">{props.value}</p>
      <p className="text-[11px] text-slate-500">{props.detail}</p>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="radar-panel p-4">
      <h2 className="border-b border-slate-800/80 pb-3 text-sm font-semibold tracking-[0.12em] text-slate-300 uppercase">
        {props.title}
      </h2>
      <div className="pt-4">{props.children}</div>
    </section>
  );
}

function RadarDisplay(props: { signals: UkraineRadarSignal[] }) {
  return (
    <div className="relative grid min-h-[500px] place-items-center">
      <div className="radar-grid relative aspect-square w-full max-w-[560px] rounded-full">
        <div className="radar-sweep absolute inset-0 rounded-full" />
        <div className="absolute inset-[9%] rounded-full border border-emerald-500/20" />
        <div className="absolute inset-[21%] rounded-full border border-emerald-500/20" />
        <div className="absolute inset-[33%] rounded-full border border-emerald-500/20" />
        <div className="absolute top-1/2 right-3 left-3 h-px bg-emerald-400/35" />
        <div className="absolute top-3 bottom-3 left-1/2 w-px bg-emerald-400/35" />
        <div className="absolute inset-[16%] rotate-[30deg] border-t border-emerald-400/20" />
        <div className="absolute inset-[16%] -rotate-[30deg] border-t border-emerald-400/20" />

        <UkraineRadarMap signals={props.signals} />

        <div className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-xs text-emerald-300">
          0
        </div>
        <div className="absolute top-1/2 right-5 -translate-y-1/2 font-mono text-xs text-emerald-300">
          90
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-emerald-300">
          180
        </div>
        <div className="absolute top-1/2 left-5 -translate-y-1/2 font-mono text-xs text-emerald-300">
          270
        </div>
      </div>
    </div>
  );
}

function AnalyzedProcurements(props: {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    startItem: number;
    endItem: number;
  };
  procurements: {
    tenderUid: string;
    tenderId: string | null;
    buyerName: string | null;
    region: string | null;
    score: number;
    signalCount: number;
    valueAmount: number;
    prozorroUrl: string | null;
    alertDraft: {
      status: "drafted" | "test_sent" | "failed" | "disabled";
      recipient: string;
      subject: string;
      body: string;
    } | null;
    detectedSignals: {
      id: string;
      code: string;
      title: string;
      severity: Severity;
      score: number;
      explanation: string;
      evidence: Record<string, unknown>;
      createdAt: Date;
      confidence: Confidence;
    }[];
  }[];
  selectedPeriod: Period;
  selectedSignalCodes: SignalCode[];
}) {
  return (
    <section className="relative z-10 mt-6 border-t border-slate-800/80 pt-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] tracking-[0.24em] text-slate-500 uppercase">
            Аналіз закупівель
          </p>
          <h3 className="text-base font-semibold text-white">
            Закупівлі з ризиками
          </h3>
        </div>
        <span className="text-xs text-slate-500">
          {props.pagination.totalItems
            ? `${props.pagination.startItem}-${props.pagination.endItem} з ${props.pagination.totalItems}`
            : "Немає закупівель для вибраних фільтрів"}
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 overflow-hidden rounded-md border border-slate-800/80 bg-slate-950/35">
        {props.procurements.map((procurement) => {
          const primarySeverity =
            procurement.detectedSignals[0]?.severity ?? "low";

          return (
            <details
              key={procurement.tenderUid}
              className="group scroll-mt-6"
              id={`procurement-${procurement.tenderUid}`}
            >
              <summary className="grid cursor-pointer grid-cols-[1fr_72px] gap-3 px-4 py-3 hover:bg-slate-900/60 md:grid-cols-[minmax(0,1.35fr)_96px_92px_72px]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {procurement.buyerName ??
                      procurement.tenderId ??
                      procurement.tenderUid}
                  </span>
                  <span className="mt-1 block truncate font-mono text-xs text-slate-500">
                    {procurement.tenderId ?? procurement.tenderUid}
                  </span>
                </span>
                <span className="hidden text-sm text-slate-400 md:block">
                  {formatMoney(procurement.valueAmount)}
                </span>
                <span className="hidden text-sm text-slate-400 md:block">
                  {procurement.region ?? "region n/a"}
                </span>
                <span
                  className={`text-right font-mono text-sm ${scoreTone(procurement.score)}`}
                >
                  {procurement.score}
                </span>
                <span className="col-span-2 flex items-center gap-2 text-xs text-slate-500 md:col-span-4">
                  <span
                    className={`size-2 rounded-full ${toneDot[primarySeverity]}`}
                  />
                  {procurement.signalCount} risk signal
                  {procurement.signalCount === 1 ? "" : "s"}
                </span>
              </summary>

              <div className="space-y-4 bg-slate-950/55 px-4 pb-4">
                <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-3">
                  <InfoItem
                    label="Risk score"
                    value={`${procurement.score}/100`}
                  />
                  <InfoItem
                    label="Сума"
                    value={formatMoney(procurement.valueAmount)}
                  />
                  <InfoItem
                    label="Prozorro"
                    value={
                      procurement.prozorroUrl ? (
                        <a
                          className="text-emerald-300 underline underline-offset-4"
                          href={procurement.prozorroUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          відкрити закупівлю
                        </a>
                      ) : (
                        "немає URL"
                      )
                    }
                  />
                </div>

                {procurement.alertDraft && (
                  <div className="rounded-md border border-red-500/25 bg-red-950/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-red-300">
                        Draft alert letter
                      </span>
                      <span className="rounded border border-red-500/30 px-2 py-1 font-mono text-xs text-red-300">
                        {procurement.alertDraft.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Отримувач: {procurement.alertDraft.recipient}. Реальна
                      відправка на НАБУ/САП у MVP вимкнена.
                    </p>
                    <p className="mt-3 text-sm text-slate-300">
                      {procurement.alertDraft.subject}
                    </p>
                    <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-slate-950/80 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-500">
                      {formatDraftPreview(procurement.alertDraft.body)}
                    </pre>
                  </div>
                )}

                <div className="space-y-3">
                  {procurement.detectedSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="border-l-2 border-slate-700 pl-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${toneDot[signal.severity]}`}
                        />
                        <span className="text-sm font-medium text-slate-100">
                          {signal.title}
                        </span>
                        <span
                          className={`font-mono text-xs ${toneText[signal.severity]}`}
                        >
                          {signal.severity.toUpperCase()} / {signal.score}
                        </span>
                        <span
                          className={`font-mono text-xs ${confidenceText[signal.confidence]}`}
                        >
                          CONF {signal.confidence.toUpperCase()}
                        </span>
                        <span className="font-mono text-xs text-slate-600">
                          {signal.code}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">
                        {signal.explanation}
                      </p>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-500">
                        {formatEvidencePreview(signal.evidence)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
        {!props.procurements.length && (
          <div className="px-4 py-4">
            <EmptyState />
          </div>
        )}
      </div>
      <PaginationControls
        page={props.pagination.page}
        period={props.selectedPeriod}
        signalCodes={props.selectedSignalCodes}
        totalPages={props.pagination.totalPages}
      />
    </section>
  );
}

function PaginationControls(props: {
  page: number;
  totalPages: number;
  period: Period;
  signalCodes: SignalCode[];
}) {
  if (props.totalPages <= 1) return null;

  const firstPage = Math.max(1, Math.min(props.page - 2, props.totalPages - 4));
  const pages = Array.from(
    { length: Math.min(5, props.totalPages - firstPage + 1) },
    (_, index) => firstPage + index,
  );

  return (
    <nav
      aria-label="Пагінація закупівель"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <span className="font-mono text-slate-500">
        page {props.page}/{props.totalPages}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {props.page > 1 ? (
          <Link
            className="rounded-md border border-slate-700 bg-slate-950/45 px-3 py-2 text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
            href={buildDashboardHref(
              props.period,
              props.signalCodes,
              props.page - 1,
            )}
          >
            Назад
          </Link>
        ) : (
          <span className="rounded-md border border-slate-900 bg-slate-950/20 px-3 py-2 text-slate-700">
            Назад
          </span>
        )}
        {pages.map((page) =>
          page === props.page ? (
            <span
              key={page}
              aria-current="page"
              className="grid size-9 place-items-center rounded-md border border-emerald-400/60 bg-emerald-400/12 font-mono text-emerald-200"
            >
              {page}
            </span>
          ) : (
            <Link
              key={page}
              className="grid size-9 place-items-center rounded-md border border-slate-800 bg-slate-950/45 font-mono text-slate-500 hover:text-slate-300"
              href={buildDashboardHref(props.period, props.signalCodes, page)}
            >
              {page}
            </Link>
          ),
        )}
        {props.page < props.totalPages ? (
          <Link
            className="rounded-md border border-slate-700 bg-slate-950/45 px-3 py-2 text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
            href={buildDashboardHref(
              props.period,
              props.signalCodes,
              props.page + 1,
            )}
          >
            Далі
          </Link>
        ) : (
          <span className="rounded-md border border-slate-900 bg-slate-950/20 px-3 py-2 text-slate-700">
            Далі
          </span>
        )}
      </div>
    </nav>
  );
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function truncateJsonValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return truncateText(value, 360);
  if (typeof value !== "object" || value === null) return value;
  if (depth >= 3) return "[truncated]";

  if (Array.isArray(value)) {
    const next = value
      .slice(0, 8)
      .map((item) => truncateJsonValue(item, depth + 1));
    if (value.length > next.length)
      next.push(`... ${value.length - next.length} more`);
    return next;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      truncateJsonValue(item, depth + 1),
    ]),
  );
}

function formatEvidencePreview(evidence: Record<string, unknown>) {
  return JSON.stringify(truncateJsonValue(evidence), null, 2);
}

function formatDraftPreview(body: string) {
  return truncateText(body, 900);
}

function InfoItem(props: { label: string; value: ReactNode }) {
  return (
    <div>
      <span className="block text-[10px] tracking-[0.18em] text-slate-600 uppercase">
        {props.label}
      </span>
      <span className="mt-1 block text-slate-300">{props.value}</span>
    </div>
  );
}

function SignalFilters(props: {
  selectedCodes: SignalCode[];
  selectedPeriod: Period;
}) {
  const activeCodes = getActiveSignalCodes(props.selectedCodes);

  return (
    <div className="space-y-3">
      {props.selectedCodes.length === 0 ? (
        <span
          aria-current="true"
          className="block rounded-md border border-emerald-400/60 bg-emerald-400/12 px-3 py-2 text-xs text-emerald-200"
        >
          Усі сигнали
        </span>
      ) : (
        <Link
          className="block rounded-md border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
          href={buildDashboardHref(props.selectedPeriod, [])}
        >
          Усі сигнали
        </Link>
      )}
      <div className="grid gap-2">
        {signalOptions.map((option) => {
          const active = activeCodes.includes(option.code);
          return (
            <Link
              key={option.code}
              className={`rounded-md border px-3 py-2 text-xs ${
                active
                  ? "border-sky-400/50 bg-sky-400/10 text-sky-200"
                  : "border-slate-800 bg-slate-950/45 text-slate-600 hover:text-slate-300"
              }`}
              href={buildDashboardHref(
                props.selectedPeriod,
                nextSignalCodes(props.selectedCodes, option.code),
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TrendBadge(props: {
  trend: "new" | "up" | "down" | "flat";
  delta: number | null;
}) {
  const label =
    props.trend === "new"
      ? "new"
      : props.trend === "up"
        ? `+${props.delta}`
        : props.trend === "down"
          ? String(props.delta)
          : "0";
  const tone =
    props.trend === "up" || props.trend === "new"
      ? "text-emerald-300"
      : props.trend === "down"
        ? "text-orange-300"
        : "text-slate-500";

  return (
    <span className={`text-right font-mono text-xs ${tone}`} title="trend">
      {label}
    </span>
  );
}

function Sparkline(props: { data: { date: string; count: number }[] }) {
  const source = props.data.length
    ? props.data.slice(-7)
    : Array.from({ length: 7 }, (_, index) => ({
        date: String(index),
        count: 0,
      }));
  const max = Math.max(1, ...source.map((item) => item.count));
  const width = 252;
  const height = 90;
  const points = source
    .map((item, index) => {
      const x =
        source.length === 1 ? width : (index / (source.length - 1)) * width;
      const y = height - 15 - (item.count / max) * 58;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="h-32 w-full"
      viewBox="0 0 252 90"
      role="img"
      aria-label="Динаміка ризику"
    >
      <path d="M0 75H252M0 45H252M0 15H252" stroke="rgba(148,163,184,.14)" />
      <polyline points={points} fill="none" stroke="#fde047" strokeWidth="3" />
      {source.map((item, index) => {
        const x =
          source.length === 1 ? width : (index / (source.length - 1)) * width;
        const y = height - 15 - (item.count / max) * 58;
        return <circle key={item.date} cx={x} cy={y} r="3" fill="#fde047" />;
      })}
      <text x="216" y="62" fill="#fde047" fontSize="14" fontFamily="monospace">
        {source.at(-1)?.count ?? 0}
      </text>
    </svg>
  );
}

function Legend(props: { distribution: Record<Severity, number> }) {
  return (
    <div className="space-y-4 text-sm">
      <LegendRow
        label="Низький"
        value={String(props.distribution.low)}
        tone="low"
      />
      <LegendRow
        label="Помірний"
        value={String(props.distribution.medium)}
        tone="medium"
      />
      <LegendRow
        label="Високий"
        value={String(props.distribution.high)}
        tone="high"
      />
      <LegendRow
        label="Критичний"
        value={String(props.distribution.critical)}
        tone="critical"
      />
    </div>
  );
}

function LegendRow(props: {
  label: string;
  value: string;
  tone: "low" | "medium" | "high" | "critical" | "muted";
}) {
  const dot = props.tone === "muted" ? "bg-slate-600" : toneDot[props.tone];

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-slate-300">{props.label}</span>
      </span>
      <span className="font-mono text-xs text-slate-500">{props.value}</span>
    </div>
  );
}

function EmptyState() {
  return <p className="text-sm text-slate-500">Дані з'являться після scan.</p>;
}

function formatShortDate(date: Date | null | undefined) {
  if (!date) return "немає";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatShortTime(date: Date | null | undefined) {
  if (!date) return "scan pending";
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: number) {
  if (!value) return "сума н/д";

  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "UAH",
  }).format(value);
}

function riskIndexLabel(score: number) {
  if (score >= 75) return "критичний рівень ризику";
  if (score >= 60) return "високий рівень ризику";
  if (score >= 40) return "помірний рівень ризику";
  return "низький рівень ризику";
}

function scoreTone(score: number) {
  if (score >= 75) return toneText.critical;
  if (score >= 60) return toneText.high;
  if (score >= 40) return toneText.medium;
  return toneText.low;
}

function scoreDot(score: number) {
  if (score >= 75) return toneDot.critical;
  if (score >= 60) return toneDot.high;
  if (score >= 40) return toneDot.medium;
  return toneDot.low;
}

function severityConicGradient(distribution: Record<Severity, number>) {
  const total =
    distribution.low +
    distribution.medium +
    distribution.high +
    distribution.critical;
  if (!total) {
    return "conic-gradient(#334155 0 100%)";
  }

  const critical = (distribution.critical / total) * 100;
  const high = critical + (distribution.high / total) * 100;
  const medium = high + (distribution.medium / total) * 100;

  return `conic-gradient(#ef4444 0 ${critical}%, #f97316 ${critical}% ${high}%, #fde047 ${high}% ${medium}%, #22c55e ${medium}% 100%)`;
}
