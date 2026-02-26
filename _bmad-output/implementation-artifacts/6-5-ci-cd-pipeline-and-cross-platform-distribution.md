# Story 6.5: CI/CD Pipeline & Cross-Platform Distribution

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want automated CI/CD that tests, builds, and releases the Electron app for all platforms,
So that every release is reliable and cross-platform builds are automated.

## Acceptance Criteria

1. **Given** a pull request is opened **When** the CI pipeline runs **Then** tests are executed via Vitest **And** linting passes via ESLint **And** TypeScript compilation succeeds

2. **Given** a git tag is pushed (e.g., `v0.1.0`) **When** the release pipeline runs **Then** the Electron app is built for Windows (.exe via NSIS), macOS (.dmg for x64+arm64), and Linux (.AppImage for x64) **And** the builds are published to GitHub Releases **And** electron-updater can discover and deliver the new version

3. **Given** the server Dockerfile exists (created in story 6-4) **When** the CI builds the server container **Then** the image is built successfully and can be deployed via Docker Compose

4. **Given** the release is published to GitHub Releases **When** users' apps check for updates **Then** they detect the new version via the GitHub Releases API

## Tasks / Subtasks

- [ ] Task 1: Create CI workflow for pull requests (AC: 1)
  - [ ] 1.1 Create `.github/workflows/ci.yml` with trigger: `on: pull_request` targeting `main` branch
  - [ ] 1.2 Job `test-and-lint` on `ubuntu-latest`: checkout code, setup Node.js 20.x, `npm ci` (installs all workspaces), `npm run build -w shared` (shared must build first — server and client depend on it)
  - [ ] 1.3 Run `npm run lint` (root-level ESLint across all packages — includes `no-console` rule for server)
  - [ ] 1.4 Run `npm test -w shared && npm test -w server && npm test -w client` (Vitest in all 3 workspaces). Note: server tests require `better-sqlite3` native compilation which works on ubuntu-latest with default build tools
  - [ ] 1.5 Run `npm run build -w server` (TypeScript compilation via `tsc`) to verify server builds cleanly
  - [ ] 1.6 Run `npm run build -w client` (electron-vite build) to verify client compiles. Note: this does NOT package the Electron app — just compiles TS+React to `client/out/`
  - [ ] 1.7 Cache `node_modules` using `actions/cache` with key based on `package-lock.json` hash for faster subsequent runs

- [ ] Task 2: Create release workflow for cross-platform Electron builds (AC: 2, 4)
  - [ ] 2.1 Create `.github/workflows/release.yml` with trigger: `on: push: tags: ['v*']` (any tag starting with `v`, e.g., `v0.1.0`)
  - [ ] 2.2 Build strategy matrix with 3 runners: `ubuntu-latest` (Linux), `windows-latest` (Windows), `macos-latest` (macOS). Each runner builds for its native platform
  - [ ] 2.3 Each job: checkout code, setup Node.js 20.x, `npm ci`, `npm run build -w shared`
  - [ ] 2.4 Run `cd client && npx electron-builder --publish always` on each platform. The `--publish always` flag uploads build artifacts directly to the GitHub Release associated with the tag. Requires `GH_TOKEN` environment variable (set from `secrets.GITHUB_TOKEN`)
  - [ ] 2.5 electron-builder reads `client/electron-builder.yml` for platform-specific targets: NSIS (.exe) on Windows, DMG (.dmg) on macOS (x64+arm64), AppImage on Linux
  - [ ] 2.6 The `--publish always` flag uses electron-builder's built-in GitHub Releases publisher. It creates the release if it doesn't exist and uploads the platform-specific installers as release assets
  - [ ] 2.7 For macOS arm64+x64 builds: `macos-latest` runners are arm64 (M-series). electron-builder can cross-compile for both architectures in a single run via the `arch: [x64, arm64]` config already in `electron-builder.yml`

