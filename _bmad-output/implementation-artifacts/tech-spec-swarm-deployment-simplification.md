---
title: 'Swarm Deployment Simplification'
slug: 'swarm-deployment-simplification'
created: '2026-02-28'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Docker Swarm', 'Docker Compose v3', 'Nginx 1.27-alpine', 'GHCR', 'AWS SSM', 'certbot/certbot:v3.1.0', 'coturn/coturn:4.6.3', 'GitHub Actions', 'Fastify v5.7.x', 'Terraform']
files_to_modify: ['docker-compose.yml', 'scripts/deploy.sh', 'scripts/setup.sh', 'scripts/rollback-config.sh', 'docker/nginx/nginx.conf', 'docker/nginx/nginx.conf.template', 'docker/nginx/nginx.http-only.conf.template', 'server/src/plugins/drain.ts', 'server/src/app.ts', '.github/workflows/release.yml', 'infrastructure/main.tf', 'docker-compose.coturn.yml']
code_patterns: ['Fastify plugin architecture — drain.ts is a Fastify plugin registered in app.ts:51', 'SIGTERM handler already exists in index.ts:40-46 — calls app.close() which triggers onClose hooks', 'Fastify onClose hook chain: app-level closes mediasoup (app.ts:57), db plugin drains pool (reverse registration order)', 'getClients() in ws/wsServer.ts:20 exports the WS client map — only consumed by drain.ts', 'Client wsClient.ts handles reconnection via onclose → startReconnection() with exponential backoff (1s-30s)', 'Client does NOT handle server reconnect message type — drain signal is a no-op on client side', 'Nginx upstream templating via {{UPSTREAM}} placeholder in both .conf.template files', 'Terraform SG allows 40000-49999/udp — comment says narrow to 40000-40099 after Phase 3', 'setup.sh already handles cert bootstrapping (lines 126-172) — creates temp HTTP nginx, runs certbot, cleans up', 'Docker Compose deploy profile used for green slot — profiles not supported in Swarm stacks']
test_patterns: ['No tests for drain.ts', 'wsClient.test.ts exists but does not test reconnect message handling', 'Infrastructure validated by dry-run, health checks, and manual verification']
---

# Tech-Spec: Swarm Deployment Simplification

**Created:** 2026-02-28

## Overview

### Problem Statement

The current blue-green deployment architecture (267-line deploy.sh, dual nginx templates, manual health polling, drain endpoint, crash-loop detection, config validation containers, post-switchover verification, rollback logic) is over-engineered for a single-EC2 deployment. Recent fixes to stabilize nginx crash-loop detection and post-switchover checks (`6f4a000`, `1d765b4`) highlight that the bash-based orchestration is fragile and hard to maintain.

### Solution

Replace the hand-rolled blue-green orchestration with Docker Swarm's built-in service management. Use `stop-first` update order (accepting ~10s downtime per deploy) to eliminate the mediasoup UDP port conflict that necessitated the blue-green port split. Swarm handles health checks, rollback on failure, and restart policies natively — removing ~200 lines of bash and all nginx config templating.

### Scope

**In Scope:**
- Replace `docker-compose.yml` with Swarm-compatible stack file (single `app` service, no blue/green split)
- Rewrite `scripts/deploy.sh` from 267 lines to ~60 lines (secrets + `docker stack deploy` + migrations)
- Replace dual nginx templates with a single static `nginx.conf` using Docker DNS resolver
- Move cert bootstrapping logic from deploy.sh into `scripts/setup.sh`
- Remove `/api/drain` endpoint from server code
- Delete `scripts/rollback-config.sh` (Swarm handles rollback)
- Delete `docker/nginx/nginx.http-only.conf.template`
- Extract coturn into separate `docker-compose.coturn.yml` (needs host networking, incompatible with Swarm)
- Update `release.yml` deploy-server job for simplified SSM command
- Narrow Terraform security group mediasoup UDP range from 40000-49999 to 40000-40049

