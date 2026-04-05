import { useCallback, useRef, useEffect, useState } from 'react'
import { getApi } from '../api/client'
import { useSessionStore } from '../stores/useSessionStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useUIStore, findLeaf, findLeafBySession } from '../stores/useUIStore'
import { OrphanWorkspaceBanner } from './OrphanWorkspaceBanner'
import { GitBranchIcon, TerminalIcon, BotIcon, NotesIcon, SplitHorizontalIcon, SplitVerticalIcon, MaximizeIcon, MinimizeIcon } from './icons'
import { TerminalView } from './TerminalView'
import { QuickNotesPanel, parseQuickNotesPanelId } from './QuickNotesPanel'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { MissionPanel } from './MissionPanel'
import { ParticleCanvas } from './ParticleCanvas'
import type { Session, Agent, SplitNode } from '../types'

function IdleSessionPanel({ session }: { session: Session }) {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const restartSession = useSessionStore((s) => s.restartSession)
  const [hasConversation, setHasConversation] = useState<boolean | null>(null)

  useEffect(() => {
    getApi().session.hasConversation(session.id).then(setHasConversation)
  }, [session.id])

  return (
    <div className="terminal-placeholder">
      <TerminalIcon className="terminal-placeholder-icon" />
      <div className="terminal-placeholder-text">
        Session <strong>{session.name}</strong> has ended.
      </div>
      {hasConversation === false && (
        <div className="terminal-placeholder-hint">
          No conversation history found — conversation data may have expired.
        </div>
      )}
      <div className="terminal-action-row">
        {hasConversation !== false && (
          <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => resumeSession(session.id)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 3.5a.5.5 0 0 1 .795-.404l6 4.5a.5.5 0 0 1 0 .808l-6 4.5A.5.5 0 0 1 6 12.5v-9z" />
            </svg>
            Resume
          </button>
        )}
        <button className={`terminal-restart-btn${hasConversation === false ? ' terminal-restart-btn--primary' : ''}`} onClick={() => restartSession(session.id)}>
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
  const startAgent = useAgentStore((s) => s.startAgent)
  const [hasConversation, setHasConversation] = useState<boolean | null>(null)
  const isAutonomous = !!agent.mission

  useEffect(() => {
    if (!isAutonomous) {
      getApi().agent.hasConversation(agent.id).then(setHasConversation)
    }
  }, [agent.id, isAutonomous])

  return (
    <div className="terminal-placeholder">
      <BotIcon className="terminal-placeholder-icon" />
      <div className="terminal-placeholder-text">
        Agent <strong>{agent.name}</strong> has {isAutonomous ? 'stopped' : 'ended'}.
      </div>
      {isAutonomous && agent.auto_restart ? (
        <div className="terminal-placeholder-hint">
          Auto-restart is enabled — agent will restart in {agent.restart_delay}s.
        </div>
      ) : isAutonomous ? (
        <div className="terminal-placeholder-hint">
          Mission completed. Restart to run again.
        </div>
      ) : hasConversation === false ? (
        <div className="terminal-placeholder-hint">
          No conversation history found — conversation data may have expired.
        </div>
      ) : null}
      <div className="terminal-action-row">
        {isAutonomous ? (
          <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => startAgent(agent.id)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
              <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
            </svg>
            Restart Mission
          </button>
        ) : (
          <>
            {hasConversation !== false && (
              <button className="terminal-restart-btn terminal-restart-btn--primary" onClick={() => resumeAgent(agent.id)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 3.5a.5.5 0 0 1 .795-.404l6 4.5a.5.5 0 0 1 0 .808l-6 4.5A.5.5 0 0 1 6 12.5v-9z" />
                </svg>
                Resume
              </button>
            )}
            <button className={`terminal-restart-btn${hasConversation === false ? ' terminal-restart-btn--primary' : ''}`} onClick={() => restartAgent(agent.id)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z" />
                <path fillRule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z" />
              </svg>
              New Session
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function TerminalPanel({ session, agent, particlesEnabled, isFocused = true }: { session: Session | undefined; agent: Agent | undefined; particlesEnabled?: boolean; isFocused?: boolean }) {
  const activeItem = session || agent

  if (!activeItem) {
    return (
      <div className="terminal-placeholder">
        {particlesEnabled && <ParticleCanvas />}
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

  // Scheduled mission agents get a run history panel, not a terminal
  if (agent?.mission && agent?.schedule_minutes > 0) {
    return <MissionPanel agent={agent} />
  }

  if (activeItem.status === 'idle') {
    if (session?.type === 'quick-terminal') return <IdleQuickTerminalPanel session={session} />
    if (agent) return <IdleAgentPanel agent={agent} />
    return <IdleSessionPanel session={session!} />
  }

  return <TerminalView sessionId={activeItem.id} isFocused={isFocused} />
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

function PanelHeaderInfo({ session, agent }: { session?: Session; agent?: Agent }) {
  const { projects } = useProjectStore()
  if (agent) {
    return (
      <span className="split-panel-name">
        <BotIcon style={{ width: 12, height: 12, opacity: 0.5, flexShrink: 0 }} />
        {agent.name}
      </span>
    )
  }
  if (!session) return <span className="split-panel-name">Empty</span>

  const project = projects.find((p) => p.id === session.project_id)

  return (
    <span className="split-panel-name">
      {project && (
        <>
          <span className="split-panel-project">{project.name}</span>
          <span className="split-panel-sep">/</span>
        </>
      )}
      {session.name}
      {session.branch && session.type !== 'quick-terminal' && (
        <span className="split-panel-branch">
          <GitBranchIcon />
          {session.branch}
        </span>
      )}
    </span>
  )
}

function FocusModeOverlay({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const sessions = useSessionStore((s) => s.sessions)
  const agents = useAgentStore((s) => s.agents)
  const quickNotes = sessionId.startsWith('quicknotes:') ? parseQuickNotesPanelId(sessionId) : null
  const session = !quickNotes ? sessions.find((s) => s.id === sessionId) : undefined
  const agent = !quickNotes && !session ? agents.find((a) => a.id === sessionId) : undefined
  const isWide = !quickNotes

  let quickNotesName = 'Notes'
  if (quickNotes) {
    if (quickNotes.parentType === 'session') {
      const parentSession = sessions.find((x) => x.id === quickNotes.parentId)
      quickNotesName = `Notes: ${parentSession?.name ?? 'Session'}`
    } else {
      const parentAgent = agents.find((x) => x.id === quickNotes.parentId)
      quickNotesName = `Notes: ${parentAgent?.name ?? 'Agent'}`
    }
  }

  return (
    <div className="focus-mode-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`focus-mode-shell${isWide ? ' focus-mode-shell--wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="focus-mode-shell__titlebar">
          {quickNotes ? (
            <span className="split-panel-name">{quickNotesName}</span>
          ) : (
            <PanelHeaderInfo session={session} agent={agent} />
          )}
          <div className="focus-mode-shell__actions">
            <button className="focus-mode-shell__close" onClick={onClose}>Exit Focus Mode</button>
          </div>
        </div>
        <div className="focus-mode-shell__content">
          {quickNotes ? (
            <QuickNotesPanel panelSessionId={sessionId} />
          ) : (
            <TerminalPanel session={session} agent={agent} isFocused particlesEnabled={false} />
          )}
        </div>
      </div>
    </div>
  )
}

function SplitNodeView({ node }: { node: SplitNode }) {
  const { focusedPanelId, setFocusedPanel, closePanel, setSplitRatio, setPanelSession, splitRight, splitDown, maximizedPanelId, toggleMaximizePanel } = useUIStore()
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

    // If the focused panel is empty, fill it instead of creating a new split.
    // When no empty panel is available, split from this panel (node.id), not from
    // whatever panel happens to be focused.
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
      setFocusedPanel(node.id)
      splitRight(sessionId)
    }

    // Same as fillEmptyOrSplit but for non-session panel content (e.g. Quick Notes)
    // that shouldn't touch activeSessionId.
    const fillEmptyOrSplitPanel = (panelSessionId: string) => {
      const { splitRoot: root, focusedPanelId: fpId } = useUIStore.getState()
      if (root && fpId) {
        const focused = findLeaf(root, fpId)
        if (focused && focused.sessionId === null) {
          setPanelSession(fpId, panelSessionId)
          return
        }
      }
      setFocusedPanel(node.id)
      splitRight(panelSessionId)
    }

    const openQuickNotesSplit = (parentId: string, parentType: 'session' | 'agent') => {
      const notePanelId = `quicknotes:${parentType}:${parentId}`
      useQuickNotesStore.getState().addNotePanel(parentId)
      ensureExpanded(parentId)
      fillEmptyOrSplitPanel(notePanelId)
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
          {isQuickNotes ? (
            <span className="split-panel-name">{quickNotesName}</span>
          ) : (
            <PanelHeaderInfo session={session} agent={agent} />
          )}
          <div className="split-panel-actions">
            {session && session.type !== 'quick-terminal' && (
              <>
                <button
                  className="split-panel-action"
                  title="Open Quick Notes"
                  onClick={(e) => {
                    e.stopPropagation()
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
            <button
              className="split-panel-action"
              title={maximizedPanelId === node.id ? 'Restore' : 'Maximize'}
              onClick={(e) => {
                e.stopPropagation()
                toggleMaximizePanel(node.id)
              }}
            >
              {maximizedPanelId === node.id ? <MinimizeIcon /> : <MaximizeIcon />}
            </button>
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

function useParticleSettings() {
  const [enabled, setEnabled] = useState(true)
  const [intensity, setIntensity] = useState(0.5)
  useEffect(() => {
    getApi().settings.get('particlesEnabled').then((v) => {
      if (v !== undefined) setEnabled(v !== 'false')
    })
    getApi().settings.get('particleIntensity').then((v) => {
      if (v !== undefined) setIntensity(parseFloat(v) || 0.5)
    })
    const handler = () => {
      getApi().settings.get('particlesEnabled').then((v) => {
        if (v !== undefined) setEnabled(v !== 'false')
      })
      getApi().settings.get('particleIntensity').then((v) => {
        if (v !== undefined) setIntensity(parseFloat(v) || 0.5)
      })
    }
    window.addEventListener('sorcerer:settings-updated', handler)
    return () => window.removeEventListener('sorcerer:settings-updated', handler)
  }, [])
  return { enabled, intensity }
}

function useUpdateCheck() {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null)
  useEffect(() => {
    let mounted = true
    const check = async () => {
      // Respect the setting
      const enabled = await getApi().settings.get('checkForUpdates')
      if (enabled === 'false') return
      const u = await getApi().system.checkUpdate().catch(() => null)
      if (mounted) setUpdate(u)
    }
    // Check after 5 seconds, then every 2 hours
    const initial = setTimeout(check, 5000)
    const interval = setInterval(check, 2 * 60 * 60 * 1000)
    return () => { mounted = false; clearTimeout(initial); clearInterval(interval) }
  }, [])
  return update
}

export function MainContent() {
  const { sessions, activeSessionId, setActiveSession, deleteSession, createQuickTerminal, addLocalSession } = useSessionStore()
  const { projects } = useProjectStore()
  const { agents: agentsList } = useAgentStore()
  const { splitRoot, splitRight, splitDown, maximizedPanelId, focusModeSessionId, exitFocusMode } = useUIStore()
  const updateAvailable = useUpdateCheck()
  const particles = useParticleSettings()

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeAgent = !activeSession && activeSessionId
    ? agentsList.find((a) => a.id === activeSessionId)
    : undefined
  const activeQuickNotes = activeSessionId?.startsWith('quicknotes:')
    ? parseQuickNotesPanelId(activeSessionId)
    : null

  const hasActiveSessions = sessions.some((s) => s.status === 'active')
  // Empty state = no split layout and no active item selected
  const showingEmptyState = !splitRoot && !activeSession && !activeAgent && !activeQuickNotes

  useEffect(() => {
    if (!focusModeSessionId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        exitFocusMode()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusModeSessionId, exitFocusMode])

  useEffect(() => {
    if (!focusModeSessionId) return
    const focusQuickNotes = focusModeSessionId.startsWith('quicknotes:') ? parseQuickNotesPanelId(focusModeSessionId) : null
    if (focusQuickNotes) {
      const parentExists = focusQuickNotes.parentType === 'session'
        ? sessions.some((s) => s.id === focusQuickNotes.parentId)
        : agentsList.some((a) => a.id === focusQuickNotes.parentId)
      if (!parentExists) exitFocusMode()
      return
    }
    const itemExists = sessions.some((s) => s.id === focusModeSessionId) || agentsList.some((a) => a.id === focusModeSessionId)
    if (!itemExists) exitFocusMode()
  }, [focusModeSessionId, sessions, agentsList, exitFocusMode])

  return (
    <div className="main-content">
      {/* Titlebar — minimal drag region */}
      <div className="main-titlebar">
        {particles.enabled && hasActiveSessions && !showingEmptyState && (
          <ParticleCanvas count={15} brightness={particles.intensity} />
        )}
        {updateAvailable && (
          <a
            className="titlebar-update"
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.sorcerer?.window.openExternal(updateAvailable.url)
            }}
            title={`Download v${updateAvailable.version}`}
          >
            Update available: v{updateAvailable.version}
          </a>
        )}
      </div>

      <OrphanWorkspaceBanner />

      {/* Terminal area */}
      {splitRoot && maximizedPanelId && findLeaf(splitRoot, maximizedPanelId) ? (
        <div className="split-panel--maximized-container">
          <SplitNodeView node={findLeaf(splitRoot, maximizedPanelId)!} />
        </div>
      ) : splitRoot ? (
        <SplitNodeView node={splitRoot} />
      ) : activeQuickNotes && activeSessionId ? (
        <div className="split-panel split-panel--focused">
          <div className="split-panel-titlebar">
            <span className="split-panel-name">
              {activeQuickNotes.parentType === 'session'
                ? `Notes: ${sessions.find((s) => s.id === activeQuickNotes.parentId)?.name ?? 'Session'}`
                : `Notes: ${agentsList.find((a) => a.id === activeQuickNotes.parentId)?.name ?? 'Agent'}`}
            </span>
            <div className="split-panel-actions">
              <button className="split-panel-close" onClick={() => {
                useQuickNotesStore.getState().removeNotePanel(activeQuickNotes.parentId)
                useSessionStore.setState({ activeSessionId: null })
              }}>&times;</button>
            </div>
          </div>
          <QuickNotesPanel panelSessionId={activeSessionId} />
        </div>
      ) : (activeSession || activeAgent) ? (
        <div className="split-panel split-panel--focused">
          <div className="split-panel-titlebar">
            <PanelHeaderInfo session={activeSession} agent={activeAgent} />
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
                      if (!useUIStore.getState().splitRoot) {
                        useSessionStore.setState({ activeSessionId: notePanelId })
                        return
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
                      if (!useUIStore.getState().splitRoot) {
                        useSessionStore.setState({ activeSessionId: notePanelId })
                        return
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
                if (activeSession?.type === 'quick-terminal') {
                  deleteSession(activeSession.id)
                }
                useSessionStore.setState({ activeSessionId: null })
              }}>&times;</button>
            </div>
          </div>
          <TerminalPanel session={activeSession} agent={activeAgent} particlesEnabled={particles.enabled} />
        </div>
      ) : (
        <TerminalPanel session={activeSession} agent={activeAgent} particlesEnabled={particles.enabled} />
      )}
      {focusModeSessionId && (
        <FocusModeOverlay sessionId={focusModeSessionId} onClose={exitFocusMode} />
      )}
    </div>
  )
}
