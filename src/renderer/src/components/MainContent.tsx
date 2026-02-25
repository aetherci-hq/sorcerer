import { useCallback, useRef, useEffect } from 'react'
import { getApi } from '../api/client'
import { useSessionStore } from '../stores/useSessionStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useUIStore, findLeaf, findLeafBySession } from '../stores/useUIStore'
import { useTeamStore } from '../stores/useTeamStore'
import { OrphanWorkspaceBanner } from './OrphanWorkspaceBanner'
import { GitBranchIcon, TerminalIcon, ClockIcon, UserIcon, BotIcon, NotesIcon, SplitHorizontalIcon, SplitVerticalIcon } from './icons'
import { StatusDot } from './StatusDot'
import { Tooltip } from './Tooltip'
import { TerminalView } from './TerminalView'
import { QuickNotesPanel, parseQuickNotesPanelId } from './QuickNotesPanel'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
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

function IdleQuickTerminalPanel({ session }: { session: Session }) {
  const restartSession = useSessionStore((s) => s.restartSession)
  return (
    <div className="terminal-placeholder">
      <TerminalIcon className="terminal-placeholder-icon" />
      <div className="terminal-placeholder-text">
        Terminal has ended.
      </div>
      <div className="terminal-action-row">
        <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => restartSession(session.id)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
            <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
          </svg>
          Restart
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
    if (session?.type === 'quick-terminal') return <IdleQuickTerminalPanel session={session} />
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
  const { focusedPanelId, setFocusedPanel, closePanel, setSplitRatio, setPanelSession, splitRight, splitDown } = useUIStore()
  const { sessions, setActiveSession, deleteSession, createQuickTerminal, addLocalSession } = useSessionStore()
  const { agents: agentsList } = useAgentStore()

  if (node.type === 'leaf') {
    const isQuickNotes = node.sessionId?.startsWith('quicknotes:') ?? false
    const parsedNotes = isQuickNotes && node.sessionId ? parseQuickNotesPanelId(node.sessionId) : null
    const session = node.sessionId && !isQuickNotes ? sessions.find((s) => s.id === node.sessionId) : undefined
    const agent = node.sessionId && !session && !isQuickNotes ? agentsList.find((a) => a.id === node.sessionId) : undefined
    const activeItem = session || agent
    const isFocused = focusedPanelId === node.id
    const isEmpty = node.sessionId === null

    // Resolve quicknotes panel name
    let quickNotesName = 'Notes'
    if (parsedNotes) {
      if (parsedNotes.parentType === 'session') {
        const s = sessions.find((x) => x.id === parsedNotes.parentId)
        quickNotesName = `Notes: ${s?.name ?? 'Session'}`
      } else {
        const a = agentsList.find((x) => x.id === parsedNotes.parentId)
        quickNotesName = `Notes: ${a?.name ?? 'Agent'}`
      }
    }

    const handleClick = () => {
      setFocusedPanel(node.id)
      if (node.sessionId && !isQuickNotes) setActiveSession(node.sessionId)
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

    // Helper to open quick notes split panel
    const ensureExpanded = (id: string) => {
      if (!useUIStore.getState().expandedSessions.has(id)) {
        useUIStore.getState().toggleSession(id)
      }
    }

    // If the focused panel is empty, fill it instead of creating a new split
    const fillEmptyOrSplit = (sessionId: string) => {
      const { splitRoot: root, focusedPanelId: fpId } = useUIStore.getState()
      if (root && fpId) {
        const focused = findLeaf(root, fpId)
        if (focused && focused.sessionId === null) {
          setPanelSession(fpId, sessionId)
          setActiveSession(sessionId)
          return
        }
      }
      splitRight(sessionId)
    }

    const openQuickNotesSplit = (parentId: string, parentType: 'session' | 'agent') => {
      const notePanelId = `quicknotes:${parentType}:${parentId}`
      useQuickNotesStore.getState().addNotePanel(parentId)
      ensureExpanded(parentId)
      splitRight(notePanelId)
      const { splitRoot: root } = useUIStore.getState()
      if (root) {
        const leaf = findLeafBySession(root, notePanelId)
        if (leaf) setFocusedPanel(leaf.id)
      }
    }

    return (
      <div
        className={`split-panel ${isFocused ? 'split-panel--focused' : ''}`}
        onClick={handleClick}
      >
        <div className="split-panel-titlebar">
          <span className="split-panel-name">{isQuickNotes ? quickNotesName : (activeItem?.name ?? 'Empty')}</span>
          <div className="split-panel-actions">
            {session && session.type !== 'quick-terminal' && (
              <>
                <button
                  className="split-panel-action"
                  title="Open Quick Notes"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    openQuickNotesSplit(session.id, 'session')
                  }}
                >
                  <NotesIcon />
                </button>
                <button
                  className="split-panel-action"
                  title="Open Quick Terminal"
                  onClick={async (e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    const newSession = await createQuickTerminal(session.id)
                    if (newSession) {
                      ensureExpanded(session.id)
                      fillEmptyOrSplit(newSession.id)
                      const { splitRoot: root } = useUIStore.getState()
                      if (root) {
                        const leaf = findLeafBySession(root, newSession.id)
                        if (leaf) setFocusedPanel(leaf.id)
                      }
                      setActiveSession(newSession.id)
                    }
                  }}
                >
                  <TerminalIcon />
                </button>
              </>
            )}
            {agent && (
              <>
                <button
                  className="split-panel-action"
                  title="Open Quick Notes"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    openQuickNotesSplit(agent.id, 'agent')
                  }}
                >
                  <NotesIcon />
                </button>
                <button
                  className="split-panel-action"
                  title="Open Quick Terminal"
                  onClick={async (e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    const qt = await getApi().agent.createQuickTerminal(agent.id)
                    if (qt) {
                      addLocalSession(qt as any)
                      ensureExpanded(agent.id)
                      fillEmptyOrSplit(qt.id)
                      const { splitRoot: root } = useUIStore.getState()
                      if (root) {
                        const leaf = findLeafBySession(root, qt.id)
                        if (leaf) setFocusedPanel(leaf.id)
                      }
                      setActiveSession(qt.id)
                    }
                  }}
                >
                  <TerminalIcon />
                </button>
              </>
            )}
            {node.sessionId && (
              <>
                <button
                  className="split-panel-action"
                  title="Split Right"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    splitRight(node.sessionId!)
                  }}
                >
                  <SplitHorizontalIcon />
                </button>
                <button
                  className="split-panel-action"
                  title="Split Down"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFocusedPanel(node.id)
                    splitDown(node.sessionId!)
                  }}
                >
                  <SplitVerticalIcon />
                </button>
              </>
            )}
            <button className="split-panel-close" onClick={(e) => {
              e.stopPropagation()
              // Quick notes: remove from openNotePanels
              if (isQuickNotes && parsedNotes) {
                useQuickNotesStore.getState().removeNotePanel(parsedNotes.parentId)
              }
              // Quick terminals: auto-delete on panel close
              if (session?.type === 'quick-terminal') {
                deleteSession(session.id)
              }
              closePanel(node.id)
            }}>&times;</button>
          </div>
        </div>
        {isQuickNotes && node.sessionId ? (
          <QuickNotesPanel panelSessionId={node.sessionId} />
        ) : isEmpty ? (
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
          session?.type === 'quick-terminal' ? <IdleQuickTerminalPanel session={session} />
          : agent ? <IdleAgentPanel agent={agent} /> : <IdleSessionPanel session={session!} />
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
  const { sessions, activeSessionId, setActiveSession, createQuickTerminal, addLocalSession } = useSessionStore()
  const { projects } = useProjectStore()
  const { agents: agentsList } = useAgentStore()
  const { teams } = useTeamStore()
  const { splitRoot, splitRight, splitDown } = useUIStore()

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

      <OrphanWorkspaceBanner />

      {/* Terminal area */}
      {splitRoot ? (
        <SplitNodeView node={splitRoot} />
      ) : (activeSession || activeAgent) ? (
        <div className="split-panel split-panel--focused">
          <div className="split-panel-titlebar">
            <span className="split-panel-name">{(activeSession || activeAgent)?.name}</span>
            <div className="split-panel-actions">
              {activeSession && activeSession.type !== 'quick-terminal' && (
                <>
                  <button
                    className="split-panel-action"
                    title="Open Quick Notes"
                    onClick={() => {
                      const notePanelId = `quicknotes:session:${activeSession.id}`
                      useQuickNotesStore.getState().addNotePanel(activeSession.id)
                      if (!useUIStore.getState().expandedSessions.has(activeSession.id)) {
                        useUIStore.getState().toggleSession(activeSession.id)
                      }
                      const originalId = activeSession.id
                      useSessionStore.setState({ activeSessionId: originalId })
                      splitRight(notePanelId)
                      const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
                      if (root) {
                        const leaf = findLeafBySession(root, notePanelId)
                        if (leaf) setFocusedPanel(leaf.id)
                      }
                    }}
                  >
                    <NotesIcon />
                  </button>
                  <button
                    className="split-panel-action"
                    title="Open Quick Terminal"
                    onClick={async () => {
                      const originalId = activeSession.id
                      const newSession = await createQuickTerminal(activeSession.id)
                      if (newSession) {
                        if (!useUIStore.getState().expandedSessions.has(activeSession.id)) {
                          useUIStore.getState().toggleSession(activeSession.id)
                        }
                        useSessionStore.setState({ activeSessionId: originalId })
                        splitRight(newSession.id)
                        const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
                        if (root) {
                          const leaf = findLeafBySession(root, newSession.id)
                          if (leaf) setFocusedPanel(leaf.id)
                        }
                        setActiveSession(newSession.id)
                      }
                    }}
                  >
                    <TerminalIcon />
                  </button>
                  <button className="split-panel-action" title="Split Right" onClick={() => splitRight(activeSession.id)}>
                    <SplitHorizontalIcon />
                  </button>
                  <button className="split-panel-action" title="Split Down" onClick={() => splitDown(activeSession.id)}>
                    <SplitVerticalIcon />
                  </button>
                </>
              )}
              {activeAgent && (
                <>
                  <button
                    className="split-panel-action"
                    title="Open Quick Notes"
                    onClick={() => {
                      const notePanelId = `quicknotes:agent:${activeAgent.id}`
                      useQuickNotesStore.getState().addNotePanel(activeAgent.id)
                      if (!useUIStore.getState().expandedSessions.has(activeAgent.id)) {
                        useUIStore.getState().toggleSession(activeAgent.id)
                      }
                      const originalId = activeAgent.id
                      useSessionStore.setState({ activeSessionId: originalId })
                      splitRight(notePanelId)
                      const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
                      if (root) {
                        const leaf = findLeafBySession(root, notePanelId)
                        if (leaf) setFocusedPanel(leaf.id)
                      }
                    }}
                  >
                    <NotesIcon />
                  </button>
                  <button
                    className="split-panel-action"
                    title="Open Quick Terminal"
                    onClick={async () => {
                      const originalId = activeAgent.id
                      const qt = await getApi().agent.createQuickTerminal(activeAgent.id)
                      if (qt) {
                        addLocalSession(qt as any)
                        if (!useUIStore.getState().expandedSessions.has(activeAgent.id)) {
                          useUIStore.getState().toggleSession(activeAgent.id)
                        }
                        useSessionStore.setState({ activeSessionId: originalId })
                        splitRight(qt.id)
                        const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
                        if (root) {
                          const leaf = findLeafBySession(root, qt.id)
                          if (leaf) setFocusedPanel(leaf.id)
                        }
                        setActiveSession(qt.id)
                      }
                    }}
                  >
                    <TerminalIcon />
                  </button>
                  <button className="split-panel-action" title="Split Right" onClick={() => splitRight(activeAgent.id)}>
                    <SplitHorizontalIcon />
                  </button>
                  <button className="split-panel-action" title="Split Down" onClick={() => splitDown(activeAgent.id)}>
                    <SplitVerticalIcon />
                  </button>
                </>
              )}
              <button className="split-panel-close" onClick={() => {
                useSessionStore.setState({ activeSessionId: null })
              }}>&times;</button>
            </div>
          </div>
          <TerminalPanel session={activeSession} agent={activeAgent} />
        </div>
      ) : (
        <TerminalPanel session={activeSession} agent={activeAgent} />
      )}

      {/* Status bar */}
      <div className="status-bar">
        {activeAgent ? (
          <>
            <StatusDot status={activeAgent.status} />
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
            <StatusDot status={activeSession.status} />
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
