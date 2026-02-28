---
title: 'Deployment Architecture Overhaul'
slug: 'deployment-architecture-overhaul'
created: '2026-02-27'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Docker Compose', 'GHCR', 'Trivy', 'AWS SSM', 'AWS OIDC', 'Terraform', 'CloudWatch', 'Nginx 1.27-alpine', 'GitHub Actions', 'coturn/coturn:4.6.3', 'certbot/certbot:v3.1.0', 'node:20-alpine']
files_to_modify: ['docker-compose.yml', '.github/workflows/release.yml', 'docker/nginx/nginx.conf', 'docker/nginx/nginx.conf.template', 'server/Dockerfile', 'server/src/index.ts', 'scripts/setup.sh', 'scripts/deploy.sh', 'scripts/rollback-config.sh', '.env.example', 'docker/coturn/turnserver.prod.conf', 'infrastructure/main.tf', 'infrastructure/bootstrap/main.tf']
code_patterns: ['GitHub Actions OIDC federation', 'AWS SSM Run Command with structured status parsing', 'Blue-green Docker deployment with split mediasoup UDP ranges', 'GHCR image tagging (SHA + semver + latest)', 'Terraform HCL for EC2 + IAM + SG + S3', 'Fastify onClose hook for graceful shutdown (pool drain + mediasoup)', 'Docker Compose profiles for deploy-only containers', 'nginx upstream switching via template + nginx -t validation + reload', 'SSM secrets passed as environment overrides (no file on disk)', 'Application-level connection draining via /api/drain endpoint', 'Database migration guard via RUN_MIGRATIONS env var', 'DATABASE_URL for Supabase managed Postgres (no local DB volume)']
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
- `app` builds from `server/Dockerfile` (context: `.`), env from `.env`, `DATABASE_URL` points to Supabase (no local DB volume)
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
- `server/src/index.ts`: Entry point — NO SIGTERM handler. Calls `buildApp()` + `app.listen()` but never `app.close()` on signal
- `server/src/app.ts:55`: `onClose` hook wired to `closeMediasoup()` — will execute IF `app.close()` is called
- Health endpoint at `app.ts:59`: `GET /api/health` — checks Supabase connectivity via `SELECT 1` (plus periodic health monitor with consecutive-failure threshold added by Supabase migration)
- Mediasoup port range: `MEDIASOUP_MIN_PORT` / `MEDIASOUP_MAX_PORT` read from env (defaults 40000-49999)
- `.env.example` has all env vars including `MEDIASOUP_MIN_PORT=40000`, `MEDIASOUP_MAX_PORT=49999`

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
| `server/src/index.ts` | Server entry point — MISSING SIGTERM handler (44 lines) |
| `server/src/app.ts` | Fastify app builder, health endpoint, onClose hook for mediasoup (71 lines) |
| `server/src/plugins/voice/mediasoupManager.ts` | Reads MEDIASOUP_MIN_PORT/MAX_PORT from env (line 8-9) |
| `scripts/setup.sh` | One-time EC2 setup: secrets, .env, certbot, coturn config (155 lines) |
| `.env.example` | All env vars including mediasoup ports, secrets, domain config (60 lines) |
| `docker/coturn/turnserver.prod.conf` | TURN config: ports 49152-49252, auth secret placeholder |
| `.dockerignore` | Excludes client/, .git/, node_modules/, .env, _bmad*/ |
| `_bmad-output/planning-artifacts/deployment-architecture-review.md` | Source review document with all recommendations |

### Technical Decisions

