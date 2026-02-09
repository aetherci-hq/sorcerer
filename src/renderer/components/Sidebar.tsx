import React, { useState, useEffect, useRef } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useProjectStore } from '../stores/project-store'
import { useSessionStore } from '../stores/session-store'
import { useTeamStore } from '../stores/team-store'
import { NewSessionDialog } from './NewSessionDialog'
import { SettingsDialog } from './SettingsDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { showToast } from './Toast'
import { useTileStore } from '../stores/tile-store'
import { findLeafBySessionId } from '../lib/tile-utils'
import { on } from '../lib/events'
import type { Project, Session, TeamMember, TaskData } from '../types'

export function Sidebar() {
  const projects = useProjectStore((s) => s.projects)
  const addProjectRaw = useProjectStore((s) => s.addProject)
  const addProject = async () => {
    try {
      await addProjectRaw()
    } catch (err: any) {
      showToast(err?.message || 'Failed to add project', 'error')
    }
  }
  const removeProject = useProjectStore((s) => s.removeProject)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const archiveSession = useSessionStore((s) => s.archiveSession)
  const restartSession = useSessionStore((s) => s.restartSession)
  const pushBranch = useSessionStore((s) => s.pushBranch)
  const restoreSession = useSessionStore((s) => s.restoreSession)
  const teams = useTeamStore((s) => s.teams)
  const tasksByTeam = useTeamStore((s) => s.tasksByTeam)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newSessionSplitDir, setNewSessionSplitDir] = useState<'horizontal' | 'vertical' | null>(null)
  const [preselectedProjectId, setPreselectedProjectId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{
    title: string; description: string; confirmLabel: string; details?: { label: string; value: string }[]; action: () => Promise<void>
  } | null>(null)

  // Listen for keyboard shortcuts
  useEffect(() => {
    const unsub1 = on('shortcut:new-session', () => {
      if (projects.length > 0) {
        setNewSessionSplitDir(null)
        setShowNewSession(true)
      } else {
        showToast('Add a project first before creating sessions', 'info')
      }
    })
    const unsub2 = on('shortcut:split-right', () => {
      if (projects.length > 0) {
        setNewSessionSplitDir('horizontal')
        setShowNewSession(true)
      }
    })
    const unsub3 = on('shortcut:split-down', () => {
      if (projects.length > 0) {
        setNewSessionSplitDir('vertical')
        setShowNewSession(true)
      }
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [projects])

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const getProjectSessions = (projectId: string) =>
    sessions.filter((s) => s.project_id === projectId && !s.parent_session_id && s.status !== 'deleted' && s.status !== 'archived')

  const getArchivedSessions = (projectId: string) =>
    sessions.filter((s) => s.project_id === projectId && s.status === 'archived')

  const getChildSessions = (parentId: string) =>
    sessions.filter((s) => s.parent_session_id === parentId)

  const getTeamForSession = (teamName: string | null) => {
    if (!teamName) return null
    return teams.find((t) => t.name === teamName) || null
  }

  const getTasksForTeam = (teamName: string | null): TaskData[] => {
    if (!teamName) return []
    return tasksByTeam[teamName] || []
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-[var(--status-active)]'
      case 'idle': return 'bg-[var(--status-idle)]'
      case 'waiting': return 'bg-[var(--status-waiting)]'
      case 'archived': return 'bg-[var(--status-archived)]'
      default: return 'bg-[var(--text-muted)]'
    }
  }

  const handleSelectSession = (id: string, e?: React.MouseEvent) => {
    if (e && e.ctrlKey) {
      const { focusedTileId, tree, split, initSingle } = useTileStore.getState()
      if (tree && focusedTileId) {
        split(focusedTileId, 'horizontal', id)
      } else {
        initSingle(id)
      }
    } else {
      const { tree, focusedTileId, setFocus, replaceSession, initSingle } = useTileStore.getState()
      if (tree) {
        const leaf = findLeafBySessionId(tree, id)
        if (leaf) {
          setFocus(leaf.id)
          return
        }
        if (focusedTileId) {
          replaceSession(focusedTileId, id)
          return
        }
      }
      initSingle(id)
    }
  }

  const handleDeleteProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    const projectSessions = sessions.filter((s) => s.project_id === projectId && s.status !== 'deleted')
    const activeSessions = projectSessions.filter((s) => s.status === 'active')
    setConfirmAction({
      title: 'Remove Project',
      description: 'This will remove the project and delete all associated sessions and worktrees. This cannot be undone.',
      confirmLabel: 'Remove Project',
      details: [
        { label: 'Project', value: project?.name ?? projectId },
        { label: 'Path', value: project?.path ?? 'Unknown' },
        { label: 'Sessions', value: `${projectSessions.length} total${activeSessions.length > 0 ? `, ${activeSessions.length} active` : ''}` }
      ],
      action: async () => {
        for (const s of projectSessions) {
          await deleteSession(s.id)
        }
        await removeProject(projectId)
        showToast(`Project "${project?.name}" removed`, 'info')
      }
    })
  }

  const handleDeleteSession = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    const project = session ? projects.find((p) => p.id === session.project_id) : null

    // Fetch safety info
    let safety = { dirty: false, unmergedCount: 0, hasRemote: false }
    try {
      safety = await window.sorcerer.session.checkDeleteSafety(sessionId)
    } catch { /* proceed with defaults */ }

    const details: { label: string; value: string }[] = [
      { label: 'Session', value: session?.name ?? sessionId },
      ...(project ? [{ label: 'Project', value: project.name }] : []),
      { label: 'Branch', value: session?.branch ?? 'Unknown' },
      { label: 'Status', value: session?.status ?? 'Unknown' }
    ]

    if (safety.dirty) {
      details.push({ label: 'Uncommitted work', value: 'Will be auto-committed + pushed' })
    }
    if (safety.unmergedCount > 0) {
      details.push({ label: 'Unmerged commits', value: `${safety.unmergedCount} commit${safety.unmergedCount > 1 ? 's' : ''} not in main` })
    }
    if (!safety.hasRemote) {
      details.push({ label: 'Remote', value: 'No remote — work cannot be backed up' })
    }

    const description = safety.unmergedCount > 0
      ? `This session has ${safety.unmergedCount} unmerged commit${safety.unmergedCount > 1 ? 's' : ''}. Deletion will auto-commit, push to remote, then remove the worktree and branch.`
      : 'This will auto-commit any dirty work, push to remote, then remove the worktree and branch.'

    setConfirmAction({
      title: 'Delete Session',
      description,
      confirmLabel: 'Delete Session',
      details,
      action: async () => {
        await deleteSession(sessionId)
        showToast(`Session "${session?.name}" deleted`, 'info')
      }
    })
  }

  const handleArchiveSession = async (sessionId: string) => {
    await archiveSession(sessionId)
    const session = sessions.find((s) => s.id === sessionId)
    showToast(`Session "${session?.name}" archived`, 'info')
  }

  const handlePushBranch = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    showToast(`Pushing branch...`, 'info')
    const result = await pushBranch(sessionId)
    if (result.pushed) {
      showToast(`Branch "${session?.branch}" pushed to remote`, 'info')
    } else {
      showToast(result.error || 'Push failed', 'error')
    }
  }

  const handleOpenRemote = async (sessionId: string) => {
    try {
      const result = await window.sorcerer.session.openRemote(sessionId)
      if (!result.opened) {
        showToast(result.error || 'No remote URL', 'error')
      }
    } catch {
      showToast('Failed to open remote', 'error')
    }
  }

  const handleRestoreSession = async (sessionId: string) => {
    await restoreSession(sessionId)
    const session = sessions.find((s) => s.id === sessionId)
    showToast(`Session "${session?.name}" restored`, 'info')
  }

  const handleSplitRight = (sessionId: string) => {
    const { focusedTileId, tree, split, initSingle } = useTileStore.getState()
    if (!tree || !focusedTileId) {
      initSingle(sessionId)
      return
    }
    split(focusedTileId, 'horizontal', sessionId)
  }

  const handleSplitDown = (sessionId: string) => {
    const { focusedTileId, tree, split, initSingle } = useTileStore.getState()
    if (!tree || !focusedTileId) {
      initSingle(sessionId)
      return
    }
    split(focusedTileId, 'vertical', sessionId)
  }

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={150}>
    <div className="flex flex-col w-full h-full bg-[var(--bg-secondary)] select-none">
      {/* Sidebar header */}
      <div className="flex items-center justify-between h-12 border-b border-[var(--border)]" style={{ paddingLeft: 16, paddingRight: 16 }}>
        <span className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          Sessions
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setShowNewSession(true)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors"
            title="New Session (Ctrl+N)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
            </svg>
          </button>
          <button
            onClick={addProject}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors"
            title="Add Project"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H13.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3.87z" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Session tree */}
      <div className="flex-1 overflow-y-auto py-4">
        {projects.length === 0 ? (
          <div className="py-8 text-center" style={{ paddingLeft: 16, paddingRight: 16 }}>
            <p className="text-[var(--text-muted)] text-sm leading-relaxed">
              No projects yet.
              <br />
              <span className="text-[var(--text-faint)]">Add a git repository to get started.</span>
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectNode
              key={project.id}
              project={project}
              sessions={getProjectSessions(project.id)}
              archivedSessions={getArchivedSessions(project.id)}
              activeSessionId={activeSessionId}
              collapsed={collapsedProjects.has(project.id)}
              onToggle={() => toggleProject(project.id)}
              onSelectSession={handleSelectSession}
              onNewSession={() => {
                setPreselectedProjectId(project.id)
                setNewSessionSplitDir(null)
                setShowNewSession(true)
              }}
              onDeleteProject={() => handleDeleteProject(project.id)}
              onDeleteSession={handleDeleteSession}
              onArchiveSession={handleArchiveSession}
              onRestartSession={restartSession}
              onPushBranch={handlePushBranch}
              onOpenRemote={handleOpenRemote}
              onRestoreSession={handleRestoreSession}
              onSplitRight={handleSplitRight}
              onSplitDown={handleSplitDown}
              getChildSessions={getChildSessions}
              getTeamForSession={getTeamForSession}
              getTasksForTeam={getTasksForTeam}
              statusColor={statusColor}
            />
          ))
        )}
      </div>

      {showNewSession && (
        <NewSessionDialog
          onClose={() => { setShowNewSession(false); setNewSessionSplitDir(null); setPreselectedProjectId(null) }}
          splitDirection={newSessionSplitDir}
          preselectedProjectId={preselectedProjectId}
          onCreated={(projectId) => {
            setCollapsedProjects((prev) => {
              const next = new Set(prev)
              next.delete(projectId)
              return next
            })
          }}
        />
      )}

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}

      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          details={confirmAction.details}
          destructive
          onConfirm={async () => {
            await confirmAction.action()
            setConfirmAction(null)
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
    </Tooltip.Provider>
  )
}

