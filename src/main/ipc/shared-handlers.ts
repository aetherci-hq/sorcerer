import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import os from 'os'
import simpleGit from 'simple-git'
import { PTYService } from '../services/pty-service'
import { DatabaseService } from '../services/database-service'
import { WorktreeService } from '../services/worktree-service'
import { FileWatcherService } from '../services/file-watcher-service'

// ── Services interface ──────────────────────────────────────

export interface HandlerServices {
  db: DatabaseService
  pty: PTYService
  worktree: WorktreeService
  fileWatcher: FileWatcherService
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Build session-scoped env vars for Claude Code.
 * Each session gets its own CLAUDE_CODE_TASK_LIST_ID to prevent cross-session task contamination.
 */
export function sessionEnv(sessionId: string): Record<string, string> {
  return {
    CLAUDE_CODE_TASK_LIST_ID: sessionId
  }
}

// ── Project handlers ────────────────────────────────────────

export function listProjects({ db }: HandlerServices): any[] {
  return db.listProjects()
}

export function addProjectByPath(
  { db }: HandlerServices,
  projectPath: string,
  customName?: string
): any {
  const name = customName || path.basename(projectPath)
  const gitDir = path.join(projectPath, '.git')
  if (!fs.existsSync(gitDir)) {
    throw new Error('Selected directory is not a git repository')
  }
  const existing = db.listProjects().find((p: any) => p.path === projectPath)
  if (existing) return existing
  const id = uuidv4()
  return db.addProject(id, name, projectPath)
}

export function updateProject(
  { db }: HandlerServices,
  id: string,
  updates: any
): any {
  return db.updateProject(id, updates)
}

export function removeProject(
  { db }: HandlerServices,
  id: string
): void {
  db.removeProject(id)
}

export async function syncWorktrees(
  { db }: HandlerServices,
  projectId: string
): Promise<{ created: number; removed: number }> {
  const project = db.getProject(projectId)
  if (!project) throw new Error('Project not found')

  const repoName = path.basename(project.path as string)
  const workspacesDir = path.join(os.homedir(), '.sorcerer', 'workspaces', repoName)
  if (!fs.existsSync(workspacesDir)) return { created: 0, removed: 0 }

  // Get existing session worktree paths from DB
  const dbSessions = db.listSessions(projectId)
  const dbPaths = new Set(dbSessions.map((s: any) => s.worktree_path))

  // Scan filesystem for valid worktree directories
  let created = 0
  const entries = fs.readdirSync(workspacesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = path.join(workspacesDir, entry.name)
    if (dbPaths.has(dirPath)) continue // already registered

    // Verify it's a valid git worktree (has .git file or directory)
    const gitPath = path.join(dirPath, '.git')
    if (!fs.existsSync(gitPath)) continue

    // Get branch name from worktree
    const git = simpleGit(dirPath)
    let branch: string
    try {
      branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
    } catch {
      continue // skip broken worktrees
    }

    const id = uuidv4()
    db.addSession({
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
      db.removeSession(session.id)
      removed++
    }
  }

  return { created, removed }
}

export async function getProjectGitStatus(
  _services: HandlerServices,
  projectPath: string
): Promise<{
  branch: string
  dirty: boolean
  modified: number
  staged: number
  untracked: number
  ahead: number
  behind: number
  lastCommit: string | null
  lastCommitDate: string | null
} | null> {
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
}

// ── Session handlers ────────────────────────────────────────

export function listSessions(
  { db }: HandlerServices,
  projectId?: string
): any[] {
  return db.listSessions(projectId)
}

export async function createSession(
  { db, pty, worktree }: HandlerServices,
  projectId: string,
  sessionName: string,
  useMainRepo?: boolean
): Promise<any> {
  console.log('[session:create] Starting:', { projectId, sessionName, useMainRepo })
  const project = db.getProject(projectId)
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
    const result = await worktree.create(project.path, sessionName)
    worktreePath = result.worktreePath
    branch = result.branch
    console.log('[session:create] Worktree created:', { worktreePath, branch })
  }

  // Create session record
  const id = uuidv4()
  const session = db.addSession({
    id,
    project_id: projectId,
    name: sessionName,
    branch,
    worktree_path: worktreePath
  })
  console.log('[session:create] Session saved:', { id, status: session?.status })

  // Spawn Claude Code directly in the worktree — no shell prompt visible
  pty.spawn(id, worktreePath, {
    command: 'claude',
    args: ['--dangerously-skip-permissions'],
    env: sessionEnv(id)
  })
  const pid = pty.getPid(id)
  console.log('[session:create] Claude spawned, pid:', pid)
  if (pid) {
    db.updateSession(id, { pid })
  }

  // Push branch to remote on creation (fire-and-forget) — skip for main repo sessions
  if (!useMainRepo) {
    worktree.pushBranch(project.path, branch).then((r) => {
      if (r.pushed) console.log('[session:create] Branch pushed to remote')
      else console.log('[session:create] Push skipped:', r.error)
    })
  }

  return session
}

export function spawnShell(
  { pty }: HandlerServices,
  sessionId: string,
  cwd: string
): { pid: number | undefined } {
  // Spawn a plain shell session (no worktree needed)
  pty.spawn(sessionId, cwd)
  const pid = pty.getPid(sessionId)
  return { pid }
}

export function createQuickTerminal(
  { db, pty }: HandlerServices,
  sourceSessionId: string
): any {
  const source = db.getSession(sourceSessionId)
  if (!source) throw new Error('Source session not found')

  // Generate unique name: "Terminal", "Terminal (2)", etc.
  const projectSessions = db.listSessions(source.project_id as string)
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
  const session = db.addSession({
    id,
    project_id: source.project_id as string,
    name,
    branch: source.branch as string,
    worktree_path: source.worktree_path as string,
    type: 'quick-terminal'
  })

  // Spawn plain shell (no command = default shell)
  pty.spawn(id, source.worktree_path as string)
  const pid = pty.getPid(id)
  if (pid) {
    db.updateSession(id, { pid })
  }

  return session
}

export function renameSession(
  { db }: HandlerServices,
  sessionId: string,
  newName: string
): any {
  db.updateSession(sessionId, { name: newName })
  return db.getSession(sessionId)
}

export function killSession(
  { db, pty }: HandlerServices,
  sessionId: string
): void {
  pty.kill(sessionId)
  db.updateSession(sessionId, { status: 'idle', pid: null })
}

export async function archiveSession(
  { db, pty, worktree }: HandlerServices,
  sessionId: string
): Promise<void> {
  pty.kill(sessionId)

  const session = db.getSession(sessionId)

  // Quick terminals: just kill and delete — no archiving
  if (session && session.type === 'quick-terminal') {
    db.removeSession(sessionId)
    return
  }

  if (session) {
    const project = db.getProject(session.project_id)
    const isMainRepo = project && session.worktree_path === project.path

    // Auto-commit dirty work (non-destructive — worktree stays alive) — skip for main repo
    if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      const commitResult = await worktree.autoCommit(session.worktree_path as string)
      if (commitResult.committed) {
        console.log('[session:archive] Auto-committed:', commitResult.message)
      }
    }

    // Push to remote (fire-and-forget) — skip for main repo
    if (!isMainRepo && project && session.branch) {
      worktree.pushBranch(project.path as string, session.branch as string).then((r) => {
        if (r.pushed) console.log('[session:archive] Pushed to remote')
        else console.log('[session:archive] Push skipped:', r.error)
      })
    }
  }

