import React, { useState, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useProjectStore } from '../stores/project-store'
import { useSessionStore } from '../stores/session-store'
import { useTileStore } from '../stores/tile-store'

interface NewSessionDialogProps {
  onClose: () => void
  splitDirection?: 'horizontal' | 'vertical' | null
  preselectedProjectId?: string | null
  onCreated?: (projectId: string) => void
}

export function NewSessionDialog({ onClose, splitDirection, preselectedProjectId, onCreated }: NewSessionDialogProps) {
  const projects = useProjectStore((s) => s.projects)
  const createSession = useSessionStore((s) => s.createSession)
  const [selectedProjectId, setSelectedProjectId] = useState(
    preselectedProjectId || projects[0]?.id || ''
  )
  const [sessionName, setSessionName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleCreate = async () => {
    if (!selectedProjectId || !sessionName.trim()) return

    setCreating(true)
    setError('')

    try {
      const session = await createSession(selectedProjectId, sessionName.trim().replace(/\s+/g, '-').toLowerCase())
      if (session && splitDirection) {
        const { focusedTileId, split, initSingle, tree } = useTileStore.getState()
        if (focusedTileId && tree) {
          split(focusedTileId, splitDirection, session.id)
        } else {
          initSingle(session.id)
        }
      } else if (session) {
        useTileStore.getState().initSingle(session.id)
      }
      onCreated?.(selectedProjectId)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create session')
    } finally {
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !creating && sessionName.trim()) handleCreate()
  }

  const repoName = selectedProject ? selectedProject.name : ''
  const branchPreview = sessionName.trim() && repoName
    ? `${repoName}/${sessionName.trim().replace(/\s+/g, '-').toLowerCase()}`
    : null

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !creating && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content w-[460px] p-0 overflow-hidden">
          {/* Header */}
          <div style={{ padding: '28px 28px 0 28px' }}>
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 40,
                  height: 40,
                  background: 'var(--accent-muted)',
                  marginTop: 1
                }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"
                    fill="var(--accent)"
                  />
                </svg>
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug">
                  New Session
                  {splitDirection && (
                    <span className="text-[12px] font-normal text-[var(--text-muted)]" style={{ marginLeft: 8 }}>
                      {splitDirection === 'horizontal' ? '(split right)' : '(split down)'}
                    </span>
                  )}
                </Dialog.Title>
                <Dialog.Description className="text-[13px] text-[var(--text-secondary)] leading-relaxed" style={{ marginTop: 6 }}>
                  Create a new Claude Code session in an isolated worktree.
                </Dialog.Description>
              </div>
            </div>
          </div>

          {/* Form */}
          <div style={{ padding: '20px 28px 0 28px' }}>
            <div style={{ marginBottom: 18 }}>
              <label className="form-label">Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="form-input"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selectedProject && (
                <p className="text-[11px] text-[var(--text-faint)] font-mono truncate" style={{ marginTop: 6 }}>
                  {selectedProject.path}
                </p>
              )}
            </div>

            <div>
              <label className="form-label">Session Name</label>
              <input
                ref={inputRef}
                type="text"
                value={sessionName}
                onChange={(e) => { setSessionName(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. feature-auth, fix-bug-123"
                className="form-input"
                disabled={creating}
              />
            </div>

            {/* Branch preview */}
            {branchPreview && (
              <div
                className="flex items-center gap-2 rounded-md"
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <span className="text-[11px] text-[var(--text-faint)] flex-shrink-0">Branch</span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--text-faint)" className="flex-shrink-0">
                  <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" />
                </svg>
                <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                  {branchPreview}
                </span>
              </div>
            )}

            {error && (
              <div
                className="flex items-center gap-2 rounded-md"
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: 'rgba(248, 113, 113, 0.08)',
                  border: '1px solid rgba(248, 113, 113, 0.2)'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--status-error)" className="flex-shrink-0">
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.25 5a.75.75 0 0 1 1.5 0v3a.75.75 0 0 1-1.5 0V5zm.75 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                </svg>
                <span className="text-[12px] text-[var(--status-error)]">{error}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            className="flex justify-end gap-2.5 border-t border-[var(--border)]"
            style={{ padding: '16px 28px', marginTop: 20 }}
          >
            <button onClick={onClose} className="btn-ghost" disabled={creating}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedProjectId || !sessionName.trim() || creating}
              className="btn-primary"
              style={{ minWidth: 120 }}
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 16 16" className="animate-spin-slow" fill="currentColor">
                    <path d="M8 0a8 8 0 0 0-8 8h2a6 6 0 0 1 6-6V0z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Session'
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
