# ── Build stage ───────────────────────────────────────────────────────────────
# Use Debian-based image for the build so native modules (lightningcss, etc.)
# resolve against glibc without musl compatibility issues.
FROM node:20 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# Install ALL deps (including devDeps — needed for Tailwind/lightningcss build)
RUN npm ci

COPY . .

ARG GIT_COMMIT=unknown
ARG VERSION=0.1.0
ARG API_URL=http://server:8080
ENV NEXT_TELEMETRY_DISABLED=1
ENV GIT_COMMIT=$GIT_COMMIT
ENV NEXT_PUBLIC_VERSION=$VERSION
ENV API_URL=$API_URL
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user
RUN addgroup -g 1001 nodejs && adduser -D -u 1001 -G nodejs nextjs

COPY --from=builder /app/public ./public

# Next.js standalone output (must have output: 'standalone' in next.config)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