// ─── Project Node ────────────────────────────────────────────────────────────

function ProjectNode({
  project,
  sessions,
  archivedSessions,
  activeSessionId,
  collapsed,
  onToggle,
  onSelectSession,
  onNewSession,
  onDeleteProject,
  onDeleteSession,
  onArchiveSession,
  onRestartSession,
  onPushBranch,
  onOpenRemote,
  onRestoreSession,
  onSplitRight,
  onSplitDown,
  getChildSessions,
  getTeamForSession,
  getTasksForTeam,
  statusColor
}: {
  project: Project
  sessions: Session[]
  archivedSessions: Session[]
  activeSessionId: string | null
  collapsed: boolean
  onToggle: () => void
  onSelectSession: (id: string, e?: React.MouseEvent) => void
  onNewSession: () => void
  onDeleteProject: () => void
  onDeleteSession: (id: string) => void
  onArchiveSession: (id: string) => Promise<void>
  onRestartSession: (id: string) => Promise<void>
  onPushBranch: (sessionId: string) => Promise<void>
  onOpenRemote: (sessionId: string) => Promise<void>
  onRestoreSession: (sessionId: string) => Promise<void>
  onSplitRight: (sessionId: string) => void
  onSplitDown: (sessionId: string) => void
  getChildSessions: (id: string) => Session[]
  getTeamForSession: (teamName: string | null) => import('../types').TeamConfig | null
  getTasksForTeam: (teamName: string | null) => TaskData[]
  statusColor: (status: string) => string
}) {
  // Fetch git status
  const [gitStatus, setGitStatus] = useState<{
    branch: string; dirty: boolean; modified: number; staged: number; untracked: number; ahead: number; behind: number
  } | null>(null)

  useEffect(() => {
    let mounted = true
    const fetch = () => {
      window.sorcerer.project.gitStatus(project.path).then((s: any) => {
        if (mounted && s) setGitStatus(s)
      })
    }
    fetch()
    const interval = setInterval(fetch, 10000) // Refresh every 10s
    return () => { mounted = false; clearInterval(interval) }
  }, [project.path])

  const [archivedCollapsed, setArchivedCollapsed] = useState(true)
  const changeCount = gitStatus ? gitStatus.modified + gitStatus.staged + gitStatus.untracked : 0

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Project header with context menu */}
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            onClick={onToggle}
            className="sidebar-item group"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`text-[var(--text-faint)] transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--text-muted)] flex-shrink-0">
              <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H13.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3.87z" />
            </svg>
            <span className="text-[13px] font-medium text-[var(--text-secondary)] truncate">
              {project.name}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {gitStatus && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--text-faint)" style={{ flexShrink: 0 }}>
                    <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" />
                  </svg>
                  <span style={{ fontSize: 10, fontFamily: "'Cascadia Code', Consolas, monospace", color: 'var(--text-faint)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {gitStatus.branch}
                  </span>
                  {gitStatus.dirty && changeCount > 0 && (
                    <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--status-idle)' }} title={`${gitStatus.modified}M ${gitStatus.staged}S ${gitStatus.untracked}U`}>
                      {changeCount}
                    </span>
                  )}
                  {gitStatus.ahead > 0 && (
                    <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{'\u2191'}{gitStatus.ahead}</span>
                  )}
                  {gitStatus.behind > 0 && (
                    <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{'\u2193'}{gitStatus.behind}</span>
                  )}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {sessions.length}
              </span>
            </span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu">
            <ContextMenu.Item
              onClick={onNewSession}
              className="context-menu-item"
            >
              New Session
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item
              onClick={() => {
                navigator.clipboard.writeText(project.path)
                showToast('Path copied to clipboard', 'info')
              }}
              className="context-menu-item"
            >
              Copy Path
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item
              onClick={onDeleteProject}
              className="context-menu-item text-red-400"
            >
              Remove Project
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Sessions */}
      {!collapsed && (
        <div style={{ marginLeft: 16 }}>
          {sessions.map((session) => (
            <SessionNode
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={(e) => onSelectSession(session.id, e)}
              onDelete={() => onDeleteSession(session.id)}
              onArchive={() => onArchiveSession(session.id)}
              onRestart={() => onRestartSession(session.id)}
              onPushBranch={() => onPushBranch(session.id)}
              onOpenRemote={() => onOpenRemote(session.id)}
              onSplitRight={() => onSplitRight(session.id)}
              onSplitDown={() => onSplitDown(session.id)}
              childSessions={getChildSessions(session.id)}
              team={getTeamForSession(session.team_name)}
              tasks={getTasksForTeam(session.team_name)}
              statusColor={statusColor}
              onSelectSession={onSelectSession}
              activeSessionId={activeSessionId}
            />
          ))}

          {/* Archived sessions */}
          {archivedSessions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setArchivedCollapsed(!archivedCollapsed)}
                className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ padding: '4px 6px' }}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={`text-[var(--text-faint)] transition-transform flex-shrink-0 ${archivedCollapsed ? '' : 'rotate-90'}`}
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
                <span className="text-[11px] text-[var(--text-faint)]">
                  Archived ({archivedSessions.length})
                </span>
              </button>
              {!archivedCollapsed && archivedSessions.map((session) => (
                <ContextMenu.Root key={session.id}>
                  <ContextMenu.Trigger asChild>
                    <button
                      className="sidebar-item opacity-50"
                      onClick={(e) => onSelectSession(session.id, e)}
                    >
                      <div style={{ width: 8 }} className="flex-shrink-0" />
                      <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${statusColor('archived')}`} />
                      <span className="text-[13px] text-[var(--text-muted)] truncate">{session.name}</span>
                    </button>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="context-menu">
                      <ContextMenu.Item
                        onClick={() => onRestoreSession(session.id)}
                        className="context-menu-item"
                      >
                        Restore Session
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="context-menu-separator" />
                      <ContextMenu.Item
                        onClick={() => onDeleteSession(session.id)}
                        className="context-menu-item text-red-400"
                      >
                        Delete Session
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Session Node ────────────────────────────────────────────────────────────

