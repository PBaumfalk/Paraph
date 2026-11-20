# Paraph – selbst gehostete Plattform für elektronische Signaturen. Mehrstufiger Build (amd64/arm64).
FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --foreground-scripts \
  && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"
COPY tsconfig.json tsconfig.web.json vite.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund \
  && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"

FROM node:26-bookworm-slim
ARG PARAPH_VERSION=0.3.1
LABEL org.opencontainers.image.title="Paraph" \
      org.opencontainers.image.description="Selbst gehostete Plattform für elektronische Signaturen" \
      org.opencontainers.image.version="${PARAPH_VERSION}" \
      org.opencontainers.image.licenses="MIT"
# npm/npx/corepack werden zur Laufzeit nicht gebraucht
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 HOST=0.0.0.0 PARAPH_BUILD_VERSION=${PARAPH_VERSION}
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docker/paraph /usr/local/bin/paraph
RUN mkdir -p /data /backups && chown -R node:node /data /backups
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["paraph", "health"]
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/server/main.js"]
