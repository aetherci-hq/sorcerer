import { useEffect, useState, useCallback } from 'react'
import { getApi } from './api/client'
import { Sidebar } from './components/Sidebar'
import { MainContent } from './components/MainContent'
import { ContextMenu } from './components/ContextMenu'
import { ToastContainer } from './components/Toast'
import { NewSessionDialog } from './components/dialogs/NewSessionDialog'
import { AddProjectDialog } from './components/dialogs/AddProjectDialog'
import { ImportSessionsDialog } from './components/dialogs/ImportSessionsDialog'
import { DeleteDialog } from './components/dialogs/DeleteDialog'
import { LandDialog } from './components/dialogs/LandDialog'
import { ArchiveDialog } from './components/dialogs/ArchiveDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { AddAgentDialog } from './components/dialogs/AddAgentDialog'
import { DeleteAgentDialog } from './components/dialogs/DeleteAgentDialog'
import { QuickNotesOverlay } from './components/QuickNotesOverlay'
import { EditMissionDialog } from './components/dialogs/EditMissionDialog'
import { BriefingPanel } from './components/BriefingPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useProjectStore } from './stores/useProjectStore'
import { useSessionStore } from './stores/useSessionStore'
import { useAgentStore } from './stores/useAgentStore'
import { useTeamStore } from './stores/useTeamStore'
import { useQuickNotesStore } from './stores/useQuickNotesStore'
import { useToastStore } from './stores/useToastStore'
import { useUIStore } from './stores/useUIStore'