- **Registry:** GHCR (free, native GitHub Actions integration via `GITHUB_TOKEN`, zero additional config)
- **Image tagging:** Triple-tag every build: git SHA (immutable traceability), semver (human-readable rollback), `latest` (convenience, never pinned in production)
- **Networking:** Custom `backend` bridge network for app/nginx/certbot. Host mode only for coturn (UDP relay needs raw port access). Mediasoup port range reduced from 40000-49999 to 40000-40099 (100 ports via `.env`). **Capacity analysis:** Each mediasoup WebRtcTransport consumes 1 UDP port for ICE. Each peer in a voice channel needs ~2 ports (send + receive transport). With blue-green split (50 ports per slot), each slot supports ~25 concurrent voice users. This is acceptable for the project's expected scale. If concurrent voice users exceed 20, widen the range (e.g., 40000-40499 per slot), update the security group, and redeploy
- **Deployment method:** AWS SSM + OIDC — short-lived credentials, no SSH keys, no port 22, full CloudTrail audit. IAM role trust policy scoped to `repo:AidenWoodside/discord_clone:environment:production` (environment claim, not tag ref — requires both GitHub environment approval and matching OIDC token)
- **Zero-downtime:** Blue-green with `app-blue` (port 3001, UDP 40000-40049) and `app-green` (port 3002, UDP 40050-40099). Deploy script determines active slot by inspecting running containers (no ephemeral state file). Nginx upstream switched via template (`nginx.conf.template` with `{{UPSTREAM}}` placeholder) + `nginx -t` validation + `nginx -s reload`, with full rollback on failure. Green uses Docker Compose `profiles: [deploy]` — only started during deploys. Both slots use `restart: unless-stopped` for crash recovery. **Connection pool budget:** During the brief switchover window both slots hold Supabase connection pools simultaneously. The postgres.js pool size per slot should be set so that `blue_pool + green_pool` does not exceed Supabase's connection limit (Free tier: 60 direct connections via Supavisor session mode on port 5432). Recommended: `max: 20` per slot (40 total during switchover, leaving 20 connections for migrations, health checks, and Supabase dashboard). Configure this in the `postgres()` driver options in `connection.ts`
- **Graceful shutdown:** Add SIGTERM handler to `server/src/index.ts` calling `app.close()` (Phase 1, Task 1.10 — container lifecycle hygiene, not deferred to Phase 5). `stop_grace_period: 30s` on both app containers. The `onClose` hook drains the Supabase connection pool (via `close()` from `createDatabase()`) and shuts down mediasoup workers
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
    Add `read_only: true` to the `app` service (no local DB writes after Supabase migration — the app only connects to external Supabase via `DATABASE_URL`). Add a `tmpfs` mount for any temp file needs:
    ```yaml
    read_only: true
    tmpfs:
      - /tmp
    ```
  - Notes: `no-new-privileges` prevents privilege escalation. `cap_drop: ALL` removes all Linux capabilities. Nginx needs `NET_BIND_SERVICE` for ports 80/443. The app container can be `read_only: true` because there is no local database — all data is stored in Supabase. Nginx still needs writable `/var/cache/nginx` so do NOT add `read_only` to nginx. **Verification:** Confirm that `postgres.js` (the Supabase driver) does not write temporary files to disk for connection pooling or TLS cert caching — it should not, but verify during Phase 1 testing by checking for write errors in container logs after enabling `read_only`

- [ ] Task 1.7: Verify SQLite volume is removed from Docker Compose
  - File: `docker-compose.yml`
  - Action: Confirm that the `./data/sqlite:/app/data` volume mount has been removed from the `app` service (done by the Supabase migration). The app container should have no data volumes — it connects to Supabase via `DATABASE_URL`. Keep nginx/coturn/certbot bind mounts (config files need host filesystem access). Remove the `./data/sqlite` directory from EC2 after verifying Supabase migration is complete. No `volumes:` section needed for database storage.
  - Notes: The Supabase migration eliminates local database storage entirely. If the old `./data/sqlite` directory still exists on EC2, it can be archived and deleted. The app container is now stateless (all state in Supabase)

- [ ] Task 1.8: Add Docker Compose validation to CI pipeline
  - File: `.github/workflows/ci.yml`
  - Action: Add a step to the CI workflow that validates the Docker Compose file after any changes:
    ```yaml
    - name: Validate Docker Compose config
      run: docker compose config --quiet
    ```
  - Notes: This catches YAML syntax errors, invalid service references, bad profile configs, and malformed resource limits before they reach production. Add this after the build steps. Since Phase 1 makes heavy modifications to the compose file, catching errors in CI is essential

- [ ] Task 1.9: Add GitHub environment protection rules
  - File: N/A (GitHub Settings)
  - Action: In GitHub Settings > Environments, create a `production` environment. Add required reviewers (owner). Set branch restriction to tags matching `v*`. Add `environment: production` to the `deploy-server` job in `release.yml`
  - Notes: This is a manual GitHub Settings change plus a one-line addition to `release.yml`

