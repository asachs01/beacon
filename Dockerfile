ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2

# ---------- Build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html config.yaml tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ---------- Runtime stage ----------
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app

COPY --from=builder /app/dist/ /app/dist/
COPY --from=builder /app/node_modules/ws/ /app/node_modules/ws/
COPY run.sh /etc/services.d/beacon/run
COPY server.js /app/server.js
COPY server-guards.cjs /app/server-guards.cjs
COPY chores-sync.cjs /app/chores-sync.cjs
RUN chmod a+x /etc/services.d/beacon/run

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/beacon-action/health || exit 1
