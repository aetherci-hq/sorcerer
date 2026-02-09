import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '../components/Sidebar'
import { TerminalPanel } from '../components/TerminalPanel'
import { StatusBar } from '../components/StatusBar'
import { TitleBar } from '../components/TitleBar'
import { WelcomeView } from '../components/WelcomeView'
import { TeamPanel } from '../components/TeamPanel'
import { ResizeSplitter } from '../components/ResizeSplitter'
import { ToastContainer } from '../components/Toast'
import { useSessionStore } from '../stores/session-store'
import { useTileStore } from '../stores/tile-store'
import { emit } from '../lib/events'

export function AppLayout() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const tileTree = useTileStore((s) => s.tree)
  const [teamPanelName, setTeamPanelName] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(270)

  // Only render terminals for non-archived sessions
  const liveSessions = sessions.filter((s) => s.status !== 'archived' && s.status !== 'deleted')

  // Show team panel when active session has a team
  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => Math.min(400, Math.max(180, prev + delta)))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N: New session
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        emit('shortcut:new-session')
      }
      // Ctrl+T: Toggle team panel
      if (e.ctrlKey && e.key === 't' && activeSession?.team_name) {
        e.preventDefault()
        setTeamPanelName((prev) =>
          prev === activeSession.team_name ? null : activeSession.team_name
        )
      }
      // Ctrl+[ / Ctrl+]: Switch sessions
      if (e.ctrlKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const visibleSessions = liveSessions.filter(
          (s) => !s.parent_session_id
        )
        if (visibleSessions.length === 0) return
        const currentIdx = visibleSessions.findIndex((s) => s.id === activeSessionId)
        let nextIdx: number
        if (e.key === ']') {
          nextIdx = currentIdx < visibleSessions.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : visibleSessions.length - 1
        }
        useTileStore.getState().initSingle(visibleSessions[nextIdx].id)
      }

      // Ctrl+W: Close focused tile pane
      if (e.ctrlKey && e.key === 'w') {
        const { tree, focusedTileId, close } = useTileStore.getState()
        if (tree && focusedTileId) {
          e.preventDefault()
          close(focusedTileId)
        }
      }

      // Ctrl+Alt+Arrow: Navigate focus between panes
      if (e.ctrlKey && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        const dirMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
          ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'
        }
        useTileStore.getState().moveFocus(dirMap[e.key])
      }

      // Ctrl+\: Split focused pane right
      if (e.ctrlKey && !e.shiftKey && e.key === '\\') {
        e.preventDefault()
        emit('shortcut:split-right')
      }
      // Ctrl+Shift+\: Split focused pane down
      if (e.ctrlKey && e.shiftKey && e.key === '|') {
        e.preventDefault()
        emit('shortcut:split-down')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSessionId, activeSession, liveSessions])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)]">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          className="border-r border-[var(--border)] bg-[var(--bg-secondary)] flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          <Sidebar />
        </div>
        <ResizeSplitter onResize={handleSidebarResize} />
        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 min-h-0 relative flex bg-[#09090b]">
            <div className="flex-1 min-w-0 relative">
              {!tileTree && !activeSessionId && <WelcomeView />}
              <TerminalPanel
                sessions={liveSessions}
                activeSessionId={activeSessionId}
              />
            </div>
            {teamPanelName && (
              <TeamPanel
                teamName={teamPanelName}
                onClose={() => setTeamPanelName(null)}
              />
            )}
          </div>
          <StatusBar onToggleTeamPanel={(name) => setTeamPanelName((prev) => prev === name ? null : name)} />
        </div>
      </div>
      <ToastContainer />
    </div>
  )
}
