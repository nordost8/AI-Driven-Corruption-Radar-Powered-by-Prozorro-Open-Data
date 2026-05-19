# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA=1 \
    BROWSERSLIST_IGNORE_OLD_DATA=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.19.0 --activate

WORKDIR /app

FROM base AS builder

ENV AUTH_SECRET=build-time-placeholder \
    CI=1 \
    DEEPSEEK_API_KEY=build-time-placeholder \
    POSTGRES_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -F @acme/nextjs build

FROM base AS runner

ENV HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    PORT=7474

RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/.next/static ./apps/nextjs/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/nextjs/public ./apps/nextjs/public

USER nextjs

EXPOSE 7474

CMD ["node", "apps/nextjs/server.js"]
