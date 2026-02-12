# Remote Access — Implementation Plan

**Date:** 2026-02-11
**Branch:** `feature-remote-access`
**Prerequisite:** None — desktop app continues working unchanged throughout.

---

## Task Organization

Tasks are organized into **streams** that can be worked on in parallel by separate
agents/sessions. Dependencies between streams are explicitly marked. Each task
includes the exact files to create or modify.

```
Stream A: Shared Handlers        ─────┐
(extract from IPC)                     │
                                       ├──► Stream D: API Server
Stream B: Remote Client Adapter  ─────┤    (HTTP + WS + auth)
(renderer-side network layer)          │
                                       │
Stream C: Scrollback Buffer      ─────┘
(ring buffer for reconnection)

Stream E: Settings UI + Toggle         (depends on D for IPC wiring)
Stream F: Electron-API Conditionals    (independent, small)
```

---

## Stream A: Extract Shared Handler Logic

**Purpose:** Pull handler bodies out of `handlers.ts` into pure functions so both
IPC and HTTP can call them.

**Can start:** Immediately
**Blocks:** Stream D (API server needs shared functions to call)

### Task A1: Create `shared-handlers.ts` with project operations

**Create:** `src/main/ipc/shared-handlers.ts`
**Modify:** `src/main/ipc/handlers.ts`

Extract these handler bodies into standalone functions:

```ts
// shared-handlers.ts — project operations
import { DatabaseService } from '../services/database-service'
import { WorktreeService } from '../services/worktree-service'
import simpleGit from 'simple-git'

export interface HandlerServices {
  db: DatabaseService
  worktree: WorktreeService
}

export function listProjects(s: HandlerServices) {
  return s.db.listProjects()
}

export function addProjectByPath(s: HandlerServices, projectPath: string, customName?: string) {
  // ... body from handlers.ts lines 63-73
}

export function updateProject(s: HandlerServices, id: string, updates: any) {
  return s.db.updateProject(id, updates)
}

export function removeProject(s: HandlerServices, id: string) {
  s.db.removeProject(id)
}

export async function getProjectGitStatus(projectPath: string) {
  // ... body from handlers.ts lines 83-117
}
```

Then update `handlers.ts` — IPC registrations delegate to shared functions:

```ts
ipcMain.handle('project:list', () => listProjects(services))
ipcMain.handle('project:addPath', (_, path, name) => addProjectByPath(services, path, name))
// etc.
```

**Note:** The `project:add` handler (which calls `dialog.showOpenDialog`) stays
in `handlers.ts` as IPC-only — remote clients will use `project:addPath` instead.

**Verification:** `npm run build` succeeds. Desktop app launches and all project
operations work identically.

---

### Task A2: Extract session operations into shared handlers

**Modify:** `src/main/ipc/shared-handlers.ts`, `src/main/ipc/handlers.ts`

Extract session handler bodies. These are the largest and most complex handlers.
The `HandlerServices` interface expands:

```ts
export interface HandlerServices {
  db: DatabaseService
  worktree: WorktreeService
  pty: PTYService
  fileWatcher: FileWatcherService
}
```

Functions to extract (from `handlers.ts` lines 127-506):
- `listSessions(s, projectId?)`
- `createSession(s, projectId, sessionName)` — includes worktree creation, PTY spawn
- `createQuickTerminal(s, sourceSessionId)`
- `killSession(s, sessionId)`
- `archiveSession(s, sessionId)`
- `deleteSession(s, sessionId)`
- `restartSession(s, sessionId)`
- `resumeSession(s, sessionId)`
- `setSessionTeam(s, sessionId, teamName)`
- `pushSessionBranch(s, sessionId)`
- `openSessionRemote(s, sessionId)` — keep `shell.openExternal` in IPC handler; shared function returns URL only
- `checkDeleteSafety(s, sessionId)`
- `getSessionGitStatus(s, sessionId)`
- `landSessionOnMain(s, sessionId)`
- `restoreSession(s, sessionId)`

