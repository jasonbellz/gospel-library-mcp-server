# syntax=docker/dockerfile:1.7

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install dependencies using the lockfile for reproducible builds.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies for the runtime image.
RUN npm prune --omit=dev

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Run as non-root.
RUN groupadd --system --gid 1001 app \
 && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app

ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --chown=app:app infra/schema.sql ./infra/schema.sql
COPY --chown=app:app DISCLAIMER.md ./DISCLAIMER.md

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["node", "dist/index.js"]
CMD ["server"]
