ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2

# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules/ws /app/node_modules/ws
COPY run.sh /etc/services.d/beacon/run
COPY server.js /app/server.js
COPY custom_sentences/ /app/custom_sentences/
COPY custom_intents/ /app/custom_intents/
RUN chmod a+x /etc/services.d/beacon/run

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/ || exit 1