  db.updateSession(sessionId, {
    status: 'archived',
    pid: null,
    archived_at: Math.floor(Date.now() / 1000)
  })
}

export async function deleteSession(
  { db, pty, worktree }: HandlerServices,
  sessionId: string
): Promise<void> {
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  const session = db.getSession(sessionId)

  // Quick terminals: just kill PTY and remove DB record — no worktree/branch ops
  if (session && session.type === 'quick-terminal') {
    db.removeSession(sessionId)
    return
  }

  if (session) {
    const project = db.getProject(session.project_id as string)
    const isMainRepo = project && session.worktree_path === project.path

    // Auto-commit dirty work before destruction — skip for main repo
    if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      const commitResult = await worktree.autoCommit(session.worktree_path as string)
      if (commitResult.committed) {
        console.log('[session:delete] Auto-committed:', commitResult.message)
      }
    }

    // Push to remote (blocking — ensure backup before destruction) — skip for main repo
    if (!isMainRepo && project && session.branch) {
      const pushResult = await worktree.pushBranch(project.path as string, session.branch as string)
      if (pushResult.pushed) {
        console.log('[session:delete] Pushed to remote before deletion')
      } else {
        console.log('[session:delete] Push skipped:', pushResult.error)
      }
    }

    // Remove worktree + local branch — skip for main repo
    if (!isMainRepo && project && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
      try {
        await worktree.remove(project.path as string, session.worktree_path as string, session.branch as string)
      } catch (err) {
        console.log('[session:delete] Worktree cleanup failed (may already be removed):', err)
      }
    }

    // Delete remote branch (fire-and-forget) — skip for main repo
    if (!isMainRepo && project && session.branch) {
      worktree.deleteRemoteBranch(project.path as string, session.branch as string).then((r) => {
        if (r.deleted) console.log('[session:delete] Remote branch deleted')
      })
    }
  }

  db.removeSession(sessionId)
}

