import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { getRiskDashboard } from "../prozorro-risk/analytics";
import { refreshProzorroScanInBackground } from "../prozorro-risk/scanner";
import { riskSignalCodes } from "../prozorro-risk/types";
import { publicProcedure } from "../trpc";

const PeriodSchema = z
  .enum(["today", "yesterday", "week", "month", "year", "all"])
  .default("today");
const SignalCodeSchema = z.enum(riskSignalCodes);

export const prozorroRiskRouter = {
  dashboard: publicProcedure
    .input(
      z
        .object({
          period: PeriodSchema,
          signalCodes: z.array(SignalCodeSchema).default([]),
        })
        .default({ period: "today", signalCodes: [] }),
    )
    .query(async ({ ctx, input }) => {
      void refreshProzorroScanInBackground(ctx.db);
      return getRiskDashboard(ctx.db, input.period, input.signalCodes);
    }),
} satisfies TRPCRouterRecord;
