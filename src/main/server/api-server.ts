import http from 'http'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import {
  HandlerServices,
  listProjects,
  addProjectByPath,
  updateProject,
  removeProject,
  syncWorktrees,
  getProjectGitStatus,
  listSessions,
  createSession,
  spawnShell,
  createQuickTerminal,
  renameSession,
  killSession,
  archiveSession,
  deleteSession,
  restartSession,
  resumeSession,
  setSessionTeam,
  pushSessionBranch,
  checkDeleteSafety,
  getSessionGitStatus,
  landOnMain,
  restoreSession,
  listAgents,
  addAgent,
  updateAgent,
  removeAgent,
  startAgent,
  resumeAgent,
  restartAgent,
  createAgentQuickTerminal,
  killAgent,
  listTeams,
  getTeamTasks,
  getTeamInbox,
  getSetting,
  setSetting,
  getUserInfo
} from '../ipc/shared-handlers'
import { ScrollbackBuffer } from './scrollback'
import { WebSocketHandler } from './ws-handler'

// ── Config ──────────────────────────────────────────────────

export interface ApiServerConfig {
  port: number
  bindAddress: string
  authToken: string
}

// ── MIME type map for static file serving ───────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

// ── ApiServer ───────────────────────────────────────────────

export class ApiServer {
  private httpServer: http.Server | null = null
  private scrollback = new ScrollbackBuffer()
  private wsHandler: WebSocketHandler | null = null
  private dispatch: Record<string, (...args: any[]) => any>

  constructor(
    private services: HandlerServices,
    private config: ApiServerConfig
  ) {
    this.dispatch = this.buildDispatchMap()
  }

  // ── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    this.httpServer = http.createServer((req, res) => this.handleRequest(req, res))

    // Create WebSocket handler (hooks into upgrade events on the HTTP server)
    this.wsHandler = new WebSocketHandler(
      this.httpServer,
      this.services.pty,
      this.scrollback,
      this.config.authToken
    )

    // Hook into PTY output → feed scrollback buffer + broadcast to WS clients
    this.services.pty.onOutput((sessionId, data) => {
      this.scrollback.append(sessionId, data)
      this.wsHandler?.broadcastTerminalData(sessionId, data)
    })

    // Hook into PTY exit → broadcast to WS clients
    this.services.pty.onExit((sessionId, exitCode) => {
      this.wsHandler?.broadcastTerminalExit(sessionId, exitCode)
    })

