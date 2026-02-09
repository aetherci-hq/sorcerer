import React, { useEffect, useState } from 'react'
import { useTeamStore } from '../stores/team-store'
import type { TaskData, TeamConfig } from '../types'

interface TeamPanelProps {
  teamName: string
  onClose: () => void
}

const pad = { paddingLeft: 16, paddingRight: 16 }

export function TeamPanel({ teamName, onClose }: TeamPanelProps) {
  const teams = useTeamStore((s) => s.teams)
  const tasksByTeam = useTeamStore((s) => s.tasksByTeam)
  const loadTasks = useTeamStore((s) => s.loadTasks)

  const team = teams.find((t) => t.name === teamName)
  const tasks = tasksByTeam[teamName] || []

  useEffect(() => {
    loadTasks(teamName)
  }, [teamName])

  if (!team) {
    return (
      <div className="flex flex-col w-72 min-w-[260px] bg-[var(--bg-secondary)] border-l border-[var(--border)]">
        <div className="flex items-center justify-between h-12 border-b border-[var(--border)]" style={pad}>
          <span className="text-[13px] text-[var(--text-muted)]">Team not found</span>
          <CloseButton onClick={onClose} />
        </div>
      </div>
    )
  }

  const pendingTasks = tasks.filter((t) => t.status === 'pending')
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress')
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  return (
    <div className="flex flex-col w-72 min-w-[260px] bg-[var(--bg-secondary)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="flex items-center justify-between h-12 border-b border-[var(--border)]" style={pad}>
        <div className="flex items-center gap-2.5 min-w-0">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--accent)] opacity-70 flex-shrink-0">
            <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <path fillRule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z" />
            <path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
          </svg>
          <span className="text-[13px] font-semibold text-[var(--text-secondary)] truncate">
            {team.name}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Members */}
        <div className="py-4" style={pad}>
          <h3 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold mb-3">
            Members ({team.members.length})
          </h3>
          <div className="space-y-1">
            {team.members.map((member) => (
              <div key={member.name} className="flex items-center gap-3 py-2">
                <div className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
                  member.status === 'active' ? 'bg-[var(--status-active)]' : 'bg-[var(--text-faint)]'
                }`} />
                <span className="text-[13px] text-[var(--text-primary)] truncate font-medium">{member.name}</span>
                {member.activeTask && (
                  <span className="text-[11px] text-[var(--status-active)] ml-auto truncate max-w-[120px] italic opacity-80">
                    {member.activeTask}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* In Progress Tasks */}
        {inProgressTasks.length > 0 && (
          <TaskSection title="In Progress" tasks={inProgressTasks} statusColor="text-[var(--status-active)]" />
        )}

        {/* Pending Tasks */}
        {pendingTasks.length > 0 && (
          <TaskSection title="Pending" tasks={pendingTasks} statusColor="text-[var(--status-idle)]" />
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <TaskSection title="Completed" tasks={completedTasks} statusColor="text-[var(--text-muted)]" />
        )}

        {tasks.length === 0 && (
          <div className="py-8 text-center" style={pad}>
            <p className="text-[13px] text-[var(--text-muted)]">No tasks yet</p>
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className="py-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] flex items-center gap-4" style={pad}>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-active)] inline-block" />
          {inProgressTasks.length} active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-idle)] inline-block" />
          {pendingTasks.length} pending
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-faint)] inline-block" />
          {completedTasks.length} done
        </span>
      </div>
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
      </svg>
    </button>
  )
}

function TaskSection({ title, tasks, statusColor }: { title: string; tasks: TaskData[]; statusColor: string }) {
  const [collapsed, setCollapsed] = useState(title === 'Completed')

  return (
    <div className="border-t border-[var(--border)]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left py-3 hover:bg-[var(--bg-hover)] transition-colors"
        style={{ paddingLeft: 16, paddingRight: 16 }}
      >
        <svg
          width="9" height="9" viewBox="0 0 16 16" fill="currentColor"
          className={`text-[var(--text-faint)] transition-transform ${collapsed ? '' : 'rotate-90'}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <h3 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">
          {title} ({tasks.length})
        </h3>
      </button>
      {!collapsed && (
        <div className="pb-3" style={{ paddingLeft: 16, paddingRight: 16 }}>
          {tasks.map((task) => (
            <div key={task.id} className="py-2 ml-2 pl-3 border-l border-[var(--border-subtle)]">
              <div className="flex items-start gap-2.5">
                <span className={`text-[11px] flex-shrink-0 mt-0.5 ${statusColor}`}>
                  {task.status === 'in_progress' ? '\u25B6' : task.status === 'completed' ? '\u2713' : '\u25CB'}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-[var(--text-primary)] leading-snug">{task.subject}</p>
                  {task.owner && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">{task.owner}</p>
                  )}
                  {task.activeForm && task.status === 'in_progress' && (
                    <p className="text-[11px] text-[var(--status-active)] italic mt-1 opacity-80">{task.activeForm}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
