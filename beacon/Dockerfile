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

RUN apk add --no-cache nodejs npm \
    && npm install -g serve@14 \
    && npm cache clean --force

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY run.sh /app/run.sh
RUN chmod a+x /app/run.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://localhost:3000/ || exit 1

CMD ["/app/run.sh"]