**Verification:** All session operations (create, archive, delete, restart, resume,
land-on-main, push) work identically from desktop UI.

---

### Task A3: Extract agent + settings + team operations

**Modify:** `src/main/ipc/shared-handlers.ts`, `src/main/ipc/handlers.ts`

Functions to extract (from `handlers.ts` lines 508-671):
- `listAgents(s)`
- `addAgent(s, data)`
- `updateAgent(s, id, updates)`
- `removeAgent(s, id)`
- `startAgent(s, agentId)`
- `resumeAgent(s, agentId)`
- `restartAgent(s, agentId)`
- `killAgent(s, agentId)`
- `listTeams(s)`
- `getTeamTasks(s, teamName)`
- `getTeamInbox(s, teamName, agentName)`
- `getSetting(s, key)`
- `setSetting(s, key, value)` — apply shell setting side-effect inline

**Verification:** Agent start/stop/resume, team monitoring, settings save/load all
work from desktop UI.

---

## Stream B: Remote Client Adapter (Renderer Side)

**Purpose:** Create a network-backed implementation of the `SorcererAPI` interface
and swap stores to use an abstracted client.

**Can start:** Immediately (no dependency on backend streams)
**Blocks:** Nothing directly — but needed for end-to-end testing with Stream D

### Task B1: Create API client abstraction and Electron client wrapper

**Create:** `src/renderer/src/api/client.ts`

```ts
import type { SorcererAPI } from '../../../preload/index'

// In Electron, window.sorcerer is defined by the context bridge.
// In a browser, it's undefined — we'll plug in the remote client.
declare global {
  interface Window {
    sorcerer?: SorcererAPI
  }
}

let _api: SorcererAPI

export function getApi(): SorcererAPI {
  if (_api) return _api

  if (window.sorcerer) {
    // Running inside Electron — use IPC directly
    _api = window.sorcerer
  } else {
    // Running in browser — lazy-import remote client
    throw new Error('Remote client not initialized. Call initRemoteClient() first.')
  }

  return _api
}

export function initRemoteClient(baseUrl: string, token: string): void {
  // Dynamically import to avoid bundling ws/fetch code in Electron
  import('./remote-client').then(({ createRemoteClient }) => {
    _api = createRemoteClient(baseUrl, token)
  })
}
```

**Verification:** Compiles. Desktop app still works (falls through to `window.sorcerer`).

---

### Task B2: Replace `window.sorcerer` references across stores

**Modify:** (8 files)
- `src/renderer/src/stores/useProjectStore.ts` — 5 references
- `src/renderer/src/stores/useSessionStore.ts` — 11 references
- `src/renderer/src/stores/useAgentStore.ts` — 10 references
- `src/renderer/src/stores/useTeamStore.ts` — 2 references
- `src/renderer/src/App.tsx` — 2 references (teams.onUpdate, teams.onSessionLinked)
- `src/renderer/src/components/TerminalView.tsx` — 9 references
- `src/renderer/src/components/ContextMenu.tsx` — 1 reference
- `src/renderer/src/components/dialogs/SettingsDialog.tsx` — 4 references

Each file gets:
```ts
import { getApi } from '../api/client'
// Then replace window.sorcerer.foo.bar() → getApi().foo.bar()
```

This is a mechanical find-and-replace. No logic changes.

**Verification:** `npm run build` succeeds. Desktop app behaves identically — `getApi()`
returns `window.sorcerer` in Electron.

---

### Task B3: Build the remote client implementation

**Create:** `src/renderer/src/api/remote-client.ts`

Implements `SorcererAPI` using `fetch()` for request-response and `WebSocket` for
streaming:

