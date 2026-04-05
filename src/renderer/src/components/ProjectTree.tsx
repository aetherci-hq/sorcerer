import { useEffect, useRef, useState } from 'react'
import { getApi } from '../api/client'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore, getAllSessionIds, findLeafBySession } from '../stores/useUIStore'
import { useTeamStore } from '../stores/useTeamStore'
import { ChevronIcon, FolderIcon, TerminalIcon, ShellPromptIcon, UserIcon, MoreHorizontalIcon, NotesIcon, WifiIcon, ChevronsCollapseIcon, PlusIcon } from './icons'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { StatusDot } from './StatusDot'
import { Tooltip } from './Tooltip'
import { EmptyState } from './EmptyState'
import type { Project, ProjectGroup, Session, TeamMember, TaskData } from '../types'

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

function ChildQTItem({
  session,
  isActive,
}: {
  session: Session
  isActive: boolean
}) {
  const { setActiveSession } = useSessionStore()
  const { openContextMenu, splitRoot, poppedOutSessionIds } = useUIStore()
  const itemRef = useRef<HTMLDivElement>(null)

  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []
  const isInSplit = !isActive && splitIds.includes(session.id)

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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'session', id: session.id, projectId: session.project_id
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
    <div
      ref={itemRef}
      className={`tree-item tree-item--child-qt ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
      onClick={() => setActiveSession(session.id)}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ShellPromptIcon className="tree-icon tree-icon--quick-terminal" />
      <span className="tree-label">{session.name}</span>
      <button className="tree-item-actions" onClick={handleMoreClick}>
        <MoreHorizontalIcon />
      </button>
      <StatusDot status={poppedOutSessionIds.has(session.id) && session.status === 'active' ? 'popped-out' : session.status} />
    </div>
  )
}

function ChildNotesItem({
  parentId,
  parentType,
}: {
  parentId: string
  parentType: 'session' | 'agent'
}) {
  const { splitRight, setFocusedPanel, setPanelSession, splitRoot, focusedPanelId, openContextMenu } = useUIStore()
  const notePanelId = `quicknotes:${parentType}:${parentId}`

  // Determine active/split state
  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []
  const isInSplitView = splitIds.includes(notePanelId)
  const focusedLeaf = splitRoot ? findLeafBySession(splitRoot, notePanelId) : null
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const isActive = (isInSplitView && focusedLeaf?.id === focusedPanelId) || (!splitRoot && activeSessionId === notePanelId)
  const isInSplit = isInSplitView && !isActive

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'quicknotes', targetId: notePanelId })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'quicknotes', targetId: notePanelId })
  }

  const handleClick = () => {
    useQuickNotesStore.getState().addNotePanel(parentId)
    // Focus the existing panel if already open in split view
    if (splitRoot) {
      const leaf = findLeafBySession(splitRoot, notePanelId)
      if (leaf) {
        setFocusedPanel(leaf.id)
        return
      }
      if (focusedPanelId) {
        setPanelSession(focusedPanelId, notePanelId)
        setFocusedPanel(focusedPanelId)
        return
      }
    }
    // Otherwise open it
    if (!splitRoot) {
      useSessionStore.setState({ activeSessionId: notePanelId })
      return
    }
    splitRight(notePanelId)
    const { splitRoot: root } = useUIStore.getState()
    if (root) {
      const leaf = findLeafBySession(root, notePanelId)
      if (leaf) setFocusedPanel(leaf.id)
    }
  }

  return (
    <div
      className={`tree-item tree-item--child-qt ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <NotesIcon className="tree-icon tree-icon--quick-terminal" />
      <span className="tree-label">Notes</span>
      <button className="tree-item-actions" onClick={handleMoreClick}>
        <MoreHorizontalIcon />
      </button>
    </div>
  )
}

