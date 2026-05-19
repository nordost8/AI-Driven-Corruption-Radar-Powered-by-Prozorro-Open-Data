import type {
  ProzorroTenderData,
  ProzorroTenderSummary,
  ProzorroViolationReportData,
  ProzorroViolationReportSummary,
} from "./types";

const PROZORRO_API_BASE = "https://public-api.prozorro.gov.ua/api/2.5";

interface ProzorroTenderListResponse {
  data?: ProzorroTenderSummary[];
}

interface ProzorroTenderResponse {
  data?: ProzorroTenderData;
}

interface ProzorroViolationReportListResponse {
  data?: ProzorroViolationReportSummary[];
}

interface ProzorroViolationReportResponse {
  data?: ProzorroViolationReportData;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "prozorro-risk-radar-mvp/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Prozorro API ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchLatestTenderSummaries(limit: number) {
  const url = new URL(`${PROZORRO_API_BASE}/tenders`);
  url.searchParams.set("descending", "1");
  url.searchParams.set("limit", String(limit));

  const payload = await fetchJson<ProzorroTenderListResponse>(url.toString());
  return payload.data ?? [];
}

export async function fetchTenderDetails(tenderUid: string) {
  const payload = await fetchJson<ProzorroTenderResponse>(
    `${PROZORRO_API_BASE}/tenders/${tenderUid}`,
  );

  if (!payload.data) {
    throw new Error(`Prozorro tender ${tenderUid} returned no data`);
  }

  return payload.data;
}

export function getTenderPublicUrl(tenderUid: string) {
  return `https://prozorro.gov.ua/tender/${tenderUid}`;
}

export async function fetchLatestViolationReportSummaries(limit: number) {
  const url = new URL(`${PROZORRO_API_BASE}/violation_reports`);
  url.searchParams.set("descending", "1");
  url.searchParams.set("limit", String(limit));

  const payload = await fetchJson<ProzorroViolationReportListResponse>(
    url.toString(),
  );
  return payload.data ?? [];
}

export async function fetchViolationReportDetails(reportUid: string) {
  const payload = await fetchJson<ProzorroViolationReportResponse>(
    `${PROZORRO_API_BASE}/violation_reports/${reportUid}`,
  );

  if (!payload.data) {
    throw new Error(`Prozorro violation report ${reportUid} returned no data`);
  }

  return payload.data;
}