```ts
export function createRemoteClient(baseUrl: string, token: string): SorcererAPI {
  const http = (method: string, path: string, body?: any) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json())

  let ws: WebSocket
  const listeners = new Map<string, Set<Function>>()

  function ensureWs() {
    if (ws?.readyState === WebSocket.OPEN) return
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws?token=' + token
    ws = new WebSocket(wsUrl)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      const key = msg.channel  // e.g. "terminal:data:abc-123"
      listeners.get(key)?.forEach(fn => fn(msg.payload))
    }
  }

  return {
    project: {
      list: () => http('GET', '/api/projects'),
      add: () => { throw new Error('Use addPath for remote clients') },
      addPath: (path, name) => http('POST', '/api/projects', { path, name }),
      update: (id, updates) => http('PATCH', `/api/projects/${id}`, updates),
      remove: (id) => http('DELETE', `/api/projects/${id}`),
      gitStatus: (path) => http('POST', '/api/projects/git-status', { path })
    },
    session: {
      list: (projectId) => http('GET', `/api/sessions${projectId ? `?projectId=${projectId}` : ''}`),
      create: (projectId, name) => http('POST', '/api/sessions', { projectId, name }),
      // ... all other session methods mapping to REST endpoints
    },
    terminal: {
      write: (sessionId, data) => {
        ensureWs()
        ws.send(JSON.stringify({ type: 'terminal:write', sessionId, data }))
      },
      resize: (sessionId, cols, rows) => {
        ensureWs()
        ws.send(JSON.stringify({ type: 'terminal:resize', sessionId, cols, rows }))
      },
      onData: (sessionId, callback) => {
        ensureWs()
        const key = `terminal:data:${sessionId}`
        if (!listeners.has(key)) listeners.set(key, new Set())
        listeners.get(key)!.add(callback)
        return () => listeners.get(key)?.delete(callback)
      },
      onExit: (sessionId, callback) => {
        ensureWs()
        const key = `terminal:exit:${sessionId}`
        if (!listeners.has(key)) listeners.set(key, new Set())
        listeners.get(key)!.add(callback)
        return () => listeners.get(key)?.delete(callback)
      }
    },
    teams: {
      list: () => http('GET', '/api/teams'),
      getTasks: (teamName) => http('GET', `/api/teams/${teamName}/tasks`),
      getInbox: (teamName, agentName) => http('GET', `/api/teams/${teamName}/inbox/${agentName}`),
      onUpdate: (callback) => {
        ensureWs()
        const key = 'filewatcher:update'
        if (!listeners.has(key)) listeners.set(key, new Set())
        listeners.get(key)!.add(callback)
        return () => listeners.get(key)?.delete(callback)
      },
      onSessionLinked: (callback) => {
        ensureWs()
        const key = 'filewatcher:session-linked'
        if (!listeners.has(key)) listeners.set(key, new Set())
        listeners.get(key)!.add(callback)
        return () => listeners.get(key)?.delete(callback)
      }
    },
    settings: {
      get: (key) => http('GET', `/api/settings/${key}`).then(r => r.value),
      set: (key, value) => http('PUT', `/api/settings/${key}`, { value })
    },
    window: {
      // No-ops for remote clients
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      isMaximized: () => Promise.resolve(false)
    }
  }
}
```

**Verification:** TypeScript compiles with full `SorcererAPI` type satisfaction.

---

## Stream C: Scrollback Buffer

**Purpose:** Server-side ring buffer that captures PTY output so reconnecting
clients can replay terminal history.

**Can start:** Immediately
**Blocks:** Stream D (WS handler uses scrollback on client connect)

### Task C1: Implement scrollback ring buffer

**Create:** `src/main/server/scrollback.ts`

```ts
export class ScrollbackBuffer {
  private buffers = new Map<string, { data: Buffer; writePos: number; full: boolean }>()
  private maxSize: number

  constructor(maxSizePerSession = 256 * 1024) {  // 256KB default
    this.maxSize = maxSizePerSession
  }

  /** Append PTY output for a session */
  append(sessionId: string, chunk: string): void { ... }

  /** Get full scrollback for replay on reconnect */
  getScrollback(sessionId: string): string { ... }

  /** Clean up when session ends */
  remove(sessionId: string): void { ... }

  /** Clean up everything */
  clear(): void { ... }
}
```

**Verification:** Unit-testable in isolation. Write a simple test that appends
data, verifies getScrollback returns it in order, and handles wrap-around.

---

