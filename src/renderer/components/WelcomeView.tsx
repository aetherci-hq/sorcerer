import React, { useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import { showToast } from './Toast'

const shortcuts = [
  { label: 'New Session', keys: ['Ctrl', 'N'] },
  { label: 'Split Right', keys: ['Ctrl', '\\'] },
  { label: 'Split Down', keys: ['Ctrl', 'Shift', '\\'] },
  { label: 'Close Pane', keys: ['Ctrl', 'W'] },
  { label: 'Navigate Panes', keys: ['Ctrl', 'Alt', '\u2190\u2192'] },
  { label: 'Next Session', keys: ['Ctrl', ']'] },
  { label: 'Prev Session', keys: ['Ctrl', '['] },
  { label: 'Team Panel', keys: ['Ctrl', 'T'] }
]

export function WelcomeView() {
  const addProject = useProjectStore((s) => s.addProject)
  const projects = useProjectStore((s) => s.projects)
  const [error, setError] = useState('')

  const handleAddProject = async () => {
    setError('')
    try {
      await addProject()
    } catch (err: any) {
      const msg = err.message || 'Failed to add project'
      setError(msg)
      showToast(msg, 'error')
    }
  }

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div className="flex flex-col items-center max-w-lg w-full">

        {/* Logo */}
        <div className="flex flex-col items-center" style={{ marginBottom: 12 }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            className="text-[var(--accent)]"
            style={{ marginBottom: 20, filter: 'drop-shadow(0 0 24px rgba(139, 92, 246, 0.15))' }}
          >
            <path
              d="M32 4L58 19v26L32 60 6 45V19L32 4z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              opacity="0.5"
            />
            <path
              d="M32 10L52 21v22L32 54 12 43V21L32 10z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              opacity="0.8"
            />
            <circle cx="32" cy="32" r="8" fill="currentColor" opacity="0.9" />
          </svg>
          <h1
            className="text-[var(--accent)] font-bold tracking-widest uppercase"
            style={{ fontSize: 22, letterSpacing: '0.2em' }}
          >
            Sorcerer
          </h1>
        </div>

        <p className="text-[var(--text-muted)] text-[14px]" style={{ marginBottom: 40 }}>
          Claude Code Agent Orchestration
        </p>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center">
            <p className="text-[var(--text-muted)] text-[13px] leading-relaxed text-center" style={{ marginBottom: 24, maxWidth: 320 }}>
              Add a git repository to get started with your first session.
            </p>
            <button
              onClick={handleAddProject}
              className="btn-primary"
              style={{ padding: '11px 28px', fontSize: 14 }}
            >
              Add Project
            </button>
            {error && (
              <p className="text-[12px] text-[var(--status-error)]" style={{ marginTop: 16 }}>{error}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <p className="text-[var(--text-muted)] text-[13px]" style={{ marginBottom: 32 }}>
              Select a session from the sidebar, or create a new one.
            </p>

            {/* Shortcuts grid */}
            <div
              className="w-full rounded-lg border border-[var(--border-subtle)]"
              style={{
                maxWidth: 400,
                background: 'var(--bg-secondary)',
                overflow: 'hidden'
              }}
            >
              <div
                className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold"
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                Keyboard Shortcuts
              </div>
              <div style={{ padding: '6px 0' }}>
                {shortcuts.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                    style={{
                      padding: '9px 20px'
                    }}
                  >
                    <span className="text-[13px] text-[var(--text-secondary)]">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-[var(--text-faint)] text-[10px]" style={{ marginRight: 4 }}>+</span>}
                          <kbd
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              fontSize: 11,
                              fontFamily: "'Cascadia Code', 'Consolas', monospace",
                              color: 'var(--text-secondary)',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border)',
                              borderBottom: '2px solid var(--border-emphasis)',
                              borderRadius: 5,
                              lineHeight: 1.4,
                              minWidth: 24,
                              textAlign: 'center' as const
                            }}
                          >
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hint */}
            <p
              className="text-[var(--text-faint)] text-[11px]"
              style={{ marginTop: 20 }}
            >
              Right-click a session for split options, or Ctrl+Click to split right
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
