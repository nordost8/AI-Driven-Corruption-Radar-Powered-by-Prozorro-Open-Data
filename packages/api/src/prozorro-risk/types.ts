export type RiskSeverity = "low" | "medium" | "high" | "critical";

export const riskSignalCodes = [
  "LOW_COMPETITION",
  "LOW_SAVINGS",
  "HIGH_VALUE_DIRECT",
  "RISKY_CANCELLATION",
  "COMPLAINT_ACTIVITY",
  "VIOLATION_REPORT_MATCH",
  "PROCUREMENT_SPLITTING",
  "REPEATED_BUYER_SUPPLIER",
] as const;

export type RiskSignalCode = (typeof riskSignalCodes)[number];

export type RiskPeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "all";

export type JsonRecord = Record<string, unknown>;

export interface TenderRiskSignal {
  code: string;
  severity: RiskSeverity;
  score: number;
  title: string;
  explanation: string;
  evidence: JsonRecord;
}

export interface ProzorroTenderSummary {
  id: string;
  dateModified?: string;
}

export interface ProzorroViolationReportSummary {
  id: string;
  dateModified?: string;
}

export type ProzorroViolationReportData = JsonRecord & {
  id?: string;
  violationReportID?: string;
  status?: string;
  tender_id?: string;
  contract_id?: string;
  dateModified?: string;
  details?: {
    reason?: string;
    description?: string;
  };
  authority?: {
    name?: string;
    identifier?: {
      id?: string;
    };
  };
  defendants?: {
    name?: string;
    identifier?: {
      id?: string;
    };
  }[];
  decisions?: {
    resolution?: string;
    status?: string;
    description?: string;
  }[];
};

export type ProzorroTenderData = JsonRecord & {
  id?: string;
  tenderID?: string;
  dateModified?: string;
  publicModified?: string;
  status?: string;
  procurementMethodType?: string;
  numberOfBids?: number;
  value?: {
    amount?: number;
    currency?: string;
  };
  buyer?: {
    name?: string;
    identifier?: {
      id?: string;
    };
    address?: {
      region?: string;
      locality?: string;
      streetAddress?: string;
      postalCode?: string;
    };
  };
  procuringEntity?: {
    name?: string;
    identifier?: {
      id?: string;
    };
    address?: {
      region?: string;
      locality?: string;
      streetAddress?: string;
      postalCode?: string;
    };
  };
  awards?: {
    status?: string;
    value?: {
      amount?: number;
      currency?: string;
    };
    suppliers?: {
      name?: string;
      identifier?: {
        id?: string;
      };
    }[];
    complaints?: ({ status?: string } & JsonRecord)[];
  }[];
  bids?: {
    status?: string;
  }[];
  cancellations?: {
    status?: string;
    reasonType?: string;
    reason?: string;
  }[];
  complaints?: ({ status?: string } & JsonRecord)[];
  items?: {
    classification?: {
      id?: string;
    };
  }[];
};
