# Feasibility Analysis: Remote Access & Android Client for Sorcerer

**Date:** 2026-02-11

---

## Executive Summary

Sorcerer is an Electron desktop app that orchestrates Claude Code agent sessions via
local PTY processes, git worktrees, and an in-process SQLite database. Adding remote
access requires inserting a network transport layer between the existing service layer
and the UI. An Android client is feasible as a thin remote viewer once that transport
exists, but cannot run Sorcerer's backend natively (no node-pty, no git worktrees on
Android).

**The desktop app remains the primary target.** Remote access is an opt-in feature
(disabled by default) that can be toggled on/off from Settings. The local Electron
experience is completely unchanged whether remote is enabled or not.

The two efforts are sequential: **remote capability is a prerequisite for Android**.

---

## Design Principle: Modular, Opt-In, Desktop-First

Remote access is a **feature of the desktop app**, not a pivot away from it. The core
design principles:

1. **Desktop-first, always.** The Electron app is the primary interface. It works
   identically whether remote access is on or off. No degradation, no new dependencies
   on the critical path.

2. **Opt-in toggle.** Remote access is off by default. A `Remote Access: Enabled/Disabled`
   switch in the Settings dialog controls whether the API server starts. Disabling it
   shuts down the server immediately — no restart required.

3. **Additive, not invasive.** The API server is a second consumer of the existing
   services, running alongside (not replacing) the Electron IPC path. If the server
   has a bug, the desktop app is unaffected.

4. **Zero-config for local use.** Users who never enable remote access see no difference
   in behavior, performance, or UI. The server code is loaded lazily only when enabled.

### Architecture: Local vs. Remote Paths

```
Electron Main Process
  │
  └── Services (PTYService, DatabaseService, WorktreeService, FileWatcherService)
        │
        ├── IPC Handlers ←→ Electron Renderer    [ALWAYS active, unchanged]
        │                    (local React UI)
        │
        └── API Server   ←→ Browser Clients       [OPT-IN, toggled via Settings]
             (HTTP + WS)     (remote React UI)
```

Both paths call the **exact same service methods**. The IPC path is never modified,
never rerouted, and never depends on the API server. They are fully independent
consumers of a shared service layer.

### What "Remote" Means

"Remote" means: **a browser tab on another device connecting to the Sorcerer host over
the network.** It is not a separate app, a cloud deployment, or a rewrite. Concretely:

- You're at your desktop. Sorcerer is running as the normal Electron app.
- You toggle on Remote Access in Settings. A server starts on port 7437.
- You open `http://192.168.1.x:7437` in a browser on your phone, tablet, or laptop.
- The browser loads the same React UI and connects via WebSocket for terminal I/O.
- Your desktop Electron window continues working simultaneously — both are live.
- You toggle Remote Access off. The server stops. The browser client disconnects.
  The desktop app is unaffected.

### Settings UI for Remote Access

The Settings dialog gains a "Remote Access" section:

| Setting | Default | Description |
|---|---|---|
| **Enabled** | Off | Master toggle — starts/stops the API server |
| **Port** | 7437 | TCP port for HTTP + WebSocket server |
| **Bind Address** | `127.0.0.1` | `127.0.0.1` = local only; `0.0.0.0` = LAN accessible |
| **Auth Token** | (auto-generated) | Bearer token for API/WS authentication; regenerate button |
| **Status** | (read-only) | Shows "Running on http://192.168.1.x:7437" or "Stopped" |

When `Enabled` is toggled on, the main process:
1. Starts the Express + WebSocket server on the configured port/address.
2. Serves the renderer bundle as static files (same React app).
3. Authenticates incoming connections via bearer token.
4. Displays the access URL in the Settings status line.

When toggled off:
1. Closes all WebSocket connections gracefully.
2. Stops the HTTP server.
3. No lingering processes or open ports.

---

## Part 1: Remote Capability (Implementation Details)

### What Changes and What Doesn't

**Unchanged (local Electron path):**
- `src/preload/index.ts` — Context bridge stays as-is
- `src/main/ipc/handlers.ts` — IPC handlers stay registered, always active
- `src/main/services/*` — All four services unchanged
- `src/renderer/src/components/*` — React components unchanged
- `src/renderer/src/stores/*` — Zustand stores unchanged