- [ ] Task 3: Configure electron-builder for GitHub Releases publishing (AC: 2, 4)
  - [ ] 3.1 Add `publish` configuration to `client/electron-builder.yml`:
    ```yaml
    publish:
      provider: github
      owner: OWNER
      repo: discord-clone
    ```
    The `owner` must match the GitHub repository owner. electron-builder uses `GH_TOKEN` to authenticate
  - [ ] 3.2 Add `protocols` configuration to `client/electron-builder.yml` (if not already present from story 6-4):
    ```yaml
    protocols:
      - name: "Discord Clone Invite"
        schemes:
          - discord-clone
    ```
    This registers the `discord-clone://` custom protocol handler at OS level during installation
  - [ ] 3.3 Verify electron-builder.yml `productName` is `Discord Clone` and `appId` is `com.discord-clone.app` — these are used in the published release asset names and auto-update identification

- [ ] Task 4: Add electron-updater dependency and configure auto-update support (AC: 4)
  - [ ] 4.1 Run `npm install electron-updater -w client` to add electron-updater as a production dependency. electron-updater is the companion library to electron-builder that checks GitHub Releases for updates
  - [ ] 4.2 electron-updater reads the `publish` config from electron-builder.yml to know where to check for updates. With `provider: github`, it calls the GitHub Releases API: `https://api.github.com/repos/OWNER/discord-clone/releases/latest` and compares the version in the release tag against `package.json` version
  - [ ] 4.3 Note: The actual auto-update UI integration (notification, download progress, restart prompt) is story 6-2 scope. This task only ensures electron-updater is installed and the publish config is correct so that the release pipeline produces update-compatible artifacts (`.yml` metadata files that electron-updater needs)

- [ ] Task 5: Add server Docker build verification to release workflow (AC: 3)
  - [ ] 5.1 Add a `build-server-image` job to `release.yml` that runs on `ubuntu-latest`
  - [ ] 5.2 Check if `server/Dockerfile` exists (created by story 6-4). If story 6-4 is not yet implemented, this job should be skipped gracefully — use `if: hashFiles('server/Dockerfile') != ''` condition
  - [ ] 5.3 If Dockerfile exists: run `docker build -t discord-clone-server:${{ github.ref_name }} -f server/Dockerfile .` to verify the image builds. Do NOT push to any registry — the image is built locally on EC2 via `docker compose build`
  - [ ] 5.4 This job runs independently from the Electron build jobs (no dependency between them)

- [ ] Task 6: Sync package versions for release consistency (AC: 2)
  - [ ] 6.1 Verify that `client/package.json` version field matches the git tag pattern. electron-builder uses `package.json` version for the installer filename and auto-update version comparison. Current version: `0.0.1`
  - [ ] 6.2 Document the release process in a comment block at the top of `release.yml`:
    ```
    # Release Process:
    # 1. Update version in client/package.json (and optionally root + server)
    # 2. Commit: "Release vX.Y.Z"
    # 3. Tag: git tag vX.Y.Z
    # 4. Push: git push && git push --tags
    # 5. GitHub Actions builds all platforms and publishes to GitHub Releases
    # 6. electron-updater in running apps detects the new version
    ```

- [ ] Task 7: Verify and test the complete pipeline (AC: 1-4)
  - [ ] 7.1 Run `npm run lint` locally — zero errors
  - [ ] 7.2 Run `npm test` locally (all workspaces) — all tests pass
  - [ ] 7.3 Run `npm run build -w shared && npm run build -w server && npm run build -w client` — all compile successfully
  - [ ] 7.4 Verify `.github/workflows/ci.yml` syntax: use `act` locally or validate YAML structure manually
  - [ ] 7.5 Verify `.github/workflows/release.yml` syntax
  - [ ] 7.6 Verify `client/electron-builder.yml` has `publish` config and all platform targets are correct
  - [ ] 7.7 Verify `electron-updater` is in `client/package.json` dependencies (not devDependencies — it must ship with the app)

## Dev Notes

### Critical Architecture Patterns

**GitHub Actions CI Workflow (`ci.yml`):**
```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  test-and-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build -w shared
      - run: npm run lint
      - run: npm test -w shared && npm test -w server && npm test -w client
      - run: npm run build -w server
      - run: npm run build -w client
```

**GitHub Actions Release Workflow (`release.yml`):**
```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build-electron:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    permissions:
      contents: write  # Required to create/upload GitHub Releases
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build -w shared
      - name: Build and publish Electron app
        run: cd client && npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  build-server-image:
    runs-on: ubuntu-latest
    if: hashFiles('server/Dockerfile') != ''
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t discord-clone-server:${{ github.ref_name }} -f server/Dockerfile .
```

