---
title: 'Deployment Architecture Overhaul'
slug: 'deployment-architecture-overhaul'
created: '2026-02-27'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Docker Compose', 'GHCR', 'Trivy', 'AWS SSM', 'AWS OIDC', 'Terraform', 'CloudWatch', 'Nginx 1.27-alpine', 'GitHub Actions', 'coturn/coturn:4.6.3', 'certbot/certbot:v3.1.0', 'node:20-alpine']
files_to_modify: ['docker-compose.yml', '.github/workflows/release.yml', '.github/workflows/ci.yml', '.github/dependabot.yml', 'docker/nginx/nginx.conf', 'docker/nginx/nginx.conf.template', 'server/Dockerfile', 'server/src/index.ts', 'server/src/scripts/migrate.ts', 'scripts/setup.sh', 'scripts/deploy.sh', 'scripts/rollback-config.sh', '.env.example', 'docker/coturn/turnserver.prod.conf', 'infrastructure/main.tf', 'infrastructure/bootstrap/main.tf', 'infrastructure/import.sh', 'docs/migration-policy.md']
code_patterns: ['GitHub Actions OIDC federation', 'AWS SSM Run Command with structured status parsing', 'Blue-green Docker deployment with split mediasoup UDP ranges', 'GHCR image tagging (SHA + semver + latest)', 'SHA-pinned GitHub Actions for supply-chain security', 'Dependabot for automated action/image/npm/docker updates (root + /server)', 'Terraform HCL for EC2 + IAM + SG + S3 with terraform import for existing resources', 'Fastify onClose hook chain: app hook closes mediasoup first + db plugin drains pool second (reverse registration order)', 'Docker Compose profiles for deploy-only containers', 'nginx upstream switching via template + nginx -t validation + reload', 'SSM secrets passed as environment overrides (no file on disk) with reboot persistence via container config', 'Application-level connection draining via /api/drain endpoint with X-Drain-Token auth', 'Database migration guard via RUN_MIGRATIONS env var', 'Dedicated migration entry point (scripts/migrate.ts) using createDatabase() sync interface', 'Expand-contract migration policy for blue-green backward compatibility', 'DB_POOL_MAX=20 per blue-green slot (40 peak during switchover within Supabase 60-conn limit)', 'DATABASE_URL for Supabase managed Postgres via Supavisor session mode port 5432 (no local DB volume)', 'postgres.js max_lifetime 30min for Supabase connection rotation', 'withDbRetry for transient Supabase errors (08006/08001/57P01)', 'dorny/paths-filter for conditional Terraform CI validation']
test_patterns: ['No automated tests — infrastructure validated by dry-run, health checks, and manual verification', 'Blue-green rollback tested by deploying broken image', 'CloudWatch verified by checking log group population']
---

# Tech-Spec: Deployment Architecture Overhaul

**Created:** 2026-02-27

## Overview

### Problem Statement

The current deployment pipeline builds images on the production EC2 instance, uses `network_mode: host` on all containers with zero isolation, deploys via static SSH keys with no audit trail, stores secrets in a plain `.env` file, has no resource limits or log rotation, and causes downtime on every deploy. These gaps introduce real operational and security risk.

### Solution

Implement the full deployment architecture review across 6 phased stories — from Docker Compose hardening through Terraform IaC — resulting in registry-based image management, bridge networking, SSM+OIDC deployment, blue-green zero-downtime deploys, centralized secrets, CloudWatch observability, and reproducible infrastructure.

### Scope

**In Scope:**
- **Phase 1:** Docker Compose hardening (resource limits, log rotation, health check start_period, image pinning, security_opt, depends_on conditions, read_only filesystem) + minimal server lifecycle changes for container orchestration (SIGTERM handler, graceful shutdown)
- **Phase 2:** GHCR container registry + Trivy scanning + image-based rollback
- **Phase 3:** Bridge networking for app/nginx/certbot (100-port mediasoup range), host mode only for coturn
- **Phase 4:** AWS SSM + OIDC replacing SSH deployment, environment protection rules, close port 22
- **Phase 5:** Blue-green deployment (app-blue/app-green, deploy script, nginx upstream switching, connection draining)
- **Phase 6:** SSM Parameter Store secrets, CloudWatch log shipping, Terraform IaC, uptime monitoring, deploy failure notifications

**Out of Scope:**
- Application feature/logic changes (Fastify routes, React UI, mediasoup call logic)
- Database migrations or schema changes (Supabase migration is a prerequisite — see `tech-spec-supabase-migration.md`)
- Electron client build/distribution changes
- Multi-instance / auto-scaling architecture

**Prerequisite:** The Supabase migration (`tech-spec-supabase-migration.md`) must be completed before implementing this spec. That migration removes SQLite entirely — the app connects to Supabase-hosted PostgreSQL via `DATABASE_URL` with no local database volume. All references in this spec reflect the post-Supabase state.

## Context for Development

### Codebase Patterns

**GitHub Actions:**
- Workflows use `actions/checkout@v4`, `actions/setup-node@v4` with Node 20
- `release.yml` triggers on `push: tags: ['v*']` — 4 existing jobs: `validate-version`, `build-electron` (3-OS matrix), `publish-release`, `deploy-server`
- `ci.yml` triggers on `pull_request` to `main` — runs lint, test, build
- Current deploy uses `appleboy/ssh-action@v1` and `appleboy/scp-action@v0.1.7` with secrets `EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`, `EC2_DEPLOY_PATH`
- Deploy downloads release assets via `gh CLI`, uploads to EC2 via SCP, then SSH executes: save rollback state → git pull → docker compose build → docker compose up → health check → rollback on failure
- Concurrency control: `group: release`, `cancel-in-progress: false`

**Docker Compose (current `docker-compose.yml`):**
- 4 services: `app`, `coturn`, `nginx`, `certbot`
- ALL services use `network_mode: host` — zero network isolation
- `app` builds from `server/Dockerfile` (context: `.`), env from `.env` (which includes `DATABASE_URL` pointing to Supabase — no local DB volume)
- `coturn` uses `coturn/coturn:latest` (unpinned), volume mounts `turnserver.prod.conf:ro`
- `nginx` uses `nginx:alpine` (unpinned), depends on `app` (no health condition), volumes for config/landing/downloads/certs
- `certbot` uses `certbot/certbot`, renewal loop via entrypoint, depends on `nginx`
- No resource limits, no log rotation, no `start_period`, no `security_opt`
- Health check on app only: `wget --spider -q http://127.0.0.1:3000/api/health` (30s interval, 5s timeout, 3 retries)

**Nginx (`docker/nginx/nginx.conf`):**
- Upstream block: `server 127.0.0.1:3000` (hardcoded single backend)
- Rate limiting: `60r/m` with burst 20 on `/api/`
- TLS: Let's Encrypt certs at `/etc/letsencrypt/live/discweeds.com/`, TLS 1.2+1.3, HSTS 2yr
- WebSocket proxy at `/ws` with 86400s read/send timeout
- Downloads served from `/usr/share/nginx/downloads/`
- Landing page SPA with `try_files`

**Server Application:**
- `server/src/index.ts`: Entry point — NO SIGTERM handler. Calls `buildApp()` + `app.listen()` inside an async `start()` function but never `app.close()` on signal. Runs Drizzle migrations at startup via `runMigrations(app.migrate)` then seeds default channels
- `server/src/app.ts:55`: App-level `onClose` hook calls `closeMediasoup()` to shut down WebRTC workers — executes IF `app.close()` is called
- `server/src/plugins/db.ts:50-53`: DB plugin `onClose` hook clears the periodic health timer and drains the postgres.js connection pool via `close()` (calls `client.end()` from `createDatabase()` in `connection.ts:90`). This runs after the app-level `onClose` hook due to Fastify's reverse plugin registration ordering (db plugin registered first at `app.ts:35`, so its `onClose` runs last)
- `server/src/plugins/db.ts:17-47`: Periodic health monitor runs `SELECT 1` every 60s against Supabase. After 3 consecutive failures, logs fatal and triggers graceful shutdown with a 5s hard-exit timeout. Skips monitoring for PGlite (tests)
- Health endpoint at `app.ts:59`: `GET /api/health` — checks Supabase connectivity via `SELECT 1 as result`, returns `503` with `DATABASE_UNAVAILABLE` code on failure
- `server/src/db/connection.ts:48`: `createDatabase()` is **synchronous** — returns `DatabaseConnection { db, close, migrate }`. The `migrate()` function internally creates a **separate** postgres.js connection without `statement_timeout` to avoid DDL operations hitting the 30s query limit (connection.ts:76-86)
- Connection pool configurable via env vars: `DB_POOL_MAX` (default 10), `DB_IDLE_TIMEOUT` (default 20s), `DB_CONNECT_TIMEOUT` (default 10s). Pool has `max_lifetime: 30 min` for automatic connection rotation to handle Supabase infrastructure updates
- `server/src/db/withDbRetry.ts`: Retry wrapper for transient Supabase errors (SQLSTATE codes `08006` connection_failure, `08001` unable_to_connect, `57P01` admin_shutdown). Used in WebSocket message handler for resilience during Supabase maintenance
- Mediasoup port range: `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` read from env (defaults 40000-49999)
- `.env.example` has all env vars including `MEDIASOUP_MIN_PORT=40000`, `MEDIASOUP_MAX_PORT=49999`, Supabase `DATABASE_URL` with 3 connection mode options (session/direct/transaction), tunable pool settings `DB_POOL_MAX`/`DB_IDLE_TIMEOUT`/`DB_CONNECT_TIMEOUT`

**Dockerfile (`server/Dockerfile`):**
- Multi-stage: `node:20-alpine` builder + `node:20-alpine` production
- Builder: installs build tools, `npm ci`, builds shared+server TypeScript, prunes devDeps
- Production: non-root `appuser`, copies compiled dist + node_modules + drizzle migrations
- No `STOPSIGNAL` directive (defaults to SIGTERM, which is correct)
- Exposes port 3000

**Setup (`scripts/setup.sh`):**
- Interactive: prompts for domain, email, server name, GitHub releases URL
- Auto-detects public/private IP for coturn NAT
- Generates JWT + TURN secrets via `openssl rand -hex 32`
- Creates `.env` from `.env.example` with `chmod 600`
- Updates coturn config, nginx config, landing page via `sed`
- Runs initial certbot standalone for TLS cert

**Coturn (`docker/coturn/turnserver.prod.conf`):**
- Ports: listening 3478, relay 49152-49252
- Auth: `use-auth-secret` with `static-auth-secret` (sed-replaced by setup.sh, but placeholder committed to git)
- NAT: `external-ip=PUBLIC/PRIVATE` format

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `docker-compose.yml` | 4 services: app, coturn, nginx, certbot — all on host networking, no resource limits |
| `.github/workflows/release.yml` | Release pipeline: validate, build Electron, publish, deploy to EC2 via SSH (217 lines) |
| `.github/workflows/ci.yml` | PR pipeline: test, lint, build (44 lines) — reference for workflow patterns |
| `docker/nginx/nginx.conf` | TLS termination, reverse proxy, rate limiting, upstream `127.0.0.1:3000` |
| `server/Dockerfile` | Multi-stage build: node:20-alpine, non-root user, port 3000 (56 lines) |
| `server/src/index.ts` | Server entry point — MISSING SIGTERM handler, runs migrations at startup (49 lines) |
| `server/src/app.ts` | Fastify app builder, health endpoint, onClose hook for mediasoup (71 lines) |
| `server/src/plugins/db.ts` | DB plugin: connection lifecycle, periodic health monitor (60s/3-failure), onClose drains pool (62 lines) |
| `server/src/db/connection.ts` | Dual-mode connection factory (postgres.js + PGlite), pool config via DB_POOL_MAX env var, Supabase SSL enforcement, migration connection without statement_timeout (105 lines) |
| `server/src/db/withDbRetry.ts` | Retry wrapper for transient Supabase errors (08006, 08001, 57P01) — used in WebSocket handlers |
| `server/src/plugins/voice/mediasoupManager.ts` | Reads MEDIASOUP_MIN_PORT/MAX_PORT from env (line 8-9) |
| `scripts/setup.sh` | One-time EC2 setup: secrets, .env, certbot, coturn config (155 lines) |
| `.env.example` | All env vars: Supabase DATABASE_URL (3 modes), DB_POOL_MAX/DB_IDLE_TIMEOUT/DB_CONNECT_TIMEOUT, mediasoup ports, secrets, domain config (82 lines) |
| `docker/coturn/turnserver.prod.conf` | TURN config: ports 49152-49252, auth secret placeholder |
| `.dockerignore` | Excludes client/, .git/, node_modules/, .env, _bmad*/ |
| `_bmad-output/planning-artifacts/deployment-architecture-review.md` | Source review document with all recommendations |