- [ ] Task 1.10: Add SIGTERM handler to server entry point
  - File: `server/src/index.ts`
  - Action: After `await app.listen(...)`, add:
    ```typescript
    const shutdown = async () => {
      app.log.info('SIGTERM received, shutting down gracefully...');
      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    ```
  - Notes: This ensures `app.close()` is called, which triggers the `onClose` hooks: the db plugin drains the Supabase connection pool (via `close()` from `createDatabase()`), clears the health check timer, and then `closeMediasoup()` shuts down workers. Without this, Docker's SIGTERM is ignored and the process is force-killed after `stop_grace_period`, leaving Supabase connections in a stale state. This is container lifecycle hygiene — required for clean shutdowns regardless of blue-green deployment. Moving this to Phase 1 allows early validation of graceful shutdown behavior

#### Acceptance Criteria

- [ ] AC 1.1: Given the updated `docker-compose.yml`, when `docker compose config` is run, then it validates without errors and all services show resource limits, logging config, and security options
- [ ] AC 1.2: Given the app service is starting, when it takes >10s to boot (migrations + mediasoup init), then Docker does not mark it unhealthy during the `start_period` window
- [ ] AC 1.3: Given nginx depends on app with `condition: service_healthy`, when `docker compose up -d` is run, then nginx starts only after the app health check passes
- [ ] AC 1.4: Given `nginx:1.27-alpine` and `coturn/coturn:4.6.3` are pinned, when `docker compose pull` is run, then it pulls those exact versions (not latest)
- [ ] AC 1.5: Given the app container is running, when `docker inspect` is run on it, then `NoNewPrivileges` is `true` and `CapDrop` includes `ALL`
- [ ] AC 1.6: Given the app container has no local database volume (Supabase is external), when `docker compose down` and `docker compose up -d` are run, then the app reconnects to Supabase and all data is intact (no local storage dependency)
- [ ] AC 1.7: Given a PR modifies `docker-compose.yml`, when CI runs, then `docker compose config --quiet` validates without errors
- [ ] AC 1.8: Given `deploy-server` job has `environment: production`, when a tag is pushed, then GitHub requires manual approval before the deploy job runs
- [ ] AC 1.9: Given SIGTERM is sent to the app container, when `docker stop` is called, then `app.close()` executes, the Supabase connection pool is drained, the health check timer is cleared, mediasoup workers are shut down, and in-flight requests complete before exit

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
  - Notes: Uses GitHub Actions cache for Docker layer caching. `GITHUB_TOKEN` has automatic GHCR write access. All third-party actions pinned to exact version tags (not just major version) for supply-chain security — major version tags like `@v3` can be force-updated upstream. Check for updates quarterly or use Dependabot/Renovate to automate version bumps

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
  - Notes: `exit-code: 1` fails the build on CRITICAL/HIGH vulnerabilities. Use `exit-code: 0` initially if you want non-blocking scans. Pin all third-party actions to a specific version tag (or full commit SHA for maximum supply-chain security) — never use `@master` or `@main`

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
  - Action: Add `IMAGE_TAG=latest` with comment explaining it's set by the deploy pipeline. Verify that `DATABASE_URL` (from Supabase migration) is present and `DATABASE_PATH` has been removed

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

