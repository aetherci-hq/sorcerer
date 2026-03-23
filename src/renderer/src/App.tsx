import { useEffect } from 'react'
import { getApi } from './api/client'
import { Sidebar } from './components/Sidebar'
import { MainContent } from './components/MainContent'
import { ContextMenu } from './components/ContextMenu'
import { ToastContainer } from './components/Toast'
import { NewSessionDialog } from './components/dialogs/NewSessionDialog'
import { AddProjectDialog } from './components/dialogs/AddProjectDialog'
import { DeleteDialog } from './components/dialogs/DeleteDialog'
import { LandDialog } from './components/dialogs/LandDialog'
import { ArchiveDialog } from './components/dialogs/ArchiveDialog'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { AddAgentDialog } from './components/dialogs/AddAgentDialog'
import { DeleteAgentDialog } from './components/dialogs/DeleteAgentDialog'
import { QuickNotesOverlay } from './components/QuickNotesOverlay'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useProjectStore } from './stores/useProjectStore'
import { useSessionStore } from './stores/useSessionStore'
import { useAgentStore } from './stores/useAgentStore'
import { useTeamStore } from './stores/useTeamStore'
import { useQuickNotesStore } from './stores/useQuickNotesStore'
import { useUIStore } from './stores/useUIStore'

export function App() {
  useKeyboardShortcuts()

  useEffect(() => {
    // Set platform class on <html> for OS-specific CSS (e.g. macOS traffic lights)
    const platform = getApi().system.platform
    if (platform) document.documentElement.dataset.platform = platform

    const { loadProjects } = useProjectStore.getState()
    const { loadSessions } = useSessionStore.getState()
    const { loadAgents } = useAgentStore.getState()
    const { loadTeams, loadTasks } = useTeamStore.getState()

    // Load all data on mount
    loadAgents()
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

    return () => {
      unsub()
      unsubLink()
      unsubPopout()
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
      <DeleteDialog />
      <LandDialog />
      <ArchiveDialog />
      <SettingsDialog />
      <AddAgentDialog />
      <DeleteAgentDialog />
      <QuickNotesOverlay />
    </div>
  )
}
