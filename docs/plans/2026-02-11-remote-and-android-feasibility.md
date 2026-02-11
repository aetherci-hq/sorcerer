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

The two efforts are sequential: **remote capability is a prerequisite for Android**.

---

## Part 1: Remote Capability

### What "Remote" Means Here

The Sorcerer desktop host continues running the backend (PTY processes, git worktrees,
SQLite, file watchers) on a real machine. A remote client — whether a browser tab, a
second desktop, or a phone — connects over the network and gets the same UI experience:
sidebar, terminal I/O, session management.

### Current Architecture Coupling Points

| Layer | Current Transport | What Needs to Change |
|---|---|---|
| **CRUD operations** (project/session/agent) | `ipcRenderer.invoke` → `ipcMain.handle` | Wrap in HTTP/REST or WebSocket RPC |
| **Terminal data** (stdin/stdout stream) | `ipcRenderer.send` / `ipcRenderer.on` per session | WebSocket channel per session |
| **File watcher events** (teams/tasks) | `ipcRenderer.on` push events | WebSocket server-push or SSE |
| **Native dialogs** (`dialog.showOpenDialog`) | Electron-only API | Replace with path-input text field for remote clients |
| **Window controls** (minimize/maximize/close) | Electron `BrowserWindow` | N/A for remote — only applies to local Electron shell |

### Proposed Architecture

```
┌──────────────────────────┐     ┌──────────────────────────────┐
│  Sorcerer Host (Desktop) │     │  Remote Client               │
│                          │     │  (Browser / Android / etc.)   │
│  ┌────────────────────┐  │     │                              │
│  │ PTYService         │  │     │  React App (same renderer    │
│  │ DatabaseService    │  │     │  code, minus Electron APIs)  │
│  │ WorktreeService    │  │     │                              │
│  │ FileWatcherService │  │     │  Connects via:               │
│  └────────┬───────────┘  │     │  - WebSocket (terminal I/O)  │
│           │              │     │  - HTTP/REST (CRUD ops)       │
│  ┌────────▼───────────┐  │     │  - WebSocket (push events)   │
│  │ API Server         │  │     └──────────────┬───────────────┘
│  │ (Express/Fastify   │◄─┼─── network ───────┘
│  │  + ws)             │  │
│  └────────────────────┘  │
│                          │
│  Electron window (local  │
│  client, still works     │
│  via same API or IPC)    │
└──────────────────────────┘
```

### Implementation Breakdown

#### 1. Extract an API Server from the IPC Handlers

**File affected:** `src/main/ipc/handlers.ts` (671 lines)

The existing `registerIPC()` function is already cleanly organized as
request-response handlers over IPC. The refactor:

- Create `src/main/server/api-server.ts` — an Express or Fastify HTTP server
  running on a configurable port (e.g. `7437`).
- Each `ipcMain.handle('project:list', ...)` becomes a corresponding
  `GET /api/projects` route that calls the same service methods.
- The handler functions themselves don't change — they already take
  `(event, ...args)` and return data. Extract the logic into plain functions,
  then call them from both IPC handlers and HTTP routes.

**Effort:** The IPC handler file has ~30 distinct operations. Each one maps
1:1 to a REST endpoint. This is mechanical refactoring.

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

#### 5. Renderer Abstraction Layer

**Files affected:** `src/preload/index.ts`, renderer stores

The renderer currently calls `window.sorcerer.*` (the Electron context bridge).
For remote clients, this API needs a network-backed implementation:

- Create `src/renderer/src/api/remote-client.ts` that implements the same
  `SorcererAPI` interface but uses `fetch()` for CRUD and `WebSocket` for
  terminal/events.
- Create `src/renderer/src/api/electron-client.ts` that wraps the existing
  `window.sorcerer` (trivial, already exists).
- At startup, detect environment: if `window.sorcerer` exists, use Electron
  client; otherwise, use remote client.

**Estimated scope:** ~300 lines for the remote client implementation.

#### 6. Handle Electron-Only APIs

| API | Current Usage | Remote Replacement |
|---|---|---|
| `dialog.showOpenDialog` | Project "Add" | Text input field with path string |
| `shell.openExternal` | "Open Remote" link | `window.open()` |
| `BrowserWindow` controls | Minimize/maximize/close | Hide controls on remote |
| `app.getPath` | Database location | N/A (server-side only) |

**Estimated scope:** ~50-100 lines of conditional UI.

### Total Scope for Remote Capability

| Component | New/Changed Lines (est.) |
|---|---|
| API server (HTTP + WebSocket) | ~500 |
| Terminal WebSocket transport | ~200 |
| File watcher broadcast | ~50 |
| Auth middleware | ~100 |
| Remote client API adapter | ~300 |
| Handler refactoring (extract shared logic) | ~200 |
| Electron-API conditionals in UI | ~100 |
| **Total** | **~1,450 lines** |

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Terminal latency over network | Medium | WebSocket is low-latency; buffer/debounce output if needed |
| PTY resize synchronization | Low | Send resize events over WS; client reports actual dimensions |
| Data consistency (two clients modifying state) | Low | Single-user app; SQLite serializes writes |
| Security (exposing PTY over network) | Medium | Token auth; bind to LAN only by default; warn on 0.0.0.0 |
| xterm.js state divergence (reconnection) | Medium | On reconnect, replay terminal scrollback buffer or use screen dump |

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

### Phase 1 — API Server & Remote Web Client
- Extract service logic from IPC handlers into shared functions
- Stand up HTTP + WebSocket server in main process
- Build remote API client (`fetch` + `WebSocket` implementation of `SorcererAPI`)
- Add environment detection in renderer (Electron vs. browser)
- Add token-based auth
- Add terminal scrollback buffer for reconnection
- **Deliverable:** Open `http://host:7437` in any browser and use Sorcerer

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

| Effort | Scope | Depends On |
|---|---|---|
| **Remote capability** | ~1,450 lines new/refactored code | Nothing (standalone) |
| **Android PWA** | ~600 lines on top of remote | Remote capability |
| **Android native (Kotlin)** | ~2,200 lines, separate project | Remote capability |

The architecture is well-suited for this evolution. The existing IPC contract
(`src/preload/index.ts`) is essentially already an API specification — it just
needs a network transport underneath it. The renderer code is pure React with
Zustand stores and has no direct Electron imports, so it can run in a browser
with minimal changes.