- [ ] Task 3.7: Update setup.sh certbot from standalone to webroot mode
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
- [ ] AC 3.7: Given certbot is on bridge networking with no published ports, when `scripts/setup.sh` provisions a TLS certificate via webroot mode, then the certificate is issued successfully using the shared ACME challenge volume served by nginx

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
          COMMAND_ID=$(aws ssm send-command \
            --instance-ids "${{ secrets.EC2_INSTANCE_ID }}" \
            --document-name "AWS-RunShellScript" \
            --timeout-seconds 120 \
            --parameters 'commands=["bash /home/ubuntu/discord_clone/scripts/deploy.sh ${{ github.ref_name }}"]' \
            --query "Command.CommandId" --output text)

          # Poll with structured status parsing — never grep mixed output
          for i in $(seq 1 60); do
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
            [ "$i" -eq 60 ] && { echo "Timed out waiting for SSM command"; exit 1; }
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
    - `app-blue`: image `ghcr.io/aidenwoodside/discord-clone-server:${IMAGE_TAG:-latest}`, `PORT=3001`, networks `backend`, `restart: unless-stopped`, all resource limits/logging/security from Phase 1, health check on port 3001, mediasoup ports 40000-40049
    - `app-green`: identical but `PORT=3002`, health check on port 3002, `restart: unless-stopped`, `profiles: [deploy]` (only started during deploys), mediasoup ports 40050-40099
    - No shared data volumes needed — both slots connect to the same Supabase instance via `DATABASE_URL`
    - Both have `stop_grace_period: 30s`, `RUN_MIGRATIONS=false`
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
        - MEDIASOUP_MIN_PORT=40000
        - MEDIASOUP_MAX_PORT=40049
      ports:
        - "3001:3001"
        - "40000-40049:40000-40049/udp"

    app-green:
      environment:
        - PORT=3002
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
      curl -sf -X POST "http://127.0.0.1:$ACTIVE_PORT/api/drain" > /dev/null 2>&1 || true

      # Wait for connections to drain (poll every 2s, up to DRAIN_TIMEOUT)
      DRAIN_START=$(date +%s)
      while true; do
        ELAPSED=$(( $(date +%s) - DRAIN_START ))
        if [ "$ELAPSED" -ge "$DRAIN_TIMEOUT" ]; then
          echo "Drain timeout reached — proceeding with switchover"
          break
        fi
        CONNS=$(curl -sf "http://127.0.0.1:$ACTIVE_PORT/api/drain" 2>/dev/null \
          | python3 -c "import sys,json; print(json.load(sys.stdin).get('connections','unknown'))" 2>/dev/null || echo "unknown")
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
    if ! docker compose exec -T nginx curl -sf "http://app-$NEW:$NEW_PORT/api/health" > /dev/null 2>&1; then
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
  - Notes: Active slot is determined by inspecting which container is actually running (survives reboots, no stale file). Only the target slot's image is pulled (not both). The drain step signals the old slot's connected WebSocket clients to reconnect, then polls until connections reach zero or the `DRAIN_TIMEOUT` (default 30s) expires. Drain connection polling uses `python3 -c` for JSON parsing (available in the node:20-alpine image) instead of fragile `grep` patterns. Migrations run against Supabase on the new slot via the dedicated `dist/scripts/migrate.js` entry point (Task 5.3a) before nginx switches — the old slot still serves traffic during this window. Both slots can safely connect to Supabase concurrently (Postgres handles concurrent access natively). Nginx config uses a template file with `{{UPSTREAM}}` placeholder — never raw sed on the live config. `nginx -t` validates before reload, with full rollback on failure at every step. Post-switchover verification uses Docker DNS from inside the nginx container to confirm the upstream switch worked. Old Docker images are pruned after each deploy (keeps last 7 days) to prevent disk bloat. Requires Docker Compose V2 >= 2.20

