---
title: 'Automated EC2 Deployment via GitHub Actions'
slug: 'automated-ec2-deployment'
created: '2026-02-25'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['GitHub Actions', 'appleboy/ssh-action@v1', 'Docker Compose']
files_to_modify: ['.github/workflows/release.yml']
code_patterns: ['GitHub Actions job dependencies via needs:', 'appleboy/ssh-action for remote execution', 'Docker image tagging for rollback']
test_patterns: ['No automated tests — CI/CD workflow validated by YAML syntax and dry-run']
---

# Tech-Spec: Automated EC2 Deployment via GitHub Actions

**Created:** 2026-02-25

## Overview

### Problem Statement

Server deployment to EC2 is manual — requires SSH into the instance, git pull, docker compose rebuild, and restart. Every release requires human intervention.

### Solution

Add a `deploy-server` job to the existing `release.yml` workflow that SSHs into EC2 after Electron builds complete, pulls latest code, rebuilds Docker containers, waits for healthy status, and auto-rolls back if the health check fails.

### Scope

**In Scope:**
- New `deploy-server` job in `.github/workflows/release.yml` (runs after `build-electron` and `build-server-image`)
- SSH via `appleboy/ssh-action@v1` using GitHub secrets (`EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`)
- Deploy sequence: `git pull` → `docker compose build` → `docker compose up -d`
- Health check loop polling `/api/health` endpoint until healthy or timeout
- Auto-rollback: if health check fails, restore previous Docker images and `docker compose up -d`
- Documentation of required GitHub secrets setup in release.yml comments

**Out of Scope:**
- Blue-green / zero-downtime deployment
- Database migrations (not applicable — SQLite)
- Changes to `docker-compose.yml` or `setup.sh`
- Slack/Discord notifications on deploy status

## Context for Development

### Codebase Patterns

- GitHub Actions workflows use `actions/checkout@v4`, `actions/setup-node@v4` with Node 20
- `release.yml` triggers on `push: tags: ['v*']` — 2 existing jobs: `build-electron` (3-OS matrix) and `build-server-image`
- Docker Compose uses `build:` directive for `app` service — image named `<project_dir>-app` by default
- Health endpoint `GET /api/health` returns 200 with `{ data: { status: 'ok', database: 'connected' } }` or 503
- Docker Compose already defines health check: `wget --spider -q http://127.0.0.1:3000/api/health` with 30s interval, 5s timeout, 3 retries

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `.github/workflows/release.yml` | Existing release workflow — add deploy job here |
| `docker-compose.yml` | 4 services: app, coturn, nginx, certbot. App has built-in health check |
| `server/src/app.ts:59` | Health endpoint implementation — verifies DB connectivity |
| `server/Dockerfile` | Multi-stage build: node:20-alpine, exposes port 3000 |
| `.github/workflows/ci.yml` | Reference for workflow patterns/conventions |

### Technical Decisions

- **SSH action:** `appleboy/ssh-action@v1` — widely used, supports multi-line scripts, handles key auth
- **Rollback via Docker image tagging:** Before building, tag current app image as `:rollback`. If health check fails after deploy, re-tag `:rollback` as `:latest` and restart. Avoids slow rebuilds during rollback
- **Health check strategy:** Poll `http://127.0.0.1:3000/api/health` directly (bypasses nginx) — 30 attempts, 2s apart = 60s timeout
- **3 GitHub secrets required:** `EC2_SSH_KEY` (private key), `EC2_HOST` (IP or domain), `EC2_USER` (SSH username)
- **Deploy path:** Needs `EC2_DEPLOY_PATH` secret or hardcoded path to repo on EC2

## Implementation Plan

### Tasks

- [ ] Task 1: Add deploy-server job to release.yml
  - File: `.github/workflows/release.yml`
  - Action: Add a new `deploy-server` job with the following structure:
    - `needs: [build-electron, build-server-image]` — runs after both existing jobs complete
    - `runs-on: ubuntu-latest`
    - `if: always() && needs.build-electron.result == 'success'` — deploy even if `build-server-image` was skipped (Dockerfile conditional), but NOT if Electron builds failed
    - Uses `appleboy/ssh-action@v1` with secrets: `EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`
    - The SSH script executes the full deploy sequence (Tasks 2-4 below are logical subtasks within the single SSH script)