## Stream D: API Server (HTTP + WebSocket)

**Purpose:** The server that remote browser clients connect to.

**Can start:** After Streams A + C are complete (or stub them initially)
**Blocks:** Stream E (Settings toggle wires up to this server)

### Task D1: Create HTTP server with REST routes

**Create:** `src/main/server/api-server.ts`, `src/main/server/routes.ts`
**Add dependency:** `express`, `cors`

`api-server.ts` — lifecycle management:
```ts
import express from 'express'
import http from 'http'
import path from 'path'
import { HandlerServices } from '../ipc/shared-handlers'
import { registerRoutes } from './routes'
import { WebSocketHandler } from './ws-handler'
import { ScrollbackBuffer } from './scrollback'

export interface ApiServerConfig {
  port: number
  bindAddress: string
  authToken: string
}

export class ApiServer {
  private httpServer: http.Server | null = null
  private wsHandler: WebSocketHandler | null = null
  private scrollback = new ScrollbackBuffer()

  constructor(
    private services: HandlerServices,
    private config: ApiServerConfig
  ) {}

  async start(): Promise<void> {
    const app = express()

    // Auth middleware
    app.use('/api', (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (token !== this.config.authToken) return res.status(401).json({ error: 'Unauthorized' })
      next()
    })

    // REST routes
    registerRoutes(app, this.services)

    // Serve renderer bundle for browser clients
    const rendererPath = path.join(__dirname, '../renderer')
    app.use(express.static(rendererPath))
    app.get('*', (_, res) => res.sendFile(path.join(rendererPath, 'index.html')))

    this.httpServer = http.createServer(app)

    // WebSocket server
    this.wsHandler = new WebSocketHandler(this.httpServer, this.services, this.scrollback, this.config.authToken)

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, this.config.bindAddress, resolve)
    })
  }

  stop(): void {
    this.wsHandler?.close()
    this.httpServer?.close()
    this.scrollback.clear()
    this.httpServer = null
    this.wsHandler = null
  }

  isRunning(): boolean {
    return this.httpServer?.listening ?? false
  }
}
```

`routes.ts` — maps REST endpoints to shared handler functions:
```ts
import { Router } from 'express'
import * as handlers from '../ipc/shared-handlers'

export function registerRoutes(app: Express, services: HandlerServices) {
  const api = Router()
  api.use(express.json())

  // Projects
  api.get('/projects', (_, res) => res.json(handlers.listProjects(services)))
  api.post('/projects', async (req, res) => {
    const { path, name } = req.body
    res.json(await handlers.addProjectByPath(services, path, name))
  })
  api.patch('/projects/:id', async (req, res) => { ... })
  api.delete('/projects/:id', async (req, res) => { ... })
  api.post('/projects/git-status', async (req, res) => { ... })

  // Sessions — all 15 operations
  api.get('/sessions', (req, res) => { ... })
  api.post('/sessions', async (req, res) => { ... })
  api.post('/sessions/:id/kill', async (req, res) => { ... })
  api.post('/sessions/:id/archive', async (req, res) => { ... })
  api.delete('/sessions/:id', async (req, res) => { ... })
  api.post('/sessions/:id/restart', async (req, res) => { ... })
  api.post('/sessions/:id/resume', async (req, res) => { ... })
  api.post('/sessions/:id/push', async (req, res) => { ... })
  api.post('/sessions/:id/land', async (req, res) => { ... })
  api.post('/sessions/:id/restore', async (req, res) => { ... })
  api.get('/sessions/:id/git-status', async (req, res) => { ... })
  api.get('/sessions/:id/delete-safety', async (req, res) => { ... })
  api.put('/sessions/:id/team', async (req, res) => { ... })
  api.post('/sessions/:id/quick-terminal', async (req, res) => { ... })

  // Agents — 8 operations
  api.get('/agents', ...)
  api.post('/agents', ...)
  api.patch('/agents/:id', ...)
  api.delete('/agents/:id', ...)
  api.post('/agents/:id/start', ...)
  api.post('/agents/:id/resume', ...)
  api.post('/agents/:id/restart', ...)
  api.post('/agents/:id/kill', ...)

  // Teams
  api.get('/teams', ...)
  api.get('/teams/:name/tasks', ...)
  api.get('/teams/:name/inbox/:agent', ...)

  // Settings
  api.get('/settings/:key', ...)
  api.put('/settings/:key', ...)

  app.use('/api', api)
}
```