- [ ] Task 5.3a: Create dedicated migration entry point script
  - File: `server/src/scripts/migrate.ts` (new file, compiles to `dist/scripts/migrate.js`)
  - Action: Create a standalone migration script that:
    ```typescript
    import { createDatabase } from '../db/connection.js';

    async function runMigrations() {
      console.log('Running database migrations against Supabase...');
      const { migrate, close } = await createDatabase();
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
    Ensure `server/tsconfig.json` includes `src/scripts/` in compilation so it appears in `dist/scripts/migrate.js`. The `createDatabase()` call here should use a separate connection without `statement_timeout` (per the Supabase migration spec) to avoid DDL operations hitting the 30-second query limit.
  - Notes: This replaces the fragile inline `node -e "import(...)"` one-liner in the deploy script. A dedicated file is testable, has proper error handling, and won't break if internal module paths change. The deploy script (Task 5.3) calls `node dist/scripts/migrate.js` inside the container

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
  - Action: Add a `POST /api/drain` endpoint (or listen for `SIGUSR1`) that:
    1. Sets a `draining` flag that prevents accepting new WebSocket upgrades at `/ws`
    2. Sends a `{ type: "reconnect" }` frame to all connected WebSocket clients so they reconnect to the new slot via nginx
    3. Returns a JSON response with `{ "connections": <count> }` showing remaining active connections
  - Notes: The client-side WebSocket handler must already support reconnection (standard for Discord-style apps). If the client does not have reconnect logic, add a follow-up task to implement it. The drain endpoint is called by the deploy script before switching nginx upstream. The endpoint should NOT be publicly accessible — it is only called from localhost by the deploy script. Add `deny all;` for `/api/drain` in the nginx config and template

- [ ] Task 5.7: Add migration guard environment variable
  - File: `server/src/index.ts` (or the migration runner entry point)
  - Action: Add a `RUN_MIGRATIONS` environment variable check (default: `false`). If `RUN_MIGRATIONS` is not explicitly set to `true`, skip all Drizzle migration execution at startup. Add corresponding `RUN_MIGRATIONS=false` to both `app-blue` and `app-green` environment blocks in `docker-compose.yml`
  - File: `scripts/deploy.sh`
  - Action: The explicit migration step between health check and nginx switchover is already defined in Task 5.3 (step 5 of the deploy script) using the ESM `import('./dist/db/connection.js')` pattern with a separate connection that has no `statement_timeout`.
  - Notes: This ensures migrations run exactly once, on exactly one container, in a controlled sequence. While Supabase/Postgres safely handles concurrent connections from both slots, running DDL migrations from a single container prevents partial-migration states. The migration uses a separate connection without `statement_timeout` (per the Supabase migration spec) to avoid DDL operations hitting the 30-second query limit. The old slot continues serving traffic during this window. If the migration fails, the deploy script should stop the new slot and exit 1 (same as health check failure)

- [ ] Task 5.8: Update nginx depends_on for blue-green
  - File: `docker-compose.yml`
  - Action: Change nginx `depends_on` from `app` to `app-blue` with `condition: service_healthy`

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
  - Notes: Migrate the existing values from the EC2 `.env` file. `GROUP_ENCRYPTION_KEY` must be preserved (changing it invalidates all encrypted messages). `DATABASE_URL` contains the Supabase connection password — it must be stored as a `SecureString`. Use Supavisor session mode (port 5432) for the long-lived Fastify server (supports transactions and prepared statements)

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
    ```
  - Notes: EC2 instance profile needs `ssm:GetParameter` and `ssm:GetParametersByPath` permissions with `kms:Decrypt` for the SSM KMS key. This approach avoids the env_file + shred anti-pattern: secrets exist only in the deploy script's process memory and Docker's container config. Container recreation (via `docker compose up -d`) requires re-running the deploy script, which re-fetches from SSM — this is the intended behavior. Secrets are visible in `docker inspect` output on the host, which is acceptable since host access already implies root. Remove any `env_file:` directives from the compose file

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
  - Action: Add a job that validates Terraform config on PRs that modify `infrastructure/`:
    ```yaml
    terraform-validate:
      runs-on: ubuntu-latest
      if: contains(github.event.pull_request.changed_files, 'infrastructure/')
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
  - Notes: Uses `-backend=false` so validation doesn't require AWS credentials. `terraform validate` catches syntax errors and invalid resource references. `terraform fmt -check` enforces consistent formatting. A full `terraform plan` requires credentials and is better run as a manual step or in a separate workflow with OIDC auth

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
- [ ] AC 6.2: Given the app uses `awslogs` driver, when the app writes a log line via Pino, then it appears in CloudWatch log group `/discord-clone/production/app` within 30 seconds
- [ ] AC 6.3: Given a deploy fails, when the GitHub Actions job detects failure, then a Discord webhook notification is sent with the failure details and a link to the run
- [ ] AC 6.4: Given `terraform plan` is run against `infrastructure/main.tf`, when applied, then it creates/manages the EC2 instance, security groups, IAM roles, and OIDC provider matching the manually configured infrastructure
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
**Phase 2:** Phase 1 complete. GHCR access (included with GitHub plan). If repo is private, a PAT with `read:packages` scope for EC2 image pulls
**Phase 3:** Phase 2 complete (app uses `image:` not `build:`)
**Phase 4:** Phase 2 complete. AWS account access for IAM (OIDC provider, roles, instance profile). SSM Agent installed on EC2. Secrets: `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`. **Note:** Phases 3 and 4 may be executed in parallel after Phase 2
**Phase 5:** Phases 2, 3, and 4 all complete. SIGTERM handler already added in Phase 1
**Phase 6:** Phase 5 complete (CloudWatch logging and secrets target `app-blue`/`app-green` services from Phase 5's `docker-compose.yml`). AWS account access for SSM Parameter Store, CloudWatch, S3 (Terraform state). Terraform CLI installed locally. Discord webhook URL for notifications

### Testing Strategy

**Phase 1:** Run `docker compose config` to validate YAML. Deploy and verify `docker stats` shows resource limits. Check `docker inspect` for security options. Verify health check `start_period` by watching container startup logs. Verify SIGTERM handler by running `docker stop app` and confirming graceful shutdown in logs (`SIGTERM received, shutting down gracefully...`)
**Phase 2:** Push a test tag. Verify image appears in GHCR with all three tags. Verify EC2 can `docker compose pull` the image. Test rollback by setting `IMAGE_TAG` to a previous version
**Phase 3:** Deploy and verify: `docker network inspect backend` shows containers. Test API (`/api/health`), WebSocket (`/ws`), and voice (mediasoup RTP on UDP 40000-40099). Test that coturn TURN relay still works
**Phase 4:** Push a test tag. Verify OIDC auth succeeds in GitHub Actions logs. Verify SSM command executes on EC2. Check CloudTrail for audit entry. Verify SSH is refused after port 22 is closed
**Phase 5:** Deploy a known-good image. Verify drain endpoint signals WebSocket clients to reconnect and connection count reaches zero within drain window. Deploy a broken image (bad health check). Verify rollback leaves the old container active. Verify `RUN_MIGRATIONS=false` prevents auto-migration at startup. Verify both blue and green slots can connect to Supabase simultaneously during switchover window. Monitor WebSocket connections during deploy
**Phase 6:** Verify secrets load from SSM via environment overrides (check app startup logs for "Database connection verified" to confirm `DATABASE_URL` works; verify no `.env` or `.secrets.env` file exists on disk after deploy). Verify CloudWatch log group `/discord-clone/production/app` has entries from `app-blue` stream prefix. Run `terraform plan` and verify it matches existing infrastructure. Trigger a failed deploy and verify Discord notification arrives. Check uptime monitor dashboard

### Notes

- **No local database volume needed:** The Supabase migration eliminates the `./data/sqlite` bind mount entirely. The app container is stateless — all persistent data lives in Supabase. After confirming the Supabase migration is complete and production is stable, remove the old `./data/sqlite` directory from EC2:
  ```bash
  # After verifying Supabase migration is complete and data is accessible
  rm -rf ./data/sqlite
  ```
- **Phase ordering follows the dependency graph:** 1→2→(3∥4)→5→6. Phases 3 and 4 may run in parallel after Phase 2. Phase 5 requires all of 2, 3, and 4. Phase 6 requires Phase 5. Do not skip phases
- **EC2 still needs config files:** Even with registry images, the EC2 instance needs `docker-compose.yml`, `nginx.conf`, coturn config, landing page, and deploy scripts. These files are managed via git (the repo is still cloned on EC2) or could be managed via SSM documents in the future. Note: the EC2 instance no longer stores any database files — all data lives in Supabase
- **Phase 5 database safety with Supabase:** Both blue and green slots connect to the same Supabase instance. Postgres handles concurrent connections natively — there is no single-writer constraint like SQLite had. During the switchover window where both containers are running, the old slot serves production traffic while the new slot is health-checked. Both slots can safely read and write to Supabase simultaneously. Migrations are still enforced by the `RUN_MIGRATIONS=false` environment variable in both app slots (Task 5.7) — the deploy script runs DDL migrations explicitly on the new slot before nginx switchover to prevent partial-migration states. The migration uses a separate postgres.js connection without `statement_timeout` to avoid DDL operations hitting the 30-second query limit
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