### Technical Decisions

- **Registry:** GHCR (free, native GitHub Actions integration via `GITHUB_TOKEN`, zero additional config)
- **Image tagging:** Triple-tag every build: git SHA (immutable traceability), semver (human-readable rollback), `latest` (convenience, never pinned in production)
- **Networking:** Custom `backend` bridge network for app/nginx/certbot. Host mode only for coturn (UDP relay needs raw port access). Mediasoup port range reduced from 40000-49999 to 40000-40099 (100 ports via `.env`). **Capacity analysis:** Each mediasoup WebRtcTransport consumes 1 UDP port for ICE. Each peer in a voice channel needs ~2 ports (send + receive transport). With blue-green split (50 ports per slot), each slot supports ~25 concurrent voice users. This is acceptable for the project's expected scale. If concurrent voice users exceed 20, widen the range (e.g., 40000-40499 per slot), update the security group, and redeploy
- **Deployment method:** AWS SSM + OIDC — short-lived credentials, no SSH keys, no port 22, full CloudTrail audit. IAM role trust policy scoped to `repo:AidenWoodside/discord_clone:environment:production` (environment claim, not tag ref — requires both GitHub environment approval and matching OIDC token)
- **Zero-downtime:** Blue-green with `app-blue` (port 3001, UDP 40000-40049) and `app-green` (port 3002, UDP 40050-40099). Deploy script determines active slot by inspecting running containers (no ephemeral state file). Nginx upstream switched via template (`nginx.conf.template` with `{{UPSTREAM}}` placeholder) + `nginx -t` validation + `nginx -s reload`, with full rollback on failure. Green uses Docker Compose `profiles: [deploy]` — only started during deploys. Both slots use `restart: unless-stopped` for crash recovery. **Connection pool budget:** During the brief switchover window both slots hold Supabase connection pools simultaneously. The pool size is controlled by the `DB_POOL_MAX` environment variable (default: 10, see `connection.ts:59`). Set `DB_POOL_MAX` so that `blue_pool + green_pool` does not exceed Supabase's connection limit (Free tier: 60 direct connections via Supavisor session mode on port 5432). Recommended: `DB_POOL_MAX=20` per slot (40 total during switchover, leaving 20 connections for migrations, health checks, and Supabase dashboard). With the default of 10, both slots would use 20 total during switchover — safely within limits but with less headroom. Set this via the `environment:` block in `docker-compose.yml` for each slot (not by editing `connection.ts`). The pool also has `max_lifetime: 30 min` for automatic connection rotation, ensuring stale connections don't accumulate after nginx switches traffic
- **Graceful shutdown:** Add SIGTERM handler to `server/src/index.ts` calling `app.close()` (Phase 1, Task 1.10 — container lifecycle hygiene, not deferred to Phase 5). `stop_grace_period: 30s` on both app containers. On `app.close()`, Fastify invokes `onClose` hooks in reverse plugin registration order: (1) the app-level hook (`app.ts:55`) calls `closeMediasoup()` to shut down WebRTC workers, then (2) the db plugin (`db.ts:50-53`) clears the periodic health timer and drains the postgres.js connection pool via `client.end()`. This ordering is correct — mediasoup workers shut down before the DB pool drains, preventing voice-related DB writes from failing due to a closed pool. Without the SIGTERM handler, Docker force-kills after `stop_grace_period`, leaving Supabase connections in a stale state until they hit the 30-min `max_lifetime` rotation
- **Secrets:** AWS SSM Parameter Store with `SecureString` type (KMS encryption). Fetched at deploy time, passed as env vars — no `.env` file on disk. Secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TURN_SECRET`, `GROUP_ENCRYPTION_KEY`, `DATABASE_URL` (Supabase connection string containing password — must be treated as a secret)
- **Logging:** Phase 1 uses `json-file` driver with `max-size: 10m`, `max-file: 5`. Phase 6 switches to `awslogs` driver shipping to CloudWatch log groups `/discord-clone/production/{service}`
- **IaC:** Terraform for EC2 instance, security group (443, 80, 3478 UDP, 49152-49252 UDP, 40000-40099 UDP), IAM role + instance profile (SSM + CloudWatch), OIDC provider. State stored in S3 + DynamoDB lock
- **Uptime:** External monitoring service (UptimeRobot/Better Stack) hitting `https://discweeds.com/api/health` every 60s
- **Deploy notifications:** Discord webhook on GitHub Actions failure — POST to `DEPLOY_WEBHOOK_URL` secret
- **Docker Compose version:** Requires Docker Compose V2 >= 2.20 (the `docker compose` plugin, not the standalone `docker-compose` V1 binary). Required for `--status` filter in `docker compose ps`, `profiles` behavior, and structured output. The deploy script validates this at startup. Ubuntu 22.04's `apt install docker-compose-plugin` provides V2 but may need a manual update for >= 2.20. The `scripts/setup.sh` and Terraform EC2 user_data should install the correct version
- **Cert renewal:** Add daily cron on host to `docker compose exec nginx nginx -s reload` after certbot renews
- **Image pinning:** `nginx:1.27-alpine`, `coturn/coturn:4.6.3`, `certbot/certbot:v3.1.0` (all third-party images pinned — certbot handles TLS certs and a broken upstream causes total site unavailability)

## Implementation Plan

Each phase is a separate implementation story. Phases are ordered by dependency (see dependency graph in Additional Context). Phases 3 and 4 can be executed in parallel after Phase 2; all others are sequential. A fresh dev agent should be able to implement any single phase given this spec and the deployment architecture review document.

---

### Phase 1: Docker Compose Hardening

**Story:** As the server operator, I want hardened Docker Compose configuration with resource limits, log rotation, security options, proper dependency management, and graceful shutdown so that the deployment is resilient and follows container security best practices.

**Prerequisites:** None — this phase has no external dependencies.

#### Tasks

- [ ] Task 1.1: Add resource limits to all services
  - File: `docker-compose.yml`
  - Action: Add `deploy.resources.limits` and `deploy.resources.reservations` to each service:
    - `app`: limits `cpus: '2.0'`, `memory: 1G`; reservations `cpus: '0.25'`, `memory: 256M`
    - `nginx`: limits `cpus: '0.5'`, `memory: 256M`
    - `coturn`: limits `cpus: '1.0'`, `memory: 512M`
    - `certbot`: limits `cpus: '0.25'`, `memory: 128M`
  - Notes: Tune after running `docker stats` under load. These are initial safe values for a t3.medium (2 vCPU, 4GB RAM)

- [ ] Task 1.2: Add log rotation to all services
  - File: `docker-compose.yml`
  - Action: Add `logging` config to each service:
    ```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    ```
  - Notes: Applied to app, nginx, coturn, certbot. Prevents unbounded disk growth

- [ ] Task 1.3: Improve health check configuration
  - File: `docker-compose.yml`
  - Action: Add `start_period: 30s` to the `app` health check (allows time for migrations + mediasoup worker init). Add `stop_grace_period: 30s` and `stop_signal: SIGTERM` to app service
  - Notes: `start_period` prevents Docker marking container unhealthy during boot

- [ ] Task 1.4: Pin third-party image versions
  - File: `docker-compose.yml`
  - Action: Change `nginx:alpine` to `nginx:1.27-alpine`. Change `coturn/coturn:latest` to `coturn/coturn:4.6.3`. Change `certbot/certbot` to `certbot/certbot:v3.1.0`
  - Notes: Prevents surprise breaking changes from upstream. Update deliberately after testing. Certbot manages TLS certificates — a broken upstream image causes cert renewal failure and total site unavailability, so it must be pinned like every other image. **Update cadence:** Certbot releases frequently for ACME protocol changes. Review pinned versions quarterly (or set up Dependabot/Renovate to automate version bump PRs for Docker image tags). When updating, test cert renewal in a non-production context first

- [ ] Task 1.5: Add `depends_on` health condition
  - File: `docker-compose.yml`
  - Action: Change nginx's `depends_on` from `- app` to:
    ```yaml
    depends_on:
      app:
        condition: service_healthy
    ```
  - Notes: Ensures nginx doesn't start proxying until the app's health check passes

- [ ] Task 1.6: Add security options to containers
  - File: `docker-compose.yml`
  - Action: Add to `app`:
    ```yaml
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    ```
    Add to `nginx`:
    ```yaml
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    ```
    Add `read_only: true` to the `app` service (no local DB writes after Supabase migration — the app only connects to external Supabase via `DATABASE_URL`). Add `tmpfs` mounts for all writable paths the Node.js runtime may need:
    ```yaml
    read_only: true
    tmpfs:
      - /tmp
      - /home/appuser/.npm
    ```
  - Notes: `no-new-privileges` prevents privilege escalation. `cap_drop: ALL` removes all Linux capabilities. Nginx needs `NET_BIND_SERVICE` for ports 80/443. The app container can be `read_only: true` because there is no local database — all data is stored in Supabase. Nginx still needs writable `/var/cache/nginx` so do NOT add `read_only` to nginx. The `/home/appuser/.npm` tmpfs mount is a safety net — the production container should not run `npm`, but Node.js may attempt cache writes to the home directory. **Verification:** After enabling `read_only`, run the app container and check for EROFS (read-only filesystem) errors in logs: `docker compose logs app 2>&1 | grep -i "read-only\|EROFS\|permission denied"`. If any writes fail, add the target path as an additional tmpfs mount

- [ ] Task 1.7: Verify SQLite volume is removed from Docker Compose
  - File: `docker-compose.yml`
  - Action: **Already done** — the Supabase migration has removed the `./data/sqlite:/app/data` volume mount from the `app` service. Verify this is still the case. The app container has no data volumes — it connects to Supabase via `DATABASE_URL` (from `env_file: .env`). Keep nginx/coturn/certbot bind mounts (config files need host filesystem access). Remove the `./data/sqlite` directory from EC2 after verifying Supabase migration is complete and production data is accessible in Supabase. No `volumes:` section needed for database storage.
  - Notes: The Supabase migration eliminated local database storage entirely. The current `docker-compose.yml` confirms no SQLite volume exists. If the old `./data/sqlite` directory still exists on EC2, archive and delete it. The app container is now stateless (all persistent state in Supabase)

- [ ] Task 1.8: Add Docker Compose validation to CI pipeline
  - File: `.github/workflows/ci.yml`
  - Action: Add a step to the CI workflow that validates the Docker Compose file after any changes:
    ```yaml
    - name: Validate Docker Compose config
      run: |
        cp .env.example .env
        echo "IMAGE_TAG=ci-test" >> .env
        docker compose config --quiet
        rm .env
    ```
  - Notes: This catches YAML syntax errors, invalid service references, bad profile configs, and malformed resource limits before they reach production. Add this after the build steps. Since Phase 1 makes heavy modifications to the compose file, catching errors in CI is essential. The `.env.example` stub provides values for all interpolated variables (`${IMAGE_TAG}`, `${DATABASE_URL}`, etc.) so that `docker compose config` does not fail on undefined vars. After Phase 6 adds `${JWT_ACCESS_SECRET}` etc. to the compose file, ensure those variables also have empty-string defaults in the compose file (e.g., `${JWT_ACCESS_SECRET:-}`) or are present in `.env.example`

- [ ] Task 1.9: Add GitHub environment protection rules
  - File: N/A (GitHub Settings)
  - Action: In GitHub Settings > Environments, create a `production` environment. Add required reviewers (owner). Set branch restriction to tags matching `v*`. Add `environment: production` to the `deploy-server` job in `release.yml`
  - Notes: This is a manual GitHub Settings change plus a one-line addition to `release.yml`

- [ ] Task 1.10: Add SIGTERM handler to server entry point
  - File: `server/src/index.ts`
  - Action: Inside the existing `start()` function, after `await app.listen(...)` (line 41), add:
    ```typescript
    const shutdown = async () => {
      app.log.info('SIGTERM received, shutting down gracefully...');
      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    ```
  - Notes: This ensures `app.close()` is called, which triggers the `onClose` hooks in reverse plugin registration order: (1) the app-level hook (`app.ts:55`) calls `closeMediasoup()` to shut down WebRTC workers, then (2) the db plugin (`db.ts:50-53`) clears the periodic health check timer and drains the Supabase connection pool via `client.end()`. This ordering is correct — mediasoup shuts down before the pool drains, preventing voice-related DB writes from failing. Without the SIGTERM handler, Docker's SIGTERM is ignored and the process is force-killed after `stop_grace_period`, leaving Supabase connections in a stale state until `max_lifetime` (30 min) rotates them. This is container lifecycle hygiene — required for clean shutdowns regardless of blue-green deployment. Moving this to Phase 1 allows early validation of graceful shutdown behavior