**electron-builder publish config (`client/electron-builder.yml` additions):**
```yaml
publish:
  provider: github
  owner: OWNER
  repo: discord-clone
```

When `--publish always` is used, electron-builder:
1. Builds the platform-specific installer (e.g., `Discord-Clone-Setup-0.1.0.exe`)
2. Generates a `latest.yml` (Windows), `latest-mac.yml` (macOS), or `latest-linux.yml` (Linux) metadata file
3. Creates/finds the GitHub Release matching the tag
4. Uploads both the installer and the `.yml` metadata file as release assets

electron-updater uses the `.yml` files to determine if an update is available. The `.yml` contains the version number, file name, file size, and SHA512 hash.

**monorepo build order (CRITICAL):**
```
shared → server → client
```
`shared` MUST build first because both `server` and `client` import types from it. In CI, explicitly run `npm run build -w shared` before any test or build step. The workspace dependency `"discord-clone-shared": "*"` in both client and server package.json references the local `shared/` workspace.

**native dependencies on CI:**
- `better-sqlite3` requires native compilation (uses `node-gyp`). On `ubuntu-latest`, the default build tools (python3, make, gcc) are pre-installed — no additional setup needed
- `mediasoup` requires native C++ compilation for its worker binary. On Ubuntu CI, build-essential is pre-installed. On macOS and Windows runners, Xcode/MSVC tools are pre-installed
- `npm ci` handles native compilation automatically during install

**macOS code signing (NOT in scope):**
macOS .dmg builds will show "unidentified developer" warning without code signing. Code signing requires an Apple Developer certificate ($99/year). For this personal project, users will need to right-click → Open to bypass Gatekeeper. If code signing is desired later, add `CSC_LINK` and `CSC_KEY_PASSWORD` secrets to GitHub and electron-builder handles the rest.

**Windows code signing (NOT in scope):**
Similar to macOS — Windows SmartScreen will warn about unsigned executables. Users click "More info" → "Run anyway". Code signing requires an EV certificate from a CA.

### Existing Code to Modify

```
client/electron-builder.yml          # Add publish config, protocols config
client/package.json                  # Add electron-updater dependency
```

### New Files to Create

```
.github/workflows/ci.yml            # PR test + lint + build pipeline
.github/workflows/release.yml       # Tag-triggered cross-platform Electron build + GitHub Release
```

### Existing Patterns to Follow

**npm workspace commands:** All scripts use workspace flags: `npm run build -w shared`, `npm test -w server`, etc. Root `package.json` has `"workspaces": ["client", "server", "shared"]`.

**TypeScript build:** Server uses `tsc` (output to `server/dist/`). Client uses `electron-vite build` (output to `client/out/`). Shared uses `tsc` (output to `shared/dist/`).

**electron-builder targets:** Already configured in `client/electron-builder.yml` — NSIS for Windows, DMG for macOS (x64+arm64), AppImage for Linux. No changes to build targets needed.

**Test framework:** Vitest in all workspaces. Server: 307+ tests (27 files). Client: 436+ tests (41 files). Run via `vitest run` in each workspace.

### Previous Story Intelligence

**From Story 6-3 (Privacy Enforcement — done):**
- ESLint `no-console: 'error'` rule added for `server/src/**/*.ts` — the CI lint step will enforce this
- Pino redaction config in `server/src/config/logRedaction.ts` — all logging goes through Pino
- CSP headers enforced in `client/src/main/index.ts` — no external requests from the app
- CORS restricted to `CLIENT_ORIGIN` — tests verify this
- 743+ total tests across all workspaces (307 server + 436 client)

**From Story 6-4 (Production Deployment — ready-for-dev, may not be implemented yet):**
- `server/Dockerfile` will be created with multi-stage build (builder + production stages)
- `docker-compose.yml` at project root for production orchestration
- The CI release workflow's Docker build step conditionally runs only if `server/Dockerfile` exists
- `client/electron-builder.yml` may already have `protocols` config added by 6-4 (check before adding duplicate)

