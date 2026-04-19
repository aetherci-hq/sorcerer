import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import os from 'os'
import simpleGit from 'simple-git'
import initSqlJs from 'sql.js'
import { PTYService } from '../services/pty-service'
import { DatabaseService } from '../services/database-service'
import { WorktreeService } from '../services/worktree-service'
import { FileWatcherService } from '../services/file-watcher-service'
import { getProviderRunner } from '../services/provider-runners'
import { getDefaultProviderId, listProviders as listProviderRegistry, refreshProviders as refreshProviderRegistry, resolveLaunchModel } from '../services/provider-registry'

// ── Services interface ──────────────────────────────────────

export interface HandlerServices {
  db: DatabaseService
  pty: PTYService
  worktree: WorktreeService
  fileWatcher: FileWatcherService
}

let sqlJsPromise: Promise<any> | null = null

// ── Helpers ─────────────────────────────────────────────────

/**
 * Check if Claude Code has conversation data for a given working directory.
 * Claude stores conversations in ~/.claude/projects/<encoded-path>/ where
 * the encoded path replaces all non-alphanumeric characters with dashes.
 * Returns true if at least one .jsonl conversation file exists.
 */
export function hasClaudeConversation(cwd: string): boolean {
  return hasClaudeRuntimeSession(cwd) || hasClaudeTranscript(cwd)
}

/**
 * Get the Claude projects directory for a given working directory.
 */
function getConvDir(cwd: string): string {
  const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(os.homedir(), '.claude', 'projects', encoded)
}

function getClaudeSessionsDir(): string {
  return path.join(os.homedir(), '.claude', 'sessions')
}

function readClaudeRuntimeSessions(cwd?: string): Array<{ sessionId: string; cwd: string; startedAt: number }> {
  const sessionsDir = getClaudeSessionsDir()
  if (!fs.existsSync(sessionsDir)) return []

  const normalizedCwd = cwd ? normalizeComparablePath(cwd) : null

  try {
    return fs.readdirSync(sessionsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, entry), 'utf8')) as {
            sessionId?: string
            cwd?: string
            startedAt?: number
          }
          if (!raw.sessionId || !raw.cwd) return null
          if (normalizedCwd && normalizeComparablePath(raw.cwd) !== normalizedCwd) return null
          return {
            sessionId: String(raw.sessionId),
            cwd: String(raw.cwd),
            startedAt: Number(raw.startedAt || 0)
          }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { sessionId: string; cwd: string; startedAt: number } => entry !== null)
      .sort((left, right) => right.startedAt - left.startedAt)
  } catch {
    return []
  }
}

function hasClaudeRuntimeSession(cwd: string): boolean {
  return readClaudeRuntimeSessions(cwd).length > 0
}

function extractClaudeTranscriptTitle(lines: string[]): string {
  let lastPrompt = ''
  let lastUserMessage = ''

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as {
        type?: string
        lastPrompt?: string
        message?: { role?: string; content?: string | Array<{ type?: string; text?: string }> }
      }

      if (record.type === 'last-prompt' && typeof record.lastPrompt === 'string') {
        lastPrompt = record.lastPrompt.trim()
      }

      if (record.message?.role === 'user') {
        const content = record.message.content
        if (typeof content === 'string') {
          lastUserMessage = content.trim()
        } else if (Array.isArray(content)) {
          const text = content
            .map((part) => typeof part?.text === 'string' ? part.text : '')
            .join(' ')
            .trim()
          if (text) lastUserMessage = text
        }
      }
    } catch {
      // Ignore malformed transcript lines.
    }
  }

  const title = lastPrompt || lastUserMessage
  return title.replace(/\s+/g, ' ').trim()
}

