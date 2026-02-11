import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore, getAllSessionIds } from '../stores/useUIStore'
import { useTeamStore } from '../stores/useTeamStore'
import { ChevronIcon, FolderIcon, TerminalIcon, UserIcon, MoreHorizontalIcon } from './icons'
import { StatusDot } from './StatusDot'
import { EmptyState } from './EmptyState'
import type { Project, Session, TeamMember, TaskData } from '../types'

function TaskItem({ task }: { task: TaskData }) {
  const statusIcon = task.status === 'completed' ? 'completed'
    : task.status === 'in_progress' ? 'active'
    : 'idle'
  return (
    <div className="tree-item tree-task">
      <StatusDot status={statusIcon} />
      <span className="tree-label tree-task-label">
        {task.activeForm || task.subject}
      </span>
    </div>
  )
}

function TeammateItem({ member, tasks, staggerClass }: { member: TeamMember; tasks: TaskData[]; staggerClass?: string }) {
  // Tasks owned by this member
  const memberTasks = tasks.filter((t) => t.owner === member.name && t.status !== 'completed')
  const activeTask = memberTasks.find((t) => t.status === 'in_progress')

  return (
    <div className={`tree-teammate-group ${staggerClass || ''}`}>
      <div className="tree-item tree-teammate">
        <UserIcon className="tree-icon" />
        <span className="tree-label">{member.name}</span>
        {member.agentType && <span className="teammate-badge">{member.agentType}</span>}
        <StatusDot status={(member.status as string) || 'idle'} />
      </div>
      {activeTask && (
        <div className="tree-teammate-task">
          <span className="tree-task-label">{activeTask.activeForm || activeTask.subject}</span>
        </div>
      )}
    </div>
  )
}

