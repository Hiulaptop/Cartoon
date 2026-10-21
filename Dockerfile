# syntax=docker/dockerfile:1

# ===== worker + migrate: Debian (Remotion ở M6 không chạy tốt trên Alpine) =====
FROM node:22-bookworm-slim AS worker-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-deps /app/node_modules ./node_modules
# Chrome Headless Shell cho Remotion (danh sách thư viện lấy từ spike M0, đã chạy thật).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 \
    libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
    libpango-1.0-0 libcairo2 libcups2 \
 && rm -rf /var/lib/apt/lists/*
# Tải trình duyệt lúc build để lần render đầu không phải tải (cache trong /app/.remotion).
RUN node -e "import('@remotion/renderer').then(m => m.ensureBrowser()).then(() => console.log('browser ok'))" \
 && mkdir -p /app/node_modules/.remotion \
 && chown -R node:node /app/.remotion /app/node_modules/.remotion
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src
USER node
CMD ["node_modules/.bin/tsx", "src/worker/index.ts"]

# ===== app Next.js: Alpine, bản standalone (stage cuối = mặc định của `docker build`) =====
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run lint && npm run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
