import { describe, expect, it } from 'vitest'
import { canRecoverSessionByCwd, getCodexRecoveryAnchor, getImportedCodexSessionState, persistCodexSessionIdentity, resolveCodexExitThreadIdentity, resolveCodexSubAgentRow, resolveSessionWorkingDirectory, selectCodexThreadForAnchor } from '../../ipc/shared-handlers'

describe('Codex session recovery helpers', () => {
  it('prefers the thread closest to the session creation time', () => {
    const selected = selectCodexThreadForAnchor(
      [
        { id: 'older', created_at: 1776635886, updated_at: 1776636263 },
        { id: 'exact', created_at: 1776642201, updated_at: 1776646955 },
        { id: 'newer', created_at: 1776647153, updated_at: 1776647294 }
      ],
      1776642201
    )

    expect(selected).toBe('exact')
  })

  it('refuses to guess when no thread is close to the session anchor', () => {
    const selected = selectCodexThreadForAnchor(
      [
        { id: 'older', created_at: 1776635886, updated_at: 1776636263 },
        { id: 'newer', created_at: 1776647153, updated_at: 1776647294 }
      ],
      1776642201
    )

    expect(selected).toBeNull()
  })

  it('falls back through stable session timestamps in priority order', () => {
    expect(getCodexRecoveryAnchor({
      provider_session_captured_at: 200,
      started_at: 300,
      created_at: 100,
      provider_session_id: 'thread-1',
      resume_status: 'ready'
    })).toBe(200)

    expect(getCodexRecoveryAnchor({
      provider_session_captured_at: null,
      started_at: 300,
      created_at: 100,
      provider_session_id: null,
      resume_status: 'launching'
    })).toBe(300)

    expect(getCodexRecoveryAnchor({
      provider_session_captured_at: null,
      started_at: 300,
      created_at: 100,
      provider_session_id: null,
      resume_status: 'ready'
    })).toBe(100)
  })

  it('ignores quick terminals when deciding if cwd recovery is ambiguous', () => {
    const db = {
      listSessions: () => [
        { id: 'session-1', worktree_path: 'C:\\repo', status: 'idle', type: 'session', provider: 'claude' },
        { id: 'terminal-1', worktree_path: 'C:\\repo', status: 'idle', type: 'quick-terminal' }
      ]
    }

    expect(canRecoverSessionByCwd(db as any, db.listSessions()[0])).toBe(true)
  })

  it('ignores same-cwd sessions from other providers when deciding if recovery is ambiguous', () => {
    const db = {
      listSessions: () => [
        { id: 'session-1', worktree_path: 'C:\\repo', status: 'idle', type: 'session', provider: 'claude' },
        { id: 'session-2', worktree_path: 'C:\\repo', status: 'idle', type: 'session', provider: 'codex' }
      ]
    }

    expect(canRecoverSessionByCwd(db as any, db.listSessions()[0])).toBe(true)
    expect(canRecoverSessionByCwd(db as any, db.listSessions()[1])).toBe(true)
  })

  it('refuses project-root fallback when the missing worktree points somewhere else', () => {
    const db = {
      getProject: () => ({ path: 'C:\\project' })
    }
    const session = {
      project_id: 'project-1',
      worktree_path: 'C:\\worktrees\\feature-a'
    }

    expect(resolveSessionWorkingDirectory(db as any, session, {
      allowProjectFallback: true,
      pathExists: (targetPath) => targetPath === 'C:\\project'
    })).toBeNull()
  })

  it('allows project fallback only when the session was already rooted there', () => {
    const db = {
      getProject: () => ({ path: 'C:\\project' })
    }
    const session = {
      project_id: 'project-1',
      worktree_path: '\\\\?\\C:\\project'
    }

    expect(resolveSessionWorkingDirectory(db as any, session, {
      allowProjectFallback: true,
      pathExists: (targetPath) => targetPath === 'C:\\project'
    })).toBe('C:\\project')
  })

  it('marks imported Codex sessions ready only after cwd validation succeeds', async () => {
    const state = await getImportedCodexSessionState('thread-1', 'C:\\repo', {
      validatedAt: 123,
      belongsToCwd: async (threadId, cwd) => threadId === 'thread-1' && cwd === 'C:\\repo'
    })

    expect(state).toEqual({
      providerSessionId: 'thread-1',
      providerSessionValidatedAt: 123,
      providerSessionSource: 'import',
      resumeStatus: 'ready',
      resumeReason: null
    })
  })

  it('marks imported Codex sessions degraded when cwd validation fails', async () => {
    const state = await getImportedCodexSessionState('thread-1', 'C:\\repo', {
      belongsToCwd: async () => false
    })

    expect(state.providerSessionId).toBe('thread-1')
    expect(state.providerSessionValidatedAt).toBeNull()
    expect(state.providerSessionSource).toBe('import-unverified')
    expect(state.resumeStatus).toBe('degraded')
    expect(state.resumeReason).toContain('could not be validated')
  })

  it('persists the thread anchor from session start time instead of capture time', () => {
    const updates: Record<string, unknown>[] = []
    const db = {
      getSession: () => ({
        id: 'session-1',
        provider_session_id: null,
        provider_session_source: null,
        provider_session_captured_at: null,
        started_at: 500,
        created_at: 100
      }),
      updateSession: (_sessionId: string, update: Record<string, unknown>) => {
        updates.push(update)
      }
    }

    persistCodexSessionIdentity(db as any, 'session-1', 'thread-1', 'live-output')

    expect(updates).toHaveLength(1)
    expect(updates[0]?.provider_session_id).toBe('thread-1')
    expect(updates[0]?.provider_session_captured_at).toBe(500)
    expect(updates[0]?.provider_session_source).toBe('live-output')
  })

  it('upgrades heuristic source metadata when the same thread is later confirmed', () => {
    const updates: Record<string, unknown>[] = []
    const db = {
      getSession: () => ({
        id: 'session-1',
        provider_session_id: 'thread-1',
        provider_session_source: 'cwd-recovery',
        provider_session_captured_at: 500,
        started_at: 500,
        created_at: 100
      }),
      updateSession: (_sessionId: string, update: Record<string, unknown>) => {
        updates.push(update)
      }
    }

    persistCodexSessionIdentity(db as any, 'session-1', 'thread-1', 'live-output')

    expect(updates).toHaveLength(1)
    expect(updates[0]?.provider_session_source).toBe('live-output')
    expect(updates[0]?.provider_session_captured_at).toBeUndefined()
  })

  it('promotes a stored heuristic Codex thread to stable stored provenance', () => {
    const updates: Record<string, unknown>[] = []
    const db = {
      getSession: () => ({
        id: 'session-1',
        provider_session_id: 'thread-1',
        provider_session_source: 'cwd-recovery',
        provider_session_captured_at: 500,
        started_at: 500,
        created_at: 100
      }),
      updateSession: (_sessionId: string, update: Record<string, unknown>) => {
        updates.push(update)
      }
    }

    persistCodexSessionIdentity(db as any, 'session-1', 'thread-1', 'stored')

    expect(updates).toHaveLength(1)
    expect(updates[0]?.provider_session_source).toBe('stored')
    expect(updates[0]?.provider_session_captured_at).toBeUndefined()
  })

  it('rejects exit-time extracted thread ids that do not belong to the session cwd', async () => {
    const result = await resolveCodexExitThreadIdentity({
      provider_session_id: 'thread-old',
      provider_session_captured_at: 200,
      started_at: 300,
      created_at: 100,
      resume_status: 'ready'
    }, 'codex resume 11111111-1111-1111-1111-111111111111', {
      cwd: 'C:\\repo',
      allowCwdRecovery: true,
      threadBelongsToCwd: async () => false,
      findThreadIdForCwd: async () => 'thread-recovered'
    })

    expect(result).toEqual({
      providerSessionId: 'thread-recovered',
      source: 'resume-discovery'
    })
  })

  it('uses cwd-recovery when exit fallback has no prior stored thread id', async () => {
    const result = await resolveCodexExitThreadIdentity({
      provider_session_id: null,
      provider_session_captured_at: null,
      started_at: 300,
      created_at: 100,
      resume_status: 'launching'
    }, 'codex resume 11111111-1111-1111-1111-111111111111', {
      cwd: 'C:\\repo',
      allowCwdRecovery: true,
      threadBelongsToCwd: async () => false,
      findThreadIdForCwd: async () => 'thread-recovered'
    })

    expect(result).toEqual({
      providerSessionId: 'thread-recovered',
      source: 'cwd-recovery'
    })
  })

  it('extracts Codex sub-agent visuals from state rows without treating them as sessions', () => {
    const subAgent = resolveCodexSubAgentRow({
      id: 'child-thread',
      title: 'Investigate renderer wiring',
      edge_status: 'running',
      updated_at: 1776694778,
      created_at: 1776694745,
      agent_nickname: null,
      agent_role: null,
      parent_thread_id: 'parent-thread',
      source: JSON.stringify({
        subagent: {
          thread_spawn: {
            parent_thread_id: 'parent-thread',
            depth: 1,
            agent_nickname: 'Plato',
            agent_role: 'explorer'
          }
        }
      })
    })

    expect(subAgent).toEqual({
      threadId: 'child-thread',
      parentThreadId: 'parent-thread',
      nickname: 'Plato',
      role: 'explorer',
      title: 'Investigate renderer wiring',
      status: 'running',
      updatedAt: 1776694778000,
      createdAt: 1776694745000,
      depth: 1
    })
  })
})
