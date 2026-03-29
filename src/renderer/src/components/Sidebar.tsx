import { useCallback, useRef, useEffect } from 'react'
import { ActionBar } from './ActionBar'
import { SearchBar } from './SearchBar'
import { AgentTree } from './AgentTree'
import { ProjectTree } from './ProjectTree'
import { SidebarFooter, PinnedStats, useStatsPinned } from './SidebarFooter'
import { StatusDot } from './StatusDot'
import { Tooltip } from './Tooltip'
import { PanelLeftCloseIcon, PanelLeftOpenIcon, BotIcon, TerminalIcon, ShellPromptIcon } from './icons'
import { useUIStore, getAllSessionIds } from '../stores/useUIStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'

export function Sidebar() {
  const {
    sidebarCollapsed, sidebarHidden, toggleSidebarCollapse,
    sidebarWidth, setSidebarWidth
  } = useUIStore()
  const { pinned, togglePin } = useStatsPinned()

  const SNAP_THRESHOLD = 120

  /* ---- Drag to resize ---- */
  const isResizing = useRef(false)
  const sidebarRef = useRef<HTMLElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
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
    const onMouseUp = (e: MouseEvent) => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (sidebarRef.current) {
        sidebarRef.current.style.opacity = ''
      }
      if (e.clientX < SNAP_THRESHOLD && !sidebarCollapsed) {
        toggleSidebarCollapse()
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [setSidebarWidth, sidebarCollapsed, toggleSidebarCollapse])

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
      <AgentTree />
      <ProjectTree />
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
  const { sessions, activeSessionId, setActiveSession } = useSessionStore()
  const { agents } = useAgentStore()
  const splitRoot = useUIStore((s) => s.splitRoot)
  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []

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
                onClick={() => setActiveSession(a.id)}
              >
                <BotIcon className="collapsed-btn-icon" />
                <StatusDot status={a.status} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      {/* Projects */}
      {projects.map((p) => {
        const projectSessions = sessions.filter((s) => s.project_id === p.id && s.status !== 'deleted' && s.status !== 'archived')
        if (projectSessions.length === 0) return null
        return (
          <div key={p.id} className="collapsed-project-group">
            {projectSessions.map((s) => (
              <Tooltip key={s.id} label={s.name} position="right">
                <button
                  className={btnClass(s.id)}
                  onClick={() => setActiveSession(s.id)}
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
