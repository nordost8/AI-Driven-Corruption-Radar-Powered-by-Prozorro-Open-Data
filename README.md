# AI-Driven Corruption Radar powered by Prozorro Open Data

Diploma MVP for monitoring procurement risk signals in Ukrainian Prozorro open data.

The project does not claim to prove corruption. It detects explainable risk indicators that should be reviewed by an auditor, journalist, analyst, or public procurement specialist.

## Current Product Direction

- Radar-style dashboard for procurement risk monitoring.
- Prozorro Open Procurement API integration.
- Deterministic risk rule engine as the primary signal source.
- Optional DeepSeek/Vercel AI SDK layer for explaining detected signals in human language.
- PostgreSQL + Drizzle for persistence.
- Next.js App Router frontend in a Turborepo monorepo.

## AI-Friendly Prozorro Documentation

This project is built on top of a dedicated **LLM-native documentation layer** for the Prozorro Open Procurement API. Before implementing the scanner and risk engine, the official API docs (197 pages) were converted into the `llms.txt` format so AI-assisted development tools (Cursor, Claude Code, etc.) could work with a complete, structured context instead of hallucinating endpoints and fields.

**Source repository (used explicitly in this project):**

- [nordost8/prozorro-docs-for-llms](https://github.com/nordost8/prozorro-docs-for-llms) — Prozorro Open Procurement API docs as `llms.txt` / `llms-full.txt` (197 pages, ~16.3 MB full text, ready for LLM context)

**Copies in this monorepo (for local AI tooling):**

- [`llms.txt`](llms.txt) — compact index with links and short summaries per documentation page
- [`llms-full.txt`](llms-full.txt) — full merged documentation for deep context windows

Without this artifact, reliable integration with Prozorro API 2.5 (`/tenders`, `/violation_reports`, complaints, awards, cancellations, etc.) would require dozens of manual fetches from [prozorro-api-docs.readthedocs.io](https://prozorro-api-docs.readthedocs.io/en/latest/). The AI-friendly docs are a first-class engineering input to the corruption radar, not optional reference material.

## Stack

- TypeScript, Turborepo, pnpm
- Next.js, React, Tailwind CSS
- tRPC + TanStack Query
- Drizzle ORM + PostgreSQL
- Better Auth
- Vercel AI SDK + DeepSeek for future risk explanations
- Zod v4

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm db:push
pnpm dev:next
```

Open:

```text
http://localhost:3000
```

## Environment Variables

| Variable                               | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `POSTGRES_URL`                         | PostgreSQL connection string                                 |
| `AUTH_SECRET`                          | Better Auth secret                                           |
| `AUTH_DEV_EMAIL` / `AUTH_DEV_PASSWORD` | Optional deterministic local login                           |
| `DEEPSEEK_API_KEY`                     | DeepSeek key for future server-side risk signal explanations |

Never commit real secrets. `.env` and `.env*.local` are gitignored.

## MVP Plan

1. Fetch latest tender IDs from `GET /api/2.5/tenders`.
2. Load full tender objects from `GET /api/2.5/tenders/{id}`.
3. Compute risk rules:
   - low competition;
   - low savings;
   - high-value direct awards;
   - risky cancellations;
   - complaint activity;
   - violation report matches.
4. Persist tender snapshots and risk signals.
5. Render the dashboard.
6. Add AI-generated explanations after the deterministic engine is stable.
