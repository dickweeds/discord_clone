# Story 6.2: Auto-Update System

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to check for updates and let me install them easily,
So that I always have the latest features and fixes without manual effort.

## Acceptance Criteria

1. **Given** a new version is published to GitHub Releases **When** the app checks for updates on startup **Then** a notification appears informing me that an update is available

2. **Given** I see an update notification **When** I choose to install the update **Then** the update downloads in the background **And** I can continue using the app during download **And** the update is applied on next app restart

3. **Given** electron-updater is configured **When** the app starts **Then** it checks GitHub Releases for the latest version **And** compares it against the current installed version

4. **Given** no update is available **When** the check completes **Then** no notification is shown — the app proceeds normally

## Tasks / Subtasks

- [ ] Task 1: Create updater module in main process (AC: 3)
  - [ ] 1.1 Create `client/src/main/updater.ts`: import `autoUpdater` from `electron-updater`. Export an `initAutoUpdater(mainWindow: BrowserWindow)` function. Set `autoUpdater.autoDownload = false` (user must confirm before download). Set `autoUpdater.autoInstallOnAppQuit = true` (if downloaded, install on quit)
  - [ ] 1.2 In `initAutoUpdater()`: register event listeners on `autoUpdater`:
    - `checking-for-update` → send IPC `'updater:checking'` to renderer
    - `update-available` (info: UpdateInfo) → send IPC `'updater:available'` with `{ version: info.version, releaseNotes: info.releaseNotes, releaseDate: info.releaseDate }` to renderer
    - `update-not-available` → send IPC `'updater:not-available'` to renderer
    - `download-progress` (progress: ProgressInfo) → send IPC `'updater:download-progress'` with `{ percent: progress.percent, bytesPerSecond: progress.bytesPerSecond, transferred: progress.transferred, total: progress.total }` to renderer
    - `update-downloaded` → send IPC `'updater:downloaded'` to renderer
    - `error` (err: Error) → send IPC `'updater:error'` with `{ message: err.message }` to renderer. Log the full error with `console.error` (main process — not Pino, this is Electron not Fastify)
  - [ ] 1.3 In `initAutoUpdater()`: register IPC handlers via `ipcMain.handle()`:
    - `'updater:check'` → calls `autoUpdater.checkForUpdates()`, returns void
    - `'updater:download'` → calls `autoUpdater.downloadUpdate()`, returns void
    - `'updater:install'` → calls `autoUpdater.quitAndInstall()`, returns void (triggers app restart)
  - [ ] 1.4 Call `autoUpdater.checkForUpdates()` once after a 5-second delay on app startup (give the app time to initialize before hitting the network). Use `setTimeout`, not `setInterval` — subsequent checks only happen on app restart
  - [ ] 1.5 Skip auto-update initialization entirely when `is.dev` is true (from `@electron-toolkit/utils`). electron-updater should never run in development mode — it would fail without signed builds

- [ ] Task 2: Expose updater IPC bridge in preload script (AC: 1, 2)
  - [ ] 2.1 In `client/src/preload/index.ts`: add an `updater` property to the `api` object with three methods:
    - `checkForUpdates: () => ipcRenderer.invoke('updater:check')`
    - `downloadUpdate: () => ipcRenderer.invoke('updater:download')`
    - `quitAndInstall: () => ipcRenderer.invoke('updater:install')`
  - [ ] 2.2 In `client/src/preload/index.ts`: add four event listener setup methods to the `updater` property:
    - `onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => { ... }` — listens on `'updater:available'`, returns cleanup function
    - `onUpdateDownloaded: (callback: () => void) => { ... }` — listens on `'updater:downloaded'`, returns cleanup function
    - `onDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => { ... }` — listens on `'updater:download-progress'`, returns cleanup function
    - `onUpdateError: (callback: (error: { message: string }) => void) => { ... }` — listens on `'updater:error'`, returns cleanup function
  - [ ] 2.3 Follow the exact pattern used by `onDeepLink`: create a handler function, call `ipcRenderer.on(channel, handler)`, return a cleanup function that calls `ipcRenderer.removeListener(channel, handler)`
  - [ ] 2.4 In `client/src/preload/index.d.ts`: extend the `Window.api` interface to include the `updater` property with full type declarations for all methods and callbacks