**Verification:** Start server manually, hit endpoints with curl, confirm responses
match IPC handler output.

---

### Task D2: Create WebSocket handler for terminal I/O and events

**Create:** `src/main/server/ws-handler.ts`
**Add dependency:** `ws`

```ts
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { HandlerServices } from '../ipc/shared-handlers'
import { ScrollbackBuffer } from './scrollback'

export class WebSocketHandler {
  private wss: WebSocketServer
  private clients = new Set<WebSocket>()

  constructor(
    server: http.Server,
    private services: HandlerServices,
    private scrollback: ScrollbackBuffer,
    private authToken: string
  ) {
    this.wss = new WebSocketServer({ server })
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req))

    // Hook into PTYService output — broadcast to WS clients
    this.hookPtyOutput()

    // Hook into FileWatcherService events — broadcast to WS clients
    this.hookFileWatcher()
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    // Validate auth token from query string
    const url = new URL(req.url!, `http://${req.headers.host}`)
    if (url.searchParams.get('token') !== this.authToken) {
      ws.close(4001, 'Unauthorized')
      return
    }

    this.clients.add(ws)
    ws.on('close', () => this.clients.delete(ws))

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      switch (msg.type) {
        case 'terminal:write':
          this.services.pty.write(msg.sessionId, msg.data)
          break
        case 'terminal:resize':
          this.services.pty.resize(msg.sessionId, msg.cols, msg.rows)
          break
        case 'terminal:subscribe':
          // Send scrollback on subscribe
          const scrollback = this.scrollback.getScrollback(msg.sessionId)
          if (scrollback) {
            ws.send(JSON.stringify({
              channel: `terminal:data:${msg.sessionId}`,
              payload: scrollback
            }))
          }
          break
      }
    })
  }

  /** Intercept PTY output → feed scrollback + broadcast to WS clients */
  private hookPtyOutput() {
    // PTYService needs a small modification: add an event emitter or callback
    // hook so we can tap into output without replacing the IPC send.
    // See Task D3 for the PTYService modification.
  }

  /** Broadcast file watcher events to all connected WS clients */
  private hookFileWatcher() {
    // FileWatcherService also needs a callback hook.
    // See Task D4.
  }

  broadcast(channel: string, payload: any) {
    const msg = JSON.stringify({ channel, payload })
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg)
      }
    }
  }

  close() {
    for (const ws of this.clients) ws.close()
    this.wss.close()
  }
}
```

**Verification:** Connect via wscat, send terminal:write message, confirm PTY
receives input. Confirm terminal:data messages arrive.

---

### Task D3: Add output hooks to PTYService

**Modify:** `src/main/services/pty-service.ts`

Add an optional output listener that the WebSocket handler can register. This
does NOT change the existing IPC output path:

```ts
// Add to PTYService class:
private outputListener: ((sessionId: string, data: string) => void) | null = null

/** Register a listener for all PTY output (used by API server) */
onOutput(listener: (sessionId: string, data: string) => void): void {
  this.outputListener = listener
}

// Modify the spawn() method's onData handler:
ptyProcess.onData((data: string) => {
  // Existing: send to Electron window
  if (this.mainWindow && !this.mainWindow.isDestroyed()) {
    this.mainWindow.webContents.send(`terminal:data:${sessionId}`, data)
  }
  // New: also notify API server listener (if registered)
  this.outputListener?.(sessionId, data)
})

