import { useCallback, useRef, useEffect } from 'react'
import { useSessionStore } from '../stores/useSessionStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useUIStore } from '../stores/useUIStore'
import { useTeamStore } from '../stores/useTeamStore'
import { GitBranchIcon, TerminalIcon, ClockIcon, UserIcon, BotIcon } from './icons'
import { Tooltip } from './Tooltip'
import { TerminalView } from './TerminalView'
import type { Session, Agent, SplitNode } from '../types'

function IdleSessionPanel({ session }: { session: Session }) {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const restartSession = useSessionStore((s) => s.restartSession)
  return (
    <div className="terminal-placeholder">
      <TerminalIcon className="terminal-placeholder-icon" />
      <div className="terminal-placeholder-text">
        Session <strong>{session.name}</strong> has ended.
      </div>
      <div className="terminal-action-row">
        <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => resumeSession(session.id)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3.5a.5.5 0 0 1 .795-.404l6 4.5a.5.5 0 0 1 0 .808l-6 4.5A.5.5 0 0 1 6 12.5v-9z" />
          </svg>
          Resume
        </button>
        <button className="terminal-restart-btn" onClick={() => restartSession(session.id)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
            <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
          </svg>
          New Session
        </button>
      </div>
    </div>
  )
}

function IdleAgentPanel({ agent }: { agent: Agent }) {
  const resumeAgent = useAgentStore((s) => s.resumeAgent)
  const restartAgent = useAgentStore((s) => s.restartAgent)
  return (
    <div className="terminal-placeholder">
      <BotIcon className="terminal-placeholder-icon" />
      <div className="terminal-placeholder-text">
        Agent <strong>{agent.name}</strong> has ended.
      </div>
      <div className="terminal-action-row">
        <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => resumeAgent(agent.id)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3.5a.5.5 0 0 1 .795-.404l6 4.5a.5.5 0 0 1 0 .808l-6 4.5A.5.5 0 0 1 6 12.5v-9z" />
          </svg>
          Resume
        </button>
        <button className="terminal-restart-btn" onClick={() => restartAgent(agent.id)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
            <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
          </svg>
          New Session
        </button>
      </div>
    </div>
  )
}

function TerminalPanel({ session, agent }: { session: Session | undefined; agent: Agent | undefined }) {
  const activeItem = session || agent

  if (!activeItem) {
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

  if (session?.status === 'archived') {
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

  if (activeItem.status === 'idle') {
    if (agent) return <IdleAgentPanel agent={agent} />
    return <IdleSessionPanel session={session!} />
  }

  return <TerminalView sessionId={activeItem.id} isFocused={true} />
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
  const { agents: agentsList } = useAgentStore()

  if (node.type === 'leaf') {
    const session = node.sessionId ? sessions.find((s) => s.id === node.sessionId) : undefined
    const agent = node.sessionId && !session ? agentsList.find((a) => a.id === node.sessionId) : undefined
    const activeItem = session || agent
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
          <span className="split-panel-name">{activeItem?.name ?? 'Empty'}</span>
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
        ) : activeItem?.status === 'idle' ? (
          agent ? <IdleAgentPanel agent={agent} /> : <IdleSessionPanel session={session!} />
        ) : activeItem ? (
          <TerminalView sessionId={activeItem.id} isFocused={isFocused} />
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
  const { agents: agentsList } = useAgentStore()
  const { teams } = useTeamStore()
  const { splitRoot } = useUIStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeAgent = !activeSession && activeSessionId
    ? agentsList.find((a) => a.id === activeSessionId)
    : undefined
  const activeProject = activeSession
    ? projects.find((p) => p.id === activeSession.project_id)
    : undefined

  // Count team members for active session/agent
  const teamName = activeSession?.team_name || activeAgent?.team_name
  const activeTeam = teamName
    ? teams.find((t) => t.name === teamName)
    : undefined
  const teamMemberCount = activeTeam?.members.length ?? 0

  return (
    <div className="main-content">
      {/* Titlebar */}
      <div className="main-titlebar">
        <div className="main-titlebar-info">
          {activeAgent ? (
            <>
              <BotIcon style={{ width: 14, height: 14, opacity: 0.6 }} />
              <span className="main-titlebar-session">{activeAgent.name}</span>
            </>
          ) : activeSession ? (
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
          ) : null}
        </div>
      </div>

      {/* Terminal area */}
      {splitRoot ? (
        <SplitNodeView node={splitRoot} />
      ) : (
        <TerminalPanel session={activeSession} agent={activeAgent} />
      )}

      {/* Status bar */}
      <div className="status-bar">
        {activeAgent ? (
          <>
            <div className={`status-bar-indicator status-bar-indicator--${activeAgent.status}`} />
            <div className="status-bar-item">
              <BotIcon />
              <span>Agent: {activeAgent.status}</span>
            </div>
            {teamMemberCount > 0 && (
              <>
                <div className="status-bar-separator" />
                <div className="status-bar-item">
                  <UserIcon />
                  <span>{teamMemberCount} member{teamMemberCount !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
          </>
        ) : activeSession ? (
          <>
            <div className={`status-bar-indicator status-bar-indicator--${activeSession.status}`} />
            <div className="status-bar-item">
              <ClockIcon />
              <span>Session: {activeSession.status}</span>
            </div>
            {teamMemberCount > 0 && (
              <>
                <div className="status-bar-separator" />
                <div className="status-bar-item">
                  <UserIcon />
                  <span>{teamMemberCount} member{teamMemberCount !== 1 ? 's' : ''}</span>
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
