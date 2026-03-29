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

let _claudeBinary: string | null = null

/**
 * Resolve the full path to the Claude Code binary.
 * Checks well-known install locations so we don't depend on PATH ordering
 * (the native installer puts claude.exe in ~/.local/bin which Electron may not see).
 */
export function resolveClaudeBinary(): string {
  if (_claudeBinary) return _claudeBinary

  const home = os.homedir()
  const candidates =
    os.platform() === 'win32'
      ? [
          path.join(home, '.local', 'bin', 'claude.exe'),
          path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
          path.join(home, 'AppData', 'Roaming', 'npm', 'claude')
        ]
      : [
          path.join(home, '.local', 'bin', 'claude'),
          '/usr/local/bin/claude',
          path.join(home, '.npm-global', 'bin', 'claude')
        ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[claude-binary] Resolved:', candidate)
      _claudeBinary = candidate
      return candidate
    }
  }

  // Fallback: hope it's on PATH
  console.warn('[claude-binary] No known path found, falling back to bare "claude"')
  _claudeBinary = 'claude'
  return 'claude'
}

/**
 * Build session-scoped env vars for Claude Code.
 * Each session gets its own CLAUDE_CODE_TASK_LIST_ID to prevent cross-session task contamination.
 */
export function sessionEnv(sessionId: string): Record<string, string> {
  return {
    CLAUDE_CODE_TASK_LIST_ID: sessionId
  }
}

/**
 * Check if Claude Code has conversation data for a given working directory.
 * Claude stores conversations in ~/.claude/projects/<encoded-path>/ where
 * the encoded path replaces all non-alphanumeric characters with dashes.
 * Returns true if at least one .jsonl conversation file exists.
 */
export function hasClaudeConversation(cwd: string): boolean {
  const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-')
  const convDir = path.join(os.homedir(), '.claude', 'projects', encoded)
  if (!fs.existsSync(convDir)) return false
  try {
    const entries = fs.readdirSync(convDir)
    return entries.some((e) => e.endsWith('.jsonl'))
  } catch {
    return false
  }
}

/**
 * Pre-trust a directory for Claude Code so it skips the interactive trust prompt.
 * Claude Code stores trust in ~/.claude.json under projects[path].hasTrustDialogAccepted.
 */
export function ensureClaudeTrust(cwd: string): void {
  // Use forward slashes — Claude Code normalises to this on all platforms
  const key = cwd.replace(/\\/g, '/')
  const claudeJsonPath = path.join(os.homedir(), '.claude.json')
  try {
    const data = fs.existsSync(claudeJsonPath)
      ? JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'))
      : {}
    if (!data.projects) data.projects = {}
    if (data.projects[key]?.hasTrustDialogAccepted) return // already trusted
    data.projects[key] = {
      ...(data.projects[key] || {}),
      allowedTools: [],
      hasTrustDialogAccepted: true
    }
    fs.writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2))
  } catch {
    // Best effort — don't block agent launch if we can't write
  }
}

// ── Resume failure detection ────────────────────────────────
//
// Tracks sessions spawned via --continue so we can detect early exits
// (e.g. "No conversation found to continue") and notify the renderer.

/** Map of sessionId → timestamp when resume was initiated */
const resumeTimestamps = new Map<string, number>()

/** Threshold in ms — exits faster than this after a resume are considered failures */
const EARLY_EXIT_THRESHOLD = 8000

/** Patterns in Claude Code output that indicate a failed resume */
const RESUME_FAILURE_PATTERNS = [
  'No conversation found',
  'no conversation found',
  'Could not find conversation',
  'could not find conversation'
]

/**
 * Mark a session as having just been resumed via --continue.
 * Called from resumeSession/resumeAgent.
 */
function trackResume(sessionId: string): void {
  resumeTimestamps.set(sessionId, Date.now())
}

/**
 * Check whether an exiting session was a failed resume.
 * Returns the failure reason if detected, or null.
 */
export function checkResumeFailed(sessionId: string, scrollback: string): string | null {
  const resumeTime = resumeTimestamps.get(sessionId)
  resumeTimestamps.delete(sessionId)
  if (!resumeTime) return null

  const elapsed = Date.now() - resumeTime
  if (elapsed > EARLY_EXIT_THRESHOLD) return null

  for (const pattern of RESUME_FAILURE_PATTERNS) {
    if (scrollback.includes(pattern)) {
      return 'No conversation found to continue'
    }
  }

  // Still an early exit even without a known pattern
  if (elapsed < 3000) {
    return 'Session exited immediately after resume'
  }

  return null
}

