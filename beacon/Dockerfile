ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2

# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine
RUN npm install -g serve@14 && npm cache clean --force
WORKDIR /app
COPY --from=builder /app/dist /app/dist
COPY run.sh /run.sh
RUN chmod a+x /run.sh
ENTRYPOINT []
CMD ["/bin/sh", "/run.sh"]
