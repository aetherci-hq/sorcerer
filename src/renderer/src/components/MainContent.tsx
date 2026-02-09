import { useCallback, useRef, useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useUIStore } from '../stores/useUIStore'
import { useTeamStore } from '../stores/useTeamStore'
import { GitBranchIcon, TerminalIcon, ClockIcon, UserIcon } from './icons'
import { Tooltip } from './Tooltip'
import { TerminalView } from './TerminalView'
import type { Session, SplitNode } from '../types'

function TerminalPanel({ session }: { session: Session | undefined }) {
  if (!session) {
    return (
      <div className="terminal-placeholder">
        <TerminalIcon className="terminal-placeholder-icon" />
        <div className="terminal-placeholder-text">
          Select a session to connect to its terminal<br />
          or press <kbd>Ctrl</kbd> + <kbd>N</kbd> to start a new one
        </div>
      </div>
    )
  }

  if (session.status === 'archived') {
    return (
      <div className="terminal-placeholder">
        <TerminalIcon className="terminal-placeholder-icon" />
        <div className="terminal-placeholder-text">
          Session <strong>{session.name}</strong> is archived.<br />
          Right-click to restore or delete it.
        </div>
      </div>
    )
  }

  // Active or idle sessions get a real terminal
  return <TerminalView sessionId={session.id} isFocused={true} />
}

function SplitDivider({ direction, onDrag }: { direction: 'horizontal' | 'vertical'; onDrag: (ratio: number) => void }) {
  const dividerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLElement | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    containerRef.current = (e.currentTarget as HTMLElement).parentElement
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (direction === 'horizontal') {
        onDrag((e.clientX - rect.left) / rect.width)
      } else {
        onDrag((e.clientY - rect.top) / rect.height)
      }
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [direction, onDrag])

  return (
    <div
      ref={dividerRef}
      className={`split-divider split-divider--${direction}`}
      onMouseDown={onMouseDown}
    />
  )
}

function SplitNodeView({ node }: { node: SplitNode }) {
  const { focusedPanelId, setFocusedPanel, closePanel, setSplitRatio, setPanelSession } = useUIStore()
  const { sessions, setActiveSession } = useSessionStore()

  if (node.type === 'leaf') {
    const session = node.sessionId ? sessions.find((s) => s.id === node.sessionId) : undefined
    const isFocused = focusedPanelId === node.id
    const isEmpty = node.sessionId === null

    const handleClick = () => {
      setFocusedPanel(node.id)
      if (node.sessionId) setActiveSession(node.sessionId)
    }

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault()
      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'))
        if (data.type === 'session' && data.id) {
          setPanelSession(node.id, data.id)
          setFocusedPanel(node.id)
          setActiveSession(data.id)
        }
      } catch { /* ignore bad data */ }
    }

    return (
      <div
        className={`split-panel ${isFocused ? 'split-panel--focused' : ''}`}
        onClick={handleClick}
      >
        <div className="split-panel-titlebar">
          <span className="split-panel-name">{session?.name ?? 'Empty'}</span>
          <button className="split-panel-close" onClick={(e) => { e.stopPropagation(); closePanel(node.id) }}>&times;</button>
        </div>
        {isEmpty ? (
          <div
            className="terminal-placeholder"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <TerminalIcon className="terminal-placeholder-icon" />
            <div className="terminal-placeholder-text">
              Click or drag a session from the sidebar to open it here
            </div>
          </div>
        ) : session?.status === 'archived' ? (
          <div className="terminal-placeholder">
            <TerminalIcon className="terminal-placeholder-icon" />
            <div className="terminal-placeholder-text">
              Session <strong>{session.name}</strong> is archived.
            </div>
          </div>
        ) : session ? (
          <TerminalView sessionId={session.id} isFocused={isFocused} />
        ) : (
          <div className="terminal-placeholder">
            <TerminalIcon className="terminal-placeholder-icon" />
            <div className="terminal-placeholder-text">Session not found</div>
          </div>
        )}
      </div>
    )
  }

  // Branch node — render children with divider
  const [child1, child2] = node.children
  return (
    <div className={`split-container split-container--${node.direction}`}>
      <div
        className="split-pane"
        style={node.direction === 'horizontal'
          ? { width: `${node.ratio * 100}%` }
          : { height: `${node.ratio * 100}%` }
        }
      >
        <SplitNodeView node={child1} />
      </div>
      <SplitDivider direction={node.direction} onDrag={(ratio) => setSplitRatio(node.id, ratio)} />
      <div
        className="split-pane"
        style={node.direction === 'horizontal'
          ? { width: `${(1 - node.ratio) * 100}%` }
          : { height: `${(1 - node.ratio) * 100}%` }
        }
      >
        <SplitNodeView node={child2} />
      </div>
    </div>
  )
}

export function MainContent() {
  const { sessions, activeSessionId } = useSessionStore()
  const { projects } = useProjectStore()
  const { teams } = useTeamStore()
  const { splitRoot } = useUIStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeProject = activeSession
    ? projects.find((p) => p.id === activeSession.project_id)
    : undefined

  // Count team members for active session
  const activeTeam = activeSession?.team_name
    ? teams.find((t) => t.name === activeSession.team_name)
    : undefined
  const agentCount = activeTeam?.members.length ?? 0

  return (
    <div className="main-content">
      {/* Titlebar */}
      <div className="main-titlebar">
        <div className="main-titlebar-info">
          {activeSession && (
            <>
              {activeProject && (
                <>
                  <span className="main-titlebar-project">{activeProject.name}</span>
                  <span className="main-titlebar-separator">/</span>
                </>
              )}
              <span className="main-titlebar-session">{activeSession.name}</span>
              <Tooltip label={activeSession.branch}>
                <span className="branch-badge">
                  <GitBranchIcon />
                  {activeSession.branch}
                </span>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Terminal area */}
      {splitRoot ? (
        <SplitNodeView node={splitRoot} />
      ) : (
        <TerminalPanel session={activeSession} />
      )}

      {/* Status bar */}
      <div className="status-bar">
        {activeSession ? (
          <>
            <div className={`status-bar-indicator status-bar-indicator--${activeSession.status}`} />
            <div className="status-bar-item">
              <ClockIcon />
              <span>Session: {activeSession.status}</span>
            </div>
            {agentCount > 0 && (
              <>
                <div className="status-bar-separator" />
                <div className="status-bar-item">
                  <UserIcon />
                  <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="status-bar-item">
            <span>No session selected</span>
          </div>
        )}
        <div className="status-bar-right">
          <div className="status-bar-item">
            <span>Sorcerer v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