export function App() {
  useKeyboardShortcuts()
  const [briefingOpen, setBriefingOpen] = useState(false)
  const closeBriefing = useCallback(() => setBriefingOpen(false), [])
  const sessions = useSessionStore((s) => s.sessions)

  useEffect(() => {
    const needsResumeRefresh = sessions.some((session) =>
      session.type !== 'quick-terminal' &&
      session.provider === 'codex' &&
      (
        session.resume_status === 'launching' ||
        (session.status === 'active' && !session.provider_session_id)
      )
    )

    if (!needsResumeRefresh) return

    const interval = setInterval(() => {
      void useSessionStore.getState().loadSessions()
    }, 3000)

    return () => clearInterval(interval)
  }, [sessions])

  useEffect(() => {
    // Set platform class on <html> for OS-specific CSS (e.g. macOS traffic lights)
    const platform = getApi().system.platform
    if (platform) document.documentElement.dataset.platform = platform

    const { loadProjects, loadGroups } = useProjectStore.getState()
    const { loadSessions } = useSessionStore.getState()
    const { loadAgents, loadAgentGroups } = useAgentStore.getState()
    const { loadTeams, loadTasks } = useTeamStore.getState()

    // Load all data on mount
    loadAgents()
    loadAgentGroups().then(() => {
      const agentGroups = useAgentStore.getState().groups
      const { expandedGroups } = useUIStore.getState()
      // Auto-expand agent groups on first load (if no groups are expanded yet)
      if (agentGroups.length > 0) {
        const expanded = new Set(expandedGroups)
        let added = false
        for (const g of agentGroups) {
          if (!expanded.has(g.id)) { expanded.add(g.id); added = true }
        }
        if (added) useUIStore.setState({ expandedGroups: expanded })
      }
    })
    loadGroups().then(() => {
      // Auto-expand all groups on first load
      const groups = useProjectStore.getState().groups
      const { expandedGroups } = useUIStore.getState()
      if (expandedGroups.size === 0 && groups.length > 0) {
        const expanded = new Set<string>()
        for (const g of groups) expanded.add(g.id)
        useUIStore.setState({ expandedGroups: expanded })
      }
    })
    useQuickNotesStore.getState().loadNotePanels()
    loadProjects().then(() => {
      // Auto-expand all projects on first load
      const projects = useProjectStore.getState().projects
      const { expandedProjects } = useUIStore.getState()
      if (expandedProjects.size === 0 && projects.length > 0) {
        const expanded = new Set<string>()
        for (const p of projects) expanded.add(p.id)
        useUIStore.setState({ expandedProjects: expanded })
      }
    })
    // Load sessions first, then teams (teams trigger auto-link which needs sessions in store)
    loadSessions().then(() => {
      return loadTeams()
    }).then(() => {
      const sessions = useSessionStore.getState().sessions
      const { expandedSessions } = useUIStore.getState()
      const withTeams = sessions.filter((s) => s.team_name)
      if (withTeams.length > 0) {
        const next = new Set(expandedSessions)
        for (const s of withTeams) next.add(s.id)
        useUIStore.setState({ expandedSessions: next })
      }
    })

    // Subscribe to file watcher for team/task updates
    const unsub = getApi().teams.onUpdate((data: any) => {
      if (data.type === 'teams') {
        loadTeams()
      } else if (data.type === 'tasks' && data.teamName) {
        loadTasks(data.teamName)
      }
    })

    // Subscribe to session-team auto-linking
    const unsubLink = getApi().teams.onSessionLinked((data: { sessionId: string; teamName: string | null }) => {
      useSessionStore.getState().updateSessionInStore(data.sessionId, { team_name: data.teamName })
      // Auto-expand the session in the sidebar when a team is linked
      if (data.teamName) {
        const { expandedSessions } = useUIStore.getState()
        if (!expandedSessions.has(data.sessionId)) {
          const next = new Set(expandedSessions)
          next.add(data.sessionId)
          useUIStore.setState({ expandedSessions: next })
        }
      }
    })

    // Subscribe to session updates from pop-out windows (status dot sync)
    const unsubPopout = getApi().popout.onSessionUpdated((sessionId: string, status: string, pid: number | null) => {
      useSessionStore.getState().updateSessionInStore(sessionId, { status: status as any, pid })
    })

    // Listen for auto-restarted agents — update store so TerminalView re-attaches
    const unsubAgentRestarted = getApi().terminal.onAgentRestarted((sessionId: string, status: string, pid: number | null) => {
      useAgentStore.getState().updateAgentInStore(sessionId, { status: status as any, pid })
    })

    // Listen for completed agent runs — show toast with findings
    const unsubAgentRunComplete = getApi().terminal.onAgentRunComplete((agentId: string, agentName: string, preview: string, level: string) => {
      if (level === 'error') {
        useToastStore.getState().addToast(`${agentName}: ${preview}`, 'error')
      }
    })

    // Track which sessions are popped out to separate windows
    const unsubPopoutOpened = getApi().popout.onOpened((sessionId: string) => {
      useUIStore.getState().addPoppedOut(sessionId)
    })
    const unsubPopoutClosed = getApi().popout.onClosed((sessionId: string) => {
      useUIStore.getState().removePoppedOut(sessionId)
    })

    // Listen for failed resume attempts (e.g. "No conversation found to continue")
    const unsubResumeFailed = getApi().terminal.onResumeFailed(({ sessionId, reason }) => {
      // Update store so UI reflects idle state immediately
      const session = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
      if (session) {
        useSessionStore.getState().updateSessionInStore(sessionId, { status: 'idle', pid: null })
        useToastStore.getState().addToast(`Resume failed for "${session.name}": ${reason}. Use "New Session" to start fresh.`, 'error')
      } else {
        useAgentStore.getState().updateAgentInStore(sessionId, { status: 'idle', pid: null })
        useToastStore.getState().addToast(`Resume failed: ${reason}. Use "Start New Session" to start fresh.`, 'error')
      }
    })

    // Idle detection for auto-briefing on return
    let lastActivity = Date.now()
    let wasIdle = false
    const activityHandler = () => { lastActivity = Date.now(); wasIdle = false }
    window.addEventListener('mousemove', activityHandler, { passive: true })
    window.addEventListener('keydown', activityHandler, { passive: true })

    const idleCheckInterval = setInterval(async () => {
      const autoIdle = await getApi().settings.get('briefingAutoIdle')
      if (autoIdle !== 'true') return

      const idleMinutesStr = await getApi().settings.get('briefingIdleMinutes')
      const idleThreshold = (parseInt(idleMinutesStr || '15') || 15) * 60 * 1000
      const elapsed = Date.now() - lastActivity

      if (elapsed >= idleThreshold) {
        wasIdle = true
      } else if (wasIdle) {
        // User just came back from idle
        wasIdle = false
        const providerId = await getApi().settings.get('briefingProvider') || 'anthropic'
        const key = await getApi().settings.get(`apiKey_${providerId}`)
        if (key) setBriefingOpen(true)
      }
    }, 30000) // Check every 30 seconds

    // Briefing keyboard shortcut: Ctrl+Shift+B
    const briefingKeyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        setBriefingOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', briefingKeyHandler)

    // Auto-open briefing on startup if enabled
    getApi().settings.get('briefingAutoStartup').then((v: string | undefined) => {
      if (v === 'true') {
        // Check that an API key is configured before auto-opening
        getApi().settings.get('briefingProvider').then((provider: string | undefined) => {
          const providerId = provider || 'anthropic'
          getApi().settings.get(`apiKey_${providerId}`).then((key: string | undefined) => {
            if (key) setBriefingOpen(true)
          })
        })
      }
    })

    // Poll for remote control viewers (which sessions have WS subscribers)
    const pollRemote = async () => {
      try {
        const ids = await getApi().remote.remoteSessionIds()
        useUIStore.getState().setRemoteSessionIds(ids)
      } catch { /* remote server may not be running */ }
    }
    pollRemote()
    const remoteInterval = setInterval(pollRemote, 5000)

    return () => {
      unsub()
      unsubLink()
      unsubPopout()
      unsubPopoutOpened()
      unsubPopoutClosed()
      unsubResumeFailed()
      unsubAgentRestarted()
      unsubAgentRunComplete()
      window.removeEventListener('keydown', briefingKeyHandler)
      window.removeEventListener('mousemove', activityHandler)
      window.removeEventListener('keydown', activityHandler)
      clearInterval(idleCheckInterval)
      clearInterval(remoteInterval)
    }
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <MainContent />
      <ContextMenu />
      <ToastContainer />
      <NewSessionDialog />
      <AddProjectDialog />
      <ImportSessionsDialog />
      <DeleteDialog />
      <LandDialog />
      <ArchiveDialog />
      <SettingsDialog />
      <AddAgentDialog />
      <DeleteAgentDialog />
      <QuickNotesOverlay />
      <EditMissionDialog />
      <BriefingPanel open={briefingOpen} onClose={closeBriefing} />
    </div>
  )
}
