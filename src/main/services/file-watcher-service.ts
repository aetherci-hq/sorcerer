import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { DatabaseService } from './database-service'

interface RawTeamConfig {
  name: string
  description?: string
  createdAt?: number
  leadAgentId?: string
  leadSessionId?: string
  members: Array<{
    agentId: string
    name: string
    agentType?: string
    cwd?: string
    isActive?: boolean
  }>
}

interface TeamConfig {
  name: string
  description?: string
  members: TeamMember[]
}

interface TeamMember {
  name: string
  agentType?: string
  status?: string
  activeTask?: string
}

interface TaskData {
  id: string
  subject: string
  description: string
  activeForm?: string
  status: string
  owner?: string
  blocks: string[]
  blockedBy: string[]
  metadata?: Record<string, any>
}

export class FileWatcherService {
  private mainWindow: BrowserWindow
  private dbService: DatabaseService
  private teamsWatcher: any = null
  private tasksWatcher: any = null
  private claudeDirWatcher: any = null
  private claudeDir: string
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map()
  private autoLinkTimer: NodeJS.Timeout | null = null

  constructor(mainWindow: BrowserWindow, dbService: DatabaseService) {
    this.mainWindow = mainWindow
    this.dbService = dbService
    this.claudeDir = path.join(os.homedir(), '.claude')
    this.startWatching()
  }

  private startWatching(): void {
    const teamsDir = path.join(this.claudeDir, 'teams')
    const tasksDir = path.join(this.claudeDir, 'tasks')

    if (fs.existsSync(teamsDir)) {
      this.watchTeams(teamsDir)
    }

    if (fs.existsSync(tasksDir)) {
      this.watchTasks(tasksDir)
    }

    // Watch for directory creation if they don't exist yet
    if (!fs.existsSync(teamsDir) || !fs.existsSync(tasksDir)) {
      if (!fs.existsSync(this.claudeDir)) {
        try {
          fs.mkdirSync(this.claudeDir, { recursive: true })
        } catch { /* ignore */ }
      }

      if (fs.existsSync(this.claudeDir)) {
        this.claudeDirWatcher = chokidar.watch(this.claudeDir, {
          persistent: true,
          ignoreInitial: true,
          depth: 0
        })

        this.claudeDirWatcher.on('addDir', (dirPath: string) => {
          const dirName = path.basename(dirPath)
          if (dirName === 'teams' && !this.teamsWatcher) {
            this.watchTeams(dirPath)
            this.debounceEmit('teams-update', { event: 'init' })
          } else if (dirName === 'tasks' && !this.tasksWatcher) {
            this.watchTasks(dirPath)
          }
        })
      }
    }
  }

  private watchTeams(teamsDir: string): void {
    this.teamsWatcher = chokidar.watch(teamsDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 3
    })