**From recent git history:**
- Story 6-3 was the most recent completed story (3 commits: implement, 5 code review fixes, 3 more fixes)
- The project is on the `main` branch with clean git status
- Commit messages follow the pattern: "Implement story X-Y: description", "Fix N code review issues for story X-Y description"

### Anti-Patterns to Avoid

- **NEVER** hardcode the GitHub repository owner in workflow files — use `${{ github.repository_owner }}` or configure once in electron-builder.yml
- **NEVER** store secrets in workflow files or electron-builder.yml — use GitHub Actions secrets (`secrets.GITHUB_TOKEN` is automatic)
- **NEVER** use `--publish always` in CI without `GH_TOKEN` — the build will fail trying to authenticate with GitHub
- **NEVER** push Docker images to a public registry — the server image stays on the EC2 instance, built locally
- **NEVER** run `npm install` instead of `npm ci` in CI — `npm ci` is faster and guarantees reproducible installs from `package-lock.json`
- **NEVER** skip the `npm run build -w shared` step before tests/builds — server and client depend on shared types
- **NEVER** put `electron-updater` in devDependencies — it must be in production dependencies to ship with the packaged app
- **NEVER** add telemetry, analytics, or crash reporting to the CI pipeline — zero telemetry applies to infrastructure too

### Deferred / Not In Scope

- **Auto-update UI** — That's Story 6-2. This story ensures electron-updater is installed and the publish config is correct. The actual UI notification ("Update available") is 6-2's responsibility
- **macOS/Windows code signing** — Not required for a personal project with ~20 users. Can be added later by setting up signing certificates as GitHub secrets
- **Docker image registry push** — The server Docker image is built on the EC2 instance directly via `docker compose build`. No registry needed
- **Automated deployment to EC2** — Deployment is manual (`ssh` → `git pull` → `docker compose up -d`). A deployment pipeline is a post-MVP enhancement
- **Version bumping automation** — Version is bumped manually in `client/package.json` before tagging. Automated version bumping (e.g., via `standard-version`) is a post-MVP enhancement
- **Branch protection rules** — Configuring GitHub branch protection (require CI pass before merge) is a repository settings task, not a code change

### Project Structure Notes

- `.github/workflows/` directory needs to be created — does not exist yet
- `ci.yml` and `release.yml` are the only two workflow files needed
- No changes to the monorepo workspace structure
- `electron-updater` adds to `client/node_modules/` — bundled into the Electron app automatically by electron-builder
- The `publish` config in `electron-builder.yml` does NOT affect local development builds — it only activates when `--publish` flag is passed

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-6-desktop-app-polish-production-deployment.md#Story-6.5] — Full acceptance criteria for CI/CD pipeline
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure-Deployment] — CI/CD: GitHub Actions, Electron distribution: GitHub Releases + electron-updater
- [Source: _bmad-output/planning-artifacts/architecture.md#Project-Directory-Structure] — .github/workflows/ci.yml and release.yml locations
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-Impact-Analysis] — Implementation step 10: GitHub Actions CI/CD + auto-update
- [Source: _bmad-output/planning-artifacts/prd.md#Desktop-App-Specific-Requirements] — Update delivery via GitHub Releases, cross-platform builds
- [Source: _bmad-output/planning-artifacts/prd.md#FR41-FR42] — Auto-update check and install (electron-updater foundation)
- [Source: _bmad-output/project-context.md#CI-CD] — ci.yml test+lint on PR, release.yml tag→build→publish
- [Source: _bmad-output/project-context.md#Technology-Stack] — electron-builder for packaging, electron-updater for auto-updates
- [Source: client/electron-builder.yml] — Current build targets: NSIS (Windows), DMG (macOS x64+arm64), AppImage (Linux). No publish config yet
- [Source: client/package.json] — electron-builder v26, electron v40, no electron-updater dependency yet
- [Source: package.json] — Root workspace config, build/test/lint scripts
- [Source: _bmad-output/implementation-artifacts/6-3-privacy-enforcement-and-zero-telemetry.md] — Privacy tests (743 total), ESLint no-console rule, Pino redaction
- [Source: _bmad-output/implementation-artifacts/6-4-production-deployment-infrastructure.md] — Dockerfile, docker-compose.yml, protocols config (may not be implemented yet)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