#### Acceptance Criteria

- [ ] AC 1.1: Given the updated `docker-compose.yml`, when `docker compose config` is run, then it validates without errors and all services show resource limits, logging config, and security options
- [ ] AC 1.2: Given the app service is starting, when it takes >10s to boot (migrations + mediasoup init), then Docker does not mark it unhealthy during the `start_period` window
- [ ] AC 1.3: Given nginx depends on app with `condition: service_healthy`, when `docker compose up -d` is run, then nginx starts only after the app health check passes
- [ ] AC 1.4: Given `nginx:1.27-alpine` and `coturn/coturn:4.6.3` are pinned, when `docker compose pull` is run, then it pulls those exact versions (not latest)
- [ ] AC 1.5: Given the app container is running, when `docker inspect` is run on it, then `NoNewPrivileges` is `true` and `CapDrop` includes `ALL`
- [ ] AC 1.6: Given the app container has no local database volume (Supabase is external), when `docker compose down` and `docker compose up -d` are run, then the app reconnects to Supabase and all data is intact (no local storage dependency)
- [ ] AC 1.7: Given a PR modifies `docker-compose.yml`, when CI runs, then `docker compose config --quiet` validates without errors
- [ ] AC 1.8: Given `deploy-server` job has `environment: production`, when a tag is pushed, then GitHub requires manual approval before the deploy job runs
- [ ] AC 1.9: Given SIGTERM is sent to the app container, when `docker stop` is called, then `app.close()` executes, triggering onClose hooks in reverse registration order: (1) app-level hook calls `closeMediasoup()` to shut down WebRTC workers, (2) db plugin clears the periodic health timer and drains the Supabase connection pool via `client.end()`. In-flight requests complete before exit. Verify by checking logs for `SIGTERM received, shutting down gracefully...` followed by clean exit (no force-kill)

---

### Phase 2: Container Registry (GHCR) + Image Scanning

**Story:** As a developer, I want Docker images built in CI and pushed to GitHub Container Registry so that production never builds images locally, every image is scannable and traceable by git SHA, and rollback is as simple as pulling a previous tag.

**Prerequisites:** Phase 1 complete (hardened compose file is the baseline).

#### Tasks

- [ ] Task 2.0: Add top-level permissions restriction to release workflow
  - File: `.github/workflows/release.yml`
  - Action: Add a top-level `permissions: {}` block at the workflow root to deny all permissions by default. Each job must then explicitly declare its own `permissions:` block (e.g., `contents: read, packages: write` for `build-server-image`). This prevents token leakage if a dependency or third-party action is compromised — the `GITHUB_TOKEN` only has the permissions each job explicitly requests
  - Notes: This is a GitHub Actions security hardening best practice. Existing jobs (`validate-version`, `build-electron`, `publish-release`, `deploy-server`) must be audited for their required permissions and updated with explicit per-job `permissions:` blocks

- [ ] Task 2.1: Add `build-server-image` job to release workflow
  - File: `.github/workflows/release.yml`
  - Action: Add a new job `build-server-image` after `validate-version`:
    - `needs: [validate-version]`
    - `runs-on: ubuntu-latest`
    - `permissions: contents: read, packages: write`
    - Steps: checkout, `docker/setup-buildx-action@v3.9.0`, `docker/login-action@v3.4.0` (registry: `ghcr.io`, username: `${{ github.actor }}`, password: `${{ secrets.GITHUB_TOKEN }}`), `docker/build-push-action@v6.14.0` (context: `.`, file: `server/Dockerfile`, push: true, tags: `ghcr.io/aidenwoodside/discord-clone-server:${{ github.sha }}`, `ghcr.io/aidenwoodside/discord-clone-server:${{ github.ref_name }}`, `ghcr.io/aidenwoodside/discord-clone-server:latest`, cache-from: `type=gha`, cache-to: `type=gha,mode=max`)
  - Notes: Uses GitHub Actions cache for Docker layer caching. `GITHUB_TOKEN` has automatic GHCR write access. **Supply-chain security:** All third-party actions should be pinned to full commit SHAs with a version comment (e.g., `docker/setup-buildx-action@b5ca514318bd6ebac0fb2aedd5d36ec1b5c232a2 # v3.9.0`). SHA pinning is immutable — unlike version tags, SHAs cannot be force-updated upstream. Use Dependabot to automate SHA version bump PRs (see Task 2.6a). If SHA pinning is impractical initially, pin to exact minor version tags (`@v3.9.0`) not major version tags (`@v3`)

- [ ] Task 2.2: Add Trivy vulnerability scanning step
  - File: `.github/workflows/release.yml`
  - Action: Add step after `build-push-action` in `build-server-image` job:
    ```yaml
    - name: Scan image for vulnerabilities
      uses: aquasecurity/trivy-action@0.28.0  # Pin to specific version — do not use @master
      with:
        image-ref: ghcr.io/aidenwoodside/discord-clone-server:${{ github.sha }}
        format: 'table'
        severity: 'CRITICAL,HIGH'
        exit-code: '1'
    ```
  - Notes: `exit-code: 1` fails the build on CRITICAL/HIGH vulnerabilities. Use `exit-code: 0` initially if you want non-blocking scans. **Prefer SHA pinning** (e.g., `aquasecurity/trivy-action@<sha> # v0.28.0`) — Dependabot (Task 2.6a) will automatically open PRs to update the SHA when new versions release. Never use `@master` or `@main`

- [ ] Task 2.3: Switch docker-compose.yml from `build:` to `image:`
  - File: `docker-compose.yml`
  - Action: Replace the `app` service's `build:` block:
    ```yaml
    # Remove:
    build:
      context: .
      dockerfile: server/Dockerfile
    # Replace with:
    image: ghcr.io/aidenwoodside/discord-clone-server:${IMAGE_TAG:-latest}
    ```
  - Notes: `IMAGE_TAG` env var controls which version runs. Defaults to `latest` for convenience, but deploy scripts should always set an explicit tag

- [ ] Task 2.4a: Remove source-code build from deploy
  - File: `.github/workflows/release.yml`
  - Action: Update `deploy-server` job:
    - Add `needs: [publish-release, build-server-image]` (depends on image being pushed)
    - Remove `docker compose build` from the SSH deploy script — images now come from GHCR
    - Remove `git checkout` and `git clean` commands (no longer building from source)
    - Replace with:
      ```bash
      export IMAGE_TAG="${{ github.ref_name }}"
      docker compose pull app
      docker compose up -d app nginx
      ```
    - Update rollback to use registry: on health check failure, set `IMAGE_TAG` to previous known version and `docker compose pull app && docker compose up -d app`

- [ ] Task 2.4b: Keep config file sync as a separate deploy step
  - File: `.github/workflows/release.yml`
  - Action: Keep `git pull` (or replace with a targeted fetch) as a separate step that syncs only config files the EC2 instance needs on disk:
    ```bash
    git fetch origin main
    git checkout origin/main -- docker-compose.yml docker/ scripts/ landing/
    ```
    Keep the SCP step for uploading download assets (landing page still needs installers)
  - Notes: The EC2 instance needs `docker-compose.yml`, `nginx.conf`, coturn config, landing page, and deploy scripts on disk. Only the app image comes from the registry. This step is explicitly separate from the image pull to make the two concerns (app image vs config files) independently manageable

- [ ] Task 2.5: Authenticate EC2 with GHCR for image pulls
  - File: Deploy script (within SSH action in `release.yml`)
  - Action: **Decision required — depends on repo visibility:**
    - **If repo is public:** GHCR images are publicly pullable. Skip GHCR auth entirely — no PAT needed, no secret to rotate. Document this in the deploy script with a comment explaining why auth is not needed
    - **If repo is private:** Before `docker compose pull`, add GHCR login. **Prefer a GitHub App installation token** over a Personal Access Token — GitHub Apps have narrower scope (`read:packages` only), are not tied to a personal account, and tokens auto-rotate. Create a GitHub App with `read:packages` permission, install it on the repo, and store the App ID + private key in SSM Parameter Store. The deploy script fetches a short-lived installation token at deploy time:
      ```bash
      # Fetch GitHub App installation token from SSM (rotated automatically)
      GHCR_TOKEN=$(fetch-github-app-token)  # Implementation depends on GitHub App setup
      echo "$GHCR_TOKEN" | docker login ghcr.io -u x-access-token --password-stdin
      ```
      If a GitHub App is too complex for the current scale, a fine-grained PAT with `read:packages` scope scoped to this repository is acceptable — store it in SSM Parameter Store (not as a GitHub secret on EC2)
  - Notes: PATs tied to personal accounts are a security anti-pattern for production infrastructure — if the account is compromised or deactivated, deploys break. GitHub Apps or fine-grained PATs scoped to the repo are preferred

- [ ] Task 2.6: Update .env.example with IMAGE_TAG variable
  - File: `.env.example`
  - Action: Add `IMAGE_TAG=latest` with comment explaining it's set by the deploy pipeline. Verify that `DATABASE_URL` (from Supabase migration) is present with all 3 connection mode options documented, verify `DB_POOL_MAX`/`DB_IDLE_TIMEOUT`/`DB_CONNECT_TIMEOUT` are present, and confirm `DATABASE_PATH` has been removed

- [ ] Task 2.6a: Add Dependabot configuration for automated dependency updates
  - File: `.github/dependabot.yml` (new file)
  - Action: Create Dependabot config to automate version bump PRs for GitHub Actions and Docker images:
    ```yaml
    version: 2
    updates:
      # GitHub Actions — keep action SHAs current
      - package-ecosystem: "github-actions"
        directory: "/"
        schedule:
          interval: "weekly"
        commit-message:
          prefix: "ci"
        labels:
          - "dependencies"
          - "ci"

      # Docker — server Dockerfile base image (node:20-alpine)
      - package-ecosystem: "docker"
        directory: "/server"
        schedule:
          interval: "monthly"
        commit-message:
          prefix: "docker"
        labels:
          - "dependencies"
          - "docker"

      # Docker — compose file pinned images (nginx, coturn, certbot)
      - package-ecosystem: "docker"
        directory: "/"
        schedule:
          interval: "monthly"
        commit-message:
          prefix: "docker"
        labels:
          - "dependencies"
          - "docker"

      # npm — keep Node.js dependencies current
      - package-ecosystem: "npm"
        directory: "/"
        schedule:
          interval: "weekly"
        commit-message:
          prefix: "deps"
        labels:
          - "dependencies"
        # Group minor/patch updates to reduce PR noise
        groups:
          production-dependencies:
            patterns:
              - "*"
            update-types:
              - "minor"
              - "patch"
    ```
  - Notes: Dependabot automatically opens PRs when new versions are available. For GitHub Actions, it updates SHA pins with the new commit hash and version comment. For Docker, it bumps pinned image tags (e.g., `nginx:1.27-alpine` → `nginx:1.28-alpine`). Two Docker ecosystem entries are needed: `/server` for the Dockerfile base image (`node:20-alpine`) and `/` for the compose file's pinned images (`nginx`, `coturn`, `certbot`). Review and merge these PRs after CI passes. This replaces the manual "review pinned versions quarterly" recommendation from Task 1.4

#### Acceptance Criteria

- [ ] AC 2.1: Given a tag push triggers the release workflow, when the `build-server-image` job runs, then the image is pushed to `ghcr.io/aidenwoodside/discord-clone-server` with three tags: git SHA, semver tag, and `latest`
- [ ] AC 2.2: Given the image is pushed, when Trivy scans it, then CRITICAL/HIGH vulnerabilities are reported (and optionally fail the build)
- [ ] AC 2.3: Given `docker-compose.yml` uses `image:` instead of `build:`, when `IMAGE_TAG=v1.0.0 docker compose pull app` is run on EC2, then it pulls that exact version from GHCR
- [ ] AC 2.4: Given a deploy completes, when the health check fails, then the rollback pulls the previous image tag from GHCR and restarts the app
- [ ] AC 2.5: Given the `build-server-image` job completes, when `docker compose build` is run on EC2, then it is NOT required (no `build:` directive in compose)

---

### Phase 3: Network Isolation (Bridge Networking)

**Story:** As the server operator, I want Docker containers isolated on a bridge network with only necessary ports exposed so that a compromised container cannot access other services or the host network directly.

**Prerequisites:** Phase 2 complete (app uses `image:` not `build:`, so bridge networking works with pulled images).

#### Tasks