// Same pattern for onExit:
ptyProcess.onExit(({ exitCode }) => {
  if (this.mainWindow && !this.mainWindow.isDestroyed()) {
    this.mainWindow.webContents.send(`terminal:exit:${sessionId}`, exitCode)
  }
  this.exitListener?.(sessionId, exitCode)
  this.sessions.delete(sessionId)
})
```

**Impact on existing code:** Two additional lines in the `onData` and `onExit`
callbacks. The listener is null by default — zero impact when remote is disabled.

**Verification:** Desktop terminal output still works. Listener fires when registered.

---

### Task D4: Add event hooks to FileWatcherService

**Modify:** `src/main/services/file-watcher-service.ts`

Same pattern as D3 — add an optional broadcast callback:

```ts
private eventListener: ((event: string, data: any) => void) | null = null

onEvent(listener: (event: string, data: any) => void): void {
  this.eventListener = listener
}

// In existing emit methods, add alongside mainWindow.webContents.send():
this.eventListener?.('teams-update', data)
this.eventListener?.('tasks-update', data)
this.eventListener?.('session-linked', data)
```

**Verification:** Team/task updates still appear in desktop sidebar. Listener fires.

---

### Task D5: Create auth token module

**Create:** `src/main/server/auth.ts`

```ts
import crypto from 'crypto'
import { DatabaseService } from '../services/database-service'

export function getOrCreateAuthToken(db: DatabaseService): string {
  let token = db.getSetting('remoteAuthToken')
  if (!token) {
    token = crypto.randomBytes(32).toString('hex')
    db.setSetting('remoteAuthToken', token)
  }
  return token
}

export function regenerateAuthToken(db: DatabaseService): string {
  const token = crypto.randomBytes(32).toString('hex')
  db.setSetting('remoteAuthToken', token)
  return token
}
```

**Verification:** Token persists across app restarts. Regenerate produces new token.

---

## Stream E: Settings UI + Server Toggle

**Purpose:** Add the Remote Access section to the Settings dialog and wire up the
enable/disable IPC.

**Can start:** After Stream D (needs server to toggle)
**Can start UI work early:** The React component can be built before D is done;
just wire up IPC last.

### Task E1: Add remote access IPC handlers to main process

**Modify:** `src/main/index.ts`, `src/main/ipc/handlers.ts`

```ts
// In index.ts — add lazy API server management
import type { ApiServer } from './server/api-server'

let apiServer: ApiServer | null = null

// In registerIPC or directly in index.ts after IPC registration:
ipcMain.handle('remote:status', () => ({
  running: apiServer?.isRunning() ?? false,
  port: dbService.getSetting('remotePort') || '7437',
  bindAddress: dbService.getSetting('remoteBindAddress') || '127.0.0.1',
  token: dbService.getSetting('remoteAuthToken') || ''
}))

ipcMain.handle('remote:enable', async () => {
  const { ApiServer } = await import('./server/api-server')
  const { getOrCreateAuthToken } = await import('./server/auth')

  const port = parseInt(dbService.getSetting('remotePort') || '7437')
  const bindAddress = dbService.getSetting('remoteBindAddress') || '127.0.0.1'
  const authToken = getOrCreateAuthToken(dbService)

  if (apiServer) apiServer.stop()
  apiServer = new ApiServer(
    { db: dbService, pty: ptyService, worktree: worktreeService, fileWatcher: fileWatcherService },
    { port, bindAddress, authToken }
  )
  await apiServer.start()
  dbService.setSetting('remoteEnabled', 'true')
  return { port, bindAddress, token: authToken }
})

ipcMain.handle('remote:disable', () => {
  if (apiServer) { apiServer.stop(); apiServer = null }
  dbService.setSetting('remoteEnabled', 'false')
})