function readClaudeTranscriptSessions(cwd: string): Array<{ sessionId: string; cwd: string; updatedAt: number; title: string }> {
  const convDir = getConvDir(cwd)
  if (!fs.existsSync(convDir)) return []

  try {
    return fs.readdirSync(convDir)
      .filter((entry) => entry.endsWith('.jsonl'))
      .map((entry) => {
        try {
          const fullPath = path.join(convDir, entry)
          const sessionId = entry.replace(/\.jsonl$/i, '')
          const stat = fs.statSync(fullPath)
          const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).filter(Boolean)
          let assistantMessages = 0
          for (const line of lines) {
            try {
              const record = JSON.parse(line) as { type?: string; message?: { role?: string } }
              if (record.type === 'assistant' || record.message?.role === 'assistant') {
                assistantMessages += 1
                break
              }
            } catch {
              // Ignore malformed transcript lines.
            }
          }
          if (assistantMessages === 0) return null
          const title = extractClaudeTranscriptTitle(lines)
          return {
            sessionId,
            cwd,
            updatedAt: Math.floor(stat.mtimeMs),
            title
          }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { sessionId: string; cwd: string; updatedAt: number; title: string } => entry !== null)
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}

function hasClaudeTranscript(cwd: string): boolean {
  const convDir = getConvDir(cwd)
  if (!fs.existsSync(convDir)) return false
  try {
    const entries = fs.readdirSync(convDir)
    return entries.some((entry) => entry.endsWith('.jsonl'))
  } catch {
    return false
  }
}

function runtimeSessionExists(cwd: string, claudeSessionId: string): boolean {
  return readClaudeRuntimeSessions(cwd).some((entry) => entry.sessionId === claudeSessionId)
}

function findMostRecentClaudeRuntimeSession(cwd: string): string | null {
  return readClaudeRuntimeSessions(cwd)[0]?.sessionId || null
}

type ExternalSessionImportCandidate = {
  id: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  cwd: string
  createdAt: number
  updatedAt: number | null
  branch: string
  model: string
  projectId: string | null
  projectName: string
  projectPath: string
  willCreateProject: boolean
}

function slugifySessionLabel(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 28).replace(/-+$/g, '') || 'imported-session'
}

async function detectBranchForPath(cwd: string): Promise<string> {
  try {
    const git = simpleGit(cwd)
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
    return branch === 'HEAD' ? '' : branch
  } catch {
    return ''
  }
}

function deriveImportedSessionName(candidate: {
  provider: 'claude' | 'codex'
  title: string
  branch: string
  cwd: string
}): string {
  const branchLeaf = candidate.branch.split('/').pop()?.trim() || ''
  if (branchLeaf && !['main', 'master'].includes(branchLeaf.toLowerCase())) {
    return slugifySessionLabel(branchLeaf)
  }

  const title = candidate.title.trim()
  if (title) {
    return slugifySessionLabel(title.split(/\s+/).slice(0, 4).join(' '))
  }

  return slugifySessionLabel(path.basename(candidate.cwd))
}

/**
 * Check whether a specific claude_session_id has a conversation file on disk.
 */
function conversationFileExists(cwd: string, claudeSessionId: string): boolean {
  const convDir = getConvDir(cwd)
  const filePath = path.join(convDir, `${claudeSessionId}.jsonl`)
  return fs.existsSync(filePath)
}

function claudeSessionExists(cwd: string, claudeSessionId: string): boolean {
  return runtimeSessionExists(cwd, claudeSessionId) || conversationFileExists(cwd, claudeSessionId)
}

/**
 * Find the most recent conversation file in a project directory.
 * Returns the session ID (filename without .jsonl) or null if none found.
 */
function findMostRecentConversation(cwd: string): string | null {
  const convDir = getConvDir(cwd)
  if (!fs.existsSync(convDir)) return null
  try {
    const entries = fs.readdirSync(convDir)
      .filter((e) => e.endsWith('.jsonl'))
      .map((e) => ({
        id: e.replace('.jsonl', ''),
        mtime: fs.statSync(path.join(convDir, e)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime)
    return entries.length > 0 ? entries[0].id : null
  } catch {
    return null
  }
}

/**
 * Pre-trust a directory for an AI provider so it skips the interactive trust prompt.
 */
export function ensureProviderTrust(provider: string, cwd: string): void {
  const normalizedProvider = provider.toLowerCase()
  try {
    if (normalizedProvider === 'claude') {
      ensureClaudeTrust(cwd)
      return
    }
    if (normalizedProvider === 'codex') {
      ensureCodexTrust(cwd)
      return
    }
  } catch {
    // Best effort — don't block agent launch if we can't write
  }
}

function normalizeComparablePath(targetPath: string): string {
  return targetPath.replace(/^\\\\\?\\/, '').replace(/\//g, '\\').toLowerCase()
}

export function canRecoverSessionByCwd(db: DatabaseService, session: any): boolean {
  const cwd = session?.worktree_path as string | undefined
  if (!cwd) return false

  const normalizedCwd = normalizeComparablePath(cwd)
  const otherSessionsUsingCwd = db.listSessions().filter((candidate: any) => {
    if (!candidate || candidate.id === session.id) return false
    if (candidate.status === 'deleted' || candidate.status === 'archived') return false
    const candidateCwd = candidate.worktree_path as string | undefined
    if (!candidateCwd) return false
    return normalizeComparablePath(candidateCwd) === normalizedCwd
  })

  return otherSessionsUsingCwd.length === 0
}

export async function getSessionResumeHealth(
  { db, pty }: Pick<HandlerServices, 'db' | 'pty'>,
  sessionId: string
): Promise<{
  canResume: boolean
  level: 'ok' | 'warning'
  reason: string | null
  guidance: string[]
}> {
  const session = db.getSession(sessionId)
  if (!session) {
    return {
      canResume: false,
      level: 'warning',
      reason: 'Session not found.',
      guidance: ['Reload the session list and verify the session still exists.']
    }
  }

  const cwd = fs.existsSync(session.worktree_path as string)
    ? (session.worktree_path as string)
    : (db.getProject(session.project_id as string)?.path as string || '')
  if (!cwd) {
    return {
      canResume: false,
      level: 'warning',
      reason: 'The session working directory is no longer available.',
      guidance: ['Restore the project path or create a new session from the project root.']
    }
  }

  const provider = (session.provider as string) || 'claude'

  if (session.type === 'quick-terminal') {
    return { canResume: true, level: 'ok', reason: null, guidance: [] }
  }

  if (provider === 'claude') {
    const allowCwdRecovery = canRecoverSessionByCwd(db, session)
    const claudeSessionId = session.claude_session_id as string | undefined
    if (claudeSessionId && claudeSessionExists(cwd, claudeSessionId)) {
      return { canResume: true, level: 'ok', reason: null, guidance: [] }
    }
    if (!allowCwdRecovery) {
      return {
        canResume: false,
        level: 'warning',
        reason: 'This direct session shares a project directory with other sessions, and its pinned Claude conversation is missing.',
        guidance: [
          'Resume the still-intact sibling session if that is the conversation you need.',
          'Create a worktree-backed session when you need parallel independent histories.',
          'Archive or delete stale duplicate direct sessions after confirming which one is canonical.'
        ]
      }
    }
    return { canResume: true, level: 'ok', reason: null, guidance: [] }
  }

  if (provider === 'codex') {
    const resolvedThread = await resolveCodexThreadForSession({ db, pty }, sessionId)
    if (resolvedThread.id) {
      if (
        resolvedThread.id !== session.provider_session_id ||
        (session.resume_status as string | undefined) !== 'ready'
      ) {
        persistCodexSessionIdentity(db, sessionId, resolvedThread.id, resolvedThread.source)
      }
      return { canResume: true, level: 'ok', reason: null, guidance: [] }
    }
    if ((session.resume_status as string | undefined) === 'launching') {
      return {
        canResume: false,
        level: 'warning',
        reason: (session.resume_reason as string | undefined) || 'Codex thread identity is still being captured for this session.',
        guidance: [
          'Keep the session running until Sorcerer captures the Codex thread.',
          'If the session already ended, start a new session instead of attempting an ambiguous resume.'
        ]
      }
    }
    if ((session.resume_status as string | undefined) === 'degraded') {
      return {
        canResume: false,
        level: 'warning',
        reason: (session.resume_reason as string | undefined) || 'Codex thread identity is missing for this session.',
        guidance: [
          'Start a fresh session if you no longer need to preserve the old Codex thread.',
          'Use worktree-backed sessions for parallel independent Codex work.',
          'Keep the session running until Sorcerer captures its thread identity.'
        ]
      }
    }
    return {
      canResume: false,
      level: 'warning',
      reason: 'Codex thread identity is missing for this session.',
      guidance: [
        'Keep the session running until Sorcerer captures the Codex thread.',
        'If the thread already exists in Codex CLI state, try Resume Session again after restarting Sorcerer.',
        'Start a new session if you no longer need the original Codex thread.'
      ]
    }
  }

  if (provider === 'gemini') {
    return {
      canResume: false,
      level: 'warning',
      reason: 'Gemini CLI sessions are restart-only in Sorcerer right now; there is no provider-backed resume identity.',
      guidance: [
        'Use New Session to continue working in the same project.',
        'Keep long-running work in a single live session if you need continuity until Sorcerer adds Gemini resume support.'
      ]
    }
  }

  if (provider === 'opencode') {
    return {
      canResume: false,
      level: 'warning',
      reason: 'OpenCode sessions are restart-only in Sorcerer right now; there is no provider-backed resume identity.',
      guidance: [
        'Use New Session to continue working in the same project.',
        'Keep long-running work in a single live session if you need continuity until Sorcerer adds OpenCode resume support.'
      ]
    }
  }

  return { canResume: true, level: 'ok', reason: null, guidance: [] }
}

export function getSessionDiagnostics(
  { db }: Pick<HandlerServices, 'db'>,
  sessionId: string
): {
  sessionId: string
  provider: string
  providerThreadId: string | null
  providerThreadLabel: string
  providerThreadSource: string | null
  resumeStatus: string | null
  resumeReason: string | null
  worktreePath: string | null
} | null {
  const session = db.getSession(sessionId)
  if (!session) return null

  const provider = (session.provider as string) || 'claude'
  const providerThreadId =
    provider === 'claude'
      ? (session.claude_session_id as string | null | undefined) || null
      : (session.provider_session_id as string | null | undefined) || null
  const providerThreadLabel =
    provider === 'codex'
      ? 'Codex Thread'
      : provider === 'claude'
        ? 'Claude Session'
        : 'Provider Session'

  return {
    sessionId: session.id as string,
    provider,
    providerThreadId,
    providerThreadLabel,
    providerThreadSource: (session.provider_session_source as string | null | undefined) || null,
    resumeStatus: (session.resume_status as string | null | undefined) || null,
    resumeReason: (session.resume_reason as string | null | undefined) || null,
    worktreePath: (session.worktree_path as string | null | undefined) || null
  }
}

export function markSessionResumeState(
  db: DatabaseService,
  sessionId: string,
  status: 'launching' | 'ready' | 'degraded' | 'unsupported',
  reason: string | null
): void {
  db.updateSession(sessionId, {
    resume_status: status,
    resume_reason: reason
  })
}

function getInitialResumeState(provider: string): { status: 'launching' | 'ready' | 'unsupported'; reason: string | null } {
  if (provider === 'codex') {
    return { status: 'launching', reason: 'Waiting for Codex thread capture.' }
  }
  if (provider === 'gemini') {
    return { status: 'unsupported', reason: 'Gemini CLI does not provide a session resume contract in Sorcerer yet.' }
  }
  if (provider === 'opencode') {
    return { status: 'unsupported', reason: 'OpenCode does not provide a session resume contract in Sorcerer yet.' }
  }
  return { status: 'ready', reason: null }
}

export function persistCodexSessionIdentity(
  db: DatabaseService,
  sessionId: string,
  providerSessionId: string,
  source: 'live-output' | 'scrollback' | 'exit-output' | 'cwd-recovery' | 'resume-discovery'
): void {
  const session = db.getSession(sessionId)
  if (!session) return

  const now = Math.floor(Date.now() / 1000)
  const updates: Record<string, unknown> = {
    provider_session_validated_at: now,
    resume_status: 'ready',
    resume_reason: null
  }

  if (session.provider_session_id !== providerSessionId) {
    updates.provider_session_id = providerSessionId
    updates.provider_session_captured_at = now
    updates.provider_session_source = source
  }

  db.updateSession(sessionId, updates)
}

function getLatestCodexStateDbPath(): string | null {
  const codexDir = path.join(os.homedir(), '.codex')
  if (!fs.existsSync(codexDir)) return null

  try {
    const entries = fs.readdirSync(codexDir)
      .filter((entry) => /^state.*\.sqlite$/i.test(entry))
      .map((entry) => ({
        name: entry,
        mtime: fs.statSync(path.join(codexDir, entry)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime)
    return entries.length > 0 ? path.join(codexDir, entries[0].name) : null
  } catch {
    return null
  }
}

async function getSqlJs(): Promise<any> {
  if (!sqlJsPromise) {
    const sqlJsDir = path.dirname(require.resolve('sql.js'))
    const wasmPath = path.join(sqlJsDir, 'sql-wasm.wasm')
    sqlJsPromise = initSqlJs({
      locateFile: () => wasmPath
    })
  }
  return sqlJsPromise
}

export function extractCodexThreadIdFromOutput(output: string): string | null {
  const cleaned = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
  const matches = [...cleaned.matchAll(/\bcodex resume(?:\s+--)?\s+([0-9a-fA-F-]{36})\b/g)]
  return matches.length > 0 ? matches[matches.length - 1]?.[1] || null : null
}

async function listCodexThreadsForCwd(
  cwd: string
): Promise<Array<{ id: string; created_at: number; updated_at: number }>> {
  const stateDbPath = getLatestCodexStateDbPath()
  if (!stateDbPath || !fs.existsSync(stateDbPath)) return []

  const SQL = await getSqlJs()
  const stateDb = new SQL.Database(fs.readFileSync(stateDbPath))
  const wantedCwd = normalizeComparablePath(cwd)

  try {
    const stmt = stateDb.prepare(`
      SELECT id, cwd, created_at, updated_at
      FROM threads
      WHERE archived = 0 AND source = 'cli'
      ORDER BY updated_at DESC
      LIMIT 200
    `)

    const matches: Array<{ id: string; created_at: number; updated_at: number }> = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        id?: string
        cwd?: string
        created_at?: number
        updated_at?: number
      }
      if (!row.id || !row.cwd) continue
      if (normalizeComparablePath(String(row.cwd)) !== wantedCwd) continue
      matches.push({
        id: String(row.id),
        created_at: Number(row.created_at || 0),
        updated_at: Number(row.updated_at || 0)
      })
    }
    stmt.free()

    return matches
  } catch {
    return []
  } finally {
    stateDb.close()
  }
}

export async function findCodexThreadIdForCwd(
  cwd: string,
  anchorAt?: number | null
): Promise<string | null> {
  const matches = await listCodexThreadsForCwd(cwd)
  if (matches.length === 0) return null

  if (anchorAt) {
    const recentMatches = matches.filter((match) => match.created_at >= anchorAt - 300)
    const pool = recentMatches.length > 0 ? recentMatches : matches
    pool.sort((left, right) => {
      const leftDistance = Math.abs(left.created_at - anchorAt)
      const rightDistance = Math.abs(right.created_at - anchorAt)
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return right.updated_at - left.updated_at
    })
    return pool[0]?.id || null
  }

  return matches[0]?.id || null
}

async function codexThreadBelongsToCwd(threadId: string, cwd: string): Promise<boolean> {
  const matches = await listCodexThreadsForCwd(cwd)
  return matches.some((match) => match.id === threadId)
}

export async function resolveCodexThreadForSession(
  { db, pty }: Pick<HandlerServices, 'db' | 'pty'>,
  sessionId: string
): Promise<{ id: string | null; source: 'stored' | 'scrollback' | 'cwd-recovery' | 'resume-discovery' | null }> {
  const session = db.getSession(sessionId)
  if (!session) return { id: null, source: null }

  const cwd = fs.existsSync(session.worktree_path as string)
    ? (session.worktree_path as string)
    : (db.getProject(session.project_id as string)?.path as string || '')
  if (!cwd) return { id: null, source: null }

  const storedThreadId = session.provider_session_id as string | undefined
  if (storedThreadId && await codexThreadBelongsToCwd(storedThreadId, cwd)) {
    return { id: storedThreadId, source: 'stored' }
  }

  const scrollbackThreadId = extractCodexThreadIdFromOutput(pty.scrollback.getScrollback(sessionId))
  if (scrollbackThreadId && await codexThreadBelongsToCwd(scrollbackThreadId, cwd)) {
    return { id: scrollbackThreadId, source: 'scrollback' }
  }

  // Recovery should prefer the Sorcerer session's original creation time.
  // `started_at` changes on every restart/resume and can point at an unrelated
  // newer Codex thread in the same cwd.
  const recoveryAnchor =
    (session.created_at as number | null | undefined) ||
    (session.provider_session_captured_at as number | null | undefined) ||
    (session.started_at as number | null | undefined) ||
    null
  const recoveredThreadId = await findCodexThreadIdForCwd(
    cwd,
    recoveryAnchor
  )
  if (recoveredThreadId) {
    return {
      id: recoveredThreadId,
      source: storedThreadId ? 'resume-discovery' : 'cwd-recovery'
    }
  }

  return { id: null, source: null }
}

export async function reconcileCodexSessions(
  db: DatabaseService
): Promise<{ checked: number; updated: number }> {
  const sessions = db.listSessions().filter((session: any) =>
    session?.provider === 'codex' &&
    session?.type !== 'quick-terminal' &&
    session?.status !== 'deleted'
  )

  let updated = 0
  for (const session of sessions) {
    const cwd = fs.existsSync(session.worktree_path as string)
      ? (session.worktree_path as string)
      : (db.getProject(session.project_id as string)?.path as string || '')
    if (!cwd) continue

    const storedThreadId = session.provider_session_id as string | undefined
    if (storedThreadId && await codexThreadBelongsToCwd(storedThreadId, cwd)) {
      if ((session.resume_status as string | undefined) !== 'ready') {
        markSessionResumeState(db, session.id, 'ready', null)
      }
      continue
    }

    const recoveredThreadId = await findCodexThreadIdForCwd(
      cwd,
      (session.created_at as number | null | undefined) ||
      (session.started_at as number | null | undefined) ||
      null
    )

    if (recoveredThreadId) {
      persistCodexSessionIdentity(
        db,
        session.id,
        recoveredThreadId,
        storedThreadId ? 'resume-discovery' : 'cwd-recovery'
      )
      updated++
      continue
    }

    if (!storedThreadId) {
      markSessionResumeState(
        db,
        session.id,
        'degraded',
        'Codex thread identity is missing for this session.'
      )
    }
  }

  return { checked: sessions.length, updated }
}

export async function scanImportableSessions(
  { db }: Pick<HandlerServices, 'db'>,
  projectId?: string
): Promise<ExternalSessionImportCandidate[]> {
  const projects = db.listProjects()
  const targetProject = projectId ? db.getProject(projectId) : null
  const existingSessions = db.listSessions().filter((session: any) => session.status !== 'deleted')
  const existingClaudeIds = new Set(
    existingSessions
      .map((session: any) => session.claude_session_id as string | undefined)
      .filter((value): value is string => !!value)
  )
  const existingProviderIds = new Set(
    existingSessions
      .map((session: any) => session.provider_session_id as string | undefined)
      .filter((value): value is string => !!value)
  )

  const candidates: ExternalSessionImportCandidate[] = []
  const seenCandidateIds = new Set<string>()

  const claudeTranscriptSessionsByCwd = new Map<string, ReturnType<typeof readClaudeTranscriptSessions>>()
  const getClaudeTranscriptSessions = (cwd: string) => {
    const normalizedCwd = normalizeComparablePath(cwd)
    const existing = claudeTranscriptSessionsByCwd.get(normalizedCwd)
    if (existing) return existing
    const sessions = readClaudeTranscriptSessions(cwd)
    claudeTranscriptSessionsByCwd.set(normalizedCwd, sessions)
    return sessions
  }

  for (const runtimeSession of readClaudeRuntimeSessions()) {
    const cwd = String(runtimeSession.cwd)
    if (!fs.existsSync(cwd)) continue
    if (existingClaudeIds.has(runtimeSession.sessionId)) continue
    if (targetProject && normalizeComparablePath(targetProject.path as string) !== normalizeComparablePath(cwd)) continue

    const project = projects.find((entry: any) => normalizeComparablePath(entry.path as string) === normalizeComparablePath(cwd))
    const branch = await detectBranchForPath(cwd)
    const transcriptTitle =
      getClaudeTranscriptSessions(cwd).find((entry) => entry.sessionId === runtimeSession.sessionId)?.title || ''
    const candidateId = `claude:${runtimeSession.sessionId}`
    if (seenCandidateIds.has(candidateId)) continue
    candidates.push({
      id: candidateId,
      provider: 'claude',
      providerSessionId: runtimeSession.sessionId,
      title: transcriptTitle || branch || path.basename(cwd),
      cwd,
      createdAt: runtimeSession.startedAt || 0,
      updatedAt: runtimeSession.startedAt || null,
      branch,
      model: '',
      projectId: project?.id || null,
      projectName: (project?.name as string | undefined) || path.basename(cwd),
      projectPath: project?.path as string || cwd,
      willCreateProject: !project
    })
    seenCandidateIds.add(candidateId)
  }

  const transcriptProjects = targetProject ? [targetProject] : projects
  for (const project of transcriptProjects) {
    const cwd = project.path as string
    if (!cwd || !fs.existsSync(cwd)) continue

    const branch = await detectBranchForPath(cwd)
    for (const transcriptSession of getClaudeTranscriptSessions(cwd)) {
      if (existingClaudeIds.has(transcriptSession.sessionId)) continue

      const candidateId = `claude:${transcriptSession.sessionId}`
      if (seenCandidateIds.has(candidateId)) continue

      candidates.push({
        id: candidateId,
        provider: 'claude',
        providerSessionId: transcriptSession.sessionId,
        title: transcriptSession.title || branch || path.basename(cwd),
        cwd,
        createdAt: transcriptSession.updatedAt || 0,
        updatedAt: transcriptSession.updatedAt || null,
        branch,
        model: '',
        projectId: project.id as string,
        projectName: (project.name as string | undefined) || path.basename(cwd),
        projectPath: project.path as string || cwd,
        willCreateProject: false
      })
      seenCandidateIds.add(candidateId)
    }
  }

  const stateDbPath = getLatestCodexStateDbPath()
  if (stateDbPath && fs.existsSync(stateDbPath)) {
    const SQL = await getSqlJs()
    const stateDb = new SQL.Database(fs.readFileSync(stateDbPath))
    try {
      const stmt = stateDb.prepare(`
        SELECT id, cwd, title, created_at, updated_at, model
        FROM threads
        WHERE archived = 0 AND source = 'cli'
        ORDER BY updated_at DESC
        LIMIT 500
      `)

      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          id?: string
          cwd?: string
          title?: string
          created_at?: number
          updated_at?: number
          model?: string
        }
        if (!row.id || !row.cwd) continue
        const cwd = String(row.cwd).replace(/^\\\\\?\\/, '')
        if (!fs.existsSync(cwd)) continue
        if (existingProviderIds.has(String(row.id))) continue
        if (targetProject && normalizeComparablePath(targetProject.path as string) !== normalizeComparablePath(cwd)) continue

        const project = projects.find((entry: any) => normalizeComparablePath(entry.path as string) === normalizeComparablePath(cwd))
        const branch = await detectBranchForPath(cwd)
        candidates.push({
          id: `codex:${row.id}`,
          provider: 'codex',
          providerSessionId: String(row.id),
          title: String(row.title || '').trim() || branch || path.basename(cwd),
          cwd,
          createdAt: Number(row.created_at || 0),
          updatedAt: Number(row.updated_at || 0) || null,
          branch,
          model: String(row.model || ''),
          projectId: project?.id || null,
          projectName: (project?.name as string | undefined) || path.basename(cwd),
          projectPath: project?.path as string || cwd,
          willCreateProject: !project
        })
      }
      stmt.free()
    } finally {
      stateDb.close()
    }
  }

  candidates.sort((left, right) => {
    const leftStamp = left.updatedAt || left.createdAt || 0
    const rightStamp = right.updatedAt || right.createdAt || 0
    return rightStamp - leftStamp
  })

  return candidates
}

export async function importExternalSessions(
  services: Pick<HandlerServices, 'db'>,
  candidateIds: string[]
): Promise<any[]> {
  const { db } = services
  const available = await scanImportableSessions(services)
  const selected = available.filter((candidate) => candidateIds.includes(candidate.id))
  const imported: any[] = []

  for (const candidate of selected) {
    let projectId = candidate.projectId
    if (!projectId) {
      const createdProject = addProjectByPath(services, candidate.projectPath, candidate.projectName)
      projectId = createdProject?.id as string
    }
    if (!projectId) continue

    const importedSession = db.addSession({
      id: uuidv4(),
      project_id: projectId,
      name: deriveImportedSessionName(candidate),
      branch: candidate.branch,
      worktree_path: candidate.cwd,
      status: 'idle',
      claude_session_id: candidate.provider === 'claude' ? candidate.providerSessionId : undefined,
      provider_session_id: candidate.provider === 'codex' ? candidate.providerSessionId : null,
      started_at: candidate.createdAt || null,
      provider_session_captured_at: candidate.createdAt || null,
      provider_session_validated_at: Math.floor(Date.now() / 1000),
      provider_session_source: 'import',
      resume_status: 'ready',
      resume_reason: null,
      provider: candidate.provider,
      model: candidate.model || ''
    })
    imported.push(importedSession)
  }

  return imported
}

function ensureClaudeTrust(cwd: string): void {
  const key = cwd.replace(/\\/g, '/')
  const configPath = path.join(os.homedir(), '.claude.json')
  const data = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {}
  if (!data.projects) data.projects = {}
  if (data.projects[key]?.hasTrustDialogAccepted) return
  data.projects[key] = {
    ...(data.projects[key] || {}),
    allowedTools: [],
    hasTrustDialogAccepted: true
  }
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}

function ensureCodexTrust(cwd: string): void {
  const codexDir = path.join(os.homedir(), '.codex')
  const configPath = path.join(codexDir, 'config.toml')
  const section = `[projects.'${cwd.replace(/'/g, "\\'")}']`
  const trustLine = 'trust_level = "trusted"'

  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true })
  }

  const source = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : ''
  const lines = source.length > 0 ? source.split(/\r?\n/) : []
  const sectionIndex = lines.findIndex((line) => line.trim() === section)

  if (sectionIndex === -1) {
    const next = source.trimEnd()
    const prefix = next.length > 0 ? `${next}\n\n` : ''
    fs.writeFileSync(configPath, `${prefix}${section}\n${trustLine}\n`)
    return
  }

  let endIndex = lines.length
  for (let i = sectionIndex + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('[')) {
      endIndex = i
      break
    }
  }

  const trustIndex = lines.findIndex((line, index) =>
    index > sectionIndex &&
    index < endIndex &&
    line.trim().startsWith('trust_level')
  )

  if (trustIndex !== -1) {
    if (lines[trustIndex].trim() === trustLine) return
    lines[trustIndex] = trustLine
  } else {
    lines.splice(endIndex, 0, trustLine)
  }

  fs.writeFileSync(configPath, `${lines.join('\n').trimEnd()}\n`)
}

