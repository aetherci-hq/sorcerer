import { useEffect, useRef, type ReactNode } from 'react'
import { getApi } from '../api/client'
import { useUIStore, findLeaf, findLeafBySession } from '../stores/useUIStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useToastStore } from '../stores/useToastStore'
import {
  PlusIcon, CopyIcon, TrashIcon, SplitHorizontalIcon, SplitVerticalIcon,
  RefreshIcon, UploadIcon, ExternalLinkIcon, ArchiveIcon, RotateCcwIcon, EditIcon, PlayIcon, StopIcon, TerminalIcon, MergeIcon, NotesIcon, SmartphoneIcon
} from './icons'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'

type MenuItem =
  | { label: string; icon?: ReactNode; shortcut?: string; action: () => void; danger?: boolean }
  | { type: 'separator' }

export function ContextMenu() {
  const { contextMenu, closeContextMenu, openDialog, splitRight, splitDown, setRenamingId } = useUIStore()
  const { projects } = useProjectStore()
  const { sessions, resumeSession, restartSession, restoreSession, pushBranch, createQuickTerminal } = useSessionStore()
  const { agents, startAgent, resumeAgent, restartAgent, killAgent } = useAgentStore()
  const { addToast } = useToastStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // Clamp menu position to viewport
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const pad = 8

    let top = contextMenu.y
    let left = contextMenu.x
    if (rect.right > window.innerWidth - pad) {
      left = window.innerWidth - rect.width - pad
    }
    if (rect.bottom > window.innerHeight - pad) {
      top = window.innerHeight - rect.height - pad
    }
    if (left < pad) left = pad
    if (top < pad) top = pad

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
  })

  // Focus first item when menu opens
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const firstBtn = menuRef.current.querySelector<HTMLButtonElement>('.context-menu-item')
    firstBtn?.focus()
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeContextMenu(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!menuRef.current) return
        const btns = Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('.context-menu-item'))
        if (btns.length === 0) return
        const idx = btns.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === 'ArrowDown') {
          btns[(idx + 1) % btns.length].focus()
        } else {
          btns[(idx - 1 + btns.length) % btns.length].focus()
        }
      }
    }
    requestAnimationFrame(() => {
      window.addEventListener('click', onClick)
      window.addEventListener('contextmenu', onClick)
      window.addEventListener('keydown', onKey)
    })
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('contextmenu', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu, closeContextMenu])

  if (!contextMenu) return null

  const findProjectPath = (targetId: string): string => {
    const project = projects.find((p) => p.id === targetId)
    return project?.path ?? ''
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      addToast(`${label} copied`, 'success')
    }).catch(() => {
      addToast('Failed to copy', 'error')
    })
  }

  // Find session/agent to determine state
  const targetSession = contextMenu.type === 'session'
    ? sessions.find((s) => s.id === contextMenu.targetId)
    : undefined
  const targetAgent = contextMenu.type === 'agent'
    ? agents.find((a) => a.id === contextMenu.targetId)
    : undefined
  const isQuickTerminal = targetSession?.type === 'quick-terminal'
  const isArchived = targetSession?.status === 'archived'
  const targetProject = targetSession
    ? projects.find((p) => p.id === targetSession.project_id)
    : undefined
  const isMainRepo = targetProject && targetSession?.worktree_path === targetProject.path

  const iconClass = 'context-menu-icon'

  // Ensure a session/agent is expanded in the sidebar so its children are visible
  const ensureExpanded = (id: string) => {
    if (!useUIStore.getState().expandedSessions.has(id)) {
      useUIStore.getState().toggleSession(id)
    }
  }

  // Focus the panel containing a target session/agent before splitting,
  // so the split happens relative to the right-clicked item
  const focusTargetPanel = (targetId: string) => {
    const { splitRoot: root, setFocusedPanel: focus } = useUIStore.getState()
    if (root) {
      const leaf = findLeafBySession(root, targetId)
      if (leaf) focus(leaf.id)
    }
  }

  // If the currently focused panel is empty, fill it with the session instead of splitting
  const fillEmptyOrSplit = (sessionId: string) => {
    const { splitRoot: root, focusedPanelId, setPanelSession } = useUIStore.getState()
    if (root && focusedPanelId) {
      const focused = findLeaf(root, focusedPanelId)
      if (focused && focused.sessionId === null) {
        setPanelSession(focusedPanelId, sessionId)
        useSessionStore.getState().setActiveSession(sessionId)
        return
      }
    }
    splitRight(sessionId)
  }

  let items: MenuItem[]

  if (contextMenu.type === 'agent') {
    const isRunning = targetAgent?.status === 'active'
    const agentRcEnabled = targetAgent?.remote_control === 1
    items = [
      ...(isRunning ? [
        { label: 'Stop Agent', icon: <StopIcon className={iconClass} />, action: async () => {
          await killAgent(contextMenu.targetId)
          addToast('Agent stopped', 'info')
        }}
      ] : [
        { label: 'Resume Agent', icon: <PlayIcon className={iconClass} />, action: async () => {
          await resumeAgent(contextMenu.targetId)
          addToast('Agent resumed', 'info')
        }},
        { label: 'Start New Session', icon: <RefreshIcon className={iconClass} />, action: async () => {
          await restartAgent(contextMenu.targetId)
          addToast('New agent session started', 'info')
        }}
      ]),
      { label: agentRcEnabled ? 'Disable Session Remote Control' : 'Enable Session Remote Control',
        icon: <SmartphoneIcon className={iconClass} />,
        action: async () => {
          await getApi().agent.setRemoteControl(contextMenu.targetId, !agentRcEnabled)
          useAgentStore.getState().updateAgentInStore(contextMenu.targetId, { remote_control: agentRcEnabled ? 0 : 1 })
          addToast(agentRcEnabled ? 'Session Remote Control disabled for future sessions' : 'Session Remote Control enabled — check terminal for connection URL', 'success')
        }
      },
      { type: 'separator' as const },
      { label: 'Split Right', icon: <SplitHorizontalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitRight(contextMenu.targetId) } },
      { label: 'Split Down', icon: <SplitVerticalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitDown(contextMenu.targetId) } },
      { label: 'Open Quick Terminal', icon: <TerminalIcon className={iconClass} />, action: async () => {
        const qt = await getApi().agent.createQuickTerminal(contextMenu.targetId)
        if (qt) {
          useSessionStore.getState().addLocalSession(qt as any)
          ensureExpanded(contextMenu.targetId)
          fillEmptyOrSplit(qt.id)
          const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
          if (root) {
            const leaf = findLeafBySession(root, qt.id)
            if (leaf) setFocusedPanel(leaf.id)
          }
          useSessionStore.getState().setActiveSession(qt.id)
        }
      }},
      { label: 'Open Quick Notes', icon: <NotesIcon className={iconClass} />, action: () => {
        const notePanelId = `quicknotes:agent:${contextMenu.targetId}`
        useQuickNotesStore.getState().addNotePanel(contextMenu.targetId)
        ensureExpanded(contextMenu.targetId)
        focusTargetPanel(contextMenu.targetId)
        splitRight(notePanelId)
        const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, notePanelId)
          if (leaf) setFocusedPanel(leaf.id)
        }
      }},
      { type: 'separator' as const },
      { label: 'Rename', icon: <EditIcon className={iconClass} />, shortcut: 'F2', action: () => setRenamingId(contextMenu.targetId) },
      { type: 'separator' as const },
      { label: 'Delete Agent', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-agent', contextMenu.targetId) }
    ]
  } else if (contextMenu.type === 'project') {
    items = [
      { label: 'New Session', icon: <PlusIcon className={iconClass} />, shortcut: 'Ctrl+N', action: () => openDialog('new-session', contextMenu.targetId) },
      { label: 'Open Quick Terminal', icon: <TerminalIcon className={iconClass} />, action: async () => {
        const newSession = await window.sorcerer?.session.createProjectQuickTerminal(contextMenu.targetId)
        if (newSession) {
          await useSessionStore.getState().loadSessions()
          fillEmptyOrSplit(newSession.id)
          useSessionStore.getState().setActiveSession(newSession.id)
        }
      }},
      { type: 'separator' },
      { label: 'Rename', icon: <EditIcon className={iconClass} />, shortcut: 'F2', action: () => setRenamingId(contextMenu.targetId) },
      { label: 'Copy Project Path', icon: <CopyIcon className={iconClass} />, action: () => copyToClipboard(findProjectPath(contextMenu.targetId), 'Path') },
      { label: 'Sync Worktrees', icon: <RefreshIcon className={iconClass} />, action: async () => {
        const result = await getApi().project.syncWorktrees(contextMenu.targetId)
        await useSessionStore.getState().loadSessions()
        if (result.created === 0 && result.removed === 0) {
          addToast('All worktrees in sync', 'info')
        } else {
          const parts: string[] = []
          if (result.created > 0) parts.push(`${result.created} session${result.created > 1 ? 's' : ''} found`)
          if (result.removed > 0) parts.push(`${result.removed} stale removed`)
          addToast(parts.join(', '), 'success')
        }
      }},
      { type: 'separator' },
      { label: 'Remove Project', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-session', contextMenu.targetId) }
    ]
  } else if (contextMenu.type === 'quicknotes') {
    items = [
      { label: 'Split Right', icon: <SplitHorizontalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitRight(contextMenu.targetId) } },
      { label: 'Split Down', icon: <SplitVerticalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitDown(contextMenu.targetId) } },
      { type: 'separator' as const },
      { label: 'Close Panel', icon: <TrashIcon className={iconClass} />, danger: true, action: () => {
        const parts = contextMenu.targetId.split(':')
        if (parts.length === 3) {
          useQuickNotesStore.getState().removeNotePanel(parts[2])
        }
        const { splitRoot: root } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, contextMenu.targetId)
          if (leaf) useUIStore.getState().closePanel(leaf.id)
        }
      }}
    ]
  } else if (isQuickTerminal) {
    items = [
      { label: 'Split Right', icon: <SplitHorizontalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitRight(contextMenu.targetId) } },
      { label: 'Split Down', icon: <SplitVerticalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitDown(contextMenu.targetId) } },
      ...(targetSession?.parent_session_id ? [
        { label: 'Open Quick Notes', icon: <NotesIcon className={iconClass} />, action: () => {
          const parentId = targetSession!.parent_session_id!
          const notePanelId = `quicknotes:session:${parentId}`
          useQuickNotesStore.getState().addNotePanel(parentId)
          ensureExpanded(parentId)
          focusTargetPanel(contextMenu.targetId)
          splitRight(notePanelId)
          const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
          if (root) {
            const leaf = findLeafBySession(root, notePanelId)
            if (leaf) setFocusedPanel(leaf.id)
          }
        }}
      ] : []),
      { type: 'separator' },
      { label: 'Restart Shell', icon: <RefreshIcon className={iconClass} />, action: async () => {
        await restartSession(contextMenu.targetId)
        addToast('Shell restarted', 'info')
      }},
      { type: 'separator' },
      { label: 'Close Terminal', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-session', contextMenu.targetId) }
    ]
  } else if (isArchived) {
    items = [
      { label: 'Restore Session', icon: <RotateCcwIcon className={iconClass} />, action: async () => {
        await restoreSession(contextMenu.targetId)
        addToast(`"${targetSession!.name}" restored`, 'info')
      }},
      { type: 'separator' },
      { label: 'Rename', icon: <EditIcon className={iconClass} />, shortcut: 'F2', action: () => setRenamingId(contextMenu.targetId) },
      { label: 'Copy Worktree Path', icon: <CopyIcon className={iconClass} />, action: () => {
        if (targetSession) copyToClipboard(targetSession.worktree_path, 'Worktree path')
      }},
      { type: 'separator' },
      { label: 'Delete Session', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-session', contextMenu.targetId) }
    ]
  } else {
    items = [
      { label: 'Split Right', icon: <SplitHorizontalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitRight(contextMenu.targetId) } },
      { label: 'Split Down', icon: <SplitVerticalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitDown(contextMenu.targetId) } },
      { label: 'Open Quick Terminal', icon: <TerminalIcon className={iconClass} />, action: async () => {
        const newSession = await createQuickTerminal(contextMenu.targetId)
        if (newSession) {
          ensureExpanded(contextMenu.targetId)
          fillEmptyOrSplit(newSession.id)
          const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
          if (root) {
            const leaf = findLeafBySession(root, newSession.id)
            if (leaf) setFocusedPanel(leaf.id)
          }
          useSessionStore.getState().setActiveSession(newSession.id)
        }
      }},
      { label: 'Open Quick Notes', icon: <NotesIcon className={iconClass} />, action: () => {
        const notePanelId = `quicknotes:session:${contextMenu.targetId}`
        useQuickNotesStore.getState().addNotePanel(contextMenu.targetId)
        ensureExpanded(contextMenu.targetId)
        focusTargetPanel(contextMenu.targetId)
        splitRight(notePanelId)
        const { splitRoot: root, setFocusedPanel } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, notePanelId)
          if (leaf) setFocusedPanel(leaf.id)
        }
      }},
      { type: 'separator' },
      { label: 'Rename', icon: <EditIcon className={iconClass} />, shortcut: 'F2', action: () => setRenamingId(contextMenu.targetId) },
      { label: 'Resume Session', icon: <PlayIcon className={iconClass} />, action: async () => {
        await resumeSession(contextMenu.targetId)
        addToast('Session resumed', 'info')
      }},
      { label: 'New Session', icon: <RefreshIcon className={iconClass} />, action: async () => {
        await restartSession(contextMenu.targetId)
        addToast('New session started', 'info')
      }},
      { label: targetSession?.remote_control ? 'Disable Session Remote Control' : 'Enable Session Remote Control',
        icon: <SmartphoneIcon className={iconClass} />,
        action: async () => {
          const enabling = !targetSession?.remote_control
          await getApi().session.setRemoteControl(contextMenu.targetId, enabling)
          useSessionStore.getState().updateSessionInStore(contextMenu.targetId, { remote_control: enabling ? 1 : 0 })
          addToast(enabling ? 'Session Remote Control enabled — check terminal for connection URL' : 'Session Remote Control disabled for future sessions', 'success')
        }
      },
      { label: 'Copy Worktree Path', icon: <CopyIcon className={iconClass} />, action: () => {
        if (targetSession) copyToClipboard(targetSession.worktree_path, 'Worktree path')
      }},
      { type: 'separator' },
      { label: 'Push Branch', icon: <UploadIcon className={iconClass} />, action: async () => {
        addToast('Pushing branch...', 'info')
        const result = await pushBranch(contextMenu.targetId)
        if (result.pushed) {
          addToast('Branch pushed to remote', 'success')
        } else {
          addToast(result.error || 'Push failed', 'error')
        }
      }},
      { label: 'Open Remote', icon: <ExternalLinkIcon className={iconClass} />, action: async () => {
        try {
          const result = await getApi().session.openRemote(contextMenu.targetId)
          if (!result.opened) {
            addToast(result.error || 'No remote URL found', 'error')
          }
        } catch {
          addToast('Failed to open remote', 'error')
        }
      }},
      ...(!isMainRepo ? [
        { label: 'Land on Main', icon: <MergeIcon className={iconClass} />, action: () => openDialog('land-session', contextMenu.targetId) },
      ] : []),
      { type: 'separator' },
      { label: 'Archive Session', icon: <ArchiveIcon className={iconClass} />, action: () => openDialog('archive-session', contextMenu.targetId) },
      { type: 'separator' },
      { label: 'Delete Session', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-session', contextMenu.targetId) }
    ]
  }

  return (
    <div
      className="context-menu"
      ref={menuRef}
      style={{ top: contextMenu.y, left: contextMenu.x }}
    >
      {items.map((item, i) =>
        'type' in item ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? 'context-menu-item--danger' : ''}`}
            onClick={() => { item.action(); closeContextMenu() }}
          >
            {item.icon}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
