import { useCallback, useRef, useEffect } from 'react'
import { ActionBar } from './ActionBar'
import { SearchBar } from './SearchBar'
import { AgentTree } from './AgentTree'
import { ProjectTree } from './ProjectTree'
import { SidebarFooter, PinnedStats, useStatsPinned } from './SidebarFooter'
import { StatusDot } from './StatusDot'
import { Tooltip } from './Tooltip'
import { PanelLeftCloseIcon, PanelLeftOpenIcon, BotIcon, TerminalIcon, ShellPromptIcon } from './icons'
import { useUIStore, getAllSessionIds, AGENT_PANE_MIN } from '../stores/useUIStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { assignPanelToPopoutTarget } from '../utils/popoutSelection'
import { getProjectsInSidebarOrder } from '../utils/projectOrdering'

export function Sidebar() {
  const {
    sidebarCollapsed, sidebarHidden, toggleSidebarCollapse,
    sidebarWidth, setSidebarWidth, agentPaneHeight, setAgentPaneHeight, searchQuery
  } = useUIStore()
  const { pinned, togglePin } = useStatsPinned()
  const agents = useAgentStore((s) => s.agents)
  const agentGroups = useAgentStore((s) => s.groups)
  const showAgentPane = agents.length > 0 || agentGroups.length > 0 || searchQuery.trim().length > 0

  const SNAP_THRESHOLD = 120

  /* ---- Drag to resize ---- */
  const isResizing = useRef(false)
  const isAgentPaneResizing = useRef(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current && !isAgentPaneResizing.current) return
      if (isResizing.current) {
        if (e.clientX < SNAP_THRESHOLD) {
          if (sidebarRef.current) {
            sidebarRef.current.style.opacity = '0.5'
          }
        } else {
          if (sidebarRef.current) {
            sidebarRef.current.style.opacity = ''
          }
          setSidebarWidth(e.clientX)
        }
      }
      if (isAgentPaneResizing.current && contentRef.current) {
        const contentRect = contentRef.current.getBoundingClientRect()
        const maxHeight = Math.max(AGENT_PANE_MIN, contentRect.height - 160)
        const nextHeight = Math.min(maxHeight, Math.max(AGENT_PANE_MIN, e.clientY - contentRect.top))
        setAgentPaneHeight(nextHeight)
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      const wasSidebarResizing = isResizing.current
      const wasAgentPaneResizing = isAgentPaneResizing.current
      if (!wasSidebarResizing && !wasAgentPaneResizing) return
      if (wasSidebarResizing) {
        isResizing.current = false
        if (sidebarRef.current) {
          sidebarRef.current.style.opacity = ''
        }
        if (e.clientX < SNAP_THRESHOLD && !sidebarCollapsed) {
          toggleSidebarCollapse()
        }
      }
      isAgentPaneResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setSidebarWidth, sidebarCollapsed, toggleSidebarCollapse, setAgentPaneHeight])

  const onAgentPaneMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isAgentPaneResizing.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  /* ---- Hidden view ---- */
  if (sidebarHidden) {
    return null
  }

  /* ---- Collapsed view ---- */
  if (sidebarCollapsed) {
    return (
      <aside className="sidebar sidebar--collapsed" ref={sidebarRef}>
        <div className="titlebar stagger-1">
          <div className="titlebar-logo" />
        </div>

        <button className="sidebar-toggle-btn" onClick={toggleSidebarCollapse}>
          <PanelLeftOpenIcon />
        </button>

        <ActionBar collapsed />

        <CollapsedTree />

        <SidebarFooter collapsed pinned={pinned} togglePin={togglePin} />
      </aside>
    )
  }

  /* ---- Expanded view ---- */
  return (
    <aside
      className="sidebar"
      ref={sidebarRef}
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
    >
      <div className="titlebar stagger-1">
        <div className="titlebar-logo" />
        <span className="titlebar-text">Sorcerer</span>
        <button className="sidebar-toggle-btn" onClick={toggleSidebarCollapse}>
          <PanelLeftCloseIcon />
        </button>
      </div>

      <ActionBar collapsed={false} />
      <SearchBar />
      <div className="sidebar-content" ref={contentRef}>
        {showAgentPane && (
          <div className="sidebar-pane sidebar-pane--agents" style={{ height: agentPaneHeight, minHeight: AGENT_PANE_MIN }}>
            <AgentTree />
          </div>
        )}
        {showAgentPane && <div className="sidebar-section-resize-handle" onMouseDown={onAgentPaneMouseDown} />}
        <div className="sidebar-pane sidebar-pane--projects">
          <ProjectTree />
        </div>
      </div>
      {pinned && <PinnedStats />}
      <SidebarFooter collapsed={false} width={sidebarWidth} pinned={pinned} togglePin={togglePin} />

      {/* Resize handle */}
      <div className="sidebar-resize-handle" onMouseDown={onMouseDown} />
    </aside>
  )
}

/** Collapsed view: just status dots for active sessions + agents */
function CollapsedTree() {
  const { projects } = useProjectStore()
  const projectGroups = useProjectStore((s) => s.groups)
  const { sessions, activeSessionId, setActiveSession } = useSessionStore()
  const { agents } = useAgentStore()
  const splitRoot = useUIStore((s) => s.splitRoot)
  const projectTopLevelOrder = useUIStore((s) => s.projectTopLevelOrder)
  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []
  const orderedProjects = getProjectsInSidebarOrder(projects, projectGroups, projectTopLevelOrder)

  const btnClass = (id: string) => {
    const isActive = id === activeSessionId
    const isInSplit = !isActive && splitIds.includes(id)
    return `collapsed-session-btn${isActive ? ' collapsed-session-btn--active' : ''}${isInSplit ? ' collapsed-session-btn--split' : ''}`
  }

  return (
    <div className="collapsed-tree">
      {/* Agents */}
      {agents.length > 0 && (
        <div className="collapsed-project-group">
          {agents.map((a) => (
            <Tooltip key={a.id} label={a.name} position="right">
              <button
                className={btnClass(a.id)}
                onClick={async () => {
                  if (await assignPanelToPopoutTarget(a.id)) return
                  setActiveSession(a.id)
                }}
              >
                <BotIcon className="collapsed-btn-icon" />
                <StatusDot status={a.status} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      {/* Projects */}
      {orderedProjects.map((p) => {
        const projectSessions = sessions.filter((s) => s.project_id === p.id && s.status !== 'deleted' && s.status !== 'archived')
        if (projectSessions.length === 0) return null
        return (
          <div key={p.id} className="collapsed-project-group">
            {projectSessions.map((s) => (
              <Tooltip key={s.id} label={s.name} position="right">
                <button
                  className={btnClass(s.id)}
                  onClick={async () => {
                    if (await assignPanelToPopoutTarget(s.id)) return
                    setActiveSession(s.id)
                  }}
                >
                  {s.type === 'quick-terminal'
                    ? <ShellPromptIcon className="collapsed-btn-icon" />
                    : <TerminalIcon className="collapsed-btn-icon" />
                  }
                  <StatusDot status={s.status} />
                </button>
              </Tooltip>
            ))}
          </div>
        )
      })}
    </div>
  )
}