ipcMain.handle('remote:regenerate-token', async () => {
  const { regenerateAuthToken } = await import('./server/auth')
  const token = regenerateAuthToken(dbService)
  // Restart server with new token if running
  if (apiServer?.isRunning()) {
    // trigger re-enable to pick up new token
  }
  return token
})
```

Add to preload's API (in `src/preload/index.ts`):
```ts
remote: {
  status: () => ipcRenderer.invoke('remote:status'),
  enable: () => ipcRenderer.invoke('remote:enable'),
  disable: () => ipcRenderer.invoke('remote:disable'),
  regenerateToken: () => ipcRenderer.invoke('remote:regenerate-token')
}
```

Also add auto-start on app launch if previously enabled:
```ts
// In createWindow(), after registerIPC:
const remoteEnabled = dbService.getSetting('remoteEnabled')
if (remoteEnabled === 'true') {
  // Dynamic import + start server
}
```

**Verification:** `remote:enable` starts server, `remote:disable` stops it.
Server survives app restart when enabled.

---

### Task E2: Build Remote Access settings tab in renderer

**Modify:** `src/renderer/src/components/dialogs/SettingsDialog.tsx`

Add a new tab `'remote'` alongside `sessions`, `git`, `general`:

```tsx
// Add to TABS array:
{ id: 'remote', label: 'Remote', icon: <WifiIcon /> }

function RemoteTab() {
  const { addToast } = useToastStore()
  const [status, setStatus] = useState<{
    running: boolean; port: string; bindAddress: string; token: string
  }>({ running: false, port: '7437', bindAddress: '127.0.0.1', token: '' })

  useEffect(() => {
    getApi().remote.status().then(setStatus)
  }, [])

  const [port, setPort] = useSetting('remotePort', '7437')
  const [bindAddress, setBindAddress] = useSetting('remoteBindAddress', '127.0.0.1')

  const toggle = async () => {
    if (status.running) {
      await getApi().remote.disable()
      setStatus(s => ({ ...s, running: false }))
      addToast('Remote access disabled', 'info')
    } else {
      const result = await getApi().remote.enable()
      setStatus(s => ({ ...s, running: true, token: result.token }))
      addToast(`Remote access enabled on port ${result.port}`, 'success')
    }
  }

  return (
    <>
      <SectionTitle>Remote Access</SectionTitle>
      <SettingRow label="Enable remote access" description="Allow browser clients to connect to this Sorcerer instance">
        <Toggle checked={status.running} onChange={toggle} />
      </SettingRow>

      {status.running && (
        <div className="settings-status-banner">
          Running on http://{bindAddress === '0.0.0.0' ? getLocalIP() : bindAddress}:{port}
        </div>
      )}

      <SettingRow label="Port" description="TCP port for the remote access server">
        <input className="settings-input" value={port} onChange={e => setPort(e.target.value)}
          disabled={status.running} />
      </SettingRow>

      <SettingRow label="Bind address" description="127.0.0.1 = local only, 0.0.0.0 = LAN accessible">
        <select className="settings-select" value={bindAddress}
          onChange={e => setBindAddress(e.target.value)} disabled={status.running}>
          <option value="127.0.0.1">127.0.0.1 (local only)</option>
          <option value="0.0.0.0">0.0.0.0 (LAN)</option>
        </select>
      </SettingRow>

      <SectionTitle>Authentication</SectionTitle>
      <SettingRow label="Auth token" description="Include this token when connecting from a browser">
        <div className="settings-token-row">
          <code className="settings-token">{status.token || '(enable to generate)'}</code>
          <button className="settings-action-btn" onClick={async () => {
            const token = await getApi().remote.regenerateToken()
            setStatus(s => ({ ...s, token }))
            addToast('Token regenerated', 'success')
          }}>Regenerate</button>
        </div>
      </SettingRow>
    </>
  )
}
```

**Verification:** Settings dialog shows Remote tab. Toggle starts/stops server.
Token displays and can be regenerated.

---

## Stream F: Electron-API Conditionals

**Purpose:** Hide/replace Electron-only UI elements when running in browser.

**Can start:** Immediately (independent of all other streams)
**Blocks:** Nothing

### Task F1: Hide window controls and adapt dialogs for browser

**Modify:** `src/renderer/src/components/Sidebar.tsx` (or wherever title bar is),
`src/renderer/src/components/dialogs/AddProjectDialog.tsx`

Add environment detection utility:
```ts
// src/renderer/src/api/client.ts (add to existing)
export const isElectron = !!window.sorcerer
```

Conditionals:
- **Title bar:** Hide minimize/maximize/close buttons when `!isElectron`
- **Add Project dialog:** Show text input for path instead of file picker when `!isElectron`
- **"Open Remote" context menu:** Use `window.open(url)` instead of `shell.openExternal`

**Verification:** In Electron, UI is identical. In browser (once server is running),
window controls are hidden, project add shows path input.

---

## Dependency Graph

```
A1 ──► A2 ──► A3 ──┐
                     ├──► D1 ──► D2 ──► D5 ──► E1 ──► E2