function SessionItem({
  session,
  childQTs,
  isActive,
  staggerClass,
  projectId,
}: {
  session: Session
  childQTs: Session[]
  isActive: boolean
  staggerClass?: string
  projectId: string
}) {
  const { setActiveSession, activeSessionId } = useSessionStore()
  const { expandedSessions, toggleSession, openContextMenu, renamingId, setRenamingId, splitRoot, remoteSessionIds, poppedOutSessionIds, showProviderBadges } = useUIStore()
  const { projects } = useProjectStore()
  const { teams, tasksByTeam } = useTeamStore()
  const isExpanded = expandedSessions.has(session.id)
  const project = projects.find((p) => p.id === projectId)
  const isMainRepo = project && session.worktree_path === project.path
  const isWorktree = !isMainRepo && !!session.branch && session.type !== 'quick-terminal'
  const itemRef = useRef<HTMLDivElement>(null)

  // Worktree divergence check
  const [divergence, setDivergence] = useState<{ behind: number; ahead: number } | null>(null)
  useEffect(() => {
    if (!isWorktree) return
    getApi().session.divergence(session.id).then((d) => setDivergence(d)).catch(() => {})
  }, [session.id, isWorktree])

  // Quick notes panel open?
  const hasNotesPanel = useQuickNotesStore((s) => s.openNotePanels.has(session.id))
  const hasSavedNotes = useQuickNotesStore((s) => s.savedNotes.has(session.id))

  // Team members and tasks for this session
  const team = session.team_name ? teams.find((t) => t.name === session.team_name) : undefined
  const hasTeammates = (team?.members.length ?? 0) > 0
  const hasChildren = childQTs.length > 0 || hasTeammates || hasNotesPanel
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
        {hasChildren && (
          <ChevronIcon
            className={`tree-chevron ${isExpanded ? 'tree-chevron--open' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              toggleSession(session.id)
            }}
          />
        )}
        {session.type === 'quick-terminal'
          ? <ShellPromptIcon className="tree-icon tree-icon--quick-terminal" />
          : <TerminalIcon className="tree-icon" />
        }
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
            {showProviderBadges && session.provider && session.provider !== 'claude' && (
              <span className="teammate-badge" style={{ fontSize: '9px' }}>{session.provider}</span>
            )}
            {isMainRepo && session.branch && !isRenaming && (
              <span className="teammate-badge" style={{ fontSize: '9px' }}>direct</span>
            )}
            {!isRenaming && divergence && divergence.behind > 0 && (
              <Tooltip label={`${divergence.behind} commit${divergence.behind !== 1 ? 's' : ''} behind main${divergence.ahead > 0 ? `, ${divergence.ahead} ahead` : ''}`}>
                <span className={`tree-divergence ${divergence.behind >= 10 ? 'tree-divergence--danger' : divergence.behind >= 3 ? 'tree-divergence--warning' : ''}`}>
                  {divergence.behind}
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/></svg>
                </span>
              </Tooltip>
            )}
            {!isRenaming && hasSavedNotes && <NotesIcon className="tree-icon tree-notes-indicator" />}
            {!isRenaming && remoteSessionIds.has(session.id) && (
              <WifiIcon className="tree-icon tree-remote-indicator" />
            )}
        </div>
        {!isRenaming && (
          <>
            <button className="tree-item-actions" onClick={handleMoreClick}>
              <MoreHorizontalIcon />
            </button>
            <StatusDot status={poppedOutSessionIds.has(session.id) && session.status === 'active' ? 'popped-out' : session.status} />
          </>
        )}
      </div>

      {hasChildren && (
        <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
          <div className="tree-children">
            {hasNotesPanel && (
              <ChildNotesItem parentId={session.id} parentType="session" />
            )}
            {childQTs.map((qt) => (
              <ChildQTItem
                key={qt.id}
                session={qt}
                isActive={qt.id === activeSessionId}
              />
            ))}
            {hasTeammates && team && team.members.map((member, i) => (
              <TeammateItem
                key={member.name}
                member={member}
                tasks={tasks}
                staggerClass={`stagger-${Math.min(i + 7, 10)}`}
              />
            ))}
            {tasks.length > 0 && (
              <>
                <div className="tree-team-summary">
                  {completedTaskCount}/{totalTaskCount} tasks done
                </div>
                {tasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectItem({ project, staggerClass, projectIndex, onDragStart: onProjectDragStart, onDragOver: onProjectDragOver, onDragEnd: onProjectDragEnd, onDrop: onProjectDrop, dropPosition }: { project: Project; staggerClass: string; projectIndex: number; onDragStart: (e: React.DragEvent, index: number) => void; onDragOver: (e: React.DragEvent, index: number) => void; onDragEnd: () => void; onDrop: (e: React.DragEvent, index: number) => void; dropPosition: 'above' | 'below' | null }) {
  const { sessions, activeSessionId } = useSessionStore()
  const { expandedProjects, toggleProject, openContextMenu, renamingId, setRenamingId } = useUIStore()
  const isExpanded = expandedProjects.has(project.id)
  const headerRef = useRef<HTMLDivElement>(null)

  // Get sessions for this project (non-deleted, non-archived go first)
  const projectSessions = sessions.filter((s) => s.project_id === project.id && s.status !== 'deleted')
  // Split into top-level (no parent) and child QTs (have parent_session_id)
  const topLevelActive = projectSessions.filter((s) => s.status !== 'archived' && !s.parent_session_id)
  const childQTMap = new Map<string, Session[]>()
  for (const s of projectSessions) {
    if (s.parent_session_id && s.status !== 'archived') {
      const children = childQTMap.get(s.parent_session_id) || []
      children.push(s)
      childQTMap.set(s.parent_session_id, children)
    }
  }
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
        className={`tree-item ${dropPosition === 'above' ? 'tree-item--drop-above' : ''} ${dropPosition === 'below' ? 'tree-item--drop-below' : ''}`}
        onClick={() => !isRenaming && toggleProject(project.id)}
        onContextMenu={handleContextMenu}
        draggable={!isRenaming}
        onDragStart={(e) => onProjectDragStart(e, projectIndex)}
        onDragOver={(e) => onProjectDragOver(e, projectIndex)}
        onDragEnd={onProjectDragEnd}
        onDrop={(e) => onProjectDrop(e, projectIndex)}
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
          {topLevelActive.map((session, i) => (
            <SessionItem
              key={session.id}
              session={session}
              childQTs={childQTMap.get(session.id) || []}
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
                  childQTs={[]}
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

function GroupItem({
  group,
  groupProjects,
  filteredProjects: filtered,
  sessions: allSessions,
  staggerClass,
  projectDragHandlers,
  dragState,
}: {
  group: ProjectGroup
  groupProjects: Project[]
  filteredProjects: Project[]
  sessions: Session[]
  staggerClass: string
  projectDragHandlers: {
    onDragStart: (e: React.DragEvent, index: number) => void
    onDragOver: (e: React.DragEvent, index: number) => void
    onDragEnd: () => void
    onDrop: (e: React.DragEvent, index: number) => void
  }
  dragState: { dragIndex: number | null; dropTarget: { index: number; position: 'above' | 'below' } | null }
}) {
  const { expandedGroups, toggleGroup, openContextMenu, renamingId, setRenamingId } = useUIStore()
  const { moveProjectToGroup } = useProjectStore()
  const { sessions } = useSessionStore()
  const isExpanded = expandedGroups.has(group.id)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [dropHighlight, setDropHighlight] = useState(false)

  // Watch renamingId from UI store (context menu trigger)
  useEffect(() => {
    if (renamingId === group.id) {
      setIsRenaming(true)
      setRenameValue(group.name)
      setRenamingId(null)
    }
  }, [renamingId, group.id, group.name, setRenamingId])

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const commitRename = async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== group.name) {
      await useProjectStore.getState().updateGroup(group.id, { name: trimmed })
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue(group.name)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'project-group', targetId: group.id })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'project-group', targetId: group.id })
  }

  // Accept project drops to assign to this group
  const handleGroupDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-project-reorder')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropHighlight(true)
    }
  }

  const handleGroupDragLeave = () => {
    setDropHighlight(false)
  }

  const handleGroupDrop = (e: React.DragEvent) => {
    setDropHighlight(false)
    const projectId = e.dataTransfer.getData('application/x-project-id')
    if (projectId) {
      e.preventDefault()
      e.stopPropagation()
      moveProjectToGroup(projectId, group.id)
    }
  }

  // Filter to only show projects that match search
  const visibleProjects = groupProjects.filter((p) => filtered.includes(p))

  // Hide group only when search is active and nothing matches
  const isSearching = filtered.length !== useProjectStore.getState().projects.length
  if (visibleProjects.length === 0 && isSearching) return null

  return (
    <div className={`tree-group ${staggerClass}`}>
      <div
        className={`tree-item tree-item--group ${dropHighlight ? 'tree-item--drop-inside' : ''}`}
        onClick={() => !isRenaming && toggleGroup(group.id)}
        onContextMenu={handleContextMenu}
        onDragOver={handleGroupDragOver}
        onDragLeave={handleGroupDragLeave}
        onDrop={handleGroupDrop}
      >
        <ChevronIcon
          className={`tree-chevron ${isExpanded ? 'tree-chevron--open' : ''}`}
        />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="tree-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') cancelRename()
            }}
            onBlur={() => commitRename()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label tree-label--group">{group.name}</span>
        )}
        {!isRenaming && (
          <button className="tree-item-actions" onClick={handleMoreClick}>
            <MoreHorizontalIcon />
          </button>
        )}
        <span className="tree-group-count">{visibleProjects.length}</span>
      </div>

      <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
        <div className="tree-children">
          {visibleProjects.map((project, i) => {
            const globalIndex = allSessions.indexOf(project as any) // We'll use project's index in allProjects
            const pIdx = useProjectStore.getState().projects.indexOf(project)
            return (
              <ProjectItem
                key={project.id}
                project={project}
                staggerClass={`stagger-${Math.min(i + 6, 10)}`}
                projectIndex={pIdx}
                onDragStart={projectDragHandlers.onDragStart}
                onDragOver={projectDragHandlers.onDragOver}
                onDragEnd={projectDragHandlers.onDragEnd}
                onDrop={projectDragHandlers.onDrop}
                dropPosition={dragState.dropTarget?.index === pIdx && dragState.dragIndex !== pIdx ? dragState.dropTarget.position : null}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ProjectTree() {
  const { projects, groups, reorderProjects, addGroup, moveProjectToGroup } = useProjectStore()
  const { sessions } = useSessionStore()
  const { searchQuery, expandedProjects, expandedSessions, expandedGroups, collapseProjects, openDialog } = useUIStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'above' | 'below' } | null>(null)

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

  // Drag-and-drop is only enabled when showing the full unfiltered list
  const isDragEnabled = !query

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isDragEnabled) { e.preventDefault(); return }
    const project = projects[index]
    e.dataTransfer.setData('application/x-project-reorder', String(index))
    e.dataTransfer.setData('application/x-project-id', project.id)
    e.dataTransfer.effectAllowed = 'move'
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!isDragEnabled || dragIndex === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'above' : 'below'
    setDropTarget({ index, position })
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDropTarget(null)
  }

  const handleDrop = (_e: React.DragEvent, targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      handleDragEnd()
      return
    }
    const newProjects = [...projects]
    const [moved] = newProjects.splice(dragIndex, 1)
    let insertAt = targetIndex
    if (dropTarget?.position === 'below') {
      insertAt = dragIndex < targetIndex ? targetIndex : targetIndex + 1
    } else {
      insertAt = dragIndex < targetIndex ? targetIndex - 1 : targetIndex
    }
    newProjects.splice(insertAt, 0, moved)
    reorderProjects(newProjects.map((p) => p.id))
    handleDragEnd()
  }

  const projectDragHandlers = {
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDrop: handleDrop
  }
  const dragState = { dragIndex, dropTarget }

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

  // Split projects into ungrouped and per-group
  const ungroupedProjects = filteredProjects.filter((p) => !p.group_id)
  const projectGroupIds = groups.map((g) => g.id)
  const hasAnyExpanded = expandedProjects.size > 0 || expandedSessions.size > 0 ||
    projectGroupIds.some((id) => expandedGroups.has(id))

  const handleSectionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useUIStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, type: 'projects-header', targetId: '' })
  }

  return (
    <>
      <div className="section-header stagger-4" onContextMenu={handleSectionContextMenu}>
        <span className="section-label">Projects</span>
        {hasAnyExpanded && (
          <button className="section-collapse-btn" onClick={(e) => { e.stopPropagation(); collapseProjects(projects.map((p) => p.id), projectGroupIds) }} title="Collapse all">
            <ChevronsCollapseIcon />
          </button>
        )}
        <button className="section-add-btn" onClick={(e) => { e.stopPropagation(); openDialog('add-project') }} title="Add project">
          <PlusIcon />
        </button>
        <span className="section-count">{totalSessions}</span>
      </div>

      <div className="tree" onDragLeave={() => setDropTarget(null)}>
        {/* Ungrouped projects */}
        {ungroupedProjects.map((project) => {
          const pIdx = projects.indexOf(project)
          return (
            <ProjectItem
              key={project.id}
              project={project}
              staggerClass={`stagger-${Math.min(pIdx + 5, 10)}`}
              projectIndex={pIdx}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              dropPosition={dropTarget?.index === pIdx && dragIndex !== pIdx ? dropTarget.position : null}
            />
          )
        })}

        {/* Groups */}
        {groups.map((group, gi) => {
          const groupProjects = projects.filter((p) => p.group_id === group.id)
          return (
            <GroupItem
              key={group.id}
              group={group}
              groupProjects={groupProjects}
              filteredProjects={filteredProjects}
              sessions={sessions}
              staggerClass={`stagger-${Math.min(gi + 5, 10)}`}
              projectDragHandlers={projectDragHandlers}
              dragState={dragState}
            />
          )
        })}
      </div>
    </>
  )
}
