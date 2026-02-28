# Stage 1: Build — compile native deps (mediasoup) + TypeScript
FROM node:25-alpine AS builder
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

# Copy workspace root package files for npm workspaces resolution
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY shared/package.json shared/

# Install all deps from lockfile (includes devDeps like typescript for building)
# Note: npm ci installs the full lockfile (~412 packages incl. client deps).
# This is intentional — the lockfile pins patched versions of transitive deps,
# and mediasoup C++ compilation dominates build time regardless of package count.
# Docker layer caching (GHA cache) skips this step when lockfile is unchanged.
RUN --mount=type=cache,target=/root/.npm npm ci

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
FROM node:25-alpine

# mediasoup worker requires python3 at runtime
# Remove npm (not needed at runtime) to eliminate bundled vulnerable deps
RUN apk add --no-cache python3 \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy compiled output and production node_modules from builder
# All deps are hoisted to root node_modules by npm workspaces
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/package.json ./

# Copy drizzle migrations (needed at runtime for auto-migrate on startup)
COPY server/drizzle/ ./server/drizzle/

USER appuser
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