export async function restartSession(
  { db, pty }: HandlerServices,
  sessionId: string
): Promise<any> {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')

  // Kill existing process if running
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  // Check if worktree directory still exists
  const cwd = fs.existsSync(session.worktree_path as string)
    ? (session.worktree_path as string)
    : (db.getProject(session.project_id as string)?.path as string || process.cwd())

  if (session.type === 'quick-terminal') {
    // Quick terminal: spawn plain shell
    pty.spawn(sessionId, cwd)
  } else {
    // Re-spawn Claude Code directly in the worktree (fresh session)
    pty.spawn(sessionId, cwd, {
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      env: sessionEnv(sessionId)
    })
  }
  const pid = pty.getPid(sessionId)
  db.updateSession(sessionId, { status: 'active', pid: pid ?? null })

  return db.getSession(sessionId)
}

export async function resumeSession(
  { db, pty }: HandlerServices,
  sessionId: string
): Promise<any> {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')

  // Kill existing process if running
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  // Check if worktree directory still exists
  const cwd = fs.existsSync(session.worktree_path as string)
    ? (session.worktree_path as string)
    : (db.getProject(session.project_id as string)?.path as string || process.cwd())

  if (session.type === 'quick-terminal') {
    // Quick terminal: just restart the shell (no Claude conversation to resume)
    pty.spawn(sessionId, cwd)
  } else {
    // Resume the most recent Claude Code conversation in this worktree
    pty.spawn(sessionId, cwd, {
      command: 'claude',
      args: ['--continue', '--dangerously-skip-permissions'],
      env: sessionEnv(sessionId)
    })
  }
  const pid = pty.getPid(sessionId)
  db.updateSession(sessionId, { status: 'active', pid: pid ?? null })

  return db.getSession(sessionId)
}

export function setSessionTeam(
  { db }: HandlerServices,
  sessionId: string,
  teamName: string | null
): any {
  db.updateSession(sessionId, { team_name: teamName })
  return db.getSession(sessionId)
}

export async function pushSessionBranch(
  { db, worktree }: HandlerServices,
  sessionId: string
): Promise<{ pushed: boolean; error?: string }> {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const project = db.getProject(session.project_id as string)
  if (!project) throw new Error('Project not found')

  const isMainRepo = session.worktree_path === project.path

  // Auto-commit first — skip for main repo sessions
  if (!isMainRepo && session.worktree_path && fs.existsSync(session.worktree_path as string)) {
    const commitResult = await worktree.autoCommit(session.worktree_path as string)
    if (commitResult.committed) {
      console.log('[session:push-branch] Auto-committed:', commitResult.message)
    }
  }

  return worktree.pushBranch(project.path as string, session.branch as string)
}