**New (additive):**
- `src/main/server/api-server.ts` — HTTP + WebSocket server (lazy-loaded)
- `src/main/server/routes.ts` — REST routes calling shared handler functions
- `src/main/server/ws-handler.ts` — WebSocket terminal multiplexing + events
- `src/main/server/auth.ts` — Token validation middleware
- `src/main/server/scrollback.ts` — Ring buffer for terminal reconnection
- `src/main/ipc/shared-handlers.ts` — Handler logic extracted from `handlers.ts`
- `src/renderer/src/api/remote-client.ts` — `fetch`/`WebSocket` API adapter
- `src/renderer/src/api/client.ts` — Environment detection + client selection

**Refactored (minimal):**
- `src/main/ipc/handlers.ts` — Handler bodies extracted to `shared-handlers.ts`;
  IPC registrations remain, now calling the shared functions (same behavior)

### Coupling Points Between Current IPC and New HTTP/WS

| Layer | Current Transport | What Needs to Change |
|---|---|---|
| **CRUD operations** (project/session/agent) | `ipcRenderer.invoke` → `ipcMain.handle` | Wrap in HTTP/REST or WebSocket RPC |
| **Terminal data** (stdin/stdout stream) | `ipcRenderer.send` / `ipcRenderer.on` per session | WebSocket channel per session |
| **File watcher events** (teams/tasks) | `ipcRenderer.on` push events | WebSocket server-push or SSE |
| **Native dialogs** (`dialog.showOpenDialog`) | Electron-only API | Replace with path-input text field for remote clients |
| **Window controls** (minimize/maximize/close) | Electron `BrowserWindow` | N/A for remote — only applies to local Electron shell |

### Detailed Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Sorcerer Host (Electron Desktop App)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Service Layer (always running)                        │    │
│  │  PTYService · DatabaseService · WorktreeService       │    │
│  │  FileWatcherService                                   │    │
│  └────────────────┬──────────────────┬───────────────────┘    │
│                   │                  │                        │
│         ┌─────────▼──────┐  ┌────────▼──────────────┐        │
│         │ IPC Handlers   │  │ API Server (opt-in)   │        │
│         │ (always active)│  │ HTTP + WebSocket      │        │
│         │                │  │ Lazy-loaded on toggle  │        │
│         └────────┬───────┘  └────────┬──────────────┘        │
│                  │                   │                        │
│  ┌───────────────▼───┐               │                       │
│  │ Electron Renderer  │               │                       │
│  │ (local React UI)   │               │                       │
│  │ Connected via IPC   │               │                       │
│  └────────────────────┘               │                       │
└───────────────────────────────────────┼───────────────────────┘
                                        │ network (LAN/localhost)
                              ┌─────────▼─────────────┐
                              │ Browser Client(s)      │
                              │ Same React UI          │
                              │ Connected via HTTP/WS  │
                              │ (phone, tablet, laptop)│
                              └────────────────────────┘
```

Key: both clients consume the same service layer. The Electron renderer uses IPC
(always). The browser client uses HTTP/WS (only when remote access is enabled).
They are fully independent — enabling or disabling one has no effect on the other.

### Implementation Breakdown

#### 1. Extract Shared Handler Logic + Build API Server

**Files affected:** `src/main/ipc/handlers.ts` (671 lines) — refactored, not replaced

The existing `registerIPC()` function is cleanly organized as request-response
handlers over IPC. The refactor:

- Extract handler **bodies** into `src/main/ipc/shared-handlers.ts` as plain
  async functions (no IPC dependency). Example:
  ```ts
  // shared-handlers.ts
  export async function listProjects(db: DatabaseService) {
    return db.listProjects()
  }
  ```
- `handlers.ts` keeps all `ipcMain.handle(...)` registrations but delegates
  to the shared functions. **Behavior is identical** — this is a mechanical
  extract-method refactoring.
- Create `src/main/server/api-server.ts` — an Express or Fastify HTTP server
  that is **lazy-loaded** only when remote access is toggled on. It calls the
  same shared functions.
- Each `ipcMain.handle('project:list', ...)` has a corresponding
  `GET /api/projects` route. ~30 operations map 1:1.

**The IPC path never changes behavior.** Even if the API server has a bug or
crashes, the desktop app continues working via IPC as it always has.

**Lifecycle management in `src/main/index.ts`:**
```ts
let apiServer: ApiServer | null = null

// Called when user toggles Remote Access in Settings
ipcMain.handle('remote:enable', async (_, config) => {
  if (apiServer) apiServer.stop()
  apiServer = new ApiServer(services, config)
  await apiServer.start()
})