    // Hook into file watcher events → broadcast to WS clients
    this.services.fileWatcher.onEvent((event, data) => {
      this.wsHandler?.broadcastFileWatcherEvent(event, data)
    })

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, this.config.bindAddress, resolve)
    })

    console.log(`[api-server] Listening on ${this.config.bindAddress}:${this.config.port}`)
  }

  stop(): void {
    // Unhook PTY listeners
    this.services.pty.onOutput(() => {})
    this.services.pty.onExit(() => {})

    if (this.wsHandler) {
      this.wsHandler.close()
      this.wsHandler = null
    }

    this.httpServer?.close()
    this.scrollback.clear()
    this.httpServer = null
    console.log('[api-server] Stopped')
  }

  isRunning(): boolean {
    return this.httpServer?.listening ?? false
  }

  getScrollback(): ScrollbackBuffer {
    return this.scrollback
  }

  getHttpServer(): http.Server | null {
    return this.httpServer
  }

  // ── Request routing ───────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // CORS headers for browser clients
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // Auth check for /api/* routes
    if (url.pathname.startsWith('/api/')) {
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (token !== this.config.authToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
    }

    // RPC endpoint
    if (req.method === 'POST' && url.pathname === '/api/rpc') {
      await this.handleRpc(req, res)
      return
    }

    // Static file serving for the renderer bundle
    this.serveStatic(url.pathname, res)
  }

  // ── RPC dispatch ──────────────────────────────────────────

  private buildDispatchMap(): Record<string, (...args: any[]) => any> {
    const s = this.services
    return {
      // Project
      'project:list': () => listProjects(s),
      'project:addPath': (projectPath: string, name?: string) =>
        addProjectByPath(s, projectPath, name),
      'project:update': (id: string, updates: any) => updateProject(s, id, updates),
      'project:remove': (id: string) => removeProject(s, id),
      'project:sync-worktrees': (projectId: string) => syncWorktrees(s, projectId),
      'project:git-status': (projectPath: string) => getProjectGitStatus(s, projectPath),

      // Session
      'session:list': (projectId?: string) => listSessions(s, projectId),
      'session:create': (projectId: string, name: string, useMainRepo?: boolean) =>
        createSession(s, projectId, name, useMainRepo),
      'session:spawn-shell': (sessionId: string, cwd: string) => spawnShell(s, sessionId, cwd),
      'session:create-quick-terminal': (sourceId: string) => createQuickTerminal(s, sourceId),
      'session:rename': (sessionId: string, name: string) => renameSession(s, sessionId, name),
      'session:kill': (sessionId: string) => killSession(s, sessionId),
      'session:archive': (sessionId: string) => archiveSession(s, sessionId),
      'session:delete': (sessionId: string) => deleteSession(s, sessionId),
      'session:restart': (sessionId: string) => restartSession(s, sessionId),
      'session:resume': (sessionId: string) => resumeSession(s, sessionId),
      'session:set-team': (sessionId: string, teamName: string | null) =>
        setSessionTeam(s, sessionId, teamName),
      'session:push-branch': (sessionId: string) => pushSessionBranch(s, sessionId),
      'session:check-delete-safety': (sessionId: string) => checkDeleteSafety(s, sessionId),
      'session:git-status': (sessionId: string) => getSessionGitStatus(s, sessionId),
      'session:land-on-main': (sessionId: string) => landOnMain(s, sessionId),
      'session:restore': (sessionId: string) => restoreSession(s, sessionId),
      'session:open-remote': (_sessionId: string) => {
        // Remote clients should navigate via browser — no shell.openExternal available
        return { opened: false, error: 'Use browser navigation for remote clients' }
      },

      // Agent
      'agent:list': () => listAgents(s),
      'agent:add': (data: any) => addAgent(s, data),
      'agent:update': (id: string, updates: any) => updateAgent(s, id, updates),
      'agent:remove': (id: string) => removeAgent(s, id),
      'agent:start': (id: string) => startAgent(s, id),
      'agent:resume': (id: string) => resumeAgent(s, id),
      'agent:restart': (id: string) => restartAgent(s, id),
      'agent:kill': (id: string) => killAgent(s, id),
      'agent:create-quick-terminal': (agentId: string) => createAgentQuickTerminal(s, agentId),

      // Teams
      'teams:list': () => listTeams(s),
      'teams:tasks': (teamName: string) => getTeamTasks(s, teamName),
      'teams:inbox': (teamName: string, agentName: string) => getTeamInbox(s, teamName, agentName),

      // Settings
      'settings:get': (key: string) => getSetting(s, key),
      'settings:set': (key: string, value: string) => setSetting(s, key, value),

      // System
      'system:userInfo': () => getUserInfo()
    }
  }

  private async handleRpc(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req)
      const { method, args } = JSON.parse(body)

      const handler = this.dispatch[method]

      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Unknown method: ${method}` }))
        return
      }

      const result = await handler(...(args || []))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ result }))
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }))
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      req.on('error', reject)
    })
  }

  // ── Static file serving ───────────────────────────────────

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    // Resolve to renderer output directory
    const rendererDir = path.join(__dirname, '../../renderer')
    let filePath = path.join(rendererDir, pathname === '/' ? 'index.html' : pathname)

    // Security: prevent directory traversal
    if (!filePath.startsWith(rendererDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    // If file doesn't exist or is a directory, serve index.html (SPA fallback)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(rendererDir, 'index.html')
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  }
}
