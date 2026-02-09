import React, { useEffect } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { useProjectStore } from './stores/project-store'
import { useSessionStore } from './stores/session-store'
import { useTeamStore } from './stores/team-store'

export default function App() {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const loadTeams = useTeamStore((s) => s.loadTeams)

  useEffect(() => {
    loadProjects()
    loadSessions()
    loadTeams()

    // Listen for file watcher updates from main process
    const unsub = window.sorcerer.teams.onUpdate((data) => {
      if (data.type === 'teams') {
        loadTeams()
      } else if (data.type === 'tasks') {
        // Reload tasks for the affected team
        const teamStore = useTeamStore.getState()
        if (data.teamName) {
          teamStore.loadTasks(data.teamName)
        }
      }
    })

    // Listen for auto-link events (team ↔ session binding changes)
    const unsubLink = window.sorcerer.teams.onSessionLinked((data) => {
      useSessionStore.getState().updateSessionInStore(data.sessionId, { team_name: data.teamName })
    })

    return () => { unsub(); unsubLink() }
  }, [])

  return <AppLayout />
}