ipcMain.handle('remote:disable', async () => {
  if (apiServer) { apiServer.stop(); apiServer = null }
})
```

**Estimated scope:** ~400-500 lines of new server code, ~200 lines refactoring
existing handlers into shared functions.

#### 2. WebSocket Transport for Terminal I/O

**File affected:** `src/main/services/pty-service.ts` (114 lines)

Terminal I/O is the latency-sensitive path. Currently:
- Input: `ipcRenderer.send('terminal:write', sessionId, data)` → PTY stdin
- Output: PTY stdout → `mainWindow.webContents.send('terminal:data:${id}', data)`

For remote:
- Create a WebSocket server (e.g. `ws` package) alongside the HTTP server.
- Each terminal session gets a WebSocket "channel" (multiplexed on one connection
  via session-ID-prefixed messages, or one WS connection per active terminal).
- PTYService emits data to both the local Electron window AND any connected
  WebSocket clients.

**Key consideration:** Terminal data is high-frequency, small-payload. WebSocket
is the correct transport — HTTP polling would be too laggy. The `ws` package adds
minimal overhead.

**Estimated scope:** ~150-200 lines for the WebSocket server + multiplexing logic.

#### 3. Server-Push for File Watcher Events

**File affected:** `src/main/services/file-watcher-service.ts`

Currently pushes events via `mainWindow.webContents.send()`. Add a broadcast to
connected WebSocket clients for `teams-update`, `tasks-update`, and
`session-linked` events.

**Estimated scope:** ~50 lines — just add a broadcast call alongside the existing
`webContents.send`.

#### 4. Authentication (Minimal, Single-User)

Since this is a personal tool ("just me"), a lightweight approach:

- Generate a random bearer token on first launch, store in SQLite settings.
- Display it in the Settings dialog for copy/paste.
- All HTTP/WS requests must include the token.
- Optional: skip auth for `localhost` connections.

**Estimated scope:** ~100 lines (middleware + token management).

#### 5. Renderer Abstraction Layer (Transport Swap)

**Files affected:** `src/preload/index.ts` (unchanged), renderer stores (minimal)

The renderer currently calls `window.sorcerer.*` (the Electron context bridge).
**This does not change.** For browser clients, we add an alternative implementation
of the same API interface:

- Create `src/renderer/src/api/remote-client.ts` — implements `SorcererAPI`
  using `fetch()` for CRUD and `WebSocket` for terminal/events.
- Create `src/renderer/src/api/client.ts` — environment detection:
  ```ts
  // If running inside Electron, window.sorcerer exists via context bridge.
  // If running in a browser, it doesn't — use the network client instead.
  export const api: SorcererAPI = window.sorcerer
    ?? createRemoteClient(location.origin)
  ```
- All Zustand stores and React components import `api` from this file instead
  of referencing `window.sorcerer` directly. This is a find-and-replace
  change — the call signatures are identical.

**The preload script is untouched.** The Electron context bridge continues to
define `window.sorcerer` exactly as it does today. The only difference is that
stores import an abstraction that resolves to `window.sorcerer` in Electron and
to the fetch/WS client in browsers.

**Estimated scope:** ~300 lines for the remote client implementation, ~50 lines
for the import changes across stores.

#### 6. Handle Electron-Only APIs

| API | Current Usage | Remote Replacement |
|---|---|---|
| `dialog.showOpenDialog` | Project "Add" | Text input field with path string |
| `shell.openExternal` | "Open Remote" link | `window.open()` |
| `BrowserWindow` controls | Minimize/maximize/close | Hide controls on remote |
| `app.getPath` | Database location | N/A (server-side only) |

**Estimated scope:** ~50-100 lines of conditional UI.

### Total Scope for Remote Capability

| Component | New/Changed Lines (est.) | Touches Existing Code? |
|---|---|---|
| API server (HTTP + WebSocket) | ~500 | No (new files) |
| Terminal WebSocket transport | ~200 | No (new files) |
| File watcher broadcast | ~50 | Minor (add broadcast alongside existing send) |
| Auth middleware | ~100 | No (new file) |
| Remote client API adapter | ~300 | No (new file) |
| Handler refactoring (extract shared logic) | ~200 | Yes (extract-method, same behavior) |
| Store import abstraction (`api` vs `window.sorcerer`) | ~50 | Yes (find-and-replace, same behavior) |
| Settings UI: Remote Access panel | ~100 | Yes (add section to SettingsDialog) |
| Electron-API conditionals in UI | ~100 | Minor (hide window controls in browser) |
| **Total** | **~1,600 lines** | |

**Of the ~1,600 lines, ~1,150 are new files** that don't touch existing code at all.
The remaining ~450 lines are mechanical refactoring (extract method, import swaps)
that preserve existing behavior.

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Remote feature breaks desktop app | **None** | IPC path is independent; API server is lazy-loaded, can be disabled |
| Terminal latency over network | Medium | WebSocket is low-latency; buffer/debounce output if needed |
| PTY resize synchronization | Low | Send resize events over WS; client reports actual dimensions |
| Data consistency (two clients modifying state) | Low | Single-user app; SQLite serializes writes |
| Security (exposing PTY over network) | Medium | Token auth; bind to `127.0.0.1` by default; warn on `0.0.0.0` |
| xterm.js state divergence (reconnection) | Medium | On reconnect, replay terminal scrollback buffer or use screen dump |
| Performance overhead when remote is disabled | **None** | Server code is lazy-loaded; zero cost when feature is off |

### Terminal Reconnection Strategy

When a remote client disconnects and reconnects, it has lost the terminal
scrollback. Options:

1. **Scrollback buffer on server:** Keep last N bytes of each PTY's output
   in a ring buffer. On reconnect, replay the buffer to the client's xterm.js
   instance. This is the simplest and most effective approach.
2. **Screen snapshot:** Use ANSI parsing to maintain a virtual screen state
   server-side. More complex, less necessary for this use case.

Recommend option 1 with a 256KB ring buffer per session.

---

## Part 2: Android Client

### Constraints

Android cannot run Sorcerer's backend:
- **No `node-pty`:** Android doesn't support native PTY spawning in a normal app
  context (no Termux-style fork/exec without root or a custom terminal emulator).
- **No git worktrees:** No native git binary available.
- **No `~/.claude/` filesystem:** Claude Code doesn't run on Android.

Therefore, the Android app is strictly a **remote client** that connects to a
running Sorcerer host over the network.

### Architecture

```
┌──────────────────────────┐         ┌─────────────────────┐
│  Sorcerer Host           │         │  Android App        │
│  (Desktop, always on)    │         │                     │
│                          │◄── WS ──┤  Terminal View      │
│  API Server :7437        │         │  Session List       │
│  WebSocket  :7437/ws     │◄─ HTTP ─┤  Project Browser    │
│                          │         │  Team/Task Monitor  │
└──────────────────────────┘         └─────────────────────┘
```

### Technology Options

| Approach | Pros | Cons |
|---|---|---|
| **React Native + xterm.js (WebView)** | Reuse renderer code nearly 1:1; xterm.js runs in WebView | WebView terminal has touch/keyboard quirks |
| **Native Kotlin + terminal widget** | Best Android UX; native keyboard handling | Rewrite all UI; no code sharing |
| **PWA (web app, Add to Home Screen)** | Zero Android-specific code; the remote web client IS the mobile app | No Play Store presence; depends on Chrome; limited background/notifications |
| **Capacitor/Ionic wrapper** | Web tech in a native shell; Play Store distributable; access to native APIs | Adds a build layer; still WebView-based terminal |

### Recommended Approach: PWA-First, Capacitor Later

For a single-user personal tool, a **Progressive Web App** is the fastest path:

1. The remote web client (built in Part 1) already works in mobile Chrome.
2. Add a basic `manifest.json` and service worker for "Add to Home Screen".
3. Responsive CSS for the sidebar (collapse to drawer on narrow screens).
4. Touch-friendly terminal interaction (long-press for paste, gesture scrollback).

If Play Store distribution or push notifications are later desired, wrap the
PWA in Capacitor — this is a one-day task that adds no code changes to the
web app itself.

### Android-Specific UI Considerations

| Concern | Solution |
|---|---|
| **Sidebar on small screen** | Slide-out drawer (hamburger menu) replacing fixed sidebar |
| **Terminal keyboard** | Use Android soft keyboard; map common keys (Ctrl, Tab, Esc) via a toolbar row above the keyboard |
| **Terminal selection/copy** | Long-press to select; copy button in toolbar |
| **Split view** | Disable on mobile; single terminal fullscreen; swipe to switch sessions |
| **Landscape mode** | Allow and optimize for landscape — more terminal columns |
| **Connection status** | Persistent indicator showing connected/disconnected to host |
| **Reconnection** | Auto-reconnect WebSocket with exponential backoff; replay scrollback buffer |

### Scope for Android (PWA Approach)

| Component | Effort (est. lines) |
|---|---|
| Responsive CSS (sidebar drawer, mobile layout) | ~200 |
| Touch-friendly terminal toolbar (Ctrl/Tab/Esc row) | ~150 |
| PWA manifest + service worker | ~50 |
| Mobile-specific gesture handlers | ~100 |
| Connection status indicator + reconnect logic | ~100 |
| **Total** | **~600 lines** |

This assumes the remote capability from Part 1 is already complete.

### Scope for Android (Native Kotlin Approach)

If a native app is preferred instead:

| Component | Effort (est. lines) |
|---|---|
| Project setup (Gradle, dependencies) | — |
| HTTP client + WebSocket client (Ktor/OkHttp) | ~400 |
| Terminal rendering (TerminalView widget or WebView + xterm.js) | ~500 |
| Session list / project browser UI (Compose) | ~600 |
| Team/task monitoring UI | ~300 |
| Settings / connection config screen | ~200 |
| Background service for persistent WS connection | ~200 |
| **Total** | **~2,200 lines** |

This is significantly more work with zero code reuse from the existing
renderer.

---

## Part 3: Combined Roadmap

### Phase 1 — API Server & Remote Web Client (Opt-In Feature)
- Extract service logic from IPC handlers into shared functions
- Build lazy-loaded HTTP + WebSocket server (only started when enabled)
- Add Remote Access section to Settings dialog (enable/disable toggle, port, bind address, token)
- Build remote API client (`fetch` + `WebSocket` implementation of `SorcererAPI`)
- Add environment detection in renderer (Electron vs. browser)
- Add token-based auth
- Add terminal scrollback buffer for reconnection
- **Deliverable:** Toggle on Remote Access in Settings → open `http://host:7437` in any browser
- **When disabled:** Zero overhead, no open ports, desktop app unchanged

