# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# ---------- Runtime stage ----------
ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm \
    && npm install -g serve@14 \
    && npm cache clean --force

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY run.sh /app/run.sh
RUN chmod a+x /app/run.sh

CMD ["/app/run.sh"]