- [ ] Task 3: Create Zustand update store (AC: 1, 2, 3, 4)
  - [ ] 3.1 Create `client/src/renderer/src/stores/useUpdateStore.ts`:
    ```typescript
    interface UpdateState {
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
      version: string | null;
      releaseNotes: string | null;
      downloadProgress: number; // 0-100
      error: string | null;
      dismissed: boolean; // user dismissed the notification for this session
    }
    ```
  - [ ] 3.2 Add actions:
    - `checkForUpdates()` → sets status to 'checking', calls `window.api.updater.checkForUpdates()`
    - `downloadUpdate()` → sets status to 'downloading', calls `window.api.updater.downloadUpdate()`
    - `quitAndInstall()` → calls `window.api.updater.quitAndInstall()`
    - `dismiss()` → sets `dismissed = true` (hide notification until next app restart)
    - `reset()` → resets all state to initial values
  - [ ] 3.3 Add `initUpdateListeners()` function that registers all four IPC event listeners (`onUpdateAvailable`, `onUpdateDownloaded`, `onDownloadProgress`, `onUpdateError`) and returns a cleanup function that removes all listeners. Call this from the App component on mount

- [ ] Task 4: Create UpdateNotification UI component (AC: 1, 2)
  - [ ] 4.1 Create `client/src/renderer/src/components/UpdateNotification.tsx`: a banner component that appears at the top of the content area (similar pattern to ConnectionBanner). Uses Zustand `useUpdateStore` for state
  - [ ] 4.2 Render states:
    - `status === 'available' && !dismissed`: Show banner — "A new version (v{version}) is available." with two buttons: "Download" (calls `downloadUpdate()`) and "Later" (calls `dismiss()`)
    - `status === 'downloading'`: Show banner — "Downloading update... {downloadProgress}%" with a simple progress indicator (no complex progress bar needed — percentage text is sufficient)
    - `status === 'downloaded'`: Show banner — "Update ready! It will be installed when you restart." with one button: "Restart Now" (calls `quitAndInstall()`)
    - `status === 'error'`: Show banner — "Update check failed." with one button: "Retry" (calls `checkForUpdates()`). Auto-dismiss after 10 seconds
    - `status === 'idle' || status === 'checking' || dismissed`: Render nothing
  - [ ] 4.3 Styling: follow the project's earthy color palette.
    - Available/downloaded: `bg-secondary` background, `text-primary` text, standard border radius (8px)
    - Downloading: same styling, show percentage
    - Error: `text-error` (#f23f43) for the message
    - Buttons: use existing button patterns from the codebase. "Download" and "Restart Now" are primary actions, "Later" and "Retry" are secondary
  - [ ] 4.4 Position: place above the main content area but below the channel header. Do NOT use a modal — the update notification should be non-blocking (user can continue using the app)
  - [ ] 4.5 Animation: simple fade-in on appear. Respect `prefers-reduced-motion` — instant appear if reduced motion enabled

- [ ] Task 5: Integrate into app lifecycle (AC: 1, 2, 3, 4)
  - [ ] 5.1 In `client/src/main/index.ts`: import `initAutoUpdater` from `./updater`. Call `initAutoUpdater(mainWindow)` inside `app.whenReady().then(...)` AFTER `createWindow()` returns and mainWindow is set. Wrap in `if (!is.dev)` guard
  - [ ] 5.2 In `client/src/renderer/src/App.tsx` (or the appropriate root component): call `useUpdateStore.getState().initUpdateListeners()` in a `useEffect` on mount. Store the cleanup function and call it on unmount
  - [ ] 5.3 In the AppLayout component (wherever ConnectionBanner is rendered): add `<UpdateNotification />` alongside the ConnectionBanner. UpdateNotification renders above ConnectionBanner (updates are less urgent than connection issues)

- [ ] Task 6: Create dev-app-update.yml for development testing (AC: 3)
  - [ ] 6.1 Create `client/dev-app-update.yml`:
    ```yaml
    provider: github
    owner: AidenWoodside
    repo: discord_clone
    ```
    This file is already in .gitignore (electron-builder.yml excludes it). It allows testing the update flow against real GitHub Releases during development by setting `autoUpdater.forceDevUpdateConfig = true` (only enable manually for testing, do NOT leave enabled)

- [ ] Task 7: Write tests (AC: 1-4)
  - [ ] 7.1 Create `client/src/renderer/src/stores/useUpdateStore.test.ts`:
    - Test: initial state has status 'idle', null version, null error, dismissed false
    - Test: checkForUpdates sets status to 'checking'
    - Test: onUpdateAvailable sets status to 'available' with version info
    - Test: downloadUpdate sets status to 'downloading'
    - Test: onDownloadProgress updates downloadProgress percentage
    - Test: onUpdateDownloaded sets status to 'downloaded'
    - Test: onUpdateError sets status to 'error' with message
    - Test: dismiss sets dismissed to true
    - Test: reset clears all state
  - [ ] 7.2 Create `client/src/renderer/src/components/UpdateNotification.test.tsx`:
    - Test: renders nothing when status is 'idle'
    - Test: renders nothing when status is 'checking'
    - Test: renders nothing when dismissed is true
    - Test: renders available banner with version and Download/Later buttons when status is 'available'
    - Test: clicking "Download" calls downloadUpdate
    - Test: clicking "Later" calls dismiss
    - Test: renders downloading banner with progress when status is 'downloading'
    - Test: renders downloaded banner with "Restart Now" button when status is 'downloaded'
    - Test: clicking "Restart Now" calls quitAndInstall
    - Test: renders error banner with "Retry" button when status is 'error'
    - Test: clicking "Retry" calls checkForUpdates

- [ ] Task 8: Final verification (AC: 1-4)
  - [ ] 8.1 Run `npm test -w client` — all existing + new tests pass
  - [ ] 8.2 Run `npm run lint` — no lint errors
  - [ ] 8.3 Verify no existing tests broken by preload changes
  - [ ] 8.4 Run `npm run build -w client` — TypeScript compilation succeeds (important: main process types must compile)
  - [ ] 8.5 Verify the electron-builder config still works: `publish.provider` is `github`, which electron-updater reads at runtime to know where to check for updates

## Dev Notes

### Critical Architecture Patterns

**Electron Process Model — Main vs. Renderer:**
The auto-update system spans both Electron processes. electron-updater runs in the **main process** (Node.js context with full OS access). The React UI runs in the **renderer process** (sandboxed Chromium). Communication MUST go through the preload script's IPC bridge — the renderer cannot import electron-updater directly.

```
Main Process (Node.js)          Preload Bridge              Renderer (React/Zustand)
─────────────────────           ──────────────              ────────────────────────
updater.ts                      index.ts                    useUpdateStore.ts
  autoUpdater.checkForUpdates() ← ipcMain.handle('updater:check') ← window.api.updater.checkForUpdates()
  autoUpdater events ──────────→ ipcRenderer.on('updater:*') ──→ store state updates
  autoUpdater.downloadUpdate()  ← ipcMain.handle('updater:download') ← window.api.updater.downloadUpdate()
  autoUpdater.quitAndInstall()  ← ipcMain.handle('updater:install') ← window.api.updater.quitAndInstall()
```

**electron-updater Configuration — Zero Config Needed:**
electron-updater reads the `publish` section from `electron-builder.yml` at runtime. Since the config already has `provider: github`, `owner: AidenWoodside`, `repo: discord_clone`, electron-updater will automatically check GitHub Releases API for `latest.yml`/`latest-mac.yml`/`latest-linux.yml` files that electron-builder publishes during the release workflow. No additional server or URL configuration needed.

**autoDownload = false (User-Initiated Download):**
The acceptance criteria specify "I choose to install the update" — meaning the user must explicitly opt in. Set `autoUpdater.autoDownload = false` so the update is not silently downloaded. The flow is: check → notify user → user clicks "Download" → download → user restarts (or next quit installs automatically).

**macOS Code Signing Requirement:**
electron-updater requires macOS apps to be code-signed for auto-updates to work. If the app is NOT signed (likely in the current CI — no Apple Developer certificate configured), macOS auto-update will silently fail. This is acceptable for MVP — the primary users are on Windows/Linux. Document this limitation.

**IPC Channel Naming Convention:**
Follow the existing `namespace:action` pattern used throughout the project. All updater IPC channels use `updater:` prefix: `updater:check`, `updater:download`, `updater:install`, `updater:available`, `updater:downloaded`, `updater:download-progress`, `updater:error`, `updater:checking`, `updater:not-available`.

### Existing Code to Modify

```
client/src/main/index.ts                    # Add initAutoUpdater() call after createWindow()
client/src/preload/index.ts                 # Add updater IPC bridge to api object
client/src/preload/index.d.ts               # Add updater types to Window.api interface
client/src/renderer/src/App.tsx             # Initialize update listeners on mount
client/src/renderer/src/features/layout/AppLayout.tsx  # Add UpdateNotification component
```

### New Files to Create

```
client/src/main/updater.ts                                      # electron-updater initialization + IPC handlers
client/src/renderer/src/stores/useUpdateStore.ts                # Zustand store for update state
client/src/renderer/src/stores/useUpdateStore.test.ts           # Store tests
client/src/renderer/src/components/UpdateNotification.tsx       # Update banner UI
client/src/renderer/src/components/UpdateNotification.test.tsx  # Component tests
client/dev-app-update.yml                                       # Dev testing config (gitignored)
```

### Existing Patterns to Follow

**IPC Pattern (from safeStorage.ts + preload/index.ts):**
- Main process: `ipcMain.handle('channel', async (_event, ...args) => { ... })` in a dedicated module file
- Preload: `ipcRenderer.invoke('channel', ...args)` wrapped in a typed function on the `api` object
- Preload listeners: `ipcRenderer.on('channel', handler)` with cleanup function returned (see `onDeepLink` pattern)
- Type declarations: extend `Window.api` in `preload/index.d.ts`

**Zustand Store Pattern:**
```typescript
interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';
  version: string | null;
  error: string | null;
  // ... other fields
}

export const useUpdateStore = create<UpdateState & UpdateActions>()((set) => ({
  status: 'idle',
  version: null,
  error: null,
  // ... actions that call set() and window.api.updater.*
}));
```

**Component File Organization:**
- Co-located tests: `UpdateNotification.test.tsx` alongside `UpdateNotification.tsx`
- Shared components in `components/` directory (UpdateNotification is shared, not feature-specific)

**ESM vs CJS:**
- Main process (`client/src/main/`): uses ESM imports. electron-vite handles compilation
- Renderer (`client/src/renderer/src/`): uses ESM imports. Vite handles bundling
- Preload (`client/src/preload/`): uses ESM imports. electron-vite handles compilation

### Previous Story Intelligence

**From Story 6-1 (Connection Resilience — immediately prior):**
- ConnectionBanner is in `client/src/renderer/src/features/layout/ConnectionBanner.tsx` — place UpdateNotification nearby, rendered in AppLayout
- The pattern of IPC event listeners returning cleanup functions is established in `onDeepLink`
- Feature-level error boundaries were added in 6-1 — UpdateNotification should be inside these
- `is.dev` from `@electron-toolkit/utils` is used for environment detection in the main process
- `usePresenceStore` has `connectionState` — UpdateNotification should check this and NOT show update banners when disconnected (don't confuse users with two banners about different issues)

**From Story 6-5 (CI/CD — in progress):**
- Release workflow already builds for all platforms with `--publish always`
- electron-builder publishes `latest.yml`, `latest-mac.yml`, `latest-linux.yml` to GitHub Releases
- These metadata files are exactly what electron-updater reads to detect updates
- GH_TOKEN is configured as a secret in the repository

**Git Intelligence (last 5 commits):**
- All recent commits are CI/CD and electron-builder fixes
- `electron-builder.yml` was recently modified to remove unnecessary targets
- `publish` config with `provider: github` is confirmed working
- The release workflow is functional and publishes to GitHub Releases

### Anti-Patterns to Avoid

- **NEVER** import `electron-updater` in the renderer process — it requires Node.js APIs unavailable in sandboxed renderer
- **NEVER** enable `autoDownload = true` — acceptance criteria require user-initiated download
- **NEVER** call `autoUpdater.checkForUpdates()` in development mode — it will throw errors without signed/packaged builds
- **NEVER** use `autoUpdater.checkForUpdatesAndNotify()` — we need custom UI, not system notifications
- **NEVER** show update notification when the app is disconnected — ConnectionBanner takes priority
- **NEVER** block the app startup waiting for update check — the check runs async after a delay
- **NEVER** use `console.log` on server side (but `console.error` in Electron main process IS acceptable — Pino is for Fastify, not Electron)
- **NEVER** create a modal dialog for updates — use a non-blocking banner following the ConnectionBanner pattern

### Deferred / Not In Scope

- **macOS code signing** — requires Apple Developer certificate ($99/year). Auto-updates will work on Windows/Linux without signing. macOS users will need to manually download new versions until signing is configured
- **Differential/delta updates** — electron-updater supports this but it adds complexity. Full downloads are fine for the ~100MB app size with a small user base
- **Update channels (beta/stable)** — single release channel is sufficient for a private app
- **Forced/mandatory updates** — all updates are optional. No version compatibility enforcement
- **In-app changelog display** — the banner shows version number only. Full release notes can be viewed on GitHub Releases
- **Download cancellation** — once download starts, it completes. User can dismiss the notification but download continues in background
- **Rollback mechanism** — if an update causes issues, users must manually install the previous version

### Project Structure Notes

- `updater.ts` goes in `client/src/main/` alongside `index.ts` and `safeStorage.ts` — this is the main process module directory
- `useUpdateStore.ts` goes in `client/src/renderer/src/stores/` alongside all other Zustand stores
- `UpdateNotification.tsx` goes in `client/src/renderer/src/components/` — it's a shared UI component, not feature-specific
- `dev-app-update.yml` goes in `client/` root — electron-updater looks for it there in development mode
- No server-side changes needed — auto-update is purely client-side, using GitHub Releases as the update server
- No shared package changes needed — no new types need to cross the client/server boundary
- No database changes needed

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR41] — "The app automatically checks for and notifies users of available updates"
- [Source: _bmad-output/planning-artifacts/prd.md#FR42] — "Users can install updates from within the app"
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure-Deployment] — "Electron distribution: GitHub Releases + electron-updater. Auto-update checks against GitHub Releases API."
- [Source: _bmad-output/planning-artifacts/architecture.md#File-Structure] — "services/updateService.ts — electron-updater integration"
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation-Sequence] — "10. GitHub Actions CI/CD + auto-update"
- [Source: _bmad-output/planning-artifacts/architecture.md#FR38-FR45] — "Client services: services/updateService.ts"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Feedback-Patterns] — "Success: Inline, temporary, non-blocking. Green text or subtle green flash"
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Decision-Patterns] — "Confirmations only for destructive actions"
- [Source: _bmad-output/project-context.md#Technology-Stack] — "electron-updater — Auto-update mechanism"
- [Source: _bmad-output/project-context.md#CI-CD] — "electron-updater checks GitHub Releases API for auto-updates"
- [Source: client/electron-builder.yml] — publish.provider: github, owner: AidenWoodside, repo: discord_clone
- [Source: client/package.json] — electron-updater ^6.8.3 already in dependencies
- [Source: client/src/main/index.ts] — Main process structure, IPC setup pattern, is.dev guard
- [Source: client/src/main/safeStorage.ts] — ipcMain.handle() pattern for IPC handlers
- [Source: client/src/preload/index.ts] — contextBridge API pattern, onDeepLink listener pattern
- [Source: client/src/preload/index.d.ts] — Window.api type declaration pattern
- [Source: .github/workflows/release.yml] — electron-builder --publish always, GH_TOKEN secret
- [Source: _bmad-output/implementation-artifacts/6-1-connection-resilience-and-error-handling.md] — ConnectionBanner pattern, AppLayout integration, FeatureErrorBoundary wrapping
- [Source: https://www.electron.build/auto-update.html] — electron-updater v6 API: autoUpdater events, methods, macOS signing requirement

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

Ultimate context engine analysis completed — comprehensive developer guide created

### File List
