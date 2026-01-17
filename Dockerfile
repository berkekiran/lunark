# Multi-stage build for optimal image size
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 agent

# Copy built files
COPY --from=builder --chown=agent:nodejs /app/dist ./dist
COPY --from=builder --chown=agent:nodejs /app/package.json ./package.json
COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agent:nodejs /app/prisma ./prisma

# Create logs directory
RUN mkdir -p /app/logs && chown -R agent:nodejs /app

USER agent

EXPOSE 4545

ENV PORT=4545
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4545/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/app.js"]