### Phase 2 — Mobile-Ready Web Client
- Responsive CSS: sidebar → drawer on narrow viewports
- Touch terminal toolbar (Ctrl, Tab, Esc, arrow keys)
- Disable split-view on mobile; single-session fullscreen with swipe
- PWA manifest + offline shell (service worker)
- Connection status banner with auto-reconnect
- **Deliverable:** Usable on Android Chrome / "Add to Home Screen"

### Phase 3 — Native Wrapper (Optional)
- Capacitor project wrapping the web client
- Push notifications for session status changes
- Play Store listing
- **Deliverable:** Installable Android app

---

## Key Decisions to Make

1. **HTTP framework:** Express (most ecosystem support) vs. Fastify (faster,
   built-in schema validation). Either works fine at this scale.

2. **WebSocket approach:** Single multiplexed connection (all terminal sessions
   on one WS, messages tagged with session ID) vs. one WS per terminal. Single
   connection is simpler for auth and reconnection.

3. **Scrollback buffer size:** 256KB per session is ~5,000 lines of typical
   terminal output. Sufficient for reconnection without excessive memory usage.

4. **Network binding:** Default to `127.0.0.1` (local only). User explicitly
   opts in to `0.0.0.0` (LAN) via settings. Never expose to public internet
   without warning.

