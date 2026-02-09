import React from 'react'
import { useSessionStore } from '../stores/session-store'
import { useProjectStore } from '../stores/project-store'
import { useTeamStore } from '../stores/team-store'

interface StatusBarProps {
  onToggleTeamPanel?: (teamName: string) => void
}

export function StatusBar({ onToggleTeamPanel }: StatusBarProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const projects = useProjectStore((s) => s.projects)
  const teams = useTeamStore((s) => s.teams)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeProject = activeSession
    ? projects.find((p) => p.id === activeSession.project_id)
    : null

  const activeSessions = sessions.filter((s) => s.status === 'active').length

  return (
    <div className="flex items-center justify-between h-8 bg-[var(--bg-secondary)] border-t border-[var(--border)] text-[12px] text-[var(--text-muted)] select-none" style={{ paddingLeft: 16, paddingRight: 16 }}>
      <div className="flex items-center gap-4">
        {activeSession && (
          <>
            <span className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
                <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H13.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3.87z" />
              </svg>
              {activeProject?.name}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
                <path d="M11.077 1.56a.5.5 0 0 1 .707.707L4.157 9.893a.5.5 0 0 1-.354.147H1.5a.5.5 0 0 1-.5-.5V7.197a.5.5 0 0 1 .146-.354L8.773 1.56z" />
              </svg>
              {activeSession.branch}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                activeSession.status === 'active'
                  ? 'bg-[var(--status-active)]'
                  : activeSession.status === 'idle'
                  ? 'bg-[var(--status-idle)]'
                  : 'bg-[var(--text-muted)]'
              }`} />
              <span className={
                activeSession.status === 'active' ? 'text-[var(--status-active)]' : ''
              }>
                {activeSession.status}
              </span>
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {/* Team indicators */}
        {teams.length > 0 && (
          <div className="flex items-center gap-2">
            {teams.map((team) => {
              const activeMembers = team.members.filter((m) => m.status === 'active').length
              return (
                <button
                  key={team.name}
                  onClick={() => onToggleTeamPanel?.(team.name)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm hover:bg-[var(--bg-hover)] transition-colors"
                  title={`Team: ${team.name} (${team.members.length} members)`}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--accent)] opacity-70">
                    <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <path fillRule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z" />
                    <path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                  </svg>
                  <span className="text-[11px]">{team.name}</span>
                  {activeMembers > 0 && (
                    <span className="text-[10px] text-[var(--status-active)]">({activeMembers})</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${activeSessions > 0 ? 'bg-[var(--status-active)]' : 'bg-[var(--text-muted)]'}`} />
          {activeSessions} session{activeSessions !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
