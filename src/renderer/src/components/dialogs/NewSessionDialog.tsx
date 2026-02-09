import { useState } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'

export function NewSessionDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { projects } = useProjectStore()
  const { createSession } = useSessionStore()
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')

  const open = activeDialog === 'new-session'

  // If opened from a project context menu, pre-select that project
  const effectiveProjectId = dialogTargetId || projectId
  const project = projects.find((p) => p.id === effectiveProjectId)

  const handleClose = () => {
    setName('')
    setProjectId('')
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !effectiveProjectId) return
    const session = await createSession(effectiveProjectId, name.trim())
    if (session) {
      addToast(`Session "${name.trim()}" created`, 'success')
    } else {
      addToast('Failed to create session', 'error')
    }
    handleClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New Session">
      <form onSubmit={handleSubmit}>
        <DialogField label="Project">
          {dialogTargetId ? (
            <div className="dialog-readonly">{project?.name || 'Unknown'}</div>
          ) : (
            <select
              className="dialog-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </DialogField>
        <DialogField label="Session name">
          <input
            className="dialog-input"
            type="text"
            placeholder="e.g. feature-auth, fix-bug-42"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </DialogField>
        <div className="dialog-hint">
          A git worktree branch <span className="dialog-hint-mono">{project?.name || '...'}/{name || '...'}</span> will be created.
        </div>
        <DialogActions>
          <DialogButton onClick={handleClose}>Cancel</DialogButton>
          <DialogButton variant="primary" type="submit">Create Session</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