- [ ] Task 3.1: Create bridge network and move app off host mode
  - File: `docker-compose.yml`
  - Action: Remove `network_mode: host` from `app` service. Add:
    ```yaml
    networks:
      - backend
    ports:
      - "3000:3000"
      - "40000-40099:40000-40099/udp"
    ```
    Add networks section:
    ```yaml
    networks:
      backend:
        driver: bridge
    ```
  - Notes: App stays on port 3000 (the default). Port changes to 3001/3002 happen in Phase 5 when blue-green requires it. The 100-port UDP range is for mediasoup RTP

- [ ] Task 3.2: Update .env.example with reduced mediasoup port range
  - File: `.env.example`
  - Action: Change `MEDIASOUP_MIN_PORT=40000` and `MEDIASOUP_MAX_PORT=49999` to `MEDIASOUP_MAX_PORT=40099`. Add comment: `# Reduced to 100 ports for Docker bridge networking compatibility`
  - Notes: Also update the production `.env` on EC2 during deployment

- [ ] Task 3.3: Move nginx off host mode
  - File: `docker-compose.yml`
  - Action: Remove `network_mode: host` from `nginx`. Add:
    ```yaml
    networks:
      - backend
    ports:
      - "80:80"
      - "443:443"
    ```

- [ ] Task 3.4: Move certbot off host mode
  - File: `docker-compose.yml`
  - Action: Remove `network_mode: host` from `certbot` (if present — certbot currently inherits host mode). Add:
    ```yaml
    networks:
      - backend
    ```
    Certbot needs no ports — it only accesses shared volumes for ACME challenge

- [ ] Task 3.5: Keep coturn on host mode (justified)
  - File: `docker-compose.yml`
  - Action: Keep `network_mode: host` on `coturn`. Add a comment:
    ```yaml
    # Justified: coturn needs 100+ UDP ports for TURN relay (49152-49252).
    # Publishing this range via bridge would be impractical.
    ```
  - Notes: Coturn stays on host mode. This is the only service that genuinely needs it

- [ ] Task 3.6: Update nginx upstream to use Docker DNS
  - File: `docker/nginx/nginx.conf`
  - Action: Change upstream from `server 127.0.0.1:3000;` to `server app:3000;` (Docker DNS resolves `app` to the container's bridge IP). Note: in Phase 5 this changes to `app-blue:3001` via template
  - Notes: Docker bridge networking provides automatic DNS resolution between containers on the same network. Port stays at 3000 — the port change to 3001/3002 is deferred to Phase 5 where blue-green requires it

- [ ] Task 3.7: Verify MEDIASOUP_ANNOUNCED_IP is set correctly for bridge networking
  - File: `.env` (on EC2), `.env.example`
  - Action: Verify that `MEDIASOUP_ANNOUNCED_IP` is set to the EC2 public IP (not `127.0.0.1`) in the production `.env`. On bridge networking, the container's internal IP is a Docker-assigned `172.x.x.x` address — mediasoup must advertise the public IP for ICE candidates to work. In `.env.example`, update the comment:
    ```
    # IMPORTANT: Must be set to EC2 public IP in production.
    # With bridge networking, the container IP is internal (172.x.x.x).
    # mediasoup needs the public IP for WebRTC ICE candidates.
    MEDIASOUP_ANNOUNCED_IP=127.0.0.1  # dev only — change for production
    ```
  - Notes: `MEDIASOUP_LISTEN_IP` should remain `0.0.0.0` (bind all interfaces inside the container). Only `ANNOUNCED_IP` needs the public IP. This was already correct on host networking (the container shared the host's IP), but bridge networking changes the container's IP space. Failure mode: voice calls fail silently with ICE connectivity checks timing out

- [ ] Task 3.8: Update setup.sh certbot from standalone to webroot mode
  - File: `scripts/setup.sh`
  - Action: Replace the certbot standalone provisioning with webroot-based initial provisioning:
    1. Start nginx first with a temporary HTTP-only config (no TLS) that serves `/.well-known/acme-challenge/` from the shared certbot volume
    2. Run certbot in webroot mode: `certbot certonly --webroot -w /var/www/certbot -d discweeds.com`
    3. After cert is provisioned, switch nginx to the full TLS config and reload
  - Notes: Standalone mode binds directly to port 80, which won't work after Phase 3 moves certbot to bridge networking with no published ports. Webroot mode writes ACME challenge files to a shared volume that nginx serves — this works on bridge networking. **Disaster recovery:** If certs must be re-provisioned from scratch (new domain, cert corruption), either: (a) use this same webroot flow with nginx running, or (b) temporarily add `ports: ["80:80"]` to certbot in `docker-compose.yml`, stop nginx, run standalone, remove the port, restart. Document this as an operational runbook entry

#### Acceptance Criteria

- [ ] AC 3.1: Given app, nginx, and certbot are on the `backend` bridge network, when `docker network inspect backend` is run, then all three containers are listed as connected
- [ ] AC 3.2: Given coturn remains on `network_mode: host`, when a TURN relay is established, then UDP traffic flows correctly on ports 49152-49252
- [ ] AC 3.3: Given nginx uses Docker DNS (`app:3000`), when a request hits `https://discweeds.com/api/health`, then nginx proxies it to the app container and returns 200
- [ ] AC 3.4: Given WebSocket proxy uses Docker DNS, when a client connects to `wss://discweeds.com/ws`, then the WebSocket upgrade succeeds and messages flow
- [ ] AC 3.5: Given mediasoup uses ports 40000-40099, when a voice call is established, then RTP media flows over the published UDP port range
- [ ] AC 3.6: Given the app container is compromised, when it attempts to access coturn's listening port (3478) or host SSH (22), then the bridge network prevents direct access (traffic must go through published ports only)
- [ ] AC 3.7: Given the app runs on bridge networking, when a WebRTC voice call is established, then ICE candidates contain the EC2 public IP (not `172.x.x.x` or `127.0.0.1`) and the call connects successfully
- [ ] AC 3.8: Given certbot is on bridge networking with no published ports, when `scripts/setup.sh` provisions a TLS certificate via webroot mode, then the certificate is issued successfully using the shared ACME challenge volume served by nginx

---

### Phase 4: AWS SSM + OIDC (Replace SSH Deployment)

**Story:** As a developer, I want GitHub Actions to deploy via AWS SSM with OIDC-federated credentials so that there are no static SSH keys, port 22 can be closed, and every deployment command is audited in CloudTrail.

**Prerequisites:** Phase 2 complete (deploy pulls images, doesn't build). AWS account access required for IAM configuration. Note: Phase 4 does not depend on Phase 3 — they can be developed in parallel after Phase 2.

#### Tasks

- [ ] Task 4.1: Create IAM OIDC Identity Provider in AWS
  - File: N/A (AWS Console or CLI)
  - Action: Create an OIDC Identity Provider:
    - Provider URL: `https://token.actions.githubusercontent.com`
    - Audience: `sts.amazonaws.com`
  - Notes: This is a one-time AWS account setup. Can be done via Console or `aws iam create-open-id-connect-provider`

- [ ] Task 4.2: Create IAM deploy role with trust policy
  - File: N/A (AWS Console or CLI)
  - Action: Create IAM Role `discord-clone-deploy` with trust policy:
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {
          "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "repo:AidenWoodside/discord_clone:environment:production"
          }
        }
      }]
    }
    ```
    Attach inline policy granting: `ssm:SendCommand`, `ssm:GetCommandInvocation` on the EC2 instance, and `ssm:ListCommandInvocations`
  - Notes: The `sub` condition uses the `environment` claim instead of a tag ref pattern. Since the `deploy-server` job already specifies `environment: production` (Task 1.8), the OIDC token's `sub` claim will be `repo:AidenWoodside/discord_clone:environment:production`. This provides a double gate: (1) GitHub environment protection requires manual approval, and (2) the OIDC trust policy only accepts tokens from the `production` environment context. A rogue tag push without environment approval cannot assume the role. This is more secure than `ref:refs/tags/v*` which would match any tag starting with `v`

- [ ] Task 4.3: Install SSM Agent on EC2 and attach instance profile
  - File: N/A (EC2 instance)
  - Action: SSH into EC2 (last time!):
    ```bash
    sudo snap install amazon-ssm-agent --classic
    sudo systemctl enable amazon-ssm-agent
    sudo systemctl start amazon-ssm-agent
    ```
    Create IAM Instance Profile with `AmazonSSMManagedInstanceCore` policy. Attach to EC2 instance via Console or CLI
  - Notes: SSM Agent must be running and the instance must have the instance profile for SSM commands to work

- [ ] Task 4.4: Replace SSH deploy with SSM in release.yml
  - File: `.github/workflows/release.yml`
  - Action: Replace the `deploy-server` job steps:
    - Remove `appleboy/ssh-action` and `appleboy/scp-action` steps
    - Add `permissions: id-token: write, contents: read`
    - Add `environment: name: production` (for approval gate)
    - Add job-level concurrency control to prevent racing deploys:
      ```yaml
      concurrency:
        group: deploy-production
        cancel-in-progress: false
      ```
    - Add `aws-actions/configure-aws-credentials@v4` step with `role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}`, `aws-region: us-east-1`
    - Add SSM deploy step:
      ```yaml
      - name: Deploy via SSM
        run: |
          # Timeout budget: pull (~30s) + health check (~60s) + migration (~30s)
          # + drain (~30s) + nginx switch (~5s) + buffer (~145s) = 300s
          COMMAND_ID=$(aws ssm send-command \
            --instance-ids "${{ secrets.EC2_INSTANCE_ID }}" \
            --document-name "AWS-RunShellScript" \
            --timeout-seconds 300 \
            --parameters 'commands=["bash /home/ubuntu/discord_clone/scripts/deploy.sh ${{ github.ref_name }}"]' \
            --query "Command.CommandId" --output text)

          # Poll with structured status parsing — never grep mixed output
          # Poll timeout (65 x 5s = 325s) slightly exceeds SSM timeout (300s)
          # so SSM reports failure first rather than the poll giving up prematurely
          for i in $(seq 1 65); do
            STATUS=$(aws ssm get-command-invocation \
              --command-id "$COMMAND_ID" \
              --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
              --query "Status" --output text 2>/dev/null || echo "Pending")

            case "$STATUS" in
              Success)
                echo "Deploy succeeded"
                aws ssm get-command-invocation \
                  --command-id "$COMMAND_ID" \
                  --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
                  --query "StandardOutputContent" --output text
                break ;;
              Failed|TimedOut|Cancelled)
                echo "Deploy failed with status: $STATUS"
                aws ssm get-command-invocation \
                  --command-id "$COMMAND_ID" \
                  --instance-id "${{ secrets.EC2_INSTANCE_ID }}" \
                  --query "StandardErrorContent" --output text
                exit 1 ;;
              *) sleep 5 ;;
            esac
            [ "$i" -eq 65 ] && { echo "Timed out waiting for SSM command"; exit 1; }
          done
      ```
    - Keep the download asset upload step but convert from SCP to SSM (or use S3 as intermediary)
  - Notes: Health check URL is port 3000 (Phase 3 keeps default port; changes to 3001/3002 in Phase 5). `EC2_INSTANCE_ID` is a new secret

- [ ] Task 4.5: Handle download asset upload without SCP
  - File: `.github/workflows/release.yml`
  - Action: Replace `appleboy/scp-action` with S3 intermediary:
    - Upload assets to S3 bucket in CI: `aws s3 cp downloads/ s3://discord-clone-assets/ --recursive`
    - In SSM command, pull from S3: `aws s3 sync s3://discord-clone-assets/ /home/ubuntu/discord_clone/data/downloads/`
    - Add S3 read/write permissions to the deploy IAM role
  - Notes: Alternatively, the download assets could be served directly from GitHub Releases URLs instead of being hosted on EC2. This simplifies the pipeline

- [ ] Task 4.6: Add new GitHub secrets and remove old ones
  - File: N/A (GitHub Settings)
  - Action: Add secrets: `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`. After verifying SSM deploy works, remove: `EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`, `EC2_DEPLOY_PATH`

- [ ] Task 4.7: Close port 22 in EC2 security group
  - File: N/A (AWS Console)
  - Action: Remove the inbound rule allowing TCP port 22 from the EC2 security group
  - Notes: Do this AFTER verifying SSM access works. Keep SSM as the only remote access method. If you need interactive shell access, use `aws ssm start-session`

- [ ] Task 4.8: Verify coturn secret persists across deploy method change
  - File: N/A (verification only)
  - Action: After switching from SSH to SSM deployment, verify that `docker/coturn/turnserver.prod.conf` on EC2 still contains the correct `static-auth-secret` value (originally set by `setup.sh`). The coturn config file is a bind-mounted host file — it is NOT rebuilt or regenerated during deploys. Confirm TURN auth works by establishing a TURN relay
  - Notes: Between Phase 4 and Phase 6, coturn's secret lives only in this config file on EC2. It is NOT in SSM yet (that happens in Task 6.3). If EC2 is reprovisioned via Terraform before Phase 6, `setup.sh` must be re-run to populate this file, OR Task 6.3 must be pulled forward to ensure the coturn secret is available via SSM templating

