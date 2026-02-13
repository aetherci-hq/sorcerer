import { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '../stores/useAgentStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore, getAllSessionIds, findLeafBySession } from '../stores/useUIStore'
import { BotIcon, ChevronIcon, MoreHorizontalIcon, PlusIcon, ShellPromptIcon, NotesIcon } from './icons'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { StatusDot } from './StatusDot'
import type { Agent, Session } from '../types'

function AgentQTItem({ session, isActive }: { session: Session; isActive: boolean }) {
  const { setActiveSession } = useSessionStore()
  const { openContextMenu, splitRoot } = useUIStore()
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

  return (
    <div
      ref={itemRef}
      className={`tree-item tree-item--child-qt ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
      onClick={() => setActiveSession(session.id)}
      onContextMenu={handleContextMenu}
    >
      <ShellPromptIcon className="tree-icon tree-icon--quick-terminal" />
      <span className="tree-label">{session.name}</span>
      <button className="tree-item-actions" onClick={handleMoreClick}>
        <MoreHorizontalIcon />
      </button>
      <StatusDot status={session.status} />
    </div>
  )
}

function AgentNotesItem({ agentId }: { agentId: string }) {
  const { splitRight, setFocusedPanel, splitRoot, openContextMenu } = useUIStore()
  const notePanelId = `quicknotes:agent:${agentId}`

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
    if (splitRoot) {
      const leaf = findLeafBySession(splitRoot, notePanelId)
      if (leaf) {
        setFocusedPanel(leaf.id)
        return
      }
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
      className="tree-item tree-item--child-qt"
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

function AgentItem({ agent, staggerClass }: { agent: Agent; staggerClass?: string }) {
  const { setActiveSession, activeSessionId, sessions } = useSessionStore()
  const { openContextMenu, renamingId, setRenamingId, splitRoot, expandedSessions, toggleSession } = useUIStore()
  const { renameAgent } = useAgentStore()
  const isActive = activeSessionId === agent.id
  const itemRef = useRef<HTMLDivElement>(null)

  // Agent quick terminals
  const agentQTs = sessions.filter((s) => s.agentId === agent.id && s.type === 'quick-terminal')
  const hasNotesPanel = useQuickNotesStore((s) => s.openNotePanels.has(agent.id))
  const hasChildren = agentQTs.length > 0 || hasNotesPanel
  const isExpanded = expandedSessions.has(agent.id)

  // Is this agent in the split view but not the focused one?
  const splitIds = splitRoot ? getAllSessionIds(splitRoot) : []
  const isInSplit = !isActive && splitIds.includes(agent.id)

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Watch renamingId from UI store (context menu trigger)
  useEffect(() => {
    if (renamingId === agent.id) {
      setIsRenaming(true)
      setRenameValue(agent.name)
      setRenamingId(null)
    }
  }, [renamingId, agent.id, agent.name, setRenamingId])

  // Focus input when rename mode activates
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  // Scroll active agent into view
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== agent.name) {
      renameAgent(agent.id, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue(agent.name)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRenaming(true)
    setRenameValue(agent.name)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commitRename() }
    else if (e.key === 'Escape') { cancelRename() }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'agent', targetId: agent.id })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'agent', targetId: agent.id })
  }

  // Drag source for split view
  const handleDragStart = (e: React.DragEvent) => {
    if (isRenaming) { e.preventDefault(); return }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'session', id: agent.id
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
        className={`tree-item ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
        onClick={() => !isRenaming && setActiveSession(agent.id)}
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
              toggleSession(agent.id)
            }}
          />
        )}
        <BotIcon className="tree-icon tree-icon--agent" />
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
            <>
              <span className="tree-label" onDoubleClick={handleDoubleClick}>{agent.name}</span>
              {agent.description && (
                <span className="tree-hint">{agent.description}</span>
              )}
            </>
          )}
        </div>
        {!isRenaming && (
          <>
            <button className="tree-item-actions" onClick={handleMoreClick}>
              <MoreHorizontalIcon />
            </button>
            <StatusDot status={agent.status} />
          </>
        )}
      </div>

      {hasChildren && (
        <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
          <div className="tree-children">
            {hasNotesPanel && (
              <AgentNotesItem agentId={agent.id} />
            )}
            {agentQTs.map((qt) => (
              <AgentQTItem
                key={qt.id}
                session={qt}
                isActive={qt.id === activeSessionId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AgentTree() {
  const { agents } = useAgentStore()
  const { searchQuery, openDialog } = useUIStore()

  const query = searchQuery.toLowerCase().trim()

  const filteredAgents = query
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      )
    : agents

  if (agents.length === 0 && !query) {
    return null // Don't show empty section if no agents exist yet
  }

  return (
    <div className="agent-tree-section stagger-3">
      <div className="section-header">
        <span className="section-label">Agents</span>
        <button
          className="section-add-btn"
          onClick={(e) => { e.stopPropagation(); openDialog('add-agent') }}
          title="Add Agent"
        >
          <PlusIcon />
        </button>
        <span className="section-count">{filteredAgents.length}</span>
      </div>

      {filteredAgents.length > 0 ? (
        <div className="tree">
          {filteredAgents.map((agent, i) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              staggerClass={`stagger-${Math.min(i + 4, 10)}`}
            />
          ))}
        </div>
      ) : query ? (
        <div className="empty-state empty-state--compact">
          <p className="empty-state-text">No agents match "{searchQuery}"</p>
        </div>
      ) : null}
    </div>
  )
}
