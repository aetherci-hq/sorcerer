import { ipcMain, dialog, shell } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import os from 'os'
import simpleGit from 'simple-git'
import { PTYService } from '../services/pty-service'
import { DatabaseService } from '../services/database-service'
import { WorktreeService } from '../services/worktree-service'
import { FileWatcherService } from '../services/file-watcher-service'

/**
 * Build session-scoped env vars for Claude Code.
 * Each session gets its own CLAUDE_CODE_TASK_LIST_ID to prevent cross-session task contamination.
 */
function sessionEnv(sessionId: string): Record<string, string> {
  return {
    CLAUDE_CODE_TASK_LIST_ID: sessionId
  }
}

/** Write an agent.json manifest into the agent's scratch directory. */
function writeAgentManifest(
  agentId: string,
  data: { name: string; description?: string; system_prompt?: string; mcp_config?: string; created_at?: number }
): void {
  const dir = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(dir, { recursive: true })
  const manifest = {
    name: data.name,
    description: data.description || '',
    system_prompt: data.system_prompt || '',
    mcp_config: data.mcp_config || '',
    created_at: data.created_at || Math.floor(Date.now() / 1000)
  }
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

export function registerIPC(
  ptyService: PTYService,
  dbService: DatabaseService,
  worktreeService: WorktreeService,
  fileWatcherService: FileWatcherService
): void {
  // ── Project operations ──────────────────────────────────────

  ipcMain.handle('project:list', () => {
    return dbService.listProjects()
  })

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
    const name = customName || path.basename(projectPath)
    const gitDir = path.join(projectPath, '.git')
    if (!fs.existsSync(gitDir)) {
      throw new Error('Selected directory is not a git repository')
    }
    const existing = dbService.listProjects().find((p: any) => p.path === projectPath)
    if (existing) return existing
    const id = uuidv4()
    return dbService.addProject(id, name, projectPath)
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
    return dbService.updateProject(id, updates)
  })

  ipcMain.handle('project:remove', (_event, id: string) => {
    dbService.removeProject(id)
  })

  ipcMain.handle('project:sync-worktrees', async (_event, projectId: string) => {
    const project = dbService.getProject(projectId)
    if (!project) throw new Error('Project not found')

    const repoName = path.basename(project.path as string)
    const workspacesDir = path.join(os.homedir(), '.sorcerer', 'workspaces', repoName)
    if (!fs.existsSync(workspacesDir)) return { created: 0, removed: 0 }

    // Get existing session worktree paths from DB
    const dbSessions = dbService.listSessions(projectId)
    const dbPaths = new Set(dbSessions.map((s: any) => s.worktree_path))

    // Scan filesystem for worktree directories
    let created = 0
    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = path.join(workspacesDir, entry.name)
      if (dbPaths.has(dirPath)) continue // already registered

      // Try to get branch from git; fall back to .git file content or dir name
      let branch: string | null = null

      // 1. Try live git revparse (works for healthy worktrees)
      const gitPath = path.join(dirPath, '.git')
      if (fs.existsSync(gitPath)) {
        try {
          const git = simpleGit(dirPath)
          branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
        } catch { /* worktree may be broken */ }

        // 2. Parse the .git file for branch hint (worktree .git files contain
        //    "gitdir: ../../.git/worktrees/<branch-name>")
        if (!branch) {
          try {
            const gitContent = fs.readFileSync(gitPath, 'utf8').trim()
            const match = gitContent.match(/worktrees\/(.+)$/)
            if (match) branch = match[1]
          } catch { /* ignore */ }
        }
      }

      // 3. Fall back to directory name (Sorcerer names worktree dirs after the session/branch)
      if (!branch) branch = entry.name

      const id = uuidv4()
      dbService.addSession({
        id,
        project_id: projectId,
        name: entry.name,
        branch,
        worktree_path: dirPath
      })
      created++
    }

    // Clean stale: DB sessions whose worktree_path doesn't exist
    let removed = 0
    for (const session of dbSessions) {
      if (session.worktree_path === project.path) continue // main repo session
      if (session.type === 'quick-terminal') continue
      if (!fs.existsSync(session.worktree_path as string)) {
        dbService.removeSession(session.id)
        removed++
      }
    }

    return { created, removed }
  })

  ipcMain.handle('project:git-status', async (_event, projectPath: string) => {
    try {
      const git = simpleGit(projectPath)
      const [branch, status, log] = await Promise.all([
        git.revparse(['--abbrev-ref', 'HEAD']).catch(() => 'unknown'),
        git.status(),
        git.log({ maxCount: 1 }).catch(() => null)
      ])

      // Ahead/behind from tracking branch
      let ahead = 0
      let behind = 0
      try {
        const tracking = status.tracking
        if (tracking) {
          ahead = status.ahead
          behind = status.behind
        }
      } catch { /* no tracking */ }

      return {
        branch: branch.trim(),
        dirty: !status.isClean(),
        modified: status.modified.length + status.renamed.length,
        staged: status.staged.length,
        untracked: status.not_added.length,
        ahead,
        behind,
        lastCommit: log?.latest?.message || null,
        lastCommitDate: log?.latest?.date || null
      }
    } catch {
      return null
    }
  })

  // ── Session operations ──────────────────────────────────────

  // Load custom shell setting on startup
  const customShell = dbService.getSetting('shell')
  if (customShell) {
    ptyService.setCustomShell(customShell)
  }

  ipcMain.handle('session:list', (_event, projectId?: string) => {
    return dbService.listSessions(projectId)
  })

  ipcMain.handle('session:create', async (_event, projectId: string, sessionName: string, useMainRepo?: boolean) => {
    console.log('[session:create] Starting:', { projectId, sessionName, useMainRepo })
    const project = dbService.getProject(projectId)
    if (!project) throw new Error('Project not found')
    console.log('[session:create] Project found:', project.path)

    let worktreePath: string
    let branch: string

    if (useMainRepo) {
      // Work directly in the main repository — no worktree
      worktreePath = project.path as string
      branch = await simpleGit(project.path as string).revparse(['--abbrev-ref', 'HEAD'])
      branch = branch.trim()
      console.log('[session:create] Using main repo:', { worktreePath, branch })
    } else {
      // Create git worktree
      const result = await worktreeService.create(project.path, sessionName)
      worktreePath = result.worktreePath
      branch = result.branch
      console.log('[session:create] Worktree created:', { worktreePath, branch })
    }

    // Create session record
    const id = uuidv4()
    const session = dbService.addSession({
      id,
      project_id: projectId,
      name: sessionName,
      branch,
      worktree_path: worktreePath
    })
    console.log('[session:create] Session saved:', { id, status: session?.status })

    // Spawn Claude Code directly in the worktree — no shell prompt visible
    ptyService.spawn(id, worktreePath, {
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      env: sessionEnv(id)
    })
    const pid = ptyService.getPid(id)
    console.log('[session:create] Claude spawned, pid:', pid)
    if (pid) {
      dbService.updateSession(id, { pid })
    }

    // Push branch to remote on creation (fire-and-forget) — skip for main repo sessions
    if (!useMainRepo) {
      worktreeService.pushBranch(project.path, branch).then((r) => {
        if (r.pushed) console.log('[session:create] Branch pushed to remote')
        else console.log('[session:create] Push skipped:', r.error)
      })
    }

    return session
  })

  ipcMain.handle('session:spawn-shell', (_event, sessionId: string, cwd: string) => {
    // Spawn a plain shell session (no worktree needed)
    ptyService.spawn(sessionId, cwd)
    const pid = ptyService.getPid(sessionId)
    return { pid }
  })

  ipcMain.handle('session:create-quick-terminal', async (_event, sourceSessionId: string) => {
    const source = dbService.getSession(sourceSessionId)
    if (!source) throw new Error('Source session not found')

    // Generate unique name: "Terminal", "Terminal (2)", etc.
    const projectSessions = dbService.listSessions(source.project_id as string)
    const terminalNames = projectSessions
      .filter((s: any) => s.type === 'quick-terminal' && s.status !== 'deleted')
      .map((s: any) => s.name as string)
    let name = 'Terminal'
    if (terminalNames.includes(name)) {
      let n = 2
      while (terminalNames.includes(`Terminal (${n})`)) n++
      name = `Terminal (${n})`
    }

    const id = uuidv4()
    const session = dbService.addSession({
      id,
      project_id: source.project_id as string,
      name,
      branch: source.branch as string,
      worktree_path: source.worktree_path as string,
      type: 'quick-terminal'
    })

    // Spawn plain shell (no command = default shell)
    ptyService.spawn(id, source.worktree_path as string)
    const pid = ptyService.getPid(id)
    if (pid) {
      dbService.updateSession(id, { pid })
    }

    return session
  })

  ipcMain.handle('session:rename', (_event, sessionId: string, newName: string) => {
    dbService.updateSession(sessionId, { name: newName })
    return dbService.getSession(sessionId)
  })

  ipcMain.handle('session:kill', (_event, sessionId: string) => {
    ptyService.kill(sessionId)
    dbService.updateSession(sessionId, { status: 'idle', pid: null })
  })

  ipcMain.handle('session:archive', async (_event, sessionId: string) => {
    ptyService.kill(sessionId)

    const session = dbService.getSession(sessionId)

    // Quick terminals: just kill and delete — no archiving
    if (session && session.type === 'quick-terminal') {
      dbService.removeSession(sessionId)
      return
    }

    if (session) {
      const project = dbService.getProject(session.project_id)
      const isMainRepo = project && session.worktree_path === project.path

      // Auto-commit dirty work (non-destructive — worktree stays alive) — skip for main repo
      if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
        const commitResult = await worktreeService.autoCommit(session.worktree_path as string)
        if (commitResult.committed) {
          console.log('[session:archive] Auto-committed:', commitResult.message)
        }
      }

      // Push to remote (fire-and-forget) — skip for main repo
      if (!isMainRepo && project && session.branch) {
        worktreeService.pushBranch(project.path as string, session.branch as string).then((r) => {
          if (r.pushed) console.log('[session:archive] Pushed to remote')
          else console.log('[session:archive] Push skipped:', r.error)
        })
      }
    }

    dbService.updateSession(sessionId, {
      status: 'archived',
      pid: null,
      archived_at: Math.floor(Date.now() / 1000)
    })
  })

  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    if (ptyService.isRunning(sessionId)) {
      ptyService.kill(sessionId)
    }

    const session = dbService.getSession(sessionId)

    // Quick terminals: just kill PTY and remove DB record — no worktree/branch ops
    if (session && session.type === 'quick-terminal') {
      dbService.removeSession(sessionId)
      return
    }

    if (session) {
      const project = dbService.getProject(session.project_id as string)
      const isMainRepo = project && session.worktree_path === project.path

      // Auto-commit dirty work before destruction — skip for main repo
      if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
        const commitResult = await worktreeService.autoCommit(session.worktree_path as string)
        if (commitResult.committed) {
          console.log('[session:delete] Auto-committed:', commitResult.message)
        }
      }

      // Push to remote (blocking — ensure backup before destruction) — skip for main repo
      if (!isMainRepo && project && session.branch) {
        const pushResult = await worktreeService.pushBranch(project.path as string, session.branch as string)
        if (pushResult.pushed) {
          console.log('[session:delete] Pushed to remote before deletion')
        } else {
          console.log('[session:delete] Push skipped:', pushResult.error)
        }
      }

      // Remove worktree + local branch — skip for main repo
      if (!isMainRepo && project && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
        try {
          await worktreeService.remove(project.path as string, session.worktree_path as string, session.branch as string)
        } catch (err) {
          console.log('[session:delete] Worktree cleanup failed (may already be removed):', err)
        }
      }

      // Delete remote branch (fire-and-forget) — skip for main repo
      if (!isMainRepo && project && session.branch) {
        worktreeService.deleteRemoteBranch(project.path as string, session.branch as string).then((r) => {
          if (r.deleted) console.log('[session:delete] Remote branch deleted')
        })
      }
    }

    dbService.removeSession(sessionId)
  })

  ipcMain.handle('session:restart', async (_event, sessionId: string) => {
    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    // Kill existing process if running
    if (ptyService.isRunning(sessionId)) {
      ptyService.kill(sessionId)
    }

    // Check if worktree directory still exists
    const cwd = fs.existsSync(session.worktree_path as string)
      ? (session.worktree_path as string)
      : (dbService.getProject(session.project_id as string)?.path as string || process.cwd())

    if (session.type === 'quick-terminal') {
      // Quick terminal: spawn plain shell
      ptyService.spawn(sessionId, cwd)
    } else {
      // Re-spawn Claude Code directly in the worktree (fresh session)
      ptyService.spawn(sessionId, cwd, {
        command: 'claude',
        args: ['--dangerously-skip-permissions'],
        env: sessionEnv(sessionId)
      })
    }
    const pid = ptyService.getPid(sessionId)
    dbService.updateSession(sessionId, { status: 'active', pid: pid ?? null })

    return dbService.getSession(sessionId)
  })

  ipcMain.handle('session:resume', async (_event, sessionId: string) => {
    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    // Kill existing process if running
    if (ptyService.isRunning(sessionId)) {
      ptyService.kill(sessionId)
    }

    // Check if worktree directory still exists
    const cwd = fs.existsSync(session.worktree_path as string)
      ? (session.worktree_path as string)
      : (dbService.getProject(session.project_id as string)?.path as string || process.cwd())

    if (session.type === 'quick-terminal') {
      // Quick terminal: just restart the shell (no Claude conversation to resume)
      ptyService.spawn(sessionId, cwd)
    } else {
      // Resume the most recent Claude Code conversation in this worktree
      ptyService.spawn(sessionId, cwd, {
        command: 'claude',
        args: ['--continue', '--dangerously-skip-permissions'],
        env: sessionEnv(sessionId)
      })
    }
    const pid = ptyService.getPid(sessionId)
    dbService.updateSession(sessionId, { status: 'active', pid: pid ?? null })

    return dbService.getSession(sessionId)
  })

  ipcMain.handle('session:set-team', (_event, sessionId: string, teamName: string | null) => {
    dbService.updateSession(sessionId, { team_name: teamName })
    return dbService.getSession(sessionId)
  })

  ipcMain.handle('session:push-branch', async (_event, sessionId: string) => {
    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const project = dbService.getProject(session.project_id as string)
    if (!project) throw new Error('Project not found')

    const isMainRepo = session.worktree_path === project.path

    // Auto-commit first — skip for main repo sessions
    if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      const commitResult = await worktreeService.autoCommit(session.worktree_path as string)
      if (commitResult.committed) {
        console.log('[session:push-branch] Auto-committed:', commitResult.message)
      }
    }

    return worktreeService.pushBranch(project.path as string, session.branch as string)
  })

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
    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    // Quick terminals have no worktree to protect
    if (session.type === 'quick-terminal') {
      return { dirty: false, unmergedCount: 0, hasRemote: false }
    }

    const project = dbService.getProject(session.project_id as string)
    if (!project) return { dirty: false, unmergedCount: 0, hasRemote: false }

    let dirty = false
    if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      try {
        const git = simpleGit(session.worktree_path as string)
        const status = await git.status()
        dirty = !status.isClean()
      } catch { /* ignore */ }
    }

    const { count: unmergedCount } = await worktreeService.hasUnmergedCommits(project.path as string, session.branch as string)

    let hasRemote = false
    try {
      const git = simpleGit(project.path as string)
      const remotes = await git.getRemotes(true)
      hasRemote = remotes.some((r) => r.name === 'origin')
    } catch { /* ignore */ }

    return { dirty, unmergedCount, hasRemote }
  })

  ipcMain.handle('session:git-status', async (_event, sessionId: string) => {
    const session = dbService.getSession(sessionId)
    if (!session) return null
    if (!session.worktree_path || !fs.existsSync(session.worktree_path as string)) return null
    return worktreeService.getSessionGitStatus(session.worktree_path as string)
  })

  ipcMain.handle('session:land-on-main', async (_event, sessionId: string) => {
    // Kill running process if active
    if (ptyService.isRunning(sessionId)) {
      ptyService.kill(sessionId)
    }

    const session = dbService.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const project = dbService.getProject(session.project_id as string)
    if (!project) throw new Error('Project not found')

    // Main repo sessions have nothing to land — already on main
    if (session.worktree_path === project.path) {
      return { landed: false, error: 'Cannot land a main repository session — it is already working in the main repo.' }
    }

    // Auto-commit dirty work in the worktree
    if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      const commitResult = await worktreeService.autoCommit(session.worktree_path as string)
      if (commitResult.committed) {
        console.log('[session:land-on-main] Auto-committed:', commitResult.message)
      }
    }

    // Squash merge to main
    const mergeResult = await worktreeService.squashMergeToMain(
      project.path as string,
      session.branch as string,
      session.name as string
    )

    if (!mergeResult.merged) {
      return { landed: false, error: mergeResult.error }
    }

    // Remove worktree + local branch
    if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      try {
        await worktreeService.remove(project.path as string, session.worktree_path as string, session.branch as string)
      } catch (err) {
        console.log('[session:land-on-main] Worktree cleanup failed:', err)
      }
    }

    // Delete remote branch (fire-and-forget)
    if (session.branch) {
      worktreeService.deleteRemoteBranch(project.path as string, session.branch as string).then((r) => {
        if (r.deleted) console.log('[session:land-on-main] Remote branch deleted')
      })
    }

    // Remove session from DB
    dbService.removeSession(sessionId)

    return { landed: true }
  })

  ipcMain.handle('session:restore', (_event, sessionId: string) => {
    dbService.updateSession(sessionId, { status: 'idle', archived_at: null })
    return dbService.getSession(sessionId)
  })

  // ── Agent operations ───────────────────────────────────────

  ipcMain.handle('agent:list', () => {
    return dbService.listAgents()
  })

  ipcMain.handle('agent:add', (_event, data: { id?: string; name: string; description?: string; system_prompt?: string; mcp_config?: string }) => {
    const id = data.id || uuidv4()
    // Create scratch directory for this agent
    const cwd = path.join(os.homedir(), '.sorcerer', 'agents', id)
    fs.mkdirSync(cwd, { recursive: true })
    const agent = dbService.addAgent({ id, ...data })
    writeAgentManifest(id, data)
    return agent
  })

  ipcMain.handle('agent:update', (_event, id: string, updates: any) => {
    const agent = dbService.updateAgent(id, updates)
    // Keep manifest in sync when metadata changes
    if (agent && (updates.name || updates.description || updates.system_prompt || updates.mcp_config)) {
      writeAgentManifest(id, {
        name: agent.name as string,
        description: agent.description as string,
        system_prompt: agent.system_prompt as string,
        mcp_config: agent.mcp_config as string,
        created_at: agent.created_at as number
      })
    }
    return agent
  })

  ipcMain.handle('agent:remove', (_event, id: string) => {
    if (ptyService.isRunning(id)) {
      ptyService.kill(id)
    }
    dbService.removeAgent(id)
    // Remove manifest immediately (not locked) so orphan scanner won't offer re-import
    const agentDir = path.join(os.homedir(), '.sorcerer', 'agents', id)
    const manifestPath = path.join(agentDir, 'agent.json')
    try { fs.unlinkSync(manifestPath) } catch { /* already gone */ }
    // Attempt full directory cleanup after PTY file handles are released
    setTimeout(() => {
      try {
        fs.rmSync(agentDir, { recursive: true, force: true })
      } catch { /* will be cleaned up on next restart or manually */ }
    }, 3000)
  })

  ipcMain.handle('agent:start', (_event, agentId: string) => {
    const agent = dbService.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')

    if (ptyService.isRunning(agentId)) {
      ptyService.kill(agentId)
    }

    const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
    fs.mkdirSync(cwd, { recursive: true })

    const args = ['--dangerously-skip-permissions']
    if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
    if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

    ptyService.spawn(agentId, cwd, {
      command: 'claude',
      args,
      env: sessionEnv(agentId)
    })
    const pid = ptyService.getPid(agentId)
    dbService.updateAgent(agentId, { status: 'active', pid: pid ?? null })
    return dbService.getAgent(agentId)
  })

  ipcMain.handle('agent:resume', (_event, agentId: string) => {
    const agent = dbService.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')

    if (ptyService.isRunning(agentId)) {
      ptyService.kill(agentId)
    }

    const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
    fs.mkdirSync(cwd, { recursive: true })

    const args = ['--continue', '--dangerously-skip-permissions']
    if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
    if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

    ptyService.spawn(agentId, cwd, {
      command: 'claude',
      args,
      env: sessionEnv(agentId)
    })
    const pid = ptyService.getPid(agentId)
    dbService.updateAgent(agentId, { status: 'active', pid: pid ?? null })
    return dbService.getAgent(agentId)
  })

  ipcMain.handle('agent:restart', (_event, agentId: string) => {
    const agent = dbService.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')

    if (ptyService.isRunning(agentId)) {
      ptyService.kill(agentId)
    }

    const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
    fs.mkdirSync(cwd, { recursive: true })

    const args = ['--dangerously-skip-permissions']
    if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
    if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

    ptyService.spawn(agentId, cwd, {
      command: 'claude',
      args,
      env: sessionEnv(agentId)
    })
    const pid = ptyService.getPid(agentId)
    dbService.updateAgent(agentId, { status: 'active', pid: pid ?? null })
    return dbService.getAgent(agentId)
  })

  ipcMain.handle('agent:create-quick-terminal', (_event, agentId: string) => {
    const agent = dbService.getAgent(agentId)
    if (!agent) throw new Error('Agent not found')

    const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
    fs.mkdirSync(cwd, { recursive: true })

    const id = uuidv4()
    const name = `Terminal (${(agent.name as string)})`

    ptyService.spawn(id, cwd)
    const pid = ptyService.getPid(id)

    return { id, name, status: 'active', type: 'quick-terminal', agentId, pid: pid ?? null }
  })

  ipcMain.handle('agent:kill', (_event, agentId: string) => {
    if (ptyService.isRunning(agentId)) {
      ptyService.kill(agentId)
    }
    dbService.updateAgent(agentId, { status: 'idle', pid: null })
  })

  // ── Terminal I/O ────────────────────────────────────────────

  ipcMain.on('terminal:write', (_event, sessionId: string, data: string) => {
    ptyService.write(sessionId, data)
  })

  ipcMain.on('terminal:resize', (_event, sessionId: string, cols: number, rows: number) => {
    ptyService.resize(sessionId, cols, rows)
  })

  // ── Team/agent monitoring ───────────────────────────────────

  ipcMain.handle('teams:list', () => {
    return fileWatcherService.listTeams()
  })

  ipcMain.handle('teams:tasks', (_event, teamName: string) => {
    // Gather tasks from team-name directory
    const teamTasks = fileWatcherService.getTeamTasks(teamName)
    // Also gather tasks from session-ID and agent-ID directories linked to this team
    const sessions = dbService.listSessions()
    const linkedSessions = sessions.filter((s: any) => s.team_name === teamName)
    const agents = dbService.listAgents()
    const linkedAgents = agents.filter((a: any) => a.team_name === teamName)
    const sessionTasks = [...linkedSessions, ...linkedAgents].flatMap((item: any) =>
      fileWatcherService.getTeamTasks(item.id)
    )
    // Merge, deduplicate by id, and filter out internal team-spawn tasks
    const seen = new Set<string>()
    const merged: any[] = []
    for (const t of [...teamTasks, ...sessionTasks]) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      if (t.metadata?._internal) continue
      merged.push(t)
    }
    return merged
  })

  ipcMain.handle('teams:inbox', (_event, teamName: string, agentName: string) => {
    return fileWatcherService.getTeamInbox(teamName, agentName)
  })

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle('settings:get', (_event, key: string) => {
    return dbService.getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    dbService.setSetting(key, value)
    // Apply shell setting immediately
    if (key === 'shell') {
      ptyService.setCustomShell(value || undefined)
    }
  })

  // ── System info ─────────────────────────────────────────────

  ipcMain.handle('system:userInfo', () => {
    const info = os.userInfo()
    return {
      username: info.username,
      homedir: info.homedir
    }
  })

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
