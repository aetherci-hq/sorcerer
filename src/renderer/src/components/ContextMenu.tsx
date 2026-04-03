import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getApi } from '../api/client'
import { useUIStore, findLeaf, findLeafBySession } from '../stores/useUIStore'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useToastStore } from '../stores/useToastStore'
import {
  PlusIcon, CopyIcon, TrashIcon, SplitHorizontalIcon, SplitVerticalIcon,
  RefreshIcon, UploadIcon, ExternalLinkIcon, ArchiveIcon, RotateCcwIcon, EditIcon, PlayIcon, StopIcon, TerminalIcon, MergeIcon, NotesIcon, SmartphoneIcon, FolderIcon, SettingsIcon
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [loadingItem, setLoadingItem] = useState<number | null>(null)

  // Clamp menu position to viewport before paint
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) { setPos(null); return }
    const rect = menuRef.current.getBoundingClientRect()
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

    setPos({ top, left })
  }, [contextMenu])

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
      ] : targetAgent?.mission ? [
        { label: 'Start Mission', icon: <PlayIcon className={iconClass} />, action: async () => {
          await startAgent(contextMenu.targetId)
          addToast('Agent mission started', 'info')
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
      { label: 'Pop Out', icon: <ExternalLinkIcon className={iconClass} />, action: async () => {
        await getApi().popout.open('terminal', contextMenu.targetId, targetAgent?.name || 'Agent')
        // Clear the panel in the main app so it's not shown in two places
        const { splitRoot: root, setPanelSession } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, contextMenu.targetId)
          if (leaf) setPanelSession(leaf.id, null)
        } else {
          // Single panel mode (no splits) — clear the active session
          useSessionStore.getState().setActiveSession(contextMenu.targetId)
          useSessionStore.setState({ activeSessionId: null })
        }
      }},
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
      { label: 'Edit Agent Settings', icon: <SettingsIcon className={iconClass} />, action: () => {
        openDialog('edit-agent-mission', contextMenu.targetId)
      }},
      ...(targetAgent?.mission ? [
        { label: 'Disable Mission', icon: <StopIcon className={iconClass} />, danger: true, action: async () => {
          await killAgent(contextMenu.targetId)
          await getApi().agent.update(contextMenu.targetId, { mission: '', auto_start: 0, auto_restart: 0, schedule_minutes: 0 })
          useAgentStore.getState().updateAgentInStore(contextMenu.targetId, { mission: '', auto_start: 0, auto_restart: 0, schedule_minutes: 0 })
          addToast('Mission disabled — agent is now interactive', 'info')
        }}
      ] : []),
      ...(() => {
        const { groups: agentGroups, moveAgentToGroup } = useAgentStore.getState()
        const currentAgent = agents.find((a) => a.id === contextMenu.targetId)
        const agentGroupItems: MenuItem[] = agentGroups.length > 0 ? [
          { type: 'separator' as const },
          ...(currentAgent?.group_id ? [
            { label: 'Remove from Group', icon: <FolderIcon className={iconClass} />, action: async () => {
              await moveAgentToGroup(contextMenu.targetId, null)
            }}
          ] : []),
          ...agentGroups
            .filter((g) => g.id !== currentAgent?.group_id)
            .map((g) => ({
              label: `Move to ${g.name}`, icon: <FolderIcon className={iconClass} />, action: async () => {
                await moveAgentToGroup(contextMenu.targetId, g.id)
              }
            }))
        ] : []
        return agentGroupItems
      })(),
      { type: 'separator' as const },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useAgentStore.getState().addAgentGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => useUIStore.getState().setRenamingId(group.id))
        }
      }},
      { type: 'separator' as const },
      { label: 'Delete Agent', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-agent', contextMenu.targetId) }
    ]
  } else if (contextMenu.type === 'agents-header') {
    items = [
      { label: 'Add Agent', icon: <PlusIcon className={iconClass} />, action: () => openDialog('add-agent') },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useAgentStore.getState().addAgentGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => useUIStore.getState().setRenamingId(group.id))
        }
      }}
    ]
  } else if (contextMenu.type === 'agent-group') {
    items = [
      { label: 'Rename Group', icon: <EditIcon className={iconClass} />, action: () => setRenamingId(contextMenu.targetId) },
      { type: 'separator' },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useAgentStore.getState().addAgentGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => useUIStore.getState().setRenamingId(group.id))
        }
      }},
      { type: 'separator' },
      { label: 'Delete Group', icon: <TrashIcon className={iconClass} />, danger: true, action: async () => {
        await useAgentStore.getState().removeAgentGroup(contextMenu.targetId)
        addToast('Group deleted', 'info')
      }}
    ]
  } else if (contextMenu.type === 'projects-header') {
    items = [
      { label: 'Add Project', icon: <PlusIcon className={iconClass} />, action: () => openDialog('add-project') },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useProjectStore.getState().addGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => {
            useUIStore.getState().setRenamingId(group.id)
          })
        }
      }}
    ]
  } else if (contextMenu.type === 'project-group') {
    items = [
      { label: 'Rename Group', icon: <EditIcon className={iconClass} />, action: () => setRenamingId(contextMenu.targetId) },
      { type: 'separator' },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useProjectStore.getState().addGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => useUIStore.getState().setRenamingId(group.id))
        }
      }},
      { type: 'separator' },
      { label: 'Delete Group', icon: <TrashIcon className={iconClass} />, danger: true, action: async () => {
        await useProjectStore.getState().removeGroup(contextMenu.targetId)
        addToast('Group deleted', 'info')
      }}
    ]
  } else if (contextMenu.type === 'project') {
    const { groups, moveProjectToGroup } = useProjectStore.getState()
    const currentProject = projects.find((p) => p.id === contextMenu.targetId)
    const groupItems: MenuItem[] = groups.length > 0 ? [
      { type: 'separator' },
      ...(currentProject?.group_id ? [
        { label: 'Remove from Group', icon: <FolderIcon className={iconClass} />, action: async () => {
          await moveProjectToGroup(contextMenu.targetId, null)
        }}
      ] : []),
      ...groups
        .filter((g) => g.id !== currentProject?.group_id)
        .map((g) => ({
          label: `Move to ${g.name}`, icon: <FolderIcon className={iconClass} />, action: async () => {
            await moveProjectToGroup(contextMenu.targetId, g.id)
          }
        }))
    ] : []

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
      ...groupItems,
      { type: 'separator' },
      { label: 'New Group', icon: <FolderIcon className={iconClass} />, action: async () => {
        const group = await useProjectStore.getState().addGroup('New Group')
        if (group) {
          useUIStore.getState().toggleGroup(group.id)
          requestAnimationFrame(() => useUIStore.getState().setRenamingId(group.id))
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
      { label: 'Delete Notes', icon: <TrashIcon className={iconClass} />, danger: true, action: async () => {
        const parts = contextMenu.targetId.split(':')
        if (parts.length === 3) {
          const parentType = parts[1] as 'session' | 'agent'
          const parentId = parts[2]
          await getApi().quickNotes.delete(parentId, parentType)
          useQuickNotesStore.getState().clearSaved(parentId)
          useQuickNotesStore.getState().removeNotePanel(parentId)
          addToast('Notes deleted', 'success')
        }
        const { splitRoot: root } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, contextMenu.targetId)
          if (leaf) useUIStore.getState().closePanel(leaf.id)
        }
      }},
      { label: 'Close Panel', icon: <ExternalLinkIcon className={iconClass} />, action: () => {
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
      { label: 'Open Worktree Path', icon: <FolderIcon className={iconClass} />, action: () => {
        if (targetSession) window.sorcerer?.window.openPath(targetSession.worktree_path)
      }},
      { type: 'separator' },
      { label: 'Delete Session', icon: <TrashIcon className={iconClass} />, danger: true, action: () => openDialog('delete-session', contextMenu.targetId) }
    ]
  } else {
    items = [
      { label: 'Split Right', icon: <SplitHorizontalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitRight(contextMenu.targetId) } },
      { label: 'Split Down', icon: <SplitVerticalIcon className={iconClass} />, action: () => { focusTargetPanel(contextMenu.targetId); splitDown(contextMenu.targetId) } },
      { label: 'Pop Out', icon: <ExternalLinkIcon className={iconClass} />, action: async () => {
        await getApi().popout.open('terminal', contextMenu.targetId, targetSession?.name || 'Session')
        // Clear the panel in the main app so it's not shown in two places
        const { splitRoot: root, setPanelSession } = useUIStore.getState()
        if (root) {
          const leaf = findLeafBySession(root, contextMenu.targetId)
          if (leaf) setPanelSession(leaf.id, null)
        } else {
          // Single panel mode (no splits) — clear the active session
          useSessionStore.setState({ activeSessionId: null })
        }
      }},
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
      { label: targetSession?.branch ? 'Copy Worktree Path' : 'Copy Path', icon: <CopyIcon className={iconClass} />, action: () => {
        if (targetSession) copyToClipboard(targetSession.worktree_path, 'Path')
      }},
      { label: targetSession?.branch ? 'Open Worktree Path' : 'Open Path', icon: <FolderIcon className={iconClass} />, action: () => {
        if (targetSession) window.sorcerer?.window.openPath(targetSession.worktree_path)
      }},
      ...(targetSession?.branch ? [
        { type: 'separator' as const },
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
      style={{ top: pos?.top ?? contextMenu.y, left: pos?.left ?? contextMenu.x }}
    >
      {items.map((item, i) =>
        'type' in item ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? 'context-menu-item--danger' : ''} ${loadingItem === i ? 'context-menu-item--active' : ''}`}
            disabled={loadingItem !== null && loadingItem !== i}
            onClick={async () => {
              let spinnerTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                spinnerTimer = null
                setLoadingItem(i)
              }, 150)
              try {
                await Promise.resolve(item.action())
              } finally {
                if (spinnerTimer !== null) clearTimeout(spinnerTimer)
                setLoadingItem(null)
                closeContextMenu()
              }
            }}
          >
            {loadingItem === i
              ? <span className="btn-spinner btn-spinner--sm" />
              : item.icon}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
