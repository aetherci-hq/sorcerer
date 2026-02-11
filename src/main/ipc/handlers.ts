import { ipcMain, dialog, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
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
  getUserInfo
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
      title: 'Select a Git Repository'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const projectPath = result.filePaths[0]
    const name = path.basename(projectPath)

    // Verify it's a git repo
    const gitDir = path.join(projectPath, '.git')
    if (!fs.existsSync(gitDir)) {
      throw new Error('Not a git repository')
    }

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

  ipcMain.handle('agent:add', (_event, data: { name: string; description?: string; system_prompt?: string; mcp_config?: string }) => {
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
