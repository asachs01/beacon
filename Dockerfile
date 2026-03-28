ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app
RUN npm install -g serve@14

COPY --from=builder /app/dist /app/dist
COPY run.sh /app/run.sh
RUN chmod a+x /app/run.sh

CMD ["/app/run.sh"]
