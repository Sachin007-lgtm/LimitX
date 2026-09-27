# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
