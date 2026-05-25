# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first (layer cached unless package.json changes)
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy source
COPY . .

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS production

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001

WORKDIR /app

COPY --from=base --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=base --chown=nodejs:nodejs /app .

USER nodejs

EXPOSE 8080

# Graceful shutdown support
STOPSIGNAL SIGTERM

CMD ["node", "server.js"]