function SessionItem({
  session,
  isActive,
  staggerClass,
  projectId,
}: {
  session: Session
  isActive: boolean
  staggerClass?: string
  projectId: string
}) {
  const { setActiveSession } = useSessionStore()
  const { expandedSessions, toggleSession, openContextMenu, renamingId, setRenamingId, splitRoot } = useUIStore()
  const { projects } = useProjectStore()
  const { teams, tasksByTeam } = useTeamStore()
  const isExpanded = expandedSessions.has(session.id)
  const project = projects.find((p) => p.id === projectId)
  const isMainRepo = project && session.worktree_path === project.path
  const itemRef = useRef<HTMLDivElement>(null)

  // Team members and tasks for this session
  const team = session.team_name ? teams.find((t) => t.name === session.team_name) : undefined
  const hasTeammates = (team?.members.length ?? 0) > 0
  const tasks = session.team_name ? (tasksByTeam[session.team_name] || []) : []
  const totalTaskCount = tasks.length
  const completedTaskCount = tasks.filter((t) => t.status === 'completed').length
  const pendingTaskCount = totalTaskCount - completedTaskCount

  // Is this session in the split view but not the focused one?
  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []
  const isInSplit = !isActive && splitIds.includes(session.id)

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Watch renamingId from UI store (context menu trigger)
  useEffect(() => {
    if (renamingId === session.id) {
      setIsRenaming(true)
      setRenameValue(session.name)
      setRenamingId(null)
    }
  }, [renamingId, session.id, session.name, setRenamingId])

  // Focus input when rename mode activates
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  // Scroll active session into view
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  const commitRename = async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== session.name) {
      await useSessionStore.getState().renameSession(session.id, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue(session.name)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRenaming(true)
    setRenameValue(session.name)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commitRename() }
    else if (e.key === 'Escape') { cancelRename() }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'session', targetId: session.id })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'session', targetId: session.id })
  }

  // Drag source
  const handleDragStart = (e: React.DragEvent) => {
    if (isRenaming) { e.preventDefault(); return }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'session', id: session.id, projectId
    }))
    e.dataTransfer.effectAllowed = 'move'
    requestAnimationFrame(() => {
      itemRef.current?.classList.add('tree-item--dragging')
    })
  }

  const handleDragEnd = () => {
    itemRef.current?.classList.remove('tree-item--dragging')
  }

  return (
    <div className={`tree-project ${staggerClass || ''}`}>
      <div
        ref={itemRef}
        className={`tree-item ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''} ${session.status === 'archived' ? 'tree-item--archived' : ''}`}
        onClick={() => !isRenaming && setActiveSession(session.id)}
        onContextMenu={handleContextMenu}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {hasTeammates && (
          <ChevronIcon
            className={`tree-chevron ${isExpanded ? 'tree-chevron--open' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleSession(session.id)
            }}
          />
        )}
        <TerminalIcon className={`tree-icon${session.type === 'quick-terminal' ? ' tree-icon--quick-terminal' : ''}`} />
        <div className="tree-label-group">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="tree-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tree-label" onDoubleClick={handleDoubleClick}>{session.name}</span>
          )}
          {isMainRepo && !isRenaming && (
            <span className="tree-hint">direct</span>
          )}
        </div>
        {!isRenaming && (
          <>
            <button className="tree-item-actions" onClick={handleMoreClick}>
              <MoreHorizontalIcon />
            </button>
            <StatusDot status={session.status} />
          </>
        )}
      </div>

      {hasTeammates && team && (
        <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
          <div className="tree-children">
            {team.members.map((member, i) => (
              <TeammateItem
                key={member.name}
                member={member}
                tasks={tasks}
                staggerClass={`stagger-${Math.min(i + 7, 10)}`}
              />
            ))}
            {pendingTaskCount > 0 && (
              <div className="tree-team-summary">
                {completedTaskCount}/{totalTaskCount} tasks done
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectItem({ project, staggerClass, projectIndex }: { project: Project; staggerClass: string; projectIndex: number }) {
  const { sessions, activeSessionId } = useSessionStore()
  const { expandedProjects, toggleProject, openContextMenu, renamingId, setRenamingId } = useUIStore()
  const isExpanded = expandedProjects.has(project.id)
  const headerRef = useRef<HTMLDivElement>(null)

  // Get sessions for this project (non-deleted, non-archived go first)
  const projectSessions = sessions.filter((s) => s.project_id === project.id && s.status !== 'deleted')
  const activeSessions = projectSessions.filter((s) => s.status !== 'archived')
  const archivedSessions = projectSessions.filter((s) => s.status === 'archived')

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Watch renamingId from UI store (context menu trigger)
  useEffect(() => {
    if (renamingId === project.id) {
      setIsRenaming(true)
      setRenameValue(project.name)
      setRenamingId(null)
    }
  }, [renamingId, project.id, project.name, setRenamingId])

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const commitRename = async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== project.name) {
      await useProjectStore.getState().updateProject(project.id, { name: trimmed })
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue(project.name)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRenaming(true)
    setRenameValue(project.name)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commitRename() }
    else if (e.key === 'Escape') { cancelRename() }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'project', targetId: project.id })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'project', targetId: project.id })
  }

  return (
    <div className={`tree-project ${staggerClass}`}>
      <div
        ref={headerRef}
        className="tree-item"
        onClick={() => !isRenaming && toggleProject(project.id)}
        onContextMenu={handleContextMenu}
      >
        <ChevronIcon
          className={`tree-chevron ${isExpanded ? 'tree-chevron--open' : ''}`}
        />
        <FolderIcon className="tree-icon tree-icon--project" />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="tree-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => commitRename()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label" onDoubleClick={handleDoubleClick}>{project.name}</span>
        )}
        {!isRenaming && (
          <button className="tree-item-actions" onClick={handleMoreClick}>
            <MoreHorizontalIcon />
          </button>
        )}
      </div>

      <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
        <div className="tree-children">
          {activeSessions.map((session, i) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              staggerClass={`stagger-${Math.min(i + 6, 10)}`}
              projectId={project.id}
            />
          ))}
          {archivedSessions.length > 0 && (
            <>
              <div className="tree-archived-divider">
                <span className="tree-archived-label">Archived ({archivedSessions.length})</span>
              </div>
              {archivedSessions.map((session, i) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  staggerClass={`stagger-${Math.min(i + 8, 10)}`}
                  projectId={project.id}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProjectTree() {
  const { projects } = useProjectStore()
  const { sessions } = useSessionStore()
  const { searchQuery } = useUIStore()

  if (projects.length === 0) {
    return <EmptyState />
  }

  const query = searchQuery.toLowerCase().trim()

  // Filter projects to only those with matching sessions (or matching project name)
  const filteredProjects = query
    ? projects.filter((p) => {
        const projectSessions = sessions.filter((s) => s.project_id === p.id && s.status !== 'deleted')
        const hasMatchingSession = projectSessions.some((s) =>
          s.name.toLowerCase().includes(query) ||
          s.branch.toLowerCase().includes(query)
        )
        return hasMatchingSession || p.name.toLowerCase().includes(query)
      })
    : projects

  if (filteredProjects.length === 0) {
    return (
      <>
        <div className="section-header stagger-4">
          <span className="section-label">Projects</span>
          <span className="section-count">0</span>
        </div>
        <div className="empty-state">
          <p className="empty-state-title">No results</p>
          <p className="empty-state-text">No sessions match "{searchQuery}"</p>
        </div>
      </>
    )
  }

  const totalSessions = sessions.filter((s) =>
    filteredProjects.some((p) => p.id === s.project_id) && s.status !== 'deleted'
  ).length

  return (
    <>
      <div className="section-header stagger-4">
        <span className="section-label">Projects</span>
        <span className="section-count">{totalSessions} sessions</span>
      </div>

      <div className="tree">
        {filteredProjects.map((project, i) => (
          <ProjectItem
            key={project.id}
            project={project}
            staggerClass={`stagger-${Math.min(i + 5, 10)}`}
            projectIndex={i}
          />
        ))}
      </div>
    </>
  )
}
