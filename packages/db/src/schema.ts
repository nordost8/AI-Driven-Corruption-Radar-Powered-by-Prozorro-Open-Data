import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const Post = pgTable("post", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  title: t.varchar({ length: 256 }).notNull(),
  content: t.text().notNull(),
  createdAt: t.timestamp().defaultNow().notNull(),
  updatedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .$onUpdateFn(() => sql`now()`),
}));

export const ProzorroScanRun = pgTable("prozorro_scan_run", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  startedAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: t.timestamp({ mode: "date", withTimezone: true }),
  source: t.varchar({ length: 128 }).notNull().default("prozorro-api-2.5"),
  scanLimit: t.integer().notNull(),
  status: t.varchar({ length: 32 }).notNull(),
  scannedCount: t.integer().notNull().default(0),
  fetchedCount: t.integer().notNull().default(0),
  analyzedCount: t.integer().notNull().default(0),
  signalCount: t.integer().notNull().default(0),
  error: t.text(),
}));

export const ProzorroTenderSnapshot = pgTable(
  "prozorro_tender_snapshot",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    tenderUid: t.varchar({ length: 128 }).notNull(),
    tenderId: t.varchar({ length: 128 }),
    dateModified: t.timestamp({ mode: "date", withTimezone: true }),
    publicModified: t.timestamp({ mode: "date", withTimezone: true }),
    buyerId: t.varchar({ length: 128 }),
    buyerName: t.text(),
    buyerRegion: t.text(),
    buyerLocality: t.text(),
    procurementMethodType: t.varchar({ length: 128 }),
    status: t.varchar({ length: 64 }),
    cpvPrefix: t.varchar({ length: 16 }),
    valueAmount: t.numeric({ precision: 14, scale: 2 }),
    valueCurrency: t.varchar({ length: 8 }),
    rawJson: t.jsonb().$type<Record<string, unknown>>().notNull(),
    analyzedAt: t.timestamp({ mode: "date", withTimezone: true }),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("prozorro_tender_snapshot_uid_idx").on(table.tenderUid),
  ],
);

export const RiskSignal = pgTable("risk_signal", (t) => ({
  id: t.uuid().notNull().primaryKey().defaultRandom(),
  scanRunId: t.uuid().references(() => ProzorroScanRun.id, {
    onDelete: "set null",
  }),
  tenderUid: t.varchar({ length: 128 }).notNull(),
  tenderId: t.varchar({ length: 128 }),
  code: t.varchar({ length: 64 }).notNull(),
  severity: t.varchar({ length: 16 }).notNull(),
  score: t.integer().notNull(),
  title: t.text().notNull(),
  explanation: t.text().notNull(),
  evidenceJson: t.jsonb().$type<Record<string, unknown>>().notNull(),
  buyerName: t.text(),
  buyerRegion: t.text(),
  buyerLocality: t.text(),
  valueAmount: t.numeric({ precision: 14, scale: 2 }),
  valueCurrency: t.varchar({ length: 8 }),
  procurementMethodType: t.varchar({ length: 128 }),
  prozorroUrl: t.text(),
  createdAt: t
    .timestamp({ mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
}));

export const RiskAlert = pgTable(
  "risk_alert",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    scanRunId: t.uuid().references(() => ProzorroScanRun.id, {
      onDelete: "set null",
    }),
    tenderUid: t.varchar({ length: 128 }).notNull(),
    tenderId: t.varchar({ length: 128 }),
    status: t.varchar({ length: 32 }).notNull(),
    recipient: t.text().notNull().default("НАБУ / САП"),
    testRecipientEmail: t.text(),
    subject: t.text().notNull(),
    body: t.text().notNull(),
    riskScore: t.integer().notNull(),
    severity: t.varchar({ length: 16 }).notNull(),
    signalCount: t.integer().notNull(),
    evidenceJson: t.jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: t
      .timestamp({ mode: "date", withTimezone: true })
      .$onUpdateFn(() => sql`now()`),
  }),
  (table) => [
    uniqueIndex("risk_alert_scan_tender_uid_idx").on(
      table.scanRunId,
      table.tenderUid,
    ),
    index("risk_alert_tender_uid_idx").on(table.tenderUid),
  ],
);

export const CreatePostSchema = createInsertSchema(Post, {
  title: z.string().max(256),
  content: z.string().max(256),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export * from "./auth-schema";
