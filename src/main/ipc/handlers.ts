import { ipcMain, dialog, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { PTYService } from '../services/pty-service'
import { DatabaseService } from '../services/database-service'
import { WorktreeService } from '../services/worktree-service'
import { FileWatcherService } from '../services/file-watcher-service'
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
  updateAgent as updateAgentHandler,
  removeAgent,
  startAgent,
  resumeAgent,
  restartAgent,
  createAgentQuickTerminal,
  killAgent,
  terminalWrite,
  terminalResize,
  listTeams,
  getTeamTasks,
  getTeamInbox,
  getSetting,
  setSetting,
  getUserInfo,
  loadQuickNote,
  saveQuickNote,
  deleteQuickNote
} from './shared-handlers'

let globalApiServer: any = null

export function getGlobalApiServer(): any { return globalApiServer }
export function setGlobalApiServer(server: any): void { globalApiServer = server }

export function registerIPC(
  ptyService: PTYService,
  dbService: DatabaseService,
  worktreeService: WorktreeService,
  fileWatcherService: FileWatcherService
): void {
  const services: HandlerServices = {
    db: dbService,
    pty: ptyService,
    worktree: worktreeService,
    fileWatcher: fileWatcherService
  }

  // ── Project operations ──────────────────────────────────────

  ipcMain.handle('project:list', () => {
    return listProjects(services)
  })

  // Electron-only: uses dialog.showOpenDialog
  ipcMain.handle('project:add', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select a Project Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const projectPath = result.filePaths[0]
    const name = path.basename(projectPath)

    // Check if project already exists
    const existing = dbService.listProjects().find((p: any) => p.path === projectPath)
    if (existing) {
      return existing // Return existing project instead of erroring
    }

    const id = uuidv4()
    return dbService.addProject(id, name, projectPath)
  })

  ipcMain.handle('project:addPath', (_event, projectPath: string, customName?: string) => {
    return addProjectByPath(services, projectPath, customName)
  })

  // ── Workspace orphan detection ─────────────────────────────

  ipcMain.handle('workspace:scan-orphans', () => {
    const root = worktreeService.getWorkspacesRoot()
    if (!fs.existsSync(root)) return []

    const projects = dbService.listProjects()
    const knownNames = new Set(projects.map((p: any) => path.basename(p.path)))

    // Load dismissed list
    const dismissedRaw = dbService.getSetting('dismissedWorkspaces')
    const dismissed = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : [])

    const entries = fs.readdirSync(root, { withFileTypes: true })
    const orphans: { dirName: string; sessionCount: number; fullPath: string }[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (knownNames.has(entry.name)) continue
      if (dismissed.has(entry.name)) continue

      const dirPath = path.join(root, entry.name)
      // Count child directories (sessions)
      let sessionCount = 0
      try {
        const children = fs.readdirSync(dirPath, { withFileTypes: true })
        sessionCount = children.filter((c) => c.isDirectory()).length
      } catch { /* skip unreadable */ }

      if (sessionCount > 0) {
        orphans.push({ dirName: entry.name, sessionCount, fullPath: dirPath })
      }
    }

    return orphans
  })

  ipcMain.handle('workspace:dismiss-orphan', (_event, dirName: string) => {
    const raw = dbService.getSetting('dismissedWorkspaces')
    const list: string[] = raw ? JSON.parse(raw) : []
    if (!list.includes(dirName)) {
      list.push(dirName)
    }
    dbService.setSetting('dismissedWorkspaces', JSON.stringify(list))
  })

  // ── Agent orphan detection ──────────────────────────────────

  ipcMain.handle('workspace:scan-orphan-agents', () => {
    const agentsRoot = path.join(os.homedir(), '.sorcerer', 'agents')
    if (!fs.existsSync(agentsRoot)) return []

    const knownAgents = dbService.listAgents()
    const knownIds = new Set(knownAgents.map((a: any) => a.id))

    const dismissedRaw = dbService.getSetting('dismissedAgents')
    const dismissed = new Set<string>(dismissedRaw ? JSON.parse(dismissedRaw) : [])

    const entries = fs.readdirSync(agentsRoot, { withFileTypes: true })
    const orphans: { dirName: string; agentName: string; fullPath: string; hasManifest: boolean; manifest?: any }[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (knownIds.has(entry.name)) continue
      if (dismissed.has(entry.name)) continue

      const dirPath = path.join(agentsRoot, entry.name)
      const manifestPath = path.join(dirPath, 'agent.json')
      let hasManifest = false
      let manifest: any = null
      let agentName = entry.name

      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          hasManifest = true
          if (manifest.name) agentName = manifest.name
        } catch { /* ignore corrupt manifest */ }
      }

      orphans.push({ dirName: entry.name, agentName, fullPath: dirPath, hasManifest, manifest })
    }

    return orphans
  })

  ipcMain.handle('workspace:dismiss-orphan-agent', (_event, dirName: string) => {
    const raw = dbService.getSetting('dismissedAgents')
    const list: string[] = raw ? JSON.parse(raw) : []
    if (!list.includes(dirName)) {
      list.push(dirName)
    }
    dbService.setSetting('dismissedAgents', JSON.stringify(list))
  })

  ipcMain.handle('project:update', (_event, id: string, updates: any) => {
    return updateProject(services, id, updates)
  })

  ipcMain.handle('project:remove', (_event, id: string) => {
    return removeProject(services, id)
  })

  ipcMain.handle('project:sync-worktrees', async (_event, projectId: string) => {
    return syncWorktrees(services, projectId)
  })

  ipcMain.handle('project:git-status', async (_event, projectPath: string) => {
    return getProjectGitStatus(services, projectPath)
  })

  // ── Session operations ──────────────────────────────────────

  // Load custom shell setting on startup
  const customShell = dbService.getSetting('shell')
  if (customShell) {
    ptyService.setCustomShell(customShell)
  }

  ipcMain.handle('session:list', (_event, projectId?: string) => {
    return listSessions(services, projectId)
  })

  ipcMain.handle('session:create', async (_event, projectId: string, sessionName: string, useMainRepo?: boolean) => {
    return createSession(services, projectId, sessionName, useMainRepo)
  })

  ipcMain.handle('session:spawn-shell', (_event, sessionId: string, cwd: string) => {
    return spawnShell(services, sessionId, cwd)
  })

  ipcMain.handle('session:create-quick-terminal', async (_event, sourceSessionId: string) => {
    return createQuickTerminal(services, sourceSessionId)
  })

  ipcMain.handle('session:create-project-quick-terminal', async (_event, projectId: string) => {
    const project = dbService.getProject(projectId)
    if (!project) throw new Error('Project not found')

    // Generate unique name
    const projectSessions = dbService.listSessions(projectId)
    const terminalNames = projectSessions
      .filter((s: any) => s.type === 'quick-terminal' && s.status !== 'deleted')
      .map((s: any) => s.name as string)
    let name = 'Terminal'
    if (terminalNames.includes(name)) {
      let n = 2
      while (terminalNames.includes(`Terminal (${n})`)) n++
      name = `Terminal (${n})`
    }

    // Get current branch
    let branch = 'main'
    try {
      branch = (await simpleGit(project.path as string).revparse(['--abbrev-ref', 'HEAD'])).trim()
    } catch { /* fallback to main */ }

    const id = uuidv4()
    const session = dbService.addSession({
      id,
      project_id: projectId,
      name,
      branch,
      worktree_path: project.path as string,
      type: 'quick-terminal'
    })

    // Spawn plain shell in project root
    ptyService.spawn(id, project.path as string)
    const pid = ptyService.getPid(id)
    if (pid) {
      dbService.updateSession(id, { pid })
    }

    return session
  })

  ipcMain.handle('session:rename', (_event, sessionId: string, newName: string) => {
    return renameSession(services, sessionId, newName)
  })

  ipcMain.handle('session:kill', (_event, sessionId: string) => {
    return killSession(services, sessionId)
  })

  ipcMain.handle('session:archive', async (_event, sessionId: string) => {
    return archiveSession(services, sessionId)
  })

  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    return deleteSession(services, sessionId)
  })

  ipcMain.handle('session:restart', async (_event, sessionId: string) => {
    return restartSession(services, sessionId)
  })

  ipcMain.handle('session:resume', async (_event, sessionId: string) => {
    return resumeSession(services, sessionId)
  })

  ipcMain.handle('session:set-team', (_event, sessionId: string, teamName: string | null) => {
    return setSessionTeam(services, sessionId, teamName)
  })

  ipcMain.handle('session:push-branch', async (_event, sessionId: string) => {
    return pushSessionBranch(services, sessionId)
  })

  // Electron-only: uses shell.openExternal
  ipcMain.handle('session:open-remote', async (_event, sessionId: string) => {
    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const project = dbService.getProject(session.project_id as string)
    if (!project) throw new Error('Project not found')

    const url = await worktreeService.getRemoteUrl(project.path as string)
    if (url) {
      shell.openExternal(url)
      return { opened: true, url }
    }
    return { opened: false, error: 'No remote URL found' }
  })

  ipcMain.handle('session:check-delete-safety', async (_event, sessionId: string) => {
    return checkDeleteSafety(services, sessionId)
  })

  ipcMain.handle('session:git-status', async (_event, sessionId: string) => {
    return getSessionGitStatus(services, sessionId)
  })

  ipcMain.handle('session:land-on-main', async (_event, sessionId: string) => {
    return landOnMain(services, sessionId)
  })

  ipcMain.handle('session:restore', (_event, sessionId: string) => {
    return restoreSession(services, sessionId)
  })

  // ── Agent operations ───────────────────────────────────────

  ipcMain.handle('agent:list', () => {
    return listAgents(services)
  })

  ipcMain.handle('agent:add', (_event, data: { id?: string; name: string; description?: string; system_prompt?: string; mcp_config?: string }) => {
    return addAgent(services, data)
  })

  ipcMain.handle('agent:update', (_event, id: string, updates: any) => {
    return updateAgentHandler(services, id, updates)
  })

  ipcMain.handle('agent:remove', (_event, id: string) => {
    return removeAgent(services, id)
  })

  ipcMain.handle('agent:start', (_event, agentId: string) => {
    return startAgent(services, agentId)
  })

  ipcMain.handle('agent:resume', (_event, agentId: string) => {
    return resumeAgent(services, agentId)
  })

  ipcMain.handle('agent:restart', (_event, agentId: string) => {
    return restartAgent(services, agentId)
  })

  ipcMain.handle('agent:create-quick-terminal', (_event, agentId: string) => {
    return createAgentQuickTerminal(services, agentId)
  })

  ipcMain.handle('agent:kill', (_event, agentId: string) => {
    return killAgent(services, agentId)
  })

  // ── Terminal I/O ────────────────────────────────────────────

  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    terminalWrite(services, sessionId, data)
  })

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    terminalResize(services, sessionId, cols, rows)
  })

  // ── Team/agent monitoring ───────────────────────────────────

  ipcMain.handle('teams:list', () => {
    return listTeams(services)
  })

  ipcMain.handle('teams:tasks', (_event, teamName: string) => {
    return getTeamTasks(services, teamName)
  })

  ipcMain.handle('teams:inbox', (_event, teamName: string, agentName: string) => {
    return getTeamInbox(services, teamName, agentName)
  })

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle('settings:get', (_event, key: string) => {
    return getSetting(services, key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    return setSetting(services, key, value)
  })

  // ── Quick Notes ─────────────────────────────────────────────

  ipcMain.handle('quick-notes:load', (_event, parentId: string, parentType: string) => {
    return loadQuickNote(services, parentId, parentType)
  })

  ipcMain.handle('quick-notes:save', (_event, id: string, parentId: string, parentType: string, content: string) => {
    return saveQuickNote(services, id, parentId, parentType, content)
  })

  ipcMain.handle('quick-notes:delete', (_event, parentId: string, parentType: string) => {
    return deleteQuickNote(services, parentId, parentType)
  })

  // ── System info ─────────────────────────────────────────────

  ipcMain.handle('system:userInfo', () => {
    return getUserInfo()
  })

  // ── Remote access ──────────────────────────────────────────

  ipcMain.handle('remote:status', () => {
    return {
      running: globalApiServer?.isRunning() ?? false,
      port: dbService.getSetting('remotePort') || '7437',
      bindAddress: dbService.getSetting('remoteBindAddress') || '127.0.0.1',
      token: dbService.getSetting('remoteAuthToken') || ''
    }
  })

  ipcMain.handle('remote:enable', async () => {
    const { ApiServer } = await import('../server/api-server')
    const { getOrCreateAuthToken } = await import('../server/auth')

    const port = parseInt(dbService.getSetting('remotePort') || '7437')
    const bindAddress = dbService.getSetting('remoteBindAddress') || '127.0.0.1'
    const authToken = getOrCreateAuthToken(dbService)

    if (globalApiServer) globalApiServer.stop()
    globalApiServer = new ApiServer(services, { port, bindAddress, authToken })
    await globalApiServer.start()
    dbService.setSetting('remoteEnabled', 'true')
    return { port, bindAddress, token: authToken }
  })

  ipcMain.handle('remote:disable', () => {
    if (globalApiServer) { globalApiServer.stop(); globalApiServer = null }
    dbService.setSetting('remoteEnabled', 'false')
  })

  ipcMain.handle('remote:regenerate-token', async () => {
    const { regenerateAuthToken } = await import('../server/auth')
    const token = regenerateAuthToken(dbService)
    return token
  })

  ipcMain.handle('remote:update-config', (_event, config: { port?: number; bindAddress?: string }) => {
    if (config.port !== undefined) dbService.setSetting('remotePort', String(config.port))
    if (config.bindAddress !== undefined) dbService.setSetting('remoteBindAddress', config.bindAddress)
  })

  // Electron-only: uses child_process execSync and Windows registry
  ipcMain.handle('system:accountPicture', () => {
    // Windows: read account picture path from registry
    if (process.platform !== 'win32') return null
    try {
      const { execSync } = require('child_process')
      const regPath = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AccountPicture\\Users'
      const sidOutput = execSync(`reg query "${regPath}" /f * /k`, { encoding: 'utf8' })
      // Find the SID subkey for the current user
      const sidMatch = sidOutput.match(new RegExp(`${regPath.replace(/\\/g, '\\\\')}\\\\(S-[\\d-]+)`, 'i'))
      if (!sidMatch) return null
      const sid = sidMatch[1]
      // Query the Image96 value (good size for avatars)
      const imgOutput = execSync(`reg query "${regPath}\\${sid}" /v Image96`, { encoding: 'utf8' })
      const pathMatch = imgOutput.match(/Image96\s+REG_SZ\s+(.+)/i)
      if (!pathMatch) return null
      const imgPath = pathMatch[1].trim()
      if (!fs.existsSync(imgPath)) return null
      // Read and return as data URL
      const buf = fs.readFileSync(imgPath)
      const ext = path.extname(imgPath).slice(1) || 'jpg'
      return `data:image/${ext};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
}