5. **PWA vs. native Android:** PWA is recommended for a single-user tool.
   Native only if you want features like background process monitoring or
   push notifications that the web platform can't provide.

---

## Dependencies to Add

### For Remote Capability (Phase 1)
```
express        or  fastify       — HTTP server
ws                               — WebSocket server
cors                             — Cross-origin for remote browser clients
```

### For PWA (Phase 2)
```
No new dependencies — just static files (manifest.json, service-worker.js)
```

### For Capacitor (Phase 3)
```
@capacitor/core
@capacitor/cli
@capacitor/android
```

---

## Summary

| Effort | Scope | Desktop Impact | Depends On |
|---|---|---|---|
| **Remote capability** | ~1,600 lines (~1,150 new files) | None when disabled; Settings toggle when enabled | Nothing (standalone) |
| **Android PWA** | ~600 lines on top of remote | None | Remote capability |
| **Android native (Kotlin)** | ~2,200 lines, separate project | None | Remote capability |

The architecture is well-suited for this evolution. The existing IPC contract
(`src/preload/index.ts`) is essentially already an API specification — it just
needs a network transport underneath it. The renderer code is pure React with
Zustand stores and has no direct Electron imports, so it can run in a browser
with minimal changes.

**The desktop app is and remains the primary target.** Remote access is a
modular feature that adds a second access path without modifying the first.
When disabled, it has zero runtime cost — no server process, no open ports,
no code loaded. When enabled, it runs a sidecar HTTP/WebSocket server that
the user controls entirely via Settings.
