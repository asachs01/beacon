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
COPY run.sh /
RUN chmod a+x /run.sh
