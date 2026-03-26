import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
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
  const [useMainRepo, setUseMainRepo] = useState(false)
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [remoteControl, setRemoteControl] = useState(false)
  const [gitInfo, setGitInfo] = useState<{ hasGit: boolean; hasCommits: boolean } | null>(null)

  const open = activeDialog === 'new-session'

  // If opened from a project context menu, pre-select that project
  const effectiveProjectId = dialogTargetId || projectId
  const project = projects.find((p) => p.id === effectiveProjectId)

  // Check git status when project selection changes
  useEffect(() => {
    if (!effectiveProjectId || !open) {
      setGitInfo(null)
      return
    }
    getApi().project.checkGit(effectiveProjectId).then(setGitInfo)
  }, [effectiveProjectId, open])

  const isGitProject = gitInfo?.hasGit && gitInfo?.hasCommits
  const isEmptyGit = gitInfo?.hasGit && !gitInfo?.hasCommits

  const handleClose = () => {
    setName('')
    setProjectId('')
    setUseMainRepo(false)
    setBypassPermissions(true)
    setRemoteControl(false)
    setGitInfo(null)
    closeDialog()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveProjectId) {
      addToast('Please select a project', 'error')
      return
    }
    if (!name.trim()) {
      addToast('Please enter a session name', 'error')
      return
    }
    const result = await createSession(effectiveProjectId, name.trim(), useMainRepo, bypassPermissions, remoteControl)
    if (result?.session) {
      addToast(`Session "${name.trim()}" created`, 'success')
    } else {
      addToast(result?.error || 'Failed to create session', 'error')
    }
    handleClose()
  }

  // Build the hint text based on project type
  let hintText: React.ReactNode
  if (!gitInfo) {
    hintText = null
  } else if (!gitInfo.hasGit) {
    hintText = 'Claude Code will run directly in this folder.'
  } else if (isEmptyGit) {
    hintText = 'Git repository has no commits yet — will work directly in the project folder.'
  } else if (useMainRepo) {
    hintText = 'Will use current branch in main repository.'
  } else {
    hintText = <>An isolated worktree branch <span className="dialog-hint-mono">{project?.name || '...'}/{name || '...'}</span> will be created.</>
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
        {isGitProject && (
          <label className="dialog-checkbox">
            <input
              type="checkbox"
              checked={useMainRepo}
              onChange={(e) => setUseMainRepo(e.target.checked)}
            />
            Work in main repository
          </label>
        )}
        <label className="dialog-checkbox">
          <input
            type="checkbox"
            checked={bypassPermissions}
            onChange={(e) => setBypassPermissions(e.target.checked)}
          />
          Auto-accept permissions
        </label>
        <label className="dialog-checkbox">
          <input
            type="checkbox"
            checked={remoteControl}
            onChange={(e) => setRemoteControl(e.target.checked)}
          />
          Enable Session Remote Control
        </label>
        {hintText && <div className="dialog-hint">{hintText}</div>}
        <DialogActions>
          <DialogButton onClick={handleClose}>Cancel</DialogButton>
          <DialogButton variant="primary" type="submit">Create Session</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