function SessionNode({
  session,
  isActive,
  onClick,
  onDelete,
  onArchive,
  onRestart,
  onPushBranch,
  onOpenRemote,
  onSplitRight,
  onSplitDown,
  childSessions,
  team,
  tasks,
  statusColor,
  onSelectSession,
  activeSessionId
}: {
  session: Session
  isActive: boolean
  onClick: (e: React.MouseEvent) => void
  onDelete: () => void
  onArchive: () => void
  onRestart: () => void
  onPushBranch: () => void
  onOpenRemote: () => void
  onSplitRight: () => void
  onSplitDown: () => void
  childSessions: Session[]
  team: import('../types').TeamConfig | null
  tasks: TaskData[]
  statusColor: (status: string) => string
  onSelectSession: (id: string, e?: React.MouseEvent) => void
  activeSessionId: string | null
}) {
  // Per-session git status polling
  const [sessionGitStatus, setSessionGitStatus] = useState<{
    dirty: boolean; modified: number; staged: number; untracked: number
    ahead: number; behind: number; hasRemote: boolean
  } | null>(null)

  useEffect(() => {
    if (session.status === 'archived') return
    let mounted = true
    const fetch = () => {
      window.sorcerer.session.gitStatus(session.id).then((s: any) => {
        if (mounted && s) setSessionGitStatus(s)
      })
    }
    fetch()
    const interval = setInterval(fetch, 10000)
    return () => { mounted = false; clearInterval(interval) }
  }, [session.id, session.status])

  const hasTeam = !!team && team.members.length > 0
  const hasChildren = childSessions.length > 0 || hasTeam
  const activeMembers = team?.members.filter((m) => m.status === 'active') || []

  // Auto-expand when team is detected
  const [expanded, setExpanded] = useState(hasTeam)
  const [membersCollapsed, setMembersCollapsed] = useState(false)
  const [tasksCollapsed, setTasksCollapsed] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const wasAutoExpanded = useRef(false)

  // Auto-expand on first team detection
  useEffect(() => {
    if (hasTeam && !wasAutoExpanded.current) {
      setExpanded(true)
      setMembersCollapsed(false)
      setTasksCollapsed(false)
      wasAutoExpanded.current = true
    }
  }, [hasTeam])

  // Task categorization
  const activeTasks = tasks.filter((t) => t.status === 'in_progress')
  const pendingTasks = tasks.filter((t) => {
    if (t.status !== 'pending') return false
    // Check if blocked
    if (t.blockedBy && t.blockedBy.length > 0) {
      const hasUnresolved = t.blockedBy.some((blockId) => {
        const blocker = tasks.find((bt) => bt.id === blockId)
        return blocker && blocker.status !== 'completed'
      })
      if (hasUnresolved) return true
    }
    return true
  })
  const blockedTasks = pendingTasks.filter((t) => {
    if (!t.blockedBy || t.blockedBy.length === 0) return false
    return t.blockedBy.some((blockId) => {
      const blocker = tasks.find((bt) => bt.id === blockId)
      return blocker && blocker.status !== 'completed'
    })
  })
  const unblockedPending = pendingTasks.filter((t) => !blockedTasks.includes(t))
  const completedTasks = tasks.filter((t) => t.status === 'completed')
  const remainingCount = activeTasks.length + pendingTasks.length

  return (
    <div style={{ marginBottom: expanded && hasChildren ? 12 : 4 }}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            onClick={onClick}
            className={`sidebar-item ${isActive ? 'active' : ''}`}
          >
            {hasChildren ? (
              <svg
                width="8"
                height="8"
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`text-[var(--text-faint)] transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(!expanded)
                }}
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
            ) : (
              <div style={{ width: 8 }} className="flex-shrink-0" />
            )}
            <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${statusColor(session.status)} ${
              session.status === 'active' ? 'animate-pulse-glow' : ''
            }`} />
            <span className={`text-[13px] truncate ${
              isActive ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'
            }`}>{session.name}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {/* Git status indicators */}
              {sessionGitStatus && (
                <>
                  {sessionGitStatus.dirty && (
                    <span style={{ fontSize: 10, color: 'var(--status-idle)', fontWeight: 600 }} title="Uncommitted changes">M</span>
                  )}
                  {sessionGitStatus.ahead > 0 && (
                    <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{'\u2191'}{sessionGitStatus.ahead}</span>
                  )}
                  {sessionGitStatus.behind > 0 && (
                    <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{'\u2193'}{sessionGitStatus.behind}</span>
                  )}
                  {!sessionGitStatus.hasRemote && (
                    <span style={{ fontSize: 10, color: 'var(--status-idle)' }} title="No remote tracking">{'\u26A0'}</span>
                  )}
                </>
              )}
              {/* Active/total team badge */}
              {hasTeam && (
                <span className="text-[11px] text-[var(--text-faint)] tabular-nums">
                  {activeMembers.length}/{team!.members.length}
                </span>
              )}
            </span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu">
            <ContextMenu.Item onClick={onSplitRight} className="context-menu-item">
              Split Right
            </ContextMenu.Item>
            <ContextMenu.Item onClick={onSplitDown} className="context-menu-item">
              Split Down
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item onClick={onRestart} className="context-menu-item">
              Restart Session
            </ContextMenu.Item>
            <ContextMenu.Item
              onClick={() => {
                navigator.clipboard.writeText(session.worktree_path || '')
                showToast('Worktree path copied', 'info')
              }}
              className="context-menu-item"
            >
              Copy Worktree Path
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item onClick={onPushBranch} className="context-menu-item">
              Push Branch
            </ContextMenu.Item>
            <ContextMenu.Item onClick={onOpenRemote} className="context-menu-item">
              Open Remote
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item onClick={onArchive} className="context-menu-item text-[var(--text-muted)]">
              Archive Session
            </ContextMenu.Item>
            <ContextMenu.Separator className="context-menu-separator" />
            <ContextMenu.Item onClick={onDelete} className="context-menu-item text-red-400">
              Delete Session
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Expanded children: child sessions + team members + tasks */}
      {expanded && hasChildren && (
        <div
          style={{
            marginLeft: 18,
            marginTop: 2,
            paddingLeft: 12,
            paddingBottom: 4,
            borderLeft: '1px solid var(--border-subtle)'
          }}
        >
          {/* Child sessions (non-team) */}
          {childSessions.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelectSession(child.id)}
              className={`sidebar-item ${child.id === activeSessionId ? 'active' : ''}`}
            >
              <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${statusColor(child.status)}`} />
              <span className={`text-[12px] truncate ${
                child.id === activeSessionId ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
              }`}>{child.name}</span>
            </button>
          ))}

          {/* Members section */}
          {hasTeam && (
            <div style={{ marginTop: childSessions.length > 0 ? 6 : 0 }}>
              <SectionHeader
                label="Members"
                right={String(team!.members.length)}
                collapsed={membersCollapsed}
                onToggle={() => setMembersCollapsed(!membersCollapsed)}
              />
              {!membersCollapsed && team!.members.map((member) => (
                <MemberRow
                  key={member.name}
                  member={member}
                  onClick={() => onClick({} as React.MouseEvent)}
                />
              ))}
            </div>
          )}

          {/* Tasks section */}
          {hasTeam && tasks.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <SectionHeader
                label="Tasks"
                right={remainingCount > 0 || completedTasks.length > 0
                  ? `${remainingCount} remaining${completedTasks.length > 0 ? ` \u00b7 ${completedTasks.length} done` : ''}`
                  : undefined
                }
                collapsed={tasksCollapsed}
                onToggle={() => setTasksCollapsed(!tasksCollapsed)}
              />
              {!tasksCollapsed && (
                <div>
                  {/* In-progress tasks */}
                  {activeTasks.map((task) => (
                    <TaskRow key={task.id} task={task} status="in_progress" allTasks={tasks} onClick={() => onClick({} as React.MouseEvent)} />
                  ))}
                  {/* Unblocked pending */}
                  {unblockedPending.map((task) => (
                    <TaskRow key={task.id} task={task} status="pending" allTasks={tasks} onClick={() => onClick({} as React.MouseEvent)} />
                  ))}
                  {/* Blocked */}
                  {blockedTasks.map((task) => (
                    <TaskRow key={task.id} task={task} status="blocked" allTasks={tasks} onClick={() => onClick({} as React.MouseEvent)} />
                  ))}
                  {/* Show completed toggle */}
                  {completedTasks.length > 0 && !showCompleted && (
                    <button
                      onClick={() => setShowCompleted(true)}
                      className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ padding: '3px 6px', paddingLeft: 20, marginTop: 2 }}
                    >
                      <svg width="7" height="7" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--text-faint)] flex-shrink-0">
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                      <span className="text-[11px] text-[var(--text-faint)]">
                        Show {completedTasks.length} completed
                      </span>
                    </button>
                  )}
                  {/* Completed tasks (when expanded) */}
                  {showCompleted && completedTasks.map((task) => (
                    <TaskRow key={task.id} task={task} status="completed" allTasks={tasks} onClick={() => onClick({} as React.MouseEvent)} />
                  ))}
                  {showCompleted && completedTasks.length > 0 && (
                    <button
                      onClick={() => setShowCompleted(false)}
                      className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ padding: '3px 6px', paddingLeft: 20, marginTop: 2 }}
                    >
                      <svg width="7" height="7" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--text-faint)] flex-shrink-0 rotate-90">
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                      <span className="text-[11px] text-[var(--text-faint)]">
                        Hide completed
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({
  label,
  right,
  collapsed,
  onToggle
}: {
  label: string
  right?: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
      style={{ padding: '4px 6px', marginBottom: 1 }}
    >
      <svg
        width="7"
        height="7"
        viewBox="0 0 16 16"
        fill="currentColor"
        className={`text-[var(--text-faint)] transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">
        {label}
      </span>
      {right && (
        <span className="ml-auto text-[10px] text-[var(--text-faint)] tabular-nums">
          {right}
        </span>
      )}
    </button>
  )
}

// ─── Member Row ──────────────────────────────────────────────────────────────

function MemberRow({
  member,
  onClick
}: {
  member: TeamMember
  onClick: () => void
}) {
  const isActive = member.status === 'active'
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className="flex items-center gap-2 w-full text-left transition-colors hover:bg-[var(--bg-hover)]"
          style={{ padding: '3px 6px', paddingLeft: 20 }}
        >
          <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
            isActive ? 'bg-[var(--status-active)]' : 'bg-[var(--text-faint)]'
          }`} />
          <span className="text-[12px] text-[var(--text-secondary)] truncate">
            {member.name}
          </span>
          <span className={`ml-auto text-[11px] truncate italic ${
            isActive ? 'text-[var(--status-active)] opacity-80' : 'text-[var(--text-faint)]'
          }`} style={{ maxWidth: '40%' }}>
            {isActive ? (member.activeTask || 'working') : 'idle'}
          </span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="sidebar-tooltip"
        >
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <div className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
              isActive ? 'bg-[var(--status-active)]' : 'bg-[var(--text-faint)]'
            }`} />
            <span className="text-[13px] font-medium text-[var(--text-primary)]">{member.name}</span>
            <span className={`text-[11px] ${isActive ? 'text-[var(--status-active)]' : 'text-[var(--text-faint)]'}`}>
              {isActive ? 'active' : 'idle'}
            </span>
          </div>
          {member.agentType && (
            <div style={{ marginBottom: 4 }}>
              <span className="text-[10px] text-[var(--text-faint)]">{member.agentType}</span>
            </div>
          )}
          {isActive && member.activeTask && (
            <div style={{ marginTop: 4 }}>
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Current task</span>
              <p className="text-[12px] text-[var(--text-secondary)] italic" style={{ marginTop: 2 }}>
                {member.activeTask}
              </p>
            </div>
          )}
          {!isActive && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Waiting for task assignment
            </p>
          )}
          <Tooltip.Arrow className="fill-[var(--bg-tertiary)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