C1 ─────────────────┘         ▲
                               │
                    D3 ────────┘
                    D4 ────────┘

B1 ──► B2 ──► B3    (independent, can run fully in parallel with A/C/D)

F1                   (independent, can run anytime)
```

## Task Summary

| Task | Stream | Files | Est. Lines | Depends On | Parallelizable With |
|------|--------|-------|-----------|------------|-------------------|
| A1 | Shared Handlers | shared-handlers.ts, handlers.ts | ~120 | — | B1, C1, F1 |
| A2 | Shared Handlers | shared-handlers.ts, handlers.ts | ~250 | A1 | B1-B3, C1, F1 |
| A3 | Shared Handlers | shared-handlers.ts, handlers.ts | ~150 | A2 | B1-B3, C1, F1 |
| B1 | Remote Client | api/client.ts | ~40 | — | A1-A3, C1, D1-D5, F1 |
| B2 | Remote Client | 8 renderer files | ~50 (imports) | B1 | A1-A3, C1, D1-D5, F1 |
| B3 | Remote Client | api/remote-client.ts | ~300 | B1 | A1-A3, C1, D1-D5, F1 |
| C1 | Scrollback | server/scrollback.ts | ~80 | — | A1-A3, B1-B3, F1 |
| D1 | API Server | server/api-server.ts, routes.ts | ~400 | A3, C1 | B1-B3 |
| D2 | API Server | server/ws-handler.ts | ~200 | D1 | B3 |
| D3 | API Server | pty-service.ts | ~15 | — | Everything |
| D4 | API Server | file-watcher-service.ts | ~10 | — | Everything |
| D5 | API Server | server/auth.ts | ~30 | — | Everything |
| E1 | Settings Toggle | index.ts, handlers.ts, preload | ~100 | D1, D2, D5 | B3, F1 |
| E2 | Settings UI | SettingsDialog.tsx | ~100 | E1 | — |
| F1 | Electron Conditionals | Sidebar, AddProjectDialog | ~60 | — | Everything |

**Total: 15 tasks, ~1,905 lines**

## Recommended Agent Assignment (3 Parallel Sessions)

| Session | Tasks (in order) | Focus Area |
|---------|-----------------|------------|
| **Agent 1: Backend Core** | A1 → A2 → A3 → D1 → D2 → E1 | Handler extraction, server, toggle |
| **Agent 2: Renderer** | B1 → B2 → B3 → E2 → F1 | Client adapter, store migration, settings UI |
| **Agent 3: Infrastructure** | C1 → D3 → D4 → D5 → (then assist Agent 1 on D1/D2) | Scrollback, hooks, auth |

With 3 agents, Agents 2 and 3 can start immediately while Agent 1 works on A1.
Agent 3 finishes its independent tasks quickly (~135 lines) and can join Agent 1
on the larger server tasks.

## npm Dependencies to Install (Before Starting)

```bash
npm install express ws cors
npm install -D @types/express @types/ws @types/cors
```

## Verification Milestones

1. **After Stream A:** Desktop app works identically (regression check)
2. **After Stream B:** Desktop app works identically (`getApi()` returns `window.sorcerer`)
3. **After Stream D:** `curl http://localhost:7437/api/projects` returns project list
4. **After Stream D + B:** Browser at `http://localhost:7437` shows full Sorcerer UI with working terminals
5. **After Stream E:** Toggle in Settings starts/stops server; survives app restart
6. **After Stream F:** Browser client hides window controls, shows path input for Add Project