/**
 * Schedule enabling Remote Control on a Claude Code session.
 * Waits for Claude Code to initialize, then sends the /remote-control command.
 */
function enableRemoteControl(ptyService: PTYService, sessionId: string): void {
  setTimeout(() => {
    if (ptyService.isRunning(sessionId)) {
      ptyService.write(sessionId, '/remote-control\n')
    }
  }, 3000)
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
  if (!fs.existsSync(projectPath)) {
    throw new Error('Directory does not exist')
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
      worktree_path: dirPath,
      status: 'idle'
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
  useMainRepo?: boolean,
  bypassPermissions?: boolean,
  remoteControl?: boolean
): Promise<any> {
  console.log('[session:create] Starting:', { projectId, sessionName, useMainRepo, remoteControl })
  const project = db.getProject(projectId)
  if (!project) throw new Error('Project not found')
  console.log('[session:create] Project found:', project.path)

  let worktreePath: string
  let branch: string

  // Detect whether this project has git with at least one commit
  const hasGit = fs.existsSync(path.join(project.path as string, '.git'))
  let hasCommits = false
  if (hasGit) {
    try {
      await simpleGit(project.path as string).revparse(['HEAD'])
      hasCommits = true
    } catch { /* empty repo — no commits yet */ }
  }

  if (!hasGit || !hasCommits || useMainRepo) {
    // Work directly in the project directory — no worktree
    worktreePath = project.path as string
    if (hasCommits) {
      try {
        branch = (await simpleGit(project.path as string).revparse(['--abbrev-ref', 'HEAD'])).trim()
      } catch { branch = 'main' }
    } else {
      branch = ''
    }
    console.log('[session:create] Using project dir:', { worktreePath, branch, hasGit, hasCommits })
  } else {
    // Create git worktree
    const result = await worktree.create(project.path, sessionName)
    worktreePath = result.worktreePath
    branch = result.branch
    console.log('[session:create] Worktree created:', { worktreePath, branch })
  }

  // Create session record with a pinned Claude conversation ID
  const id = uuidv4()
  const claudeSessionId = uuidv4()
  const skipPerms = bypassPermissions !== false  // default true
  const rc = remoteControl ? 1 : 0
  const session = db.addSession({
    id,
    project_id: projectId,
    name: sessionName,
    branch,
    worktree_path: worktreePath,
    bypass_permissions: skipPerms ? 1 : 0,
    remote_control: rc,
    claude_session_id: claudeSessionId
  })
  console.log('[session:create] Session saved:', { id, claudeSessionId, status: session?.status })

  // Spawn Claude Code directly in the worktree — no shell prompt visible
  // Use --session-id to pin this Claude conversation to this Sorcerer session,
  // preventing cross-contamination when multiple sessions share the same cwd.
  const args: string[] = ['--session-id', claudeSessionId]
  if (skipPerms) args.push('--dangerously-skip-permissions')
  pty.spawn(id, worktreePath, {
    command: resolveClaudeBinary(),
    args,
    env: sessionEnv(id)
  })
  const pid = pty.getPid(id)
  console.log('[session:create] Claude spawned, pid:', pid)
  if (pid) {
    db.updateSession(id, { pid })
  }

  // Enable Remote Control if requested
  if (remoteControl) {
    enableRemoteControl(pty, id)
  }

  // Push branch to remote on creation (fire-and-forget) — skip for main repo / non-git / empty repo sessions
  if (hasCommits && !useMainRepo) {
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
    type: 'quick-terminal',
    parent_session_id: sourceSessionId
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
    // Re-spawn Claude Code with a fresh, pinned conversation ID.
    // Without --session-id, Claude picks the most recent conversation in the cwd,
    // which can collide with external Claude instances or other Sorcerer sessions.
    const newClaudeSessionId = uuidv4()
    db.updateSession(sessionId, { claude_session_id: newClaudeSessionId })
    const args: string[] = ['--session-id', newClaudeSessionId]
    if (session.bypass_permissions !== 0) args.push('--dangerously-skip-permissions')
    pty.spawn(sessionId, cwd, {
      command: resolveClaudeBinary(),
      args,
      env: sessionEnv(sessionId)
    })

    // Re-enable Remote Control if previously set
    if (session.remote_control) {
      enableRemoteControl(pty, sessionId)
    }
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
    // Resume the Claude Code conversation pinned to this session.
    // Use --resume <id> for sessions with a stored claude_session_id (prevents
    // cross-contamination when multiple sessions share the same cwd).
    // Fall back to --continue for legacy sessions created before conversation pinning.
    const claudeSessionId = session.claude_session_id as string | undefined
    const args = claudeSessionId
      ? ['--resume', claudeSessionId]
      : ['--continue']
    if (session.bypass_permissions !== 0) args.push('--dangerously-skip-permissions')
    trackResume(sessionId)
    pty.spawn(sessionId, cwd, {
      command: resolveClaudeBinary(),
      args,
      env: sessionEnv(sessionId)
    })

    // Re-enable Remote Control if previously set
    if (session.remote_control) {
      enableRemoteControl(pty, sessionId)
    }
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
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const project = db.getProject(session.project_id as string)
  if (!project) throw new Error('Project not found')

  // Main repo sessions have nothing to land — already on main
  if (session.worktree_path === project.path) {
    return { landed: false, error: 'Cannot land a main repository session — it is already working in the main repo.' }
  }

  // Kill running process — needed so worktree files aren't locked
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  // Auto-commit dirty work in the worktree
  if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
    const commitResult = await worktree.autoCommit(session.worktree_path as string)
    if (commitResult.committed) {
      console.log('[session:land-on-main] Auto-committed:', commitResult.message)
    }
  }

  // Rebase onto latest main before attempting the squash merge
  if (session.worktree_path && fs.existsSync(session.worktree_path as string)) {
    const rebaseResult = await worktree.rebaseOntoMain(
      project.path as string,
      session.worktree_path as string,
      session.branch as string
    )
    if (rebaseResult.rebased) {
      console.log('[session:land-on-main] Rebased onto main before merge')
    } else if (rebaseResult.error) {
      return { landed: false, error: rebaseResult.error }
    }
  }

  // Squash merge to main
  const mergeResult = await worktree.squashMergeToMain(
    project.path as string,
    session.branch as string,
    session.name as string
  )

  if (!mergeResult.merged) {
    // Merge failed — restore session to idle state so it's not left broken
    db.updateSession(sessionId, { status: 'idle', pid: null })
    return { landed: false, error: mergeResult.error }
  }

  // Kill running process only after successful merge — keeps terminal alive on failure
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
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

  // Sync other active worktrees onto updated main (fire-and-forget)
  const otherSessions = db.listSessions(session.project_id as string)
    .filter((s: any) => s.id !== sessionId && s.worktree_path && s.branch)
  if (otherSessions.length > 0) {
    worktree.syncActiveWorktrees(project.path as string, session.branch as string, otherSessions)
      .then(() => console.log('[session:land-on-main] Synced other worktrees'))
      .catch((err: any) => console.log('[session:land-on-main] Worktree sync error:', err))
  }

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

function writeAgentManifest(
  agentId: string,
  data: { name: string; description?: string; system_prompt?: string; mcp_config?: string; mission?: string; created_at?: number }
): void {
  const dir = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(dir, { recursive: true })
  const manifest = {
    name: data.name,
    description: data.description || '',
    system_prompt: data.system_prompt || '',
    mcp_config: data.mcp_config || '',
    mission: data.mission || '',
    created_at: data.created_at || Math.floor(Date.now() / 1000)
  }
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

export function addAgent(
  { db }: HandlerServices,
  data: {
    id?: string; name: string; description?: string; system_prompt?: string; mcp_config?: string;
    bypass_permissions?: boolean; remote_control?: boolean;
    mission?: string; auto_start?: boolean; auto_restart?: boolean; restart_delay?: number; max_restarts?: number; schedule_minutes?: number
  }
): any {
  const id = data.id || uuidv4()
  // Create scratch directory for this agent
  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', id)
  fs.mkdirSync(cwd, { recursive: true })
  const agent = db.addAgent({
    id, ...data,
    bypass_permissions: (data.bypass_permissions !== false) ? 1 : 0,
    remote_control: data.remote_control ? 1 : 0,
    mission: data.mission || '',
    auto_start: data.auto_start ? 1 : 0,
    auto_restart: data.auto_restart ? 1 : 0,
    restart_delay: data.restart_delay ?? 30,
    max_restarts: data.max_restarts ?? 10,
    schedule_minutes: data.schedule_minutes ?? 0
  })
  writeAgentManifest(id, data)
  return agent
}

export function updateAgent(
  { db }: HandlerServices,
  id: string,
  updates: any
): any {
  const agent = db.updateAgent(id, updates)
  // Keep manifest in sync when metadata changes
  if (agent && (updates.name || updates.description || updates.system_prompt || updates.mcp_config || updates.mission !== undefined)) {
    writeAgentManifest(id, {
      name: agent.name as string,
      description: agent.description as string,
      system_prompt: agent.system_prompt as string,
      mcp_config: agent.mcp_config as string,
      mission: agent.mission as string,
      created_at: agent.created_at as number
    })
  }
  return agent
}

export function removeAgent(
  { db, pty }: HandlerServices,
  id: string
): void {
  if (pty.isRunning(id)) {
    pty.kill(id)
  }
  db.removeAgent(id)
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
  ensureClaudeTrust(cwd)

  const args: string[] = []
  if (agent.bypass_permissions !== 0) args.push('--dangerously-skip-permissions')
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  // Pin each agent run to a unique conversation ID to prevent cross-contamination
  const claudeSessionId = uuidv4()
  args.push('--session-id', claudeSessionId)

  // Autonomous mode: run mission non-interactively
  if (agent.mission) {
    args.push('-p', agent.mission as string)
  }

  pty.spawn(agentId, cwd, {
    command: resolveClaudeBinary(),
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Enable Remote Control if configured (only for interactive agents)
  if (agent.remote_control && !agent.mission) {
    enableRemoteControl(pty, agentId)
  }

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
  ensureClaudeTrust(cwd)

  const args = ['--continue']
  if (agent.bypass_permissions !== 0) args.push('--dangerously-skip-permissions')
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  trackResume(agentId)
  pty.spawn(agentId, cwd, {
    command: resolveClaudeBinary(),
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Re-enable Remote Control if configured
  if (agent.remote_control) {
    enableRemoteControl(pty, agentId)
  }

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
  ensureClaudeTrust(cwd)

  // Pin to a fresh conversation ID to avoid picking up stale conversations
  const claudeSessionId = uuidv4()
  const args: string[] = ['--session-id', claudeSessionId]
  if (agent.bypass_permissions !== 0) args.push('--dangerously-skip-permissions')
  if (agent.mcp_config) args.push('--mcp-config', agent.mcp_config as string)
  if (agent.system_prompt) args.push('--append-system-prompt', agent.system_prompt as string)

  pty.spawn(agentId, cwd, {
    command: resolveClaudeBinary(),
    args,
    env: sessionEnv(agentId)
  })
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Re-enable Remote Control if configured
  if (agent.remote_control) {
    enableRemoteControl(pty, agentId)
  }

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

// ── Quick Notes handlers ─────────────────────────────────────

export function loadQuickNote(
  { db }: HandlerServices,
  parentId: string,
  parentType: string
): any | undefined {
  return db.getQuickNote(parentId, parentType)
}

export function saveQuickNote(
  { db }: HandlerServices,
  id: string,
  parentId: string,
  parentType: string,
  content: string
): void {
  db.saveQuickNote(id, parentId, parentType, content)
}

export function deleteQuickNote(
  { db }: HandlerServices,
  parentId: string,
  parentType: string
): void {
  db.deleteQuickNote(parentId, parentType)
}

export function listQuickNoteParents(
  { db }: HandlerServices
): { parent_id: string; parent_type: string }[] {
  return db.listQuickNoteParents()
}

// ── Remote Control handlers ─────────────────────────────────

export function setSessionRemoteControl(
  { db, pty }: HandlerServices,
  sessionId: string,
  enabled: boolean
): any {
  db.updateSession(sessionId, { remote_control: enabled ? 1 : 0 })

  // If enabling on a running session, send the command now
  if (enabled && pty.isRunning(sessionId)) {
    pty.write(sessionId, '/remote-control\n')
  }

  return db.getSession(sessionId)
}

export function setAgentRemoteControl(
  { db, pty }: HandlerServices,
  agentId: string,
  enabled: boolean
): any {
  db.updateAgent(agentId, { remote_control: enabled ? 1 : 0 })

  // If enabling on a running agent, send the command now
  if (enabled && pty.isRunning(agentId)) {
    pty.write(agentId, '/remote-control\n')
  }

  return db.getAgent(agentId)
}

// ── System info handlers ────────────────────────────────────

export function getUserInfo(): { username: string; homedir: string } {
  const info = os.userInfo()
  return {
    username: info.username,
    homedir: info.homedir
  }
}

export function getNetworkIp(): string {
  const interfaces = os.networkInterfaces()
  let fallback: string | null = null
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      // Prefer private LAN ranges: 10.x, 172.16-31.x, 192.168.x
      const a = iface.address
      if (a.startsWith('192.168.') || a.startsWith('10.') ||
          (a.startsWith('172.') && (() => { const oct = parseInt(a.split('.')[1]); return oct >= 16 && oct <= 31 })())) {
        return a
      }
      if (!fallback) fallback = a
    }
  }
  return fallback || '127.0.0.1'
}
