import { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '../stores/useAgentStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore, getAllSessionIds, findLeafBySession } from '../stores/useUIStore'
import { BotIcon, ChevronIcon, MoreHorizontalIcon, PlusIcon, ShellPromptIcon, NotesIcon, ChevronsCollapseIcon } from './icons'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { StatusDot } from './StatusDot'
import type { Agent, AgentGroup, Session } from '../types'
import { assignPanelToPopoutTarget } from '../utils/popoutSelection'

function AgentQTItem({ session, isActive }: { session: Session; isActive: boolean }) {
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

  return (
    <div
      ref={itemRef}
      className={`tree-item tree-item--child-qt ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
      onClick={async () => {
        if (await assignPanelToPopoutTarget(session.id)) return
        setActiveSession(session.id)
      }}
      onContextMenu={handleContextMenu}
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

function AgentNotesItem({ agentId }: { agentId: string }) {
  const { splitRight, setFocusedPanel, setPanelSession, splitRoot, focusedPanelId, openContextMenu } = useUIStore()
  const notePanelId = `quicknotes:agent:${agentId}`

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

  const handleClick = async () => {
    if (await assignPanelToPopoutTarget(notePanelId)) return
    useQuickNotesStore.getState().addNotePanel(agentId)
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

function AgentCountdown({ agent }: { agent: Agent }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const calc = () => {
      const lastRun = agent.last_run_at || 0
      const intervalSec = agent.schedule_minutes * 60
      const nextRunAt = lastRun + intervalSec
      const diff = nextRunAt - Math.floor(Date.now() / 1000)
      if (diff <= 0) {
        setRemaining('due')
        return
      }
      if (diff < 60) { setRemaining(`${diff}s`); return }
      if (diff < 3600) { setRemaining(`${Math.floor(diff / 60)}m`); return }
      setRemaining(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`)
    }
    calc()
    const interval = setInterval(calc, 1000)
    return () => clearInterval(interval)
  }, [agent.last_run_at, agent.schedule_minutes])

  return <span className="agent-countdown">{remaining}</span>
}

function AgentItem({ agent, staggerClass, nested = false }: { agent: Agent; staggerClass?: string; nested?: boolean }) {
  const { setActiveSession, activeSessionId, sessions } = useSessionStore()
  const { openContextMenu, renamingId, setRenamingId, splitRoot, expandedSessions, toggleSession, poppedOutSessionIds, showProviderBadges } = useUIStore()
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

  // Drag source for split view + group assignment
  const handleDragStart = (e: React.DragEvent) => {
    if (isRenaming) { e.preventDefault(); return }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'session', id: agent.id
    }))
    e.dataTransfer.setData('application/x-agent-id', agent.id)
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
        className={`tree-item ${!nested ? 'tree-item--root-agent' : ''} ${!hasChildren ? 'tree-item--no-chevron' : ''} ${isActive ? 'tree-item--active' : ''} ${isInSplit ? 'tree-item--split' : ''}`}
        onClick={async () => {
          if (isRenaming) return
          if (await assignPanelToPopoutTarget(agent.id)) return
          setActiveSession(agent.id)
        }}
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
              {showProviderBadges && agent.provider && (
                <span className="teammate-badge" style={{ fontSize: '9px' }}>{agent.provider}</span>
              )}
              {agent.description && (
                <span className="tree-hint tree-hint--inline">{agent.description}</span>
              )}
            </>
          )}
        </div>
        {!isRenaming && (
          <>
            {agent.mission && agent.schedule_minutes > 0 && agent.status !== 'active' && (
              <AgentCountdown agent={agent} />
            )}
            <button className="tree-item-actions" onClick={handleMoreClick}>
              <MoreHorizontalIcon />
            </button>
            <StatusDot status={poppedOutSessionIds.has(agent.id) && agent.status === 'active' ? 'popped-out' : agent.status} />
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

function AgentGroupItem({
  group,
  groupAgents,
  filteredAgents,
  staggerClass,
}: {
  group: AgentGroup
  groupAgents: Agent[]
  filteredAgents: Agent[]
  staggerClass: string
}) {
  const { expandedGroups, toggleGroup, openContextMenu, renamingId, setRenamingId } = useUIStore()
  const { moveAgentToGroup } = useAgentStore()
  const isExpanded = expandedGroups.has(group.id)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [dropHighlight, setDropHighlight] = useState(false)

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
      await useAgentStore.getState().updateAgentGroup(group.id, { name: trimmed })
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
    openContextMenu({ x: e.clientX, y: e.clientY, type: 'agent-group', targetId: group.id })
  }

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openContextMenu({ x: rect.right, y: rect.bottom, type: 'agent-group', targetId: group.id })
  }

  const handleGroupDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-agent-id')) {
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
    const agentId = e.dataTransfer.getData('application/x-agent-id')
    if (agentId) {
      e.preventDefault()
      e.stopPropagation()
      moveAgentToGroup(agentId, group.id)
    }
  }

  const visibleAgents = groupAgents.filter((a) => filteredAgents.includes(a))
  const isSearching = filteredAgents.length !== useAgentStore.getState().agents.length
  if (visibleAgents.length === 0 && isSearching) return null

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
        <span className="tree-group-count">{visibleAgents.length}</span>
      </div>

      <div className={`tree-children-wrapper ${isExpanded ? 'tree-children-wrapper--open' : ''}`}>
        <div className="tree-children">
          {visibleAgents.map((agent, i) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              nested
              staggerClass={`stagger-${Math.min(i + 5, 10)}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgentTree() {
  const { agents, groups } = useAgentStore()
  const { searchQuery, openDialog, expandedGroups, collapseAgents } = useUIStore()

  const query = searchQuery.toLowerCase().trim()

  const filteredAgents = query
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query)
      )
    : agents

  if (agents.length === 0 && groups.length === 0 && !query) {
    return null
  }

  const ungroupedAgents = filteredAgents.filter((a) => !a.group_id)
  const agentGroupIds = groups.map((g) => g.id)
  const hasAnyExpanded = agentGroupIds.some((id) => expandedGroups.has(id))

  const handleSectionContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useUIStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, type: 'agents-header', targetId: '' })
  }

  return (
    <div className="agent-tree-section stagger-3">
      <div className="section-header" onContextMenu={handleSectionContextMenu}>
        <span className="section-label">Agents</span>
        {hasAnyExpanded && (
          <button className="section-collapse-btn" onClick={(e) => { e.stopPropagation(); collapseAgents(agentGroupIds) }} title="Collapse all">
            <ChevronsCollapseIcon />
          </button>
        )}
        <button
          className="section-add-btn"
          onClick={(e) => { e.stopPropagation(); openDialog('add-agent') }}
          title="Add Agent"
        >
          <PlusIcon />
        </button>
        <span className="section-count">{filteredAgents.length}</span>
      </div>

      {(filteredAgents.length > 0 || groups.length > 0) ? (
        <div className="tree">
          {ungroupedAgents.map((agent, i) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              nested={false}
              staggerClass={`stagger-${Math.min(i + 4, 10)}`}
            />
          ))}
          {groups.map((group, gi) => {
            const groupAgents = agents.filter((a) => a.group_id === group.id)
            return (
              <AgentGroupItem
                key={group.id}
                group={group}
                groupAgents={groupAgents}
                filteredAgents={filteredAgents}
                staggerClass={`stagger-${Math.min(gi + 4, 10)}`}
              />
            )
          })}
        </div>
      ) : query ? (
        <div className="empty-state empty-state--compact">
          <p className="empty-state-text">No agents match "{searchQuery}"</p>
        </div>
      ) : null}
    </div>
  )
}
