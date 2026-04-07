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
  listProviders,
  refreshProviders,
  getUserInfo,
  loadQuickNote,
  saveQuickNote,
  deleteQuickNote,
  listQuickNoteParents,
  setSessionRemoteControl,
  setAgentRemoteControl,
  hasClaudeConversation
} from '../ipc/shared-handlers'
import os from 'os'
import { ScrollbackBuffer } from './scrollback'
import { WebSocketHandler } from './ws-handler'
// In dev, read from disk for live reloading. In production, use inlined copy.
import remoteControlHtmlInlined from './remote-control.html?raw'

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
  private _ptyOutputListener: ((sessionId: string, data: string) => void) | null = null
  private _ptyExitListener: ((sessionId: string, exitCode: number) => void) | null = null
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
    this._ptyOutputListener = (sessionId: string, data: string) => {
      this.scrollback.append(sessionId, data)
      this.wsHandler?.broadcastTerminalData(sessionId, data)
    }
    this.services.pty.onOutput(this._ptyOutputListener)

    // Hook into PTY exit → broadcast to WS clients
    this._ptyExitListener = (sessionId: string, exitCode: number) => {
      this.wsHandler?.broadcastTerminalExit(sessionId, exitCode)
    }
    this.services.pty.onExit(this._ptyExitListener)

    // Hook into file watcher events → broadcast to WS clients
    this.services.fileWatcher.onEvent((event, data) => {
      this.wsHandler?.broadcastFileWatcherEvent(event, data)
    })

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject)
      this.httpServer!.listen(this.config.port, this.config.bindAddress, () => {
        this.httpServer!.removeListener('error', reject)
        resolve()
      })
    })

    console.log(`[api-server] Listening on ${this.config.bindAddress}:${this.config.port}`)
  }

  stop(): void {
    // Unhook PTY listeners
    if (this._ptyOutputListener) this.services.pty.removeOutputListener(this._ptyOutputListener)
    if (this._ptyExitListener) this.services.pty.removeExitListener(this._ptyExitListener)
    this._ptyOutputListener = null
    this._ptyExitListener = null

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

  getRemoteSessionIds(): string[] {
    return this.wsHandler?.getRemoteSessionIds() ?? []
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

    // Remote Control — lightweight mobile page
    if (url.pathname === '/rc') {
      const token = url.searchParams.get('token')
      if (token !== this.config.authToken) {
        res.writeHead(401, { 'Content-Type': 'text/plain' })
        res.end('Unauthorized — append ?token=YOUR_TOKEN to the URL')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' })
      // In dev mode, read from disk for live editing. In production, use inlined copy.
      if (process.env.ELECTRON_RENDERER_URL) {
        const diskPath = path.join(__dirname, '../../src/main/server/remote-control.html')
        if (fs.existsSync(diskPath)) {
          res.end(fs.readFileSync(diskPath, 'utf-8'))
        } else {
          res.end(remoteControlHtmlInlined)
        }
      } else {
        res.end(remoteControlHtmlInlined)
      }
      return
    }

    // Serve renderer — proxy to Vite dev server or serve static files
    if (process.env.ELECTRON_RENDERER_URL) {
      this.proxyToVite(req, res)
    } else {
      this.serveStatic(url.pathname, res)
    }
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
      'project:reorder': (projectIds: string[]) => s.db.reorderProjects(projectIds),
      'project:sync-worktrees': (projectId: string) => syncWorktrees(s, projectId),
      'project:git-status': (projectPath: string) => getProjectGitStatus(s, projectPath),

      // Project groups
      'project-group:list': () => s.db.listProjectGroups(),
      'project-group:add': (name: string) => {
        const { v4: uuidv4 } = require('uuid')
        return s.db.addProjectGroup(uuidv4(), name)
      },
      'project-group:update': (id: string, updates: { name?: string }) => s.db.updateProjectGroup(id, updates),
      'project-group:remove': (id: string) => s.db.removeProjectGroup(id),
      'project-group:reorder': (groupIds: string[]) => s.db.reorderProjectGroups(groupIds),

      // Agent groups
      'agent-group:list': () => s.db.listAgentGroups(),
      'agent-group:add': (name: string) => {
        const { v4: uuidv4 } = require('uuid')
        return s.db.addAgentGroup(uuidv4(), name)
      },
      'agent-group:update': (id: string, updates: { name?: string }) => s.db.updateAgentGroup(id, updates),
      'agent-group:remove': (id: string) => s.db.removeAgentGroup(id),
      'agent-group:reorder': (groupIds: string[]) => s.db.reorderAgentGroups(groupIds),

      // Session
      'session:list': (projectId?: string) => listSessions(s, projectId),
      'session:create': (projectId: string, name: string, useMainRepo?: boolean, bypassPermissions?: boolean, remoteControl?: boolean, provider?: string, model?: string) =>
        createSession(s, projectId, name, useMainRepo, bypassPermissions, remoteControl, provider, model),
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
      'session:set-remote-control': (sessionId: string, enabled: boolean) =>
        setSessionRemoteControl(s, sessionId, enabled),
      'session:open-remote': (_sessionId: string) => {
        // Remote clients should navigate via browser — no shell.openExternal available
        return { opened: false, error: 'Use browser navigation for remote clients' }
      },
      'session:has-conversation': (sessionId: string) => {
        const session = s.db.getSession(sessionId)
        if (!session) return false
        const cwd = fs.existsSync(session.worktree_path as string)
          ? (session.worktree_path as string)
          : (s.db.getProject(session.project_id as string)?.path as string)
        if (!cwd) return false
        return hasClaudeConversation(cwd)
      },

      // Agent
      'agent:list': () => listAgents(s),
      'agent:add': (data: any) => addAgent(s, data),
      'agent:update': (id: string, updates: any) => updateAgent(s, id, updates),
      'agent:remove': (id: string) => removeAgent(s, id),
      'agent:start': (id: string) => startAgent(s, id),
      'agent:has-conversation': (agentId: string) => {
        const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
        if (!fs.existsSync(cwd)) return false
        return hasClaudeConversation(cwd)
      },
      'agent:resume': (id: string) => resumeAgent(s, id),
      'agent:restart': (id: string) => restartAgent(s, id),
      'agent:kill': (id: string) => killAgent(s, id),
      'agent:set-remote-control': (agentId: string, enabled: boolean) =>
        setAgentRemoteControl(s, agentId, enabled),
      'agent:create-quick-terminal': (agentId: string) => createAgentQuickTerminal(s, agentId),

      // Teams
      'teams:list': () => listTeams(s),
      'teams:tasks': (teamName: string) => getTeamTasks(s, teamName),
      'teams:inbox': (teamName: string, agentName: string) => getTeamInbox(s, teamName, agentName),

      // Quick Notes
      'quick-notes:load': (parentId: string, parentType: string) => loadQuickNote(s, parentId, parentType),
      'quick-notes:save': (id: string, parentId: string, parentType: string, content: string) => saveQuickNote(s, id, parentId, parentType, content),
      'quick-notes:delete': (parentId: string, parentType: string) => deleteQuickNote(s, parentId, parentType),
      'quick-notes:list-parents': () => listQuickNoteParents(s),

      // Briefing
      'briefing:generate': async () => {
        const { v4: uuidv4 } = require('uuid')
        const { generateBriefing } = await import('../services/briefing-service')
        const result = await generateBriefing(s.db, s.pty)
        if (result.text && !result.error) {
          s.db.saveBriefing(uuidv4(), result.text, result.provider, result.model)
        }
        return result
      },
      'briefing:list': (limit?: number) => s.db.listBriefings(limit || 20),
      'briefing:delete': (id: string) => s.db.deleteBriefing(id),

      // Settings
      'settings:get': (key: string) => getSetting(s, key),
      'settings:set': (key: string, value: string) => setSetting(s, key, value),
      'provider:list': () => listProviders(s),
      'provider:refresh': () => refreshProviders(s),

      // System
      'system:userInfo': () => getUserInfo(),
      'system:remoteSessionIds': () => this.wsHandler?.getRemoteSessionIds() ?? []
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

  // ── Dev proxy to Vite ────────────────────────────────────

  private proxyToVite(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    // Only forward the pathname+query to the Vite dev server, never an arbitrary host.
    // Construct the target URL entirely from the trusted base — only the path comes from the request.
    const base = new URL(process.env.ELECTRON_RENDERER_URL!)
    const reqPath = (req.url || '/').replace(/^[a-zA-Z]+:\/\/[^/]*/, '') // strip any scheme+host
    const viteUrl = new URL(reqPath, base.origin)
    const proxyReq = http.request(
      viteUrl,
      { method: req.method, headers: req.headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
      }
    )
    proxyReq.on('error', () => {
      res.writeHead(502)
      res.end('Vite dev server unavailable')
    })
    req.pipe(proxyReq)
  }

  // ── Static file serving ───────────────────────────────────

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    // Resolve to renderer output directory
    const rendererDir = path.join(__dirname, '../renderer')
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