**Out of Scope:**
- Electron build/distribution changes
- CI workflow changes (ci.yml stays as-is)
- Application feature changes (routes, UI, mediasoup call logic)
- Database schema changes
- Multi-instance / auto-scaling
- release-please workflow changes
- Adding SIGTERM handler (already exists at `server/src/index.ts:40-46`)

## Context for Development

### Codebase Patterns

**Server shutdown chain (already correct — no changes needed):**
1. `index.ts:40-46`: SIGTERM handler calls `app.close()`
2. `app.ts:57-59`: App-level `onClose` hook calls `closeMediasoup()`
3. `plugins/db.ts`: DB plugin `onClose` hook drains postgres.js pool (runs last — reverse registration order)

**Drain plugin (to be removed):**
- `server/src/plugins/drain.ts`: Fastify plugin, registered at `app.ts:51`
- Exposes `POST/GET /api/drain` with `X-Drain-Token` auth (validates against `JWT_ACCESS_SECRET`)
- Sends `{ type: 'reconnect' }` to WebSocket clients — but client `wsClient.ts` has NO handler for this message type (it's effectively a no-op)
- Blocks new WS upgrades via `onRequest` hook when `draining = true`
- `getClients()` from `ws/wsServer.ts` is also imported by `admin/adminRoutes.ts` and `voice/voiceWsHandler.ts`

**Client reconnection (already handles server death):**
- `wsClient.ts`: `onclose` triggers `startReconnection()` with exponential backoff (1s → 2s → 4s → 8s → max 30s)
- Refreshes JWT tokens before reconnect attempt
- Syncs voice presence after successful reconnect
- No dependency on server-initiated drain signal

**Nginx templating (to be eliminated):**
- `nginx.conf.template`: HTTPS config with `{{UPSTREAM}}` placeholder → `app-blue:3001` or `app-green:3002`
- `nginx.http-only.conf.template`: HTTP-only variant for pre-cert cold starts
- `nginx.conf`: The live config, generated by deploy.sh from template
- Both templates include `location /api/drain { deny all; }` — to be removed

**Docker Compose:**
- `app-blue` (port 3001, mediasoup 40000-40049) — always running
- `app-green` (port 3002, mediasoup 40050-40099) — `profiles: [deploy]`, started only during deploys
- `coturn` — `network_mode: host` (incompatible with Swarm)
- `nginx`, `certbot` — bridge network, Swarm-compatible

**Setup.sh (cert bootstrapping already partially there):**
- Lines 126-172: Creates temp HTTP-only nginx, runs certbot, cleans up
- Needs updating for Swarm context (will use `docker run` directly, not compose)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `docker-compose.yml` | Current blue-green compose → replace with Swarm stack |
| `scripts/deploy.sh` (267 lines) | Current blue-green orchestrator → rewrite to ~60 lines |
| `scripts/setup.sh` (188 lines) | One-time setup → add Swarm init + cert bootstrapping |
| `scripts/rollback-config.sh` (51 lines) | Manual rollback → DELETE |
| `docker/nginx/nginx.conf` | Live nginx config (generated) → replace with static |
| `docker/nginx/nginx.conf.template` | HTTPS template → DELETE |
| `docker/nginx/nginx.http-only.conf.template` | HTTP-only template → DELETE |
| `server/src/plugins/drain.ts` (52 lines) | Drain endpoint → DELETE |
| `server/src/app.ts` | Registers drain plugin at line 51 → remove import + registration |
| `.github/workflows/release.yml` | Deploy-server job → simplify SSM commands |
| `infrastructure/main.tf` | SG rule at line 67-72 → narrow UDP range to 40000-40049 |
| `server/src/ws/wsServer.ts` | Exports `getClients()` — only consumed by drain.ts, keep export (harmless) |

### Technical Decisions

- **`stop-first` over `start-first`**: mediasoup binds UDP 40000-40049 on the host. Two containers cannot share these ports. `stop-first` accepts ~10s downtime but eliminates all blue-green complexity.
- **Static nginx config with `resolver 127.0.0.11`**: Docker's embedded DNS + `set $backend` variable forces nginx to re-resolve per-request. No `upstream` block, no templating. Works because Swarm overlay network resolves service name `app` to current healthy task.
- **coturn outside Swarm**: Swarm doesn't support `network_mode: host`. coturn needs 100+ UDP ports for TURN relay. Stays on plain `docker compose` in a separate file.
- **Remove drain endpoint entirely**: With `stop-first`, the old container is stopped before the new one starts. No overlap period = no drain needed. The drain plugin's reconnect signal was already a client-side no-op. SIGTERM handler in `index.ts` already provides graceful shutdown.
- **Cert bootstrapping in setup.sh**: One-time operation on fresh EC2. Deploy script assumes certs exist. setup.sh already has most of this logic.
- **Keep `getClients()` export**: Still used by admin routes and voice signaling. Removing it would break those modules.
- **Overlay network replaces bridge**: Swarm requires overlay driver instead of bridge. All inter-service communication (app ↔ nginx) works identically.
- **`mode: host` for published ports**: App publishes HTTP 3001 and mediasoup UDP 40000-40049 in host mode. Nginx publishes 80/443 in host mode. This bypasses Swarm's ingress mesh (not needed for single-node).

## Implementation Plan

### Tasks

- [x] Task 1: Remove drain plugin from server
  - File: `server/src/plugins/drain.ts`
  - Action: Delete the entire file
  - File: `server/src/app.ts`
  - Action: Remove `import drainPlugin from './plugins/drain.js';` (line 13) and `await app.register(drainPlugin);` (line 51)
  - Notes: No tests to update (drain.ts has no test file). `getClients()` export in `ws/wsServer.ts` stays — harmless, no churn.

- [x] Task 2: Create `docker-compose.coturn.yml` for standalone coturn
  - File: `docker-compose.coturn.yml` (new)
  - Action: Create a minimal compose file with just the coturn service extracted from current `docker-compose.yml`. Keep identical config: `coturn/coturn:4.6.3`, `network_mode: host`, volume mount for `turnserver.prod.conf:ro`, resource limits, json-file logging.
  - Notes: This runs outside Swarm via `docker compose -f docker-compose.coturn.yml up -d`. coturn rarely changes and has no rolling update needs.

- [x] Task 3: Rewrite `docker-compose.yml` as Swarm stack
  - File: `docker-compose.yml`
  - Action: Replace the entire file with a Swarm-compatible stack definition containing:
    - **`app` service** (single, replaces app-blue + app-green):
      - Image: `ghcr.io/aidenwoodside/discord-clone-server:${IMAGE_TAG:-latest}`
      - Environment: `PORT=3001`, `DB_POOL_MAX=20`, `RUN_MIGRATIONS=false`, `MEDIASOUP_MIN_PORT=40000`, `MEDIASOUP_MAX_PORT=40049`, secrets via env vars (same as current)
      - Ports: `3001:3001/tcp` (host mode), `40000-40049:40000-40049/udp` (host mode)
      - Deploy: `replicas: 1`, `update_config: { order: stop-first, failure_action: rollback, monitor: 30s, delay: 5s }`, `rollback_config: { order: stop-first }`, `restart_policy: { condition: on-failure, delay: 5s, max_attempts: 3, window: 60s }`
      - Resources: same limits/reservations as current (2.0 CPUs / 1G limit, 0.25 CPUs / 256M reservation)
      - `stop_grace_period: 30s`, `read_only: true`, `tmpfs: [/tmp, /home/appuser/.npm]`, `cap_drop: [ALL]`
      - Healthcheck: `wget --spider -q http://127.0.0.1:3001/api/health` — interval `10s` (faster than current 30s to speed up rollout detection), timeout `5s`, retries `3`, start_period `30s`
      - Logging: awslogs driver (same config as current, tag `app/{{ .ID }}`)
    - **`nginx` service**:
      - Same as current but with static config mount (no templating)
      - Ports 80/443 in host mode
      - Deploy: `replicas: 1`, `update_config: { order: start-first }` (nginx can do start-first, no port conflict concern since old dies fast)
      - Remove `location /api/drain { deny all; }` from config (drain endpoint deleted)
    - **`certbot` service**: Identical to current
    - **Network**: `backend` with `driver: overlay` (replaces `bridge`)
    - Remove: `app-green` service entirely, `profiles` directive, all blue/green-specific config
  - Notes: `security_opt: no-new-privileges` is NOT supported in Swarm — `cap_drop: ALL` provides equivalent hardening. `env_file` works in Swarm stacks. Compose `deploy` section is now meaningful (ignored by plain `docker compose up`, used by `docker stack deploy`).

- [x] Task 4: Write static `nginx.conf`
  - File: `docker/nginx/nginx.conf`
  - Action: Replace with a static config (no `{{UPSTREAM}}` placeholders):
    - Add `resolver 127.0.0.11 valid=5s ipv6=off;` at the top of the `http` context
    - Replace `upstream app_backend { server {{UPSTREAM}}; }` with `set $backend http://app:3001;` inside each `server` block
    - Change all `proxy_pass http://app_backend;` to `proxy_pass $backend;`
    - Remove `location /api/drain { deny all; }` block
    - Keep all other config identical: rate limiting, TLS settings, HSTS, WebSocket proxy, downloads, landing page, certbot ACME challenge
  - Notes: The `set $backend` + `resolver` pattern forces nginx to re-resolve DNS per-request. Docker's internal DNS (`127.0.0.11`) resolves `app` to the Swarm service VIP. This is a well-known nginx OSS pattern for dynamic upstreams without nginx Plus.

- [x] Task 5: Delete obsolete files
  - File: `docker/nginx/nginx.conf.template` → DELETE
  - File: `docker/nginx/nginx.http-only.conf.template` → DELETE
  - File: `scripts/rollback-config.sh` → DELETE
  - Notes: Templates replaced by static nginx.conf. Rollback handled by Swarm's `failure_action: rollback`. Manual rollback via `docker service rollback discord-clone_app` if needed.

- [x] Task 6: Rewrite `scripts/deploy.sh` for Swarm
  - File: `scripts/deploy.sh`
  - Action: Replace the entire file (~267 lines → ~60 lines) with:
    1. **Arg parsing**: `IMAGE_TAG="${1:?Usage: deploy.sh <image-tag>}"`, set `DEPLOY_DIR`
    2. **SSM secrets**: Fetch all 6 secrets from SSM Parameter Store (identical to current lines 22-27)
    3. **GHCR auth**: `docker login ghcr.io` (identical to current line 30)
    4. **Export env vars**: Export `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GROUP_ENCRYPTION_KEY`, `DATABASE_URL`, `IMAGE_TAG`
    5. **Template coturn config**: `sed` TURN_SECRET into turnserver.prod.conf (identical to current lines 37-41)
    6. **Ensure coturn running**: `docker compose -f docker-compose.coturn.yml up -d coturn`
    7. **Init Swarm**: `docker swarm init 2>/dev/null || true` (idempotent)
    8. **Deploy stack**: `docker stack deploy -c docker-compose.yml --with-registry-auth --prune discord-clone`
    9. **Wait for convergence**: Poll `docker service inspect discord-clone_app --format '{{.UpdateStatus.State}}'` every 5s for up to 150s. Check for `completed`/empty (success), `rollback_completed`/`paused` (failure — log service logs, exit 1).
    10. **Run migrations**: Find app container via `docker ps -q -f "name=discord-clone_app" --latest`, exec `node server/dist/scripts/migrate.js`
    11. **Prune images**: `docker image prune -af --filter "until=168h"` (same as current)
  - Notes: Everything removed: blue-green slot detection, manual health polling, drain endpoint polling, nginx config templating, nginx validation container, nginx crash-loop detection, nginx reload + rollback, post-switchover verification, backup/restore logic. Swarm handles health checks, rollback, and restart natively.

- [x] Task 7: Update `scripts/setup.sh` for Swarm
  - File: `scripts/setup.sh`
  - Action: Add the following changes:
    - After prerequisite checks (line 10-24), add: `docker swarm init 2>/dev/null || true` with info message
    - Update cert bootstrapping section (lines 126-172) to use `docker run` directly instead of `docker compose run` (since the main compose file is now a Swarm stack — `docker compose run` doesn't work with `docker stack deploy`). Start a standalone nginx container for cert provisioning, run certbot, clean up.
    - Update the final "Start the server" message to use `docker stack deploy -c docker-compose.yml discord-clone` instead of `docker compose up -d`
    - Add note about coturn: `docker compose -f docker-compose.coturn.yml up -d`
  - Notes: setup.sh is interactive (uses `read -rp`) — only runs manually on fresh EC2. The cert bootstrapping approach is the same conceptually, just uses `docker run` instead of compose.

- [x] Task 8: Simplify `release.yml` deploy-server job
  - File: `.github/workflows/release.yml`
  - Action: In the `deploy-server` job:
    - **Remove the "Sync config files via SSM" step entirely** (lines 297-317). With Swarm, `docker stack deploy` reads the compose file directly from the repo checkout on EC2. The `git checkout origin/main -- docker-compose.yml docker/ scripts/` sync still happens but can be folded into the deploy command.
    - **Simplify the "Deploy via SSM" step**: The SSM command becomes: `git fetch origin main && git checkout origin/main -- docker-compose.yml docker-compose.coturn.yml docker/ scripts/ && bash scripts/deploy.sh $TAG`
    - **Reduce timeout** from 300s to 180s (Swarm convergence is faster than manual blue-green)
    - **Reduce poll iterations** from 65 to 40 (40 × 5s = 200s > 180s SSM timeout)
    - Keep: OIDC credential setup, failure notification webhook, concurrency control, environment protection
  - Notes: The config sync and deploy can be a single SSM command now. The S3 download sync for installer assets stays in the SSM command if it was there before.

- [x] Task 9: Narrow Terraform security group UDP range
  - File: `infrastructure/main.tf`
  - Action: Change the mediasoup ingress rule (lines 67-72):
    - `from_port = 40000` (unchanged)
    - `to_port = 40049` (was `49999`)
    - Update comment: `# mediasoup RTP ports (single slot — Swarm stop-first, no blue-green split)`
  - Notes: The old range (40000-49999) was oversized even for blue-green (which only used 40000-40099). This narrows to the exact range used. Apply with `terraform plan` + `terraform apply` — this is a non-destructive SG rule update.

### Acceptance Criteria

- [ ] AC-1: Given a fresh Swarm stack deploy, when `docker stack deploy -c docker-compose.yml --with-registry-auth discord-clone` is run with valid IMAGE_TAG, then the `app` service starts, passes health check within 30s, and `docker service ls` shows 1/1 replicas.

- [ ] AC-2: Given a running Swarm stack, when `deploy.sh <new-tag>` is executed, then Swarm performs a `stop-first` rolling update: stops old container, starts new container with new image, verifies health check, and `docker service inspect discord-clone_app --format '{{.UpdateStatus.State}}'` reports `completed`.

- [ ] AC-3: Given a running Swarm stack, when `deploy.sh` is executed with a broken image (one that fails health check), then Swarm automatically rolls back to the previous image and `docker service inspect` reports `rollback_completed`, and deploy.sh exits with code 1.

- [ ] AC-4: Given nginx is running in the Swarm stack, when the `app` service restarts (Swarm rolling update), then nginx re-resolves the `app` DNS name via `resolver 127.0.0.11` and routes requests to the new container without manual config changes.

- [ ] AC-5: Given a connected WebSocket client, when the server container is stopped during deploy (Swarm `stop-first`), then the client's `onclose` handler triggers `startReconnection()` with exponential backoff, and the client reconnects to the new container within 30s of it becoming healthy.

- [ ] AC-6: Given the drain plugin has been removed, when `GET /api/drain` is requested, then the server returns 404 (route not found).

- [ ] AC-7: Given a fresh EC2 instance with no certs, when `setup.sh` is run, then it initializes Docker Swarm, provisions TLS certs via certbot, and the server is accessible via HTTPS.

- [ ] AC-8: Given coturn is running via `docker-compose.coturn.yml`, when `docker stack deploy` updates the main stack, then coturn remains unaffected and continues serving TURN traffic.

- [ ] AC-9: Given the Terraform security group is applied, when an external client sends UDP to port 40050, then the traffic is blocked. When sending to port 40049, then the traffic is allowed.

- [ ] AC-10: Given the `release.yml` workflow triggers on a `v*` tag, when the deploy-server job runs, then it executes `deploy.sh` via SSM, the SSM command completes within 180s, and the workflow reports success.

## Additional Context

### Dependencies

- Docker Engine 20.10+ on EC2 instance (for Swarm compose v3 features, `cap_drop` in deploy section)
- Existing deployment must be stable before migration
- Terraform state must be up to date before applying SG changes
- The migration is NOT backward-compatible — once Swarm is initialized and the blue-green compose is replaced, rolling back requires restoring the old `docker-compose.yml` and running `docker swarm leave --force` + `docker compose up -d`

### Testing Strategy

**Pre-deploy validation (manual):**
- Run `docker stack deploy` in dry-run mode on a test instance if available
- Verify nginx static config with `docker run --rm -v ./docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t`
- Verify compose file syntax with `docker stack config -c docker-compose.yml` (Swarm compose validation)

**Deploy validation (automated in deploy.sh):**
- Swarm convergence polling: detect `completed`, `rollback_completed`, or `paused` states
- Migration execution: non-zero exit aborts deploy
- Service health: Swarm's built-in health check (10s interval, 3 retries, 30s start period)

**Rollback testing:**
- Deploy a known-bad image tag → verify Swarm auto-rolls back
- Verify `docker service rollback discord-clone_app` works for manual rollback

**Post-migration smoke test:**
- HTTPS accessible on port 443
- `/api/health` returns 200
- WebSocket connects at `/ws`
- WebRTC voice call connects (mediasoup UDP 40000-40049 reachable)
- coturn STUN/TURN functional
- Trigger a second deploy to verify the update cycle works end-to-end

### Notes

**High-risk items:**
- The Swarm migration is a one-way door during execution. If something goes wrong mid-migration, the EC2 instance is in an intermediate state. Mitigation: have the old `docker-compose.yml` and deploy.sh available in git history for emergency `docker swarm leave --force` + restore.
- `resolver 127.0.0.11` is Docker-specific. If nginx is ever moved outside Docker, this breaks. Acceptable risk for this architecture.
- Swarm's `stop-first` means ~10s of complete unavailability. If a deploy happens during an active voice call with many participants, all calls drop simultaneously. Mitigation: deploy during low-traffic windows (existing practice).

**Known limitations:**
- `security_opt: no-new-privileges` is not available in Swarm mode. `cap_drop: ALL` provides equivalent hardening for this use case.
- `docker compose exec` doesn't work with Swarm services. Migrations use `docker exec` against the container ID found via `docker ps -q -f "name=discord-clone_app"`.
- Swarm logs are accessed via `docker service logs discord-clone_app` instead of `docker compose logs app`. CloudWatch logging is unaffected (awslogs driver works identically in Swarm).

**Future considerations (out of scope):**
- If the project scales to multi-instance, Swarm supports multi-node with the same compose file. The overlay network and service discovery scale automatically.
- `start-first` could be re-enabled if mediasoup is split into a separate service or moved to a dedicated media server.