#### Acceptance Criteria

- [ ] AC 4.1: Given a tag is pushed, when the `deploy-server` job runs, then it authenticates via OIDC (no static AWS keys) and assumes the deploy IAM role
- [ ] AC 4.2: Given SSM Agent is running on EC2, when `aws ssm send-command` executes the deploy script, then Docker pulls the new image and restarts the app
- [ ] AC 4.3: Given the deploy completes, when CloudTrail is checked, then the SSM command and its output are logged with full audit trail
- [ ] AC 4.4: Given port 22 is closed in the security group, when an SSH connection is attempted, then it is refused
- [ ] AC 4.5: Given the `production` environment has required reviewers, when a tag is pushed, then the deploy job waits for manual approval before executing
- [ ] AC 4.6: Given the health check fails after deploy via SSM, when the command exits with code 1, then the GitHub Actions job is marked as failed

---

### Phase 5: Blue-Green Zero-Downtime Deployment

**Story:** As the server operator, I want zero-downtime deployments via blue-green container switching with application-level connection draining so that users experience minimal disruption during deploys — connected clients receive a reconnect signal and migrate to the new slot within a configurable drain window.

**Prerequisites:** Phase 2 (registry images), Phase 3 (bridge networking), Phase 4 (SSM deploy). SIGTERM handler already added in Phase 1 (Task 1.10).

#### Tasks

- [ ] Task 5.1: Replace single app service with blue-green pair
  - File: `docker-compose.yml`
  - Action: Replace the `app` service with `app-blue` and `app-green`. This is where the port changes from 3000 (Phase 3 default) to 3001/3002 for the two slots:
    - `app-blue`: image `ghcr.io/aidenwoodside/discord-clone-server:${IMAGE_TAG:-latest}`, `PORT=3001`, `DB_POOL_MAX=20`, networks `backend`, `restart: unless-stopped`, all resource limits/logging/security from Phase 1, health check on port 3001, mediasoup ports 40000-40049
    - `app-green`: identical but `PORT=3002`, `DB_POOL_MAX=20`, health check on port 3002, `restart: unless-stopped`, `profiles: [deploy]` (only started during deploys), mediasoup ports 40050-40099
    - No shared data volumes needed — both slots connect to the same Supabase instance via `DATABASE_URL`. Both slots can safely read/write simultaneously (Postgres handles concurrent access natively)
    - Both have `stop_grace_period: 30s`, `RUN_MIGRATIONS=false`, `DB_POOL_MAX=20` (see connection pool budget in Technical Decisions)
    - Published ports: `3001:3001` for blue, `3002:3002` for green
    - UDP ports: `40000-40049:40000-40049/udp` for blue, `40050-40099:40050-40099/udp` for green (split ranges allow simultaneous binding during switchover)
  - Notes: Port change from 3000 to 3001/3002 is intentionally deferred to this phase — Phase 3 uses the default port 3000 for independence. Green uses `profiles: [deploy]` so it doesn't start on regular `docker compose up -d`. Only `docker compose --profile deploy up -d app-green` starts it. Both slots use `restart: unless-stopped` so that whichever slot is active will auto-recover on crash or EC2 reboot. The `profiles` directive controls initial startup only — it does not affect restart behavior of already-running containers. The deploy script stops the old slot after switchover, so only one slot is running at steady state. Both slots connect to the same Supabase instance — concurrent reads and writes from both slots during the brief switchover window are safe because Postgres handles concurrent access natively (unlike the previous SQLite setup)

- [ ] Task 5.2: Split mediasoup UDP port ranges for blue-green
  - File: `docker-compose.yml`
  - Action: Use separate UDP ranges so both slots can bind simultaneously during switchover:
    ```yaml
    app-blue:
      environment:
        - PORT=3001
        - DB_POOL_MAX=20
        - MEDIASOUP_MIN_PORT=40000
        - MEDIASOUP_MAX_PORT=40049
      ports:
        - "3001:3001"
        - "40000-40049:40000-40049/udp"

    app-green:
      environment:
        - PORT=3002
        - DB_POOL_MAX=20
        - MEDIASOUP_MIN_PORT=40050
        - MEDIASOUP_MAX_PORT=40099
      ports:
        - "3002:3002"
        - "40050-40099:40050-40099/udp"
    ```
  - File: `.env.example`
  - Action: Update comments to document the split: `# Blue: 40000-40049, Green: 40050-40099 (50 ports each for blue-green)`
  - Notes: 50 ports per slot supports 50 concurrent media streams each. Both slots can bind their ranges simultaneously, enabling true zero-downtime switchover where existing voice calls on the old slot drain naturally while new calls land on the new slot. The security group and Terraform config already allow the full 40000-40099 range, so no infrastructure changes are needed

