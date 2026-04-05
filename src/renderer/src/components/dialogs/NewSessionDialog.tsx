import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'
import { PROVIDERS } from '../../constants'

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
  const [provider, setProvider] = useState('claude')
  const [model, setModel] = useState(PROVIDERS[0].models[0])
  const [gitInfo, setGitInfo] = useState<{ hasGit: boolean; hasCommits: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const open = activeDialog === 'new-session'

  // If opened from a project context menu, pre-select that project
  const effectiveProjectId = dialogTargetId || projectId
  const project = projects.find((p) => p.id === effectiveProjectId)

  // Load user defaults when dialog opens
  useEffect(() => {
    if (!open) return
    Promise.all([
      getApi().settings.get('defaultProvider'),
      getApi().settings.get('defaultModel')
    ]).then(([p, m]) => {
      const provId = (p as string) || 'claude'
      setProvider(provId)
      const prov = PROVIDERS.find((pr) => pr.id === provId)
      if (prov) {
        setModel((m as string) && prov.models.includes(m as string) ? (m as string) : prov.models[0])
      }
    })
  }, [open])

  // Reset model when provider changes and current model isn't valid for new provider
  useEffect(() => {
    const p = PROVIDERS.find(p => p.id === provider)
    if (p && !p.models.includes(model)) setModel(p.models[0])
  }, [provider])

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
    setProvider('claude')
    setModel(PROVIDERS[0].models[0])
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
    setSubmitting(true)
    try {
      const result = await createSession(effectiveProjectId, name.trim(), useMainRepo, bypassPermissions, remoteControl, provider, model)
      if (!result?.session) {
        addToast(result?.error || 'Failed to create session', 'error')
      } else {
        handleClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Build the hint text based on project type
  let hintText: React.ReactNode
  if (!gitInfo) {
    hintText = null
  } else if (!gitInfo.hasGit) {
    hintText = `${PROVIDERS.find(p => p.id === provider)?.name || 'Agent'} will run directly in this folder.`
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
        
        <div style={{ display: 'flex', gap: 12 }}>
          <DialogField label="AI Provider" style={{ flex: 1 }}>
            <select
              className="dialog-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </DialogField>
          <DialogField label="Model" style={{ flex: 1 }}>
            <select
              className="dialog-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {PROVIDERS.find(p => p.id === provider)?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </DialogField>
        </div>
        {PROVIDERS.find(p => p.id === provider)?.apiKeyEnv && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            Requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{PROVIDERS.find(p => p.id === provider)?.apiKeyEnv}</code> in your environment.
          </div>
        )}

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
        {provider === 'claude' && (
          <label className="dialog-checkbox">
            <input
              type="checkbox"
              checked={remoteControl}
              onChange={(e) => setRemoteControl(e.target.checked)}
            />
            Enable Session Remote Control
          </label>
        )}
        {hintText && <div className="dialog-hint">{hintText}</div>}
        <DialogActions>
          <DialogButton onClick={handleClose} disabled={submitting}>Cancel</DialogButton>
          <DialogButton variant="primary" type="submit" loading={submitting}>Create Session</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