- [ ] Task 2: Implement pre-deploy image backup (within SSH script)
  - File: `.github/workflows/release.yml` (inside `deploy-server` job's SSH script)
  - Action: Before any changes, tag the current app Docker image for rollback:
    ```bash
    cd ${{ secrets.EC2_DEPLOY_PATH }}
    docker tag $(docker compose images app -q) app:rollback 2>/dev/null || true
    ```
  - Notes: `|| true` handles first-ever deploy where no image exists yet

- [ ] Task 3: Implement deploy sequence (within SSH script)
  - File: `.github/workflows/release.yml` (inside `deploy-server` job's SSH script)
  - Action: Pull latest code, rebuild, and restart:
    ```bash
    git pull origin main
    docker compose build
    docker compose up -d
    ```

- [ ] Task 4: Implement health check loop with auto-rollback (within SSH script)
  - File: `.github/workflows/release.yml` (inside `deploy-server` job's SSH script)
  - Action: Poll health endpoint, rollback on failure:
    ```bash
    echo "Waiting for health check..."
    for i in $(seq 1 30); do
      if curl -sf http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
        echo "Deploy successful — health check passed"
        docker rmi app:rollback 2>/dev/null || true
        exit 0
      fi
      echo "Attempt $i/30 — waiting..."
      sleep 2
    done

    echo "DEPLOY FAILED — health check timed out after 60s. Rolling back..."
    docker tag app:rollback $(docker compose images app -q 2>/dev/null || echo "app:latest")
    docker compose up -d
    echo "Rollback complete"
    exit 1
    ```
  - Notes: 30 attempts x 2s = 60s timeout. Polls app directly on port 3000, bypassing nginx. Exit 1 on failure marks the GitHub Actions job as failed

- [ ] Task 5: Document required GitHub secrets in release.yml
  - File: `.github/workflows/release.yml`
  - Action: Update the comment block at the top of the file to include deployment secrets setup:
    ```yaml
    # Deployment Secrets (required for auto-deploy to EC2):
    #   EC2_SSH_KEY   — Private SSH key for EC2 access (dedicated deploy key recommended)
    #   EC2_HOST      — EC2 public IP or domain name
    #   EC2_USER      — SSH username (e.g., "ubuntu")
    #   EC2_DEPLOY_PATH — Absolute path to repo on EC2 (e.g., "/home/ubuntu/discord_clone")
    ```

- [ ] Task 6: Validate workflow YAML syntax
  - Action: Verify the updated `release.yml` is valid YAML and follows GitHub Actions schema. Ensure `needs`, `if`, `secrets` references, and `appleboy/ssh-action` parameters are correct

### Acceptance Criteria

- [ ] AC 1: Given a `v*` tag is pushed, when the Electron builds and server image build complete successfully, then the `deploy-server` job runs and SSHs into the EC2 instance
- [ ] AC 2: Given the deploy-server job runs, when it executes the deploy script, then it tags the current app image as rollback, pulls latest code, rebuilds the Docker image, and restarts containers via `docker compose up -d`
- [ ] AC 3: Given the containers are restarted, when the health check loop polls `GET http://127.0.0.1:3000/api/health`, then it waits up to 60 seconds (30 attempts, 2s interval) for a 200 response
- [ ] AC 4: Given the health check passes within 60 seconds, then the deploy job exits successfully and the rollback image is cleaned up
- [ ] AC 5: Given the health check fails (no 200 response within 60 seconds), then the previous app image is restored from the rollback tag, containers are restarted with the old image, and the GitHub Actions job exits with failure status
- [ ] AC 6: Given this is the first-ever deploy (no existing app image), when the rollback tag step runs, then it skips gracefully without error (`|| true`)
- [ ] AC 7: Given the `build-electron` job fails, then the `deploy-server` job does NOT run (deployment is skipped)

## Additional Context

### Dependencies

- **GitHub secrets must be configured before first use:** `EC2_SSH_KEY`, `EC2_HOST`, `EC2_USER`, `EC2_DEPLOY_PATH` — these are set in GitHub repo Settings → Secrets and variables → Actions
- **EC2 instance must have initial setup completed** (via `scripts/setup.sh` from story 6-4) — Docker, Docker Compose, repo cloned, `.env` configured
- **`appleboy/ssh-action@v1`** — third-party GitHub Action, MIT licensed, 10k+ stars, actively maintained

### Testing Strategy

- **YAML validation:** Verify `release.yml` syntax is valid after changes
- **Dry-run verification:** Review the complete workflow file to ensure job dependencies, conditionals, and secret references are correct
- **Manual end-to-end test:** After merging, push a test tag (`v0.0.1-test`) to trigger the full pipeline and verify deployment succeeds on EC2
- **Rollback test:** Deliberately break the health endpoint (e.g., stop the DB), push a tag, and verify auto-rollback kicks in

### Notes

- **Brief downtime expected:** Between `docker compose up -d` and health check passing, there's a few-second window where the server is restarting. Acceptable for ~20 users
- **Docker image naming:** The rollback tagging strategy uses `docker compose images app -q` to get the actual image ID, avoiding hardcoded image name assumptions
- **First deploy edge case:** If no app image exists yet (first-ever deploy), the rollback tag step is a no-op. If the health check then fails, there's nothing to roll back to — the job fails and requires manual intervention
- **Secret security:** `EC2_SSH_KEY` should be a dedicated deploy key with limited permissions, not a personal SSH key