export async function checkDeleteSafety(
  { db, worktree }: HandlerServices,
  sessionId: string
): Promise<{ dirty: boolean; unmergedCount: number; hasRemote: boolean }> {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')

  // Quick terminals have no worktree to protect
  if (session.type === 'quick-terminal') {
    return { dirty: false, unmergedCount: 0, hasRemote: false }
  }

  const project = db.getProject(session.project_id as string)
  if (!project) return { dirty: false, unmergedCount: 0, hasRemote: false }

  let dirty = false
  if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
    try {
      const git = simpleGit(session.worktree_path as string)
      const status = await git.status()
      dirty = !status.isClean()
    } catch { /* ignore */ }
  }

  const { count: unmergedCount } = await worktree.hasUnmergedCommits(project.path as string, session.branch as string)

  let hasRemote = false
  try {
    const git = simpleGit(project.path as string)
    const remotes = await git.getRemotes(true)
    hasRemote = remotes.some((r) => r.name === 'origin')
  } catch { /* ignore */ }

  return { dirty, unmergedCount, hasRemote }
}

export async function getSessionGitStatus(
  { db, worktree }: HandlerServices,
  sessionId: string
): Promise<any> {
  const session = db.getSession(sessionId)
  if (!session) return null
  if (!session.worktree_path || !fs.existsSync(session.worktree_path as string)) return null
  return worktree.getSessionGitStatus(session.worktree_path as string)
}

export async function landOnMain(
  { db, pty, worktree }: HandlerServices,
  sessionId: string
): Promise<{ landed: boolean; error?: string }> {
  // Kill running process if active
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const project = db.getProject(session.project_id as string)
  if (!project) throw new Error('Project not found')

  // Main repo sessions have nothing to land — already on main
  if (session.worktree_path === project.path) {
    return { landed: false, error: 'Cannot land a main repository session — it is already working in the main repo.' }
  }

  // Auto-commit dirty work in the worktree
  if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
    const commitResult = await worktree.autoCommit(session.worktree_path as string)
    if (commitResult.committed) {
      console.log('[session:land-on-main] Auto-committed:', commitResult.message)
    }
  }

  // Squash merge to main
  const mergeResult = await worktree.squashMergeToMain(
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
      await worktree.remove(project.path as string, session.worktree_path as string, session.branch as string)
    } catch (err) {
      console.log('[session:land-on-main] Worktree cleanup failed:', err)
    }
  }

  // Delete remote branch (fire-and-forget)
  if (session.branch) {
    worktree.deleteRemoteBranch(project.path as string, session.branch as string).then((r) => {
      if (r.deleted) console.log('[session:land-on-main] Remote branch deleted')
    })
  }

  // Remove session from DB
  db.removeSession(sessionId)

  return { landed: true }
}

export function restoreSession(
  { db }: HandlerServices,
  sessionId: string
): any {
  db.updateSession(sessionId, { status: 'idle', archived_at: null })
  return db.getSession(sessionId)
}

// ── Agent handlers ──────────────────────────────────────────

export function listAgents({ db }: HandlerServices): any[] {
  return db.listAgents()
}

export function addAgent(
  { db }: HandlerServices,
  data: { name: string; description?: string; system_prompt?: string; mcp_config?: string }
): any {
  const id = uuidv4()
  // Create scratch directory for this agent
  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', id)
  fs.mkdirSync(cwd, { recursive: true })
  return db.addAgent({ id, ...data })
}

export function updateAgent(
  { db }: HandlerServices,
  id: string,
  updates: any
): any {
  return db.updateAgent(id, updates)
}

export function removeAgent(
  { db, pty }: HandlerServices,
  id: string
): void {
  if (pty.isRunning(id)) {
    pty.kill(id)
  }
  db.removeAgent(id)
}