// ─── Task Row ────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  status,
  allTasks,
  onClick
}: {
  task: TaskData
  status: 'in_progress' | 'pending' | 'blocked' | 'completed'
  allTasks: TaskData[]
  onClick: () => void
}) {
  const icon = status === 'in_progress' ? '\u25D0'  // ◐
    : status === 'completed' ? '\u2713'               // ✓
    : status === 'blocked' ? '\u2298'                  // ⊘
    : '\u25CB'                                         // ○

  const iconColor = status === 'in_progress' ? 'text-[var(--accent)]'
    : status === 'completed' ? 'text-[var(--status-active)]'
    : status === 'blocked' ? 'text-[var(--status-error)]'
    : 'text-[var(--text-faint)]'

  const statusLabel = status === 'in_progress' ? 'In Progress'
    : status === 'completed' ? 'Completed'
    : status === 'blocked' ? 'Blocked'
    : 'Pending'

  const statusLabelColor = status === 'in_progress' ? 'text-[var(--accent)]'
    : status === 'completed' ? 'text-[var(--status-active)]'
    : status === 'blocked' ? 'text-[var(--status-error)]'
    : 'text-[var(--text-muted)]'

  const textOpacity = status === 'completed' ? 'opacity-50' : ''

  // Resolve blocked-by task names
  const blockedByNames = (task.blockedBy || [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is TaskData => !!t && t.status !== 'completed')

  // Resolve blocks task names
  const blocksNames = (task.blocks || [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is TaskData => !!t)

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className={`flex items-center gap-2 w-full text-left transition-colors hover:bg-[var(--bg-hover)] ${textOpacity} ${status === 'in_progress' ? 'task-in-progress-row' : ''}`}
          style={{ padding: '3px 6px', paddingLeft: 20 }}
        >
          <span className={`text-[10px] flex-shrink-0 ${iconColor} ${status === 'in_progress' ? 'task-in-progress-icon' : ''}`} style={{ width: 10, textAlign: 'center' }}>
            {icon}
          </span>
          <span className="text-[12px] text-[var(--text-secondary)] truncate">
            {task.subject}
          </span>
          {task.owner && status !== 'completed' && (
            <span className="ml-auto text-[10px] text-[var(--text-faint)] truncate flex-shrink-0" style={{ maxWidth: '30%' }}>
              {task.owner}
            </span>
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="sidebar-tooltip"
        >
          {/* Subject + status */}
          <div style={{ marginBottom: 6 }}>
            <p className="text-[13px] font-medium text-[var(--text-primary)]" style={{ lineHeight: 1.4 }}>
              {task.subject}
            </p>
            <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
              <span className={`text-[10px] ${iconColor}`}>{icon}</span>
              <span className={`text-[11px] font-medium ${statusLabelColor}`}>{statusLabel}</span>
            </div>
          </div>

          {/* Detail rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {task.owner && (
              <DetailRow label="Owner" value={task.owner} />
            )}
            {task.activeForm && status === 'in_progress' && (
              <DetailRow label="Activity" value={task.activeForm} italic />
            )}
            {blockedByNames.length > 0 && (
              <DetailRow label="Blocked by" value={blockedByNames.map((t) => t.subject).join(', ')} color="var(--status-error)" />
            )}
            {blocksNames.length > 0 && (
              <DetailRow label="Blocks" value={blocksNames.map((t) => t.subject).join(', ')} />
            )}
            {task.description && (
              <div style={{ marginTop: 2 }}>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">Description</span>
                <p className="text-[11px] text-[var(--text-muted)]" style={{ marginTop: 2, lineHeight: 1.4, maxHeight: 60, overflow: 'hidden' }}>
                  {task.description}
                </p>
              </div>
            )}
          </div>
          <Tooltip.Arrow className="fill-[var(--bg-tertiary)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

// ─── Tooltip Detail Row ──────────────────────────────────────────────────────

function DetailRow({ label, value, italic, color }: { label: string; value: string; italic?: boolean; color?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] flex-shrink-0" style={{ minWidth: 52 }}>{label}</span>
      <span
        className={`text-[11px] ${italic ? 'italic' : ''}`}
        style={{ color: color || 'var(--text-secondary)', lineHeight: 1.3 }}
      >
        {value}
      </span>
    </div>
  )
}