// ── Resume failure detection ────────────────────────────────
//
// Tracks sessions/agents spawned via --continue or --resume so we can detect early exits
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
  'could not find conversation',
  'No saved session found with ID'
]

/**
 * Mark a session as having just been resumed via --resume/--continue.
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
  { db }: Pick<HandlerServices, 'db'>,
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
  remoteControl?: boolean,
  provider?: string,
  model: string = ''
): Promise<any> {
  const resolvedProvider = provider || getDefaultProviderId(db)
  const resolvedModel = resolveLaunchModel(db, resolvedProvider, model, { refresh: resolvedProvider === 'codex' })
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

  // Create session record with a pinned conversation ID (for Claude)
  const id = uuidv4()
  const claudeSessionId = uuidv4()
  const skipPerms = bypassPermissions !== false  // default true
  const rc = remoteControl ? 1 : 0
  const startedAt = Math.floor(Date.now() / 1000)
  const initialResumeState = getInitialResumeState(resolvedProvider)
  const session = db.addSession({
    id,
    project_id: projectId,
    name: sessionName,
    branch,
    worktree_path: worktreePath,
    bypass_permissions: skipPerms ? 1 : 0,
    remote_control: rc,
    claude_session_id: claudeSessionId,
    provider_session_id: null,
    started_at: startedAt,
    provider_session_captured_at: null,
    provider_session_validated_at: null,
    provider_session_source: null,
    resume_status: initialResumeState.status,
    resume_reason: initialResumeState.reason,
    provider: resolvedProvider,
    model: resolvedModel
  })
  console.log('[session:create] Session saved:', { id, claudeSessionId, status: session?.status })

  const runner = getProviderRunner(resolvedProvider)
  ensureProviderTrust(resolvedProvider, worktreePath)

  const args = runner.getArgs({
    bypassPermissions: skipPerms,
    model: resolvedModel
  })

  // Add provider-specific session pinning
  if (resolvedProvider === 'claude') {
    args.push('--session-id', claudeSessionId)
  }

  pty.spawn(id, worktreePath, {
    command: runner.resolveBinary(),
    args,
    env: runner.getEnv(id)
  })
  const pid = pty.getPid(id)
  console.log(`[session:create] ${resolvedProvider} spawned, pid:`, pid)
  if (pid) {
    db.updateSession(id, { pid })
  }

  // Enable Remote Control if requested (only if provider supports it via /remote-control)
  if (remoteControl && provider === 'claude') {
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
  const startedAt = Math.floor(Date.now() / 1000)
  const session = db.addSession({
    id,
    project_id: source.project_id as string,
    name,
    branch: source.branch as string,
    worktree_path: source.worktree_path as string,
    type: 'quick-terminal',
    parent_session_id: sourceSessionId,
    started_at: startedAt
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
    const provider = (session.provider as string) || 'claude'
    const resolvedModel = resolveLaunchModel(db, provider, session.model as string, { refresh: provider === 'codex' })
    const runner = getProviderRunner(provider)
    ensureProviderTrust(provider, cwd)

    const args = runner.getArgs({
      bypassPermissions: session.bypass_permissions !== 0,
      model: resolvedModel
    })

    if (provider === 'claude') {
      const newClaudeSessionId = uuidv4()
      db.updateSession(sessionId, { claude_session_id: newClaudeSessionId })
      args.push('--session-id', newClaudeSessionId)
    } else if (provider === 'codex') {
      db.updateSession(sessionId, {
        provider_session_id: null,
        provider_session_captured_at: null,
        provider_session_validated_at: null,
        provider_session_source: null,
        resume_status: 'launching',
        resume_reason: 'Waiting for Codex thread capture.'
      })
    } else if (provider === 'gemini') {
      markSessionResumeState(db, sessionId, 'unsupported', 'Gemini CLI sessions are restart-only in Sorcerer right now.')
    } else if (provider === 'opencode') {
      markSessionResumeState(db, sessionId, 'unsupported', 'OpenCode sessions are restart-only in Sorcerer right now.')
    }

    const updates: Record<string, unknown> = {}
    if (resolvedModel !== (session.model as string)) {
      updates.model = resolvedModel
    }
    pty.spawn(sessionId, cwd, {
      command: runner.resolveBinary(),
      args,
      env: runner.getEnv(sessionId)
    })
    if (Object.keys(updates).length > 0) {
      db.updateSession(sessionId, updates)
    }

    // Re-enable Remote Control if previously set
    if (session.remote_control && provider === 'claude') {
      enableRemoteControl(pty, sessionId)
    }
  }
  const pid = pty.getPid(sessionId)
  db.updateSession(sessionId, { status: 'active', pid: pid ?? null, started_at: Math.floor(Date.now() / 1000) })

  return db.getSession(sessionId)
}

export async function resumeSession(
  { db, pty }: HandlerServices,
  sessionId: string
): Promise<any> {
  const session = db.getSession(sessionId)
  if (!session) throw new Error('Session not found')
  const resumeHealth = await getSessionResumeHealth({ db, pty }, sessionId)
  if (!resumeHealth.canResume) {
    throw new Error(`${resumeHealth.reason} ${resumeHealth.guidance.join(' ')}`.trim())
  }

  // Kill existing process if running
  if (pty.isRunning(sessionId)) {
    pty.kill(sessionId)
  }

  // Check if worktree directory still exists
  const cwd = fs.existsSync(session.worktree_path as string)
    ? (session.worktree_path as string)
    : (db.getProject(session.project_id as string)?.path as string || process.cwd())

  if (session.type === 'quick-terminal') {
    // Quick terminal: just restart the shell
    console.log(`[session:resume] ${sessionId}: quick-terminal restart in ${cwd}`)
    pty.spawn(sessionId, cwd)
  } else {
    const provider = (session.provider as string) || 'claude'
    const resolvedModel = resolveLaunchModel(db, provider, session.model as string, { refresh: provider === 'codex' })
    const runner = getProviderRunner(provider)
    ensureProviderTrust(provider, cwd)

    let args: string[]

    if (provider === 'claude') {
      const allowCwdRecovery = canRecoverSessionByCwd(db, session)
      let claudeSessionId = session.claude_session_id as string | undefined
      let selectionSource = claudeSessionId ? 'stored' : 'none'
      if (claudeSessionId && !claudeSessionExists(cwd, claudeSessionId)) {
        if (allowCwdRecovery) {
          console.log(`[session:resume] Stored claude_session_id ${claudeSessionId} not found in Claude state, searching for recoverable session...`)
          const actual =
            findMostRecentConversation(cwd) ||
            findMostRecentClaudeRuntimeSession(cwd)
          if (actual) {
            console.log(`[session:resume] Recovered Claude session: ${actual}`)
            claudeSessionId = actual
            selectionSource = 'recovered'
            db.updateSession(sessionId, { claude_session_id: claudeSessionId })
          } else {
            console.log(`[session:resume] No Claude resume target found for cwd: ${cwd}`)
            claudeSessionId = undefined
            selectionSource = 'fresh'
          }
        } else {
          console.log(`[session:resume] Stored claude_session_id ${claudeSessionId} missing; cwd recovery disabled because multiple sessions share ${cwd}`)
          claudeSessionId = undefined
          selectionSource = 'fresh'
        }
      } else if (claudeSessionId && !conversationFileExists(cwd, claudeSessionId)) {
        if (allowCwdRecovery) {
          const transcriptSessionId = findMostRecentConversation(cwd)
          if (transcriptSessionId && transcriptSessionId !== claudeSessionId) {
            console.log(`[session:resume] Replacing runtime-only Claude session ${claudeSessionId} with transcript session ${transcriptSessionId}`)
            claudeSessionId = transcriptSessionId
            selectionSource = 'transcript-upgrade'
            db.updateSession(sessionId, { claude_session_id: claudeSessionId })
          }
        } else {
          console.log(`[session:resume] Keeping runtime-only Claude session ${claudeSessionId}; transcript upgrade disabled because multiple sessions share ${cwd}`)
        }
      }

      args = runner.getArgs({
        bypassPermissions: session.bypass_permissions !== 0,
        model: resolvedModel
      })

      if (claudeSessionId) {
        args.push('--resume', claudeSessionId)
        markSessionResumeState(db, sessionId, 'ready', null)
        console.log(`[session:resume] ${sessionId}: provider=claude mode=resume source=${selectionSource} target=${claudeSessionId} cwd=${cwd}`)
      } else {
        claudeSessionId = uuidv4()
        db.updateSession(sessionId, {
          claude_session_id: claudeSessionId,
          resume_status: 'ready',
          resume_reason: null
        })
        args.push('--session-id', claudeSessionId)
        console.log(`[session:resume] ${sessionId}: provider=claude mode=fresh-session-id target=${claudeSessionId} cwd=${cwd}`)
      }
      trackResume(sessionId)
    } else if (provider === 'codex') {
      const resolvedThread = await resolveCodexThreadForSession({ db, pty }, sessionId)
      const providerSessionId = resolvedThread.id || undefined
      const selectionSource = resolvedThread.source || 'none'
      if (!providerSessionId) {
        console.log(`[session:resume] No Codex thread id available for ${sessionId}; blocking resume because provider identity is missing`)
        markSessionResumeState(db, sessionId, 'degraded', 'Codex thread identity missing; resume would require inference.')
        throw new Error('Codex thread identity is missing for this session. Start a new session instead of attempting an ambiguous resume.')
      }
      if (selectionSource !== 'stored') {
        console.log(`[session:resume] Recovered Codex thread: ${providerSessionId} via ${selectionSource}`)
        persistCodexSessionIdentity(
          db,
          sessionId,
          providerSessionId,
          selectionSource === 'scrollback' ? 'scrollback' : 'resume-discovery'
        )
      }

      const baseArgs = runner.getArgs({
        bypassPermissions: session.bypass_permissions !== 0,
        model: resolvedModel
      })

      args = providerSessionId ? ['resume', providerSessionId, ...baseArgs] : baseArgs
      if (providerSessionId) {
        db.updateSession(sessionId, {
          provider_session_validated_at: Math.floor(Date.now() / 1000),
          resume_status: 'ready',
          resume_reason: null
        })
        console.log(`[session:resume] ${sessionId}: provider=codex mode=resume source=${selectionSource} target=${providerSessionId} cwd=${cwd}`)
      }
      if (providerSessionId) trackResume(sessionId)
    } else {
      args = runner.getArgs({
        bypassPermissions: session.bypass_permissions !== 0,
        model: resolvedModel,
        hasHistory: true
      })
      console.log(`[session:resume] ${sessionId}: provider=${provider} mode=history cwd=${cwd}`)
    }

    pty.spawn(sessionId, cwd, {
      command: runner.resolveBinary(),
      args,
      env: runner.getEnv(sessionId)
    })
    if (resolvedModel !== (session.model as string)) {
      db.updateSession(sessionId, { model: resolvedModel })
    }

    // Re-enable Remote Control if previously set
    if (session.remote_control && provider === 'claude') {
      enableRemoteControl(pty, sessionId)
    }
  }
  const pid = pty.getPid(sessionId)
  db.updateSession(sessionId, { status: 'active', pid: pid ?? null, started_at: Math.floor(Date.now() / 1000) })

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
  data: { name: string; description?: string; system_prompt?: string; mcp_config?: string; mission?: string; created_at?: number; provider?: string; model?: string }
): void {
  const dir = path.join(os.homedir(), '.sorcerer', 'agents', agentId)
  fs.mkdirSync(dir, { recursive: true })
  const manifest = {
    name: data.name,
    description: data.description || '',
    system_prompt: data.system_prompt || '',
    mcp_config: data.mcp_config || '',
    mission: data.mission || '',
    created_at: data.created_at || Math.floor(Date.now() / 1000),
    provider: data.provider || '',
    model: data.model || ''
  }
  fs.writeFileSync(path.join(dir, 'agent.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

export function addAgent(
  { db }: HandlerServices,
  data: {
    id?: string; name: string; description?: string; system_prompt?: string; mcp_config?: string;
    bypass_permissions?: boolean; remote_control?: boolean;
    mission?: string; auto_start?: boolean; auto_restart?: boolean; restart_delay?: number; max_restarts?: number; schedule_minutes?: number;
    provider?: string; model?: string
  }
): any {
  const id = data.id || uuidv4()
  const resolvedProvider = data.provider || getDefaultProviderId(db)
  const resolvedModel = resolveLaunchModel(db, resolvedProvider, data.model, { refresh: resolvedProvider === 'codex' })
  // Create scratch directory for this agent
  const cwd = path.join(os.homedir(), '.sorcerer', 'agents', id)
  fs.mkdirSync(cwd, { recursive: true })
  ensureProviderTrust(resolvedProvider, cwd)
  const agent = db.addAgent({
    id, ...data,
    bypass_permissions: (data.bypass_permissions !== false) ? 1 : 0,
    remote_control: data.remote_control ? 1 : 0,
    mission: data.mission || '',
    auto_start: data.auto_start ? 1 : 0,
    auto_restart: data.auto_restart ? 1 : 0,
    restart_delay: data.restart_delay ?? 30,
    max_restarts: data.max_restarts ?? 10,
    schedule_minutes: data.schedule_minutes ?? 0,
    provider: resolvedProvider,
    model: resolvedModel
  })
  writeAgentManifest(id, { ...data, provider: resolvedProvider, model: resolvedModel })
  return agent
}

export function updateAgent(
  { db }: HandlerServices,
  id: string,
  updates: any
): any {
  const agent = db.updateAgent(id, updates)
  // Keep manifest in sync when metadata changes
  if (agent && (updates.name || updates.description || updates.system_prompt || updates.mcp_config || updates.mission !== undefined || updates.provider || updates.model)) {
    writeAgentManifest(id, {
      name: agent.name as string,
      description: agent.description as string,
      system_prompt: agent.system_prompt as string,
      mcp_config: agent.mcp_config as string,
      mission: agent.mission as string,
      created_at: agent.created_at as number,
      provider: agent.provider as string,
      model: agent.model as string
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
  
  const provider = (agent.provider as string) || 'claude'
  const resolvedModel = resolveLaunchModel(db, provider, agent.model as string, { refresh: provider === 'codex' })
  const runner = getProviderRunner(provider)
  ensureProviderTrust(provider, cwd)

  const args = runner.getArgs({
    mission: agent.mission as string,
    systemPrompt: agent.system_prompt as string,
    mcpConfig: agent.mcp_config as string,
    bypassPermissions: agent.bypass_permissions !== 0,
    model: resolvedModel
  })

  if (provider === 'claude') {
    const claudeSessionId = uuidv4()
    args.push('--session-id', claudeSessionId)
  }

  pty.spawn(agentId, cwd, {
    command: runner.resolveBinary(),
    args,
    env: runner.getEnv(agentId)
  })
  if (resolvedModel !== (agent.model as string)) {
    db.updateAgent(agentId, { model: resolvedModel })
  }
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Enable Remote Control if configured (only for interactive agents, and if supported)
  if (agent.remote_control && !agent.mission && provider === 'claude') {
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
  
  const provider = (agent.provider as string) || 'claude'
  const resolvedModel = resolveLaunchModel(db, provider, agent.model as string, { refresh: provider === 'codex' })
  const runner = getProviderRunner(provider)
  ensureProviderTrust(provider, cwd)

  const args = runner.getArgs({
    mission: agent.mission as string,
    systemPrompt: agent.system_prompt as string,
    mcpConfig: agent.mcp_config as string,
    bypassPermissions: agent.bypass_permissions !== 0,
    model: resolvedModel,
    hasHistory: true
  })

  if (provider === 'claude') {
    trackResume(agentId)
  }

  pty.spawn(agentId, cwd, {
    command: runner.resolveBinary(),
    args,
    env: runner.getEnv(agentId)
  })
  if (resolvedModel !== (agent.model as string)) {
    db.updateAgent(agentId, { model: resolvedModel })
  }
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Re-enable Remote Control if configured
  if (agent.remote_control && provider === 'claude') {
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
  
  const provider = (agent.provider as string) || 'claude'
  const resolvedModel = resolveLaunchModel(db, provider, agent.model as string, { refresh: provider === 'codex' })
  const runner = getProviderRunner(provider)
  ensureProviderTrust(provider, cwd)

  const args = runner.getArgs({
    mission: agent.mission as string,
    systemPrompt: agent.system_prompt as string,
    mcpConfig: agent.mcp_config as string,
    bypassPermissions: agent.bypass_permissions !== 0,
    model: resolvedModel,
    hasHistory: false
  })

  if (provider === 'claude') {
    const claudeSessionId = uuidv4()
    args.push('--session-id', claudeSessionId)
  }

  pty.spawn(agentId, cwd, {
    command: runner.resolveBinary(),
    args,
    env: runner.getEnv(agentId)
  })
  if (resolvedModel !== (agent.model as string)) {
    db.updateAgent(agentId, { model: resolvedModel })
  }
  const pid = pty.getPid(agentId)
  db.updateAgent(agentId, { status: 'active', pid: pid ?? null })

  // Re-enable Remote Control if configured
  if (agent.remote_control && provider === 'claude') {
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

export function listProviders(
  { db }: HandlerServices
): any[] {
  return listProviderRegistry(db)
}

export function refreshProviders(
  { db }: HandlerServices
): any[] {
  return refreshProviderRegistry(db)
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