export function startAgent(
  { db, pty }: HandlerServices,
  agentId: string
): any {
  const agent = db.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')

  if (pty.isRunning(agentId)) {
    pty.kill(agentId)
  }

  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(cwd, { recursive: true })

  const args = ['--dangerously-skip-permissions']
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  pty.spawn(agentId, cwd, {
    command: 'claude',
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })
  return db.getAgent(agentId)
}

export function resumeAgent(
  { db, pty }: HandlerServices,
  agentId: string
): any {
  const agent = db.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')

  if (pty.isRunning(agentId)) {
    pty.kill(agentId)
  }

  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(cwd, { recursive: true })

  const args = ['--continue', '--dangerously-skip-permissions']
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  pty.spawn(agentId, cwd, {
    command: 'claude',
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })
  return db.getAgent(agentId)
}

export function restartAgent(
  { db, pty }: HandlerServices,
  agentId: string
): any {
  const agent = db.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')

  if (pty.isRunning(agentId)) {
    pty.kill(agentId)
  }

  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(cwd, { recursive: true })

  const args = ['--dangerously-skip-permissions']
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  pty.spawn(agentId, cwd, {
    command: 'claude',
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })
  return db.getAgent(agentId)
}

export function createAgentQuickTerminal(
  { db, pty }: HandlerServices,
  agentId: string
): { id: string; name: string; status: string; type: string; agentId: string; pid: number | null } {
  const agent = db.getAgent(agentId)
  if (!agent) throw new Error('Agent not found')

  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(cwd, { recursive: true })

  const id = uuidv4()
  const name = `Terminal (${(agent.name as string)})`

  pty.spawn(id, cwd)
  const pid = pty.getPid(id)

  return { id, name, status: 'active', type: 'quick-terminal', agentId, pid: pid ?? null }
}

export function killAgent(
  { db, pty }: HandlerServices,
  agentId: string
): void {
  if (pty.isRunning(agentId)) {
    pty.kill(agentId)
  }
  db.updateAgent(agentId, { status: 'idle', pid: null })
}

// ── Terminal I/O handlers ───────────────────────────────────

export function terminalWrite(
  { pty }: HandlerServices,
  sessionId: string,
  data: string
): void {
  pty.write(sessionId, data)
}

export function terminalResize(
  { pty }: HandlerServices,
  sessionId: string,
  cols: number,
  rows: number
): void {
  pty.resize(sessionId, cols, rows)
}

// ── Team/agent monitoring handlers ──────────────────────────

export function listTeams({ fileWatcher }: HandlerServices): any[] {
  return fileWatcher.listTeams()
}

export function getTeamTasks(
  { db, fileWatcher }: HandlerServices,
  teamName: string
): any[] {
  // Gather tasks from team-name directory
  const teamTasks = fileWatcher.getTeamTasks(teamName)
  // Also gather tasks from session-ID and agent-ID directories linked to this team
  const sessions = db.listSessions()
  const linkedSessions = sessions.filter((s: any) => s.team_name === teamName)
  const agents = db.listAgents()
  const linkedAgents = agents.filter((a: any) => a.team_name === teamName)
  const sessionTasks = [...linkedSessions, ...linkedAgents].flatMap((item: any) =>
    fileWatcher.getTeamTasks(item.id)
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
}

export function getTeamInbox(
  { fileWatcher }: HandlerServices,
  teamName: string,
  agentName: string
): any[] {
  return fileWatcher.getTeamInbox(teamName, agentName)
}

// ── Settings handlers ───────────────────────────────────────

export function getSetting(
  { db }: HandlerServices,
  key: string
): string | undefined {
  return db.getSetting(key)
}

export function setSetting(
  { db, pty }: HandlerServices,
  key: string,
  value: string
): void {
  db.setSetting(key, value)
  // Apply shell setting immediately
  if (key === 'shell') {
    pty.setCustomShell(value || undefined)
  }
}

// ── System info handlers ────────────────────────────────────

export function getUserInfo(): { username: string; homedir: string } {
  const info = os.userInfo()
  return {
    username: info.username,
    homedir: info.homedir
  }
}