- [ ] Task 5.3: Create deploy script
  - File: `scripts/deploy.sh` (new file)
  - Action: Create deployment script:
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    # Require Docker Compose V2 >= 2.20
    if ! docker compose version --short 2>/dev/null | grep -qE '^2\.(2[0-9]|[3-9][0-9]|[0-9]{3,})'; then
      echo "FATAL: Docker Compose V2 >= 2.20 required"
      exit 1
    fi

    DEPLOY_DIR="/home/ubuntu/discord_clone"
    DRAIN_TIMEOUT="${DRAIN_TIMEOUT:-30}"
    IMAGE_TAG="${1:?Usage: deploy.sh <image-tag>}"
    export IMAGE_TAG

    cd "$DEPLOY_DIR"

    # 1. Determine active slot by inspecting running containers (not a file)
    if docker compose ps app-blue --status running -q 2>/dev/null | grep -q .; then
      ACTIVE="blue"; ACTIVE_PORT=3001
      NEW="green"; NEW_PORT=3002
    elif docker compose ps app-green --status running -q 2>/dev/null | grep -q .; then
      ACTIVE="green"; ACTIVE_PORT=3002
      NEW="blue"; NEW_PORT=3001
    else
      echo "No active slot detected — cold start, defaulting to blue"
      ACTIVE="none"
      NEW="blue"; NEW_PORT=3001
    fi
    echo "Active: $ACTIVE -> Deploying: $NEW"

    # 2. Pull only the target slot image
    docker compose pull "app-$NEW"

    # 3. Start new slot (no traffic routed yet — nginx still points at old slot)
    docker compose --profile deploy up -d "app-$NEW"

    # 4. Health check new slot
    for i in $(seq 1 30); do
      if curl -sf "http://127.0.0.1:$NEW_PORT/api/health" > /dev/null 2>&1; then
        echo "app-$NEW healthy (attempt $i)"
        break
      fi
      if [ "$i" -eq 30 ]; then
        echo "FAILED: app-$NEW unhealthy after 60s"
        docker compose stop "app-$NEW"
        exit 1
      fi
      sleep 2
    done

    # 5. Run database migrations on new slot against Supabase (old slot still serves traffic)
    # Both slots can safely connect to Supabase concurrently — Postgres handles concurrent access.
    # Uses dedicated migrate script (Task 5.3a) — not an inline one-liner — for maintainability.
    if ! docker compose exec -T "app-$NEW" node dist/scripts/migrate.js 2>&1; then
      echo "FATAL: database migration failed on app-$NEW (Supabase)"
      docker compose stop "app-$NEW"
      exit 1
    fi

    # 6. Drain old slot — signal clients to reconnect
    if [ "$ACTIVE" != "none" ]; then
      echo "Draining app-$ACTIVE (${DRAIN_TIMEOUT}s window)..."
      curl -sf -X POST -H "X-Drain-Token: $JWT_ACCESS_SECRET" \
        "http://127.0.0.1:$ACTIVE_PORT/api/drain" > /dev/null 2>&1 || true

      # Wait for connections to drain (poll every 2s, up to DRAIN_TIMEOUT)
      DRAIN_START=$(date +%s)
      while true; do
        ELAPSED=$(( $(date +%s) - DRAIN_START ))
        if [ "$ELAPSED" -ge "$DRAIN_TIMEOUT" ]; then
          echo "Drain timeout reached — proceeding with switchover"
          break
        fi
        CONNS=$(curl -sf -H "X-Drain-Token: $JWT_ACCESS_SECRET" \
          "http://127.0.0.1:$ACTIVE_PORT/api/drain" 2>/dev/null \
          | jq -r '.connections // "unknown"' 2>/dev/null || echo "unknown")
        if [ "$CONNS" = "0" ]; then
          echo "All connections drained"
          break
        fi
        echo "  $CONNS connections remaining (${ELAPSED}s elapsed)"
        sleep 2
      done
    fi

    # 7. Switch nginx upstream via template (not in-place sed)
    NGINX_CONF="$DEPLOY_DIR/docker/nginx/nginx.conf"
    NGINX_TEMPLATE="$DEPLOY_DIR/docker/nginx/nginx.conf.template"
    cp "$NGINX_CONF" "$NGINX_CONF.bak"
    sed "s/{{UPSTREAM}}/app-$NEW:$NEW_PORT/" "$NGINX_TEMPLATE" > "$NGINX_CONF"

    # 8. Validate nginx config before reload
    if ! docker compose exec -T nginx nginx -t 2>&1; then
      echo "FATAL: nginx config validation failed — restoring backup"
      cp "$NGINX_CONF.bak" "$NGINX_CONF"
      docker compose stop "app-$NEW"
      exit 1
    fi

    # 9. Reload nginx
    if ! docker compose exec -T nginx nginx -s reload 2>&1; then
      echo "FATAL: nginx reload failed — restoring backup"
      cp "$NGINX_CONF.bak" "$NGINX_CONF"
      docker compose exec -T nginx nginx -s reload || true
      docker compose stop "app-$NEW"
      exit 1
    fi

    # 10. Post-switchover verification — verify nginx can reach new slot via Docker DNS
    sleep 2
    if ! docker compose exec -T nginx wget --spider -q "http://app-$NEW:$NEW_PORT/api/health" 2>&1; then
      echo "WARNING: post-switchover health check via nginx->app-$NEW failed — verify manually"
    fi

    # 11. Stop old slot
    if [ "$ACTIVE" != "none" ]; then
      docker compose stop "app-$ACTIVE"
    fi

    # 12. Prune old Docker images (keep last 7 days)
    docker image prune -af --filter "until=168h" 2>/dev/null || true

    # 13. Cleanup
    rm -f "$NGINX_CONF.bak"
    echo "Deploy complete: app-$NEW ($IMAGE_TAG)"
    ```
  - Notes: Active slot is determined by inspecting which container is actually running (survives reboots, no stale file). Only the target slot's image is pulled (not both). The drain step signals the old slot's connected WebSocket clients to reconnect, then polls until connections reach zero or the `DRAIN_TIMEOUT` (default 30s) expires. Drain connection polling uses `jq` for JSON parsing (standard on Ubuntu 22.04 — ensure it is installed via Terraform `user_data` or `setup.sh`). Migrations run against Supabase on the new slot via the dedicated `dist/scripts/migrate.js` entry point (Task 5.3a) before nginx switches — the old slot still serves traffic during this window. Both slots can safely connect to Supabase concurrently (Postgres handles concurrent access natively). Nginx config uses a template file with `{{UPSTREAM}}` placeholder — never raw sed on the live config. `nginx -t` validates before reload, with full rollback on failure at every step. Post-switchover verification uses `wget --spider` from inside the nginx container (nginx:alpine does not include `curl`). Old Docker images are pruned after each deploy (keeps last 7 days) to prevent disk bloat. **Host dependencies:** `jq`, `curl`, `docker compose` V2 >= 2.20, `sed`, `date`. Requires Docker Compose V2 >= 2.20

- [ ] Task 5.3a: Create dedicated migration entry point script
  - File: `server/src/scripts/migrate.ts` (new file, compiles to `dist/scripts/migrate.js`)
  - Action: Create a standalone migration script. **Important:** `createDatabase()` is **synchronous** (not async) — it returns `DatabaseConnection` directly. The `migrate()` function it returns internally creates a separate postgres.js connection without `statement_timeout` (see `connection.ts:76-86`), so DDL operations won't hit the 30s query limit:
    ```typescript
    import { createDatabase } from '../db/connection.js';

    async function runMigrations() {
      console.log('Running database migrations against Supabase...');
      // createDatabase() is synchronous — returns { db, close, migrate }
      const { migrate, close } = createDatabase();
      try {
        await migrate('./drizzle');
        console.log('Migrations completed successfully');
      } finally {
        await close();
      }
    }

    runMigrations().catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
    ```
    Ensure `server/tsconfig.json` includes `src/scripts/` in compilation so it appears in `dist/scripts/migrate.js`.
  - Notes: This replaces the fragile inline `node -e "import(...)"` one-liner in the deploy script. A dedicated file is testable, has proper error handling, and won't break if internal module paths change. The deploy script (Task 5.3) calls `node dist/scripts/migrate.js` inside the container. The migration creates its own single-connection pool internally (`max: 1`) with no `statement_timeout`, so it's safe for DDL regardless of the slot's `DB_POOL_MAX` setting

- [ ] Task 5.4: Create nginx config template for blue-green
  - File: `docker/nginx/nginx.conf.template` (new file)
  - Action: Copy `docker/nginx/nginx.conf` to `docker/nginx/nginx.conf.template`. In the template, replace the upstream block with:
    ```nginx
    upstream app_backend {
        server {{UPSTREAM}};  # Managed by scripts/deploy.sh — do not edit manually
    }
    ```
    Set the initial `nginx.conf` (non-template) to `app-blue:3001` as the default. Add `nginx.conf.bak` to `.gitignore`
  - Notes: The deploy script generates `nginx.conf` from the template by replacing `{{UPSTREAM}}` with the target slot (e.g., `app-green:3002`). This is explicit, auditable, and immune to pattern-matching drift. The template is the source of truth; the generated `nginx.conf` is a deployment artifact

- [ ] Task 5.5: Update SSM deploy command to use deploy script
  - File: `.github/workflows/release.yml`
  - Action: Update the SSM command in `deploy-server` job to call the deploy script:
    ```
    'cd /home/ubuntu/discord_clone',
    'bash scripts/deploy.sh ${{ github.ref_name }}'
    ```
  - Notes: The deploy script handles all blue-green logic. SSM just invokes it

- [ ] Task 5.6: Add connection drain endpoint to server
  - File: `server/src/index.ts` (or a dedicated `server/src/plugins/drain.ts` plugin)
  - Action: Add a `POST /api/drain` endpoint that:
    1. Validates a shared secret via `X-Drain-Token` header — reject with 403 if the token does not match `process.env.JWT_ACCESS_SECRET` (reuses existing secret, no new secret needed)
    2. Sets a `draining` flag that prevents accepting new WebSocket upgrades at `/ws`
    3. Sends a `{ type: "reconnect" }` frame to all connected WebSocket clients so they reconnect to the new slot via nginx
    4. Returns a JSON response with `{ "connections": <count> }` showing remaining active connections
    The GET variant (for polling connection count) must also validate the same token
  - Notes: The client-side WebSocket handler must already support reconnection (standard for Discord-style apps). If the client does not have reconnect logic, add a follow-up task to implement it. The drain endpoint is called by the deploy script before switching nginx upstream. **Security:** The endpoint is protected by two layers: (1) nginx `deny all;` for `/api/drain` blocks external access, and (2) the `X-Drain-Token` header check prevents unauthorized drain triggers from other containers on the bridge network. The deploy script has access to `JWT_ACCESS_SECRET` via SSM and passes it as a header:
    ```bash
    curl -sf -X POST -H "X-Drain-Token: $JWT_ACCESS_SECRET" \
      "http://127.0.0.1:$ACTIVE_PORT/api/drain" > /dev/null 2>&1 || true
    ```

- [ ] Task 5.7: Add migration guard environment variable
  - File: `server/src/index.ts`
  - Action: Wrap the existing `runMigrations(app.migrate)` call (line 31) with a `RUN_MIGRATIONS` environment variable check (default: `false`). If `RUN_MIGRATIONS` is not explicitly set to `true`, skip the migration call at startup:
    ```typescript
    if (process.env.RUN_MIGRATIONS === 'true') {
      try {
        await runMigrations(app.migrate);
        app.log.info('Database migrations completed');
      } catch (err) {
        app.log.fatal({ err }, 'Migration failed — aborting startup');
        process.exit(1);
      }
    } else {
      app.log.info('RUN_MIGRATIONS not set — skipping migrations');
    }
    ```
    Add `RUN_MIGRATIONS=false` to both `app-blue` and `app-green` environment blocks in `docker-compose.yml`.
  - File: `scripts/deploy.sh`
  - Action: The explicit migration step between health check and nginx switchover is already defined in Task 5.3 (step 5 of the deploy script) using the dedicated `dist/scripts/migrate.js` entry point (Task 5.3a). That script calls `createDatabase()` (synchronous) which internally creates a separate single-connection pool with no `statement_timeout` for DDL safety.
  - Notes: This ensures migrations run exactly once, on exactly one container, in a controlled sequence. While Supabase/Postgres safely handles concurrent connections from both slots, running DDL migrations from a single container prevents partial-migration states. The `migrate()` function in `connection.ts:76-86` creates its own `postgres()` client with `max: 1` and no `statement_timeout`, so DDL operations won't hit the 30s query limit configured on the main pool. The old slot continues serving traffic during this window. If the migration fails, the deploy script stops the new slot and exits 1 (same as health check failure)

- [ ] Task 5.8: Update nginx depends_on for blue-green
  - File: `docker-compose.yml`
  - Action: Change nginx `depends_on` from `app` to `app-blue` with `condition: service_healthy`

- [ ] Task 5.9: Document migration backward-compatibility policy
  - File: `docs/migration-policy.md` (new file)
  - Action: Document that all database migrations MUST be backward-compatible with the previous release. The deploy script runs migrations while the old slot serves traffic — a breaking migration will cause production errors on the old slot. Require the **expand-contract pattern** for all destructive schema changes:
    - **Expand phase** (deployed first): Add new columns/tables, keep old columns intact. Both old and new app code works against this schema
    - **Contract phase** (deployed after all slots run new code): Remove old columns/rename in a subsequent release
    - Examples of migrations requiring expand-contract: `DROP COLUMN`, `RENAME COLUMN`, `ALTER COLUMN TYPE`, `DROP TABLE`
    - Examples of safe single-release migrations: `ADD COLUMN` (nullable or with default), `CREATE TABLE`, `CREATE INDEX`
  - Notes: This policy is critical for blue-green safety. Without it, a single destructive migration will cause queries on the old slot to fail with `column does not exist` or `relation does not exist` errors during every deploy window

#### Acceptance Criteria

- [ ] AC 5.1: Given blue is active, when `deploy.sh v1.2.3` runs, then green starts on port 3002, passes health check, the old slot is drained, nginx switches upstream via template, and blue is stopped only after nginx reload succeeds
- [ ] AC 5.2: Given green is active, when `deploy.sh v1.2.4` runs, then blue starts on port 3001, passes health check, the old slot is drained, nginx switches upstream via template, and green is stopped only after nginx reload succeeds
- [ ] AC 5.3: Given a deploy is in progress, when the old slot enters drain mode, then connected WebSocket clients receive a reconnect signal and migrate to the new slot within the drain window (default 30s). Connections that do not migrate are terminated when the old slot stops
- [ ] AC 5.4: Given the new slot fails health checks, when the deploy script detects failure, then it stops the new slot and exits with code 1 (old slot remains active, zero impact, nginx config unchanged)
- [ ] AC 5.5: Given a rollback is needed, when the old container was already stopped, then the operator can run `deploy.sh <previous-tag>` to deploy the previous version from the registry
- [ ] AC 5.6: Given the EC2 instance reboots, when Docker starts, then the active slot restarts automatically via `restart: unless-stopped` (no dependency on ephemeral state files)
- [ ] AC 5.7: Given the deploy script generates nginx config from template, when `nginx -t` validation fails, then the backup config is restored, the new slot is stopped, and the script exits with code 1
- [ ] AC 5.8: Given blue uses mediasoup ports 40000-40049 and green uses 40050-40099, when both slots are briefly running during switchover, then both can bind their UDP ranges simultaneously without conflict
- [ ] AC 5.9: Given `RUN_MIGRATIONS` is not set or set to `false`, when the container starts, then zero DDL statements are executed against the database
- [ ] AC 5.10: Given a migration is included in a release, when the old slot queries the database after the migration runs on the new slot, then all queries succeed (no column-not-found, type-mismatch, or relation-does-not-exist errors). All migrations must follow the expand-contract pattern documented in `docs/migration-policy.md`

---

### Phase 6: Operational Maturity

**Story:** As the server operator, I want centralized secrets in SSM Parameter Store, CloudWatch log shipping, Terraform IaC, external uptime monitoring, and deploy failure notifications so that the infrastructure is observable, reproducible, and self-alerting.

**Prerequisites:** Phase 5 complete (blue-green `app-blue`/`app-green` services exist in `docker-compose.yml` — CloudWatch logging and secrets must target these services, not the single `app` service from earlier phases). Phase 4's SSM + OIDC and IAM roles are already in place via Phase 5's prerequisites.

#### Tasks

- [ ] Task 6.1: Store secrets in SSM Parameter Store
  - File: N/A (AWS CLI)
  - Action: Create SSM SecureString parameters:
    ```bash
    aws ssm put-parameter --name "/discord-clone/prod/JWT_ACCESS_SECRET" \
      --value "$(openssl rand -hex 32)" --type SecureString
    aws ssm put-parameter --name "/discord-clone/prod/JWT_REFRESH_SECRET" \
      --value "$(openssl rand -hex 32)" --type SecureString
    aws ssm put-parameter --name "/discord-clone/prod/TURN_SECRET" \
      --value "$(openssl rand -hex 32)" --type SecureString
    aws ssm put-parameter --name "/discord-clone/prod/GROUP_ENCRYPTION_KEY" \
      --value "<current-value-from-env>" --type SecureString
    aws ssm put-parameter --name "/discord-clone/prod/DATABASE_URL" \
      --value "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require" \
      --type SecureString
    ```
  - Notes: Migrate the existing values from the EC2 `.env` file. `GROUP_ENCRYPTION_KEY` must be preserved (changing it invalidates all encrypted messages — the app uses libsodium-wrappers for E2E message encryption). `DATABASE_URL` contains the Supabase connection password — it must be stored as a `SecureString`. **Use Supavisor session mode (port 5432)** for the long-lived Fastify server — it supports transactions and prepared statements. Do NOT use transaction mode (port 6543) which pools connections per-query and disables prepared statements. The `connection.ts:54-56` auto-detects transaction mode by port number, but session mode is the correct choice for a persistent server. The `sslmode=require` parameter is mandatory — `connection.ts:34-38` enforces this and will throw on startup if missing

- [ ] Task 6.2: Update deploy script to fetch secrets from SSM and pass as environment overrides
  - File: `scripts/deploy.sh`
  - Action: Before `docker compose up`, fetch secrets from SSM and pass them as explicit `-e` flags to `docker compose`. Do NOT write secrets to a file on disk — pass them directly as environment variables to the `docker compose` command:
    ```bash
    # Fetch secrets from SSM into shell variables (scoped to this script's process only)
    JWT_ACCESS_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_ACCESS_SECRET" --with-decryption --query "Parameter.Value" --output text)
    JWT_REFRESH_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_REFRESH_SECRET" --with-decryption --query "Parameter.Value" --output text)
    TURN_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/TURN_SECRET" --with-decryption --query "Parameter.Value" --output text)
    GROUP_ENCRYPTION_KEY=$(aws ssm get-parameter --name "/discord-clone/prod/GROUP_ENCRYPTION_KEY" --with-decryption --query "Parameter.Value" --output text)
    DATABASE_URL=$(aws ssm get-parameter --name "/discord-clone/prod/DATABASE_URL" --with-decryption --query "Parameter.Value" --output text)

    # Pass secrets as environment overrides — Docker stores them in the container config
    # No file on disk, no env_file directive needed
    export JWT_ACCESS_SECRET JWT_REFRESH_SECRET TURN_SECRET GROUP_ENCRYPTION_KEY DATABASE_URL
    ```
    Update the `docker compose up` commands in the deploy script to use these exported variables. In `docker-compose.yml`, reference them in the `environment:` block of `app-blue` and `app-green`:
    ```yaml
    environment:
      - JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - GROUP_ENCRYPTION_KEY=${GROUP_ENCRYPTION_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - DB_POOL_MAX=20
    ```
  - Notes: EC2 instance profile needs `ssm:GetParameter` and `ssm:GetParametersByPath` permissions with `kms:Decrypt` for the SSM KMS key. This approach avoids the env_file + shred anti-pattern: secrets exist only in the deploy script's process memory and Docker's container config. Container recreation (via `docker compose up -d`) requires re-running the deploy script, which re-fetches from SSM — this is the intended behavior. Secrets are visible in `docker inspect` output on the host, which is acceptable since host access already implies root. Remove any `env_file:` directives from the compose file. **Reboot safety:** Docker stores environment variables in the container config at creation time (`/var/lib/docker/containers/<id>/config.v2.json`). After a reboot, `restart: unless-stopped` restarts containers with their original env — SSM-fetched secrets persist because they were captured in the container config during `docker compose up -d`. The host shell environment is irrelevant after creation. **Secret rotation:** Rotating a secret in SSM requires re-running the deploy script to recreate the container with updated env vars. Restarting the container alone does NOT re-fetch secrets from SSM

- [ ] Task 6.3: Update coturn to use SSM secret
  - File: `scripts/deploy.sh`, `docker/coturn/turnserver.prod.conf`
  - Action: At deploy time, template the coturn config with the TURN_SECRET from SSM:
    ```bash
    sed "s|static-auth-secret=.*|static-auth-secret=$TURN_SECRET|" \
      docker/coturn/turnserver.prod.conf.template > docker/coturn/turnserver.prod.conf
    ```
    Create a `.template` version of the coturn config with a placeholder instead of the committed secret

- [ ] Task 6.3.1: Securely delete the legacy `.env` file from EC2
  - File: N/A (EC2 instance)
  - Action: After verifying SSM-based deploys work on at least 2 consecutive deployments:
    ```bash
    # 1. Back up the .env to SSM for emergency recovery
    aws ssm put-parameter --name "/discord-clone/prod/env-backup" \
      --value "$(cat /home/ubuntu/discord_clone/.env)" --type SecureString --overwrite

    # 2. Securely delete the .env file
    shred -vfz -n 5 /home/ubuntu/discord_clone/.env
    rm -f /home/ubuntu/discord_clone/.env

    # 3. Verify the app still starts correctly from SSM secrets
    bash /home/ubuntu/discord_clone/scripts/deploy.sh <current-tag>
    ```
  - Notes: The entire purpose of the SSM migration is to eliminate plaintext secrets on disk. Leaving the old `.env` file in place defeats this goal — it contains `DATABASE_URL` with the Supabase password in cleartext. This task must not be skipped

- [ ] Task 6.4: Switch logging to CloudWatch awslogs driver
  - File: `docker-compose.yml`
  - Action: Replace `json-file` logging on `app-blue`, `app-green`, and `nginx` with:
    ```yaml
    logging:
      driver: awslogs
      options:
        awslogs-region: us-east-1
        awslogs-group: /discord-clone/production/app
        awslogs-stream-prefix: app-blue  # or app-green for the green slot
        awslogs-create-group: "true"
        mode: "non-blocking"
        max-buffer-size: "4m"
    ```
    (Similar for nginx with group `/discord-clone/production/nginx`)
    Keep `json-file` on coturn and certbot (lower priority, less useful in CloudWatch)
  - Notes: Both `app-blue` and `app-green` ship to the same log group (`/discord-clone/production/app`) but with different stream prefixes to distinguish them. EC2 instance profile needs `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` permissions. Cost: ~$0.50/GB ingested + $0.03/GB stored. This task modifies the blue-green `docker-compose.yml` from Phase 5, which is why Phase 6 depends on Phase 5. **Important:** The `mode: "non-blocking"` option prevents the awslogs driver from blocking container startup and operation if CloudWatch is unreachable (e.g., IAM permission loss, AWS API outage). Without this, a CloudWatch outage would prevent containers from starting entirely. The `max-buffer-size: "4m"` caps the in-memory log buffer during outages

- [ ] Task 6.5: Add deploy failure notification
  - File: `.github/workflows/release.yml`
  - Action: Add notification step at the end of `deploy-server` job:
    ```yaml
    - name: Notify on failure
      if: failure()
      run: |
        curl -H "Content-Type: application/json" \
          -d '{"content": "**Deploy FAILED:** `${{ github.ref_name }}` — [View logs](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})"}' \
          "${{ secrets.DEPLOY_WEBHOOK_URL }}"
    ```
  - Notes: `DEPLOY_WEBHOOK_URL` is a Discord webhook URL. Create a webhook in your Discord server's settings

- [ ] Task 6.6: Create Terraform bootstrap for state backend
  - File: `infrastructure/bootstrap/main.tf` (new file)
  - Action: Create a standalone Terraform config that provisions the state backend resources (chicken-and-egg problem — these must exist before the main config):
    ```hcl
    resource "aws_s3_bucket" "terraform_state" {
      bucket = "discord-clone-terraform-state"
    }
    resource "aws_s3_bucket_versioning" "terraform_state" {
      bucket = aws_s3_bucket.terraform_state.id
      versioning_configuration { status = "Enabled" }
    }
    resource "aws_dynamodb_table" "terraform_locks" {
      name         = "terraform-locks"
      billing_mode = "PAY_PER_REQUEST"
      hash_key     = "LockID"
      attribute { name = "LockID"; type = "S" }
    }
    ```
  - File: `infrastructure/bootstrap/README.md`
  - Action: Document the one-time bootstrap process:
    ```
    cd infrastructure/bootstrap
    terraform init
    terraform apply
    cd .. && terraform init
    ```
  - Notes: Apply this once before the main Terraform config. Uses local state (acceptable for a one-time bootstrap)

- [ ] Task 6.6.1: Import existing AWS resources into Terraform state
  - File: `infrastructure/import.sh` (one-time script)
  - Action: After writing the Terraform config (Task 6.7), import every resource that was manually created in Phases 1-5. Run `terraform import` for each existing resource:
    ```bash
    cd infrastructure
    terraform init

    # Import existing resources (run once, in this order)
    terraform import aws_instance.app i-<INSTANCE_ID>
    terraform import aws_security_group.app sg-<SG_ID>
    terraform import aws_iam_role.ec2 discord-clone-ec2
    terraform import aws_iam_instance_profile.ec2 discord-clone-ec2
    terraform import aws_iam_role.deploy discord-clone-deploy
    terraform import aws_iam_openid_connect_provider.github \
      arn:aws:iam::<ACCOUNT>:oidc-provider/token.actions.githubusercontent.com

    # Verify no destructive changes
    terraform plan
    ```
    Fill in actual resource IDs before running. After import, run `terraform plan` and verify it shows zero destroy/replace actions. Only proceed with `terraform apply` when the plan shows cosmetic-only changes (e.g., tag normalization)
  - Notes: Without this step, `terraform apply` will attempt to create duplicate resources — IAM role name conflicts, OIDC provider duplicates, and potentially a second EC2 instance. This is a one-time operation. The import script can be deleted after successful import. Document the actual resource IDs in the script before running

- [ ] Task 6.7: Create Terraform infrastructure code
  - File: `infrastructure/main.tf` (new file)
  - Action: Create Terraform config defining:
    - `aws_security_group` with inbound rules: 443/tcp, 80/tcp, 3478/udp, 49152-49252/udp (TURN), 40000-40099/udp (mediasoup). All egress (required for Supabase connectivity — the app connects outbound to Supabase-hosted Postgres over TLS on port 5432)
    - `aws_instance` with `ami` (Ubuntu 22.04), `instance_type` (t3.medium), `iam_instance_profile`, encrypted root volume (30GB), user_data script for Docker + Docker Compose V2 + SSM agent installation
    - `aws_iam_role` for EC2 instance with `AmazonSSMManagedInstanceCore` + CloudWatch Logs + SSM Parameter Store read permissions
    - `aws_iam_instance_profile` attaching the role
    - `aws_iam_openid_connect_provider` for GitHub Actions OIDC
    - `aws_iam_role` for GitHub Actions deploy with trust policy scoped to repo + tags, and SSM + S3 permissions
    - `aws_s3_bucket` for download assets (`discord-clone-assets`) with versioning and lifecycle policy to expire old assets after 90 days. Add read/write permission to the deploy IAM role
  - File: `infrastructure/variables.tf` (new file)
  - Action: Define variables for `aws_region`, `instance_type`, `ami_id`, `github_repo`
  - File: `infrastructure/outputs.tf` (new file)
  - Action: Output `instance_id`, `security_group_id`, `deploy_role_arn`, `instance_public_ip`, `assets_bucket_name`
  - File: `infrastructure/backend.tf` (new file)
  - Action: Configure S3 backend for state:
    ```hcl
    terraform {
      backend "s3" {
        bucket         = "discord-clone-terraform-state"
        key            = "production/terraform.tfstate"
        region         = "us-east-1"
        dynamodb_table = "terraform-locks"
        encrypt        = true
      }
    }
    ```
  - Notes: Run Task 6.6 (bootstrap) first. The assets S3 bucket is required by Phase 4 Task 4.5. The EC2 user_data should install Docker Compose V2 >= 2.20 (required by Phase 5 deploy script). Add `infrastructure/.terraform/` to `.gitignore`

- [ ] Task 6.8: Set up external uptime monitoring
  - File: N/A (External service)
  - Action: Configure UptimeRobot (free tier) or Better Stack to monitor `https://discweeds.com/api/health` every 60 seconds. Set up email/Discord notifications on downtime
  - Notes: This catches issues that internal health checks miss: DNS failures, certificate expiry, nginx misconfiguration, complete EC2 outage

- [ ] Task 6.9: Add nginx cert reload cron
  - File: N/A (EC2 crontab) or `scripts/setup.sh`
  - Action: Add to EC2 crontab:
    ```bash
    0 3 * * * docker compose -f /home/ubuntu/discord_clone/docker-compose.yml exec -T nginx nginx -s reload 2>/dev/null || true
    ```
  - Notes: Runs daily at 3am. After certbot renews the cert, nginx picks it up on reload. Currently nginx serves the old cert until manually restarted. The `|| true` prevents cron error emails if the nginx container isn't running (e.g., during a deploy window)

- [ ] Task 6.10: Add Terraform validation to CI pipeline
  - File: `.github/workflows/ci.yml`
  - Action: Add two jobs — a path filter job and a conditional validation job:
    ```yaml
    check-paths:
      runs-on: ubuntu-latest
      outputs:
        infra: ${{ steps.filter.outputs.infra }}
      steps:
        - uses: actions/checkout@v4
        - uses: dorny/paths-filter@v3  # Pin to SHA per supply-chain policy
          id: filter
          with:
            filters: |
              infra:
                - 'infrastructure/**'

    terraform-validate:
      runs-on: ubuntu-latest
      needs: [check-paths]
      if: needs.check-paths.outputs.infra == 'true'
      steps:
        - uses: actions/checkout@v4
        - uses: hashicorp/setup-terraform@v3
        - name: Terraform Init (no backend)
          run: cd infrastructure && terraform init -backend=false
        - name: Terraform Validate
          run: cd infrastructure && terraform validate
        - name: Terraform Format Check
          run: cd infrastructure && terraform fmt -check -recursive
    ```
  - Notes: The `dorny/paths-filter` action correctly detects which files changed in the PR. The previous approach (`contains(github.event.pull_request.changed_files, 'infrastructure/')`) does not work — `changed_files` is an integer count, not a file list. Pin `dorny/paths-filter` to a full commit SHA per the spec's supply-chain security guidance (Task 2.1). Uses `-backend=false` so validation doesn't require AWS credentials. `terraform validate` catches syntax errors and invalid resource references. `terraform fmt -check` enforces consistent formatting

- [ ] Task 6.11: Update .gitignore for Terraform
  - File: `.gitignore`
  - Action: Add:
    ```
    infrastructure/.terraform/
    infrastructure/*.tfstate
    infrastructure/*.tfstate.backup
    ```

#### Acceptance Criteria

- [ ] AC 6.1: Given secrets are stored in SSM Parameter Store (including `DATABASE_URL` for Supabase), when the deploy script runs, then it fetches all secrets from SSM and passes them as environment overrides to `docker compose up` — no secrets file is written to disk
- [ ] AC 6.1.1: Given SSM-based deploys are verified working, when the legacy `.env` file is checked on EC2, then it does not exist (securely deleted after migration)
- [ ] AC 6.1.2: Given the EC2 instance reboots, when Docker restarts the active slot via `restart: unless-stopped`, then the app starts successfully with the SSM secrets that were set during the last deploy (verify by checking app logs for successful database connection)
- [ ] AC 6.2: Given the app uses `awslogs` driver, when the app writes a log line via Pino, then it appears in CloudWatch log group `/discord-clone/production/app` within 30 seconds
- [ ] AC 6.3: Given a deploy fails, when the GitHub Actions job detects failure, then a Discord webhook notification is sent with the failure details and a link to the run
- [ ] AC 6.4: Given `terraform plan` is run against `infrastructure/main.tf`, when applied, then it creates/manages the EC2 instance, security groups, IAM roles, and OIDC provider matching the manually configured infrastructure
- [ ] AC 6.4a: Given all existing resources from Phases 1-5 are imported via `terraform import`, when `terraform plan` runs, then it reports zero destroy/replace actions (only cosmetic or no-op changes)
- [ ] AC 6.5: Given the external uptime monitor is configured, when `https://discweeds.com/api/health` returns non-200 for >60 seconds, then an alert notification is sent
- [ ] AC 6.6: Given certbot renews the TLS certificate, when the daily cron triggers nginx reload, then nginx serves the renewed certificate without manual intervention

---

## Additional Context

### Dependencies

```
Phase 1 (Compose hardening + SIGTERM handler) — no dependencies
  ↓
Phase 2 (GHCR + scanning) — depends on Phase 1
  ↓              ↓
Phase 3          Phase 4
(Bridge net)     (SSM+OIDC)     ← can run in parallel after Phase 2
  ↓                ↓
  →  Phase 5  ←  (Blue-green — depends on Phases 2, 3, and 4)
       ↓
    Phase 6 (Operational maturity — depends on Phase 5)
```

**Phase 1:** None
**Phase 2:** Phase 1 complete. GHCR access (included with GitHub plan). If repo is private, a PAT with `read:packages` scope for EC2 image pulls. Dependabot config (Task 2.6a) has no external dependencies
**Phase 3:** Phase 2 complete (app uses `image:` not `build:`)
**Phase 4:** Phase 2 complete. AWS account access for IAM (OIDC provider, roles, instance profile). SSM Agent installed on EC2. Secrets: `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`. **Note:** Phases 3 and 4 may be executed in parallel after Phase 2
**Phase 5:** Phases 2, 3, and 4 all complete. SIGTERM handler already added in Phase 1
**Phase 6:** Phase 5 complete (CloudWatch logging and secrets target `app-blue`/`app-green` services from Phase 5's `docker-compose.yml`). AWS account access for SSM Parameter Store, CloudWatch, S3 (Terraform state). Terraform CLI installed locally. Discord webhook URL for notifications

### Testing Strategy

**Phase 1:** Run `docker compose config` to validate YAML. Deploy and verify `docker stats` shows resource limits. Check `docker inspect` for security options. Verify health check `start_period` by watching container startup logs. Verify SIGTERM handler by running `docker stop app` and confirming graceful shutdown in logs (`SIGTERM received, shutting down gracefully...`)
**Phase 2:** Push a test tag. Verify image appears in GHCR with all three tags. Verify EC2 can `docker compose pull` the image. Test rollback by setting `IMAGE_TAG` to a previous version
**Phase 3:** Deploy and verify: `docker network inspect backend` shows containers. Test API (`/api/health`), WebSocket (`/ws`), and voice (mediasoup RTP on UDP 40000-40099). Verify `MEDIASOUP_ANNOUNCED_IP` is set to the EC2 public IP (not `127.0.0.1` or `172.x.x.x`) — check ICE candidates during a voice call. Test that coturn TURN relay still works
**Phase 4:** Push a test tag. Verify OIDC auth succeeds in GitHub Actions logs. Verify SSM command executes on EC2. Check CloudTrail for audit entry. Verify SSH is refused after port 22 is closed
**Phase 5:** Deploy a known-good image. Verify drain endpoint requires `X-Drain-Token` header (returns 403 without it) and signals WebSocket clients to reconnect when authenticated. Verify connection count reaches zero within drain window. Deploy a broken image (bad health check). Verify rollback leaves the old container active. Verify `RUN_MIGRATIONS=false` prevents auto-migration at startup (check logs for `RUN_MIGRATIONS not set — skipping migrations`). Verify both blue and green slots can connect to Supabase simultaneously during switchover window — check Supabase dashboard for connection count (should peak at ~41: 20+20 pool + 1 migration). Verify migrations follow expand-contract policy (no destructive DDL that breaks the old slot). Monitor WebSocket connections during deploy. Verify old slot's connection pool drains cleanly on `docker stop` (check logs for `SIGTERM received, shutting down gracefully...`)
**Phase 6:** Verify secrets load from SSM via environment overrides (check app startup logs for `Database connection verified` to confirm `DATABASE_URL` works — this message comes from `db.ts:20` after the startup `SELECT 1` succeeds; verify no `.env` or `.secrets.env` file exists on disk after deploy). Verify `DB_POOL_MAX=20` is respected by checking `docker inspect` env vars on the running slot. Verify reboot safety: reboot the EC2 instance and confirm the active slot restarts with SSM secrets intact (check logs for successful database connection). Verify CloudWatch log group `/discord-clone/production/app` has entries from `app-blue` stream prefix. After running `terraform import` for all existing resources, run `terraform plan` and verify zero destroy/replace actions. Trigger a failed deploy and verify Discord notification arrives. Check uptime monitor dashboard

### Notes

- **No local database volume needed:** The Supabase migration eliminates the `./data/sqlite` bind mount entirely. The app container is stateless — all persistent data lives in Supabase. After confirming the Supabase migration is complete and production is stable, remove the old `./data/sqlite` directory from EC2:
  ```bash
  # After verifying Supabase migration is complete and data is accessible
  rm -rf ./data/sqlite
  ```
- **Phase ordering follows the dependency graph:** 1→2→(3∥4)→5→6. Phases 3 and 4 may run in parallel after Phase 2. Phase 5 requires all of 2, 3, and 4. Phase 6 requires Phase 5. Do not skip phases
- **EC2 still needs config files:** Even with registry images, the EC2 instance needs `docker-compose.yml`, `nginx.conf`, coturn config, landing page, and deploy scripts. These files are managed via git (the repo is still cloned on EC2) or could be managed via SSM documents in the future. Note: the EC2 instance no longer stores any database files — all data lives in Supabase
- **Phase 5 database safety with Supabase:** Both blue and green slots connect to the same Supabase instance. Postgres handles concurrent connections natively — there is no single-writer constraint like SQLite had. During the switchover window where both containers are running, the old slot serves production traffic while the new slot is health-checked. Both slots can safely read and write to Supabase simultaneously. Migrations are still enforced by the `RUN_MIGRATIONS=false` environment variable in both app slots (Task 5.7) — the deploy script runs DDL migrations explicitly on the new slot via `dist/scripts/migrate.js` (Task 5.3a) before nginx switchover to prevent partial-migration states. The migration function (`connection.ts:76-86`) creates a separate `postgres()` client with `max: 1` and no `statement_timeout` to avoid DDL operations hitting the 30-second query limit
- **Supabase connection resilience during deploys:** The app uses `withDbRetry` (`server/src/db/withDbRetry.ts`) to retry transient Supabase errors (SQLSTATE `08006` connection_failure, `08001` unable_to_connect, `57P01` admin_shutdown) in WebSocket message handlers. The connection pool has `max_lifetime: 30 min` (`connection.ts:62`) which automatically rotates connections, ensuring stale connections from before a deploy don't accumulate. During blue-green switchover, the old slot shuts down cleanly when `docker stop` triggers the SIGTERM handler → `app.close()` → app-level `onClose` closes mediasoup workers → db plugin `onClose` drains pool via `client.end()`. The new slot establishes fresh connections to Supabase on startup. If Supabase itself undergoes maintenance during a deploy, the periodic health monitor (`db.ts:17-47`) will detect consecutive failures (3x60s = 3 minutes) and crash the container — Docker's `restart: unless-stopped` will then restart it, establishing fresh connections
- **Supabase connection pool budget at steady state:** At steady state, only one slot runs (`DB_POOL_MAX=20`). During switchover, both slots run briefly (40 total connections). The migration script adds 1 more (max: 1 in its own pool). Total peak: 41 connections. Supabase Free tier allows 60 via Supavisor session mode (port 5432), leaving 19 for the Supabase dashboard, Studio, and any manual `psql` connections. If using Supabase Pro tier, the limit is higher. Monitor connection usage in the Supabase dashboard after the first few deploys
- **Cost impact:** GHCR is free. SSM is free. CloudWatch Logs ~$5/month. Terraform state S3 <$1/month. S3 assets bucket <$1/month. UptimeRobot free tier. Total incremental cost from this spec: ~$6-7/month. (Supabase Free tier is $0/month for up to 500 MB — separate from this spec's costs)

### Rollback Procedures

Each phase must be tagged in git upon completion. Tag format: `deploy-phase-N` (e.g., `deploy-phase-2`). This provides concrete rollback targets.

**Rollback script (`scripts/rollback-config.sh`):**
```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET_REF="${1:?Usage: rollback-config.sh <git-ref>}"
DEPLOY_DIR="/home/ubuntu/discord_clone"
cd "$DEPLOY_DIR"

echo "Rolling back config files to $TARGET_REF..."
git fetch origin
git checkout "$TARGET_REF" -- docker-compose.yml docker/ scripts/

# Fetch secrets — try SSM first (Phase 6+), fall back to .env (Phase 1-5)
if command -v aws &>/dev/null && aws ssm get-parameter \
    --name "/discord-clone/prod/DATABASE_URL" \
    --query "Parameter.Value" --output text &>/dev/null 2>&1; then
  echo "Fetching secrets from SSM..."
  export JWT_ACCESS_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_ACCESS_SECRET" --with-decryption --query "Parameter.Value" --output text)
  export JWT_REFRESH_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/JWT_REFRESH_SECRET" --with-decryption --query "Parameter.Value" --output text)
  export TURN_SECRET=$(aws ssm get-parameter --name "/discord-clone/prod/TURN_SECRET" --with-decryption --query "Parameter.Value" --output text)
  export GROUP_ENCRYPTION_KEY=$(aws ssm get-parameter --name "/discord-clone/prod/GROUP_ENCRYPTION_KEY" --with-decryption --query "Parameter.Value" --output text)
  export DATABASE_URL=$(aws ssm get-parameter --name "/discord-clone/prod/DATABASE_URL" --with-decryption --query "Parameter.Value" --output text)
elif [ -f "$DEPLOY_DIR/.env" ]; then
  echo "Using .env file for secrets (pre-Phase 6)"
else
  echo "FATAL: No secret source available (no SSM access, no .env file)"
  exit 1
fi

echo "Restarting services with rolled-back config..."
docker compose down
docker compose up -d

# Detect active health check port (blue-green or single app)
if docker compose ps app-blue --status running -q 2>/dev/null | grep -q .; then
  HEALTH_PORT=3001
elif docker compose ps app-green --status running -q 2>/dev/null | grep -q .; then
  HEALTH_PORT=3002
else
  HEALTH_PORT=3000  # Pre-Phase 5 single app service
fi

echo "Verifying health on port $HEALTH_PORT..."
for i in $(seq 1 15); do
  if curl -sf "http://127.0.0.1:$HEALTH_PORT/api/health" > /dev/null 2>&1; then
    echo "Health check passed"
    exit 0
  fi
  sleep 2
done
echo "WARNING: health check failed after rollback — investigate manually"
exit 1
```

**Per-phase rollback steps:**

- **Phase 1 rollback:** `git checkout deploy-phase-0 -- docker-compose.yml && docker compose down && docker compose up -d`. Verification: `docker compose ps` shows all services running. Note: database is in Supabase — no local volume rollback needed
- **Phase 2 rollback:** `git checkout deploy-phase-1 -- docker-compose.yml .github/workflows/release.yml && docker compose down && docker compose up -d`. This restores the `build:` directive. The EC2 instance needs source code again for local builds
- **Phase 3 rollback:** `bash scripts/rollback-config.sh deploy-phase-2`. This restores host networking, reverts nginx upstream to `127.0.0.1:3000`, and removes the bridge network. Verification: test API, WebSocket, and voice
- **Phase 4 rollback:** Re-enable SSH key secrets in GitHub, restore `appleboy/ssh-action` steps in `release.yml`, re-open port 22 in security group. This is a manual revert — Phase 4 changes span GitHub Settings + AWS Console + workflow file
- **Phase 5 rollback:** `bash scripts/rollback-config.sh deploy-phase-4`. This reverts to single `app` service on port 3000. Verification: `docker compose ps` shows single app instance, test API + WebSocket + voice. If Phase 5 was partially deployed (one blue-green slot running), stop both slots first: `docker compose stop app-blue app-green` before rolling back
- **Phase 6 rollback:** Revert compose logging to `json-file`, remove SSM secret fetching from deploy script, restore `.env` from SSM backup: `aws ssm get-parameter --name "/discord-clone/prod/env-backup" --with-decryption --query "Parameter.Value" --output text > .env && chmod 600 .env`. Ensure `DATABASE_URL` is present in the restored `.env` (it must point to Supabase). Terraform resources (IAM, SG, etc.) can remain in AWS — they are declarative and don't affect the running application
