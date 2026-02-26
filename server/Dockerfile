# Stage 1: Build — compile native deps (mediasoup, better-sqlite3) + TypeScript
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

# Copy workspace root package files for npm workspaces resolution
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY shared/package.json shared/

# Install ALL deps (including devDeps like typescript) for building
# Root install first (gets typescript + shared devDeps), then workspace-specific native deps
RUN npm ci

# Copy source and compile TypeScript
COPY shared/src/ shared/src/
COPY shared/tsconfig.json shared/
COPY server/src/ server/src/
COPY server/tsconfig.json server/
COPY tsconfig.base.json ./
RUN npm run build -w shared && npm run build -w server

# Prune devDependencies after build — production image only gets runtime deps
RUN npm prune --omit=dev

# Stage 2: Production — minimal runtime image
FROM node:20-alpine

# mediasoup worker requires python3 at runtime
RUN apk add --no-cache python3

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy compiled output and production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/shared/node_modules ./shared/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/package.json ./

# Copy drizzle migrations (needed at runtime for auto-migrate on startup)
COPY server/drizzle/ ./server/drizzle/

# Data directory will be mounted as a volume
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

USER appuser
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