    this.teamsWatcher.on('all', (event: string, filePath: string) => {
      this.debounceEmit('teams-update', { event, path: filePath })
      this.debounceAutoLink()
    })
  }

  private watchTasks(tasksDir: string): void {
    this.tasksWatcher = chokidar.watch(tasksDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 2
    })

    this.tasksWatcher.on('all', (event: string, filePath: string) => {
      if (filePath.endsWith('.json') && !filePath.endsWith('.lock')) {
        let teamName = path.basename(path.dirname(filePath))
        // If the directory name is a session ID (UUID), resolve to team name
        if (/^[0-9a-f]{8}-/.test(teamName)) {
          const sessions = this.dbService.listSessions()
          const session = sessions.find((s: any) => s.id === teamName)
          if (session?.team_name) teamName = session.team_name
        }
        this.debounceEmit('tasks-update', { event, path: filePath, teamName })
      }
    })
  }

  private debounceEmit(channel: string, data: any): void {
    const key = `${channel}:${data.teamName || 'global'}`
    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(key, setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(`filewatcher:${channel}`, data)
      }
      this.debounceTimers.delete(key)
    }, 500))
  }

  private debounceAutoLink(): void {
    if (this.autoLinkTimer) clearTimeout(this.autoLinkTimer)
    this.autoLinkTimer = setTimeout(() => {
      this.autoLinkTeams()
      this.autoLinkTimer = null
    }, 1000)
  }

  private readTeamConfig(teamName: string): RawTeamConfig | null {
    const configPath = path.join(this.claudeDir, 'teams', teamName, 'config.json')
    if (!fs.existsSync(configPath)) return null
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch {
      return null
    }
  }

  private pathsMatch(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
  }

  /**
   * Auto-link teams to sessions by matching lead member's cwd to session worktree_path.
   * Also un-links sessions whose team no longer exists.
   */
  private autoLinkTeams(): void {
    const teamsDir = path.join(this.claudeDir, 'teams')
    if (!fs.existsSync(teamsDir)) return

    const sessions = this.dbService.listSessions()
    const activeTeamNames = new Set<string>()

    try {
      const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const teamName = entry.name
        const config = this.readTeamConfig(teamName)
        if (!config) continue

        activeTeamNames.add(teamName)

        // Find the lead member's cwd (first member, or the one named after the lead)
        const leadMember = config.members.find(
          (m) => m.agentId === config.leadAgentId
        ) || config.members[0]
        const leadCwd = leadMember?.cwd
        if (!leadCwd) continue

        // Find matching session
        const match = sessions.find(
          (s: any) => s.worktree_path && this.pathsMatch(s.worktree_path, leadCwd)
        )
        if (match && match.team_name !== teamName) {
          this.dbService.updateSession(match.id, { team_name: teamName })
          this.emitSessionLinked(match.id, teamName)
        }
      }
    } catch { /* ignore */ }

    // Un-link sessions whose team no longer exists
    for (const session of sessions) {
      if (session.team_name && !activeTeamNames.has(session.team_name)) {
        this.dbService.updateSession(session.id, { team_name: null })
        this.emitSessionLinked(session.id, null)
      }
    }
  }

  private emitSessionLinked(sessionId: string, teamName: string | null): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('filewatcher:session-linked', { sessionId, teamName })
    }
  }

  /**
   * List all teams by reading config.json from each team directory.
   * Members come from config.json and are enriched with task-based status.
   */
  listTeams(): TeamConfig[] {
    const teamsDir = path.join(this.claudeDir, 'teams')
    if (!fs.existsSync(teamsDir)) return []

    const teams: TeamConfig[] = []
    try {
      const entries = fs.readdirSync(teamsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const teamName = entry.name
        const config = this.readTeamConfig(teamName)
        if (!config) continue // Skip teams without config.json

        const tasks = this.getTeamTasks(teamName)
        const members: TeamMember[] = []

        for (const rawMember of config.members) {
          const activeTask = tasks.find(
            (t) => t.owner === rawMember.name && t.status === 'in_progress'
          )
          members.push({
            name: rawMember.name,
            agentType: rawMember.agentType,
            status: activeTask ? 'active' : 'idle',
            activeTask: activeTask?.activeForm || activeTask?.subject
          })
        }

        // Sort: active members first, then alphabetical
        members.sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1
          if (a.status !== 'active' && b.status === 'active') return 1
          return a.name.localeCompare(b.name)
        })

        teams.push({ name: teamName, description: config.description, members })
      }
    } catch { /* ignore */ }

    // Run auto-link as side effect for startup recovery
    this.debounceAutoLink()

    return teams
  }

  getTeamTasks(teamName: string): TaskData[] {
    const tasksDir = path.join(this.claudeDir, 'tasks', teamName)
    if (!fs.existsSync(tasksDir)) return []

    const tasks: TaskData[] = []
    try {
      const entries = fs.readdirSync(tasksDir)
      for (const entry of entries) {
        if (entry.endsWith('.json') && !entry.startsWith('.')) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(tasksDir, entry), 'utf8'))
            tasks.push(data)
          } catch { /* skip invalid */ }
        }
      }
    } catch { /* ignore */ }

    return tasks
  }

  getTeamInbox(teamName: string, agentName: string): any[] {
    const inboxPath = path.join(this.claudeDir, 'teams', teamName, 'inboxes', `${agentName}.json`)
    if (!fs.existsSync(inboxPath)) return []

    try {
      return JSON.parse(fs.readFileSync(inboxPath, 'utf8'))
    } catch {
      return []
    }
  }

  close(): void {
    if (this.teamsWatcher) this.teamsWatcher.close()
    if (this.tasksWatcher) this.tasksWatcher.close()
    if (this.claudeDirWatcher) this.claudeDirWatcher.close()
    if (this.autoLinkTimer) clearTimeout(this.autoLinkTimer)
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
  }
}
