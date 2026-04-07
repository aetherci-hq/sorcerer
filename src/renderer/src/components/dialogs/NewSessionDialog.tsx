import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { DialogSelect } from '../DialogSelect'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'
import { useProviders } from '../../hooks/useProviders'

export function NewSessionDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { projects } = useProjectStore()
  const { createSession } = useSessionStore()
  const { addToast } = useToastStore()
  const { detectedProviders, defaultProvider, getProvider, loading: providersLoading } = useProviders()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [useMainRepo, setUseMainRepo] = useState(false)
  const [bypassPermissions, setBypassPermissions] = useState(true)
  const [remoteControl, setRemoteControl] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [gitInfo, setGitInfo] = useState<{ hasGit: boolean; hasCommits: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const open = activeDialog === 'new-session'
  const selectedProvider = getProvider(provider) || defaultProvider

  const effectiveProjectId = dialogTargetId || projectId
  const project = projects.find((p) => p.id === effectiveProjectId)

  useEffect(() => {
    if (!open || providersLoading || provider || !defaultProvider) return
    setProvider(defaultProvider.id)
    setModel(defaultProvider.supportsModelOverride ? defaultProvider.defaultModel || defaultProvider.models[0] || '' : '')
  }, [open, providersLoading, provider, defaultProvider])

  useEffect(() => {
    if (!effectiveProjectId || !open) {
      setGitInfo(null)
      return
    }
    getApi().project.checkGit(effectiveProjectId).then(setGitInfo)
  }, [effectiveProjectId, open])

  const isGitProject = gitInfo?.hasGit && gitInfo?.hasCommits
  const isEmptyGit = gitInfo?.hasGit && !gitInfo?.hasCommits
  const hasSuggestedModels = (selectedProvider?.models.length || 0) > 0
  const isCustomModel = !!selectedProvider?.supportsModelOverride && !!model && !selectedProvider.models.includes(model)
  const bypassHint =
    provider === 'claude'
      ? 'Claude runs with --dangerously-skip-permissions.'
      : provider === 'gemini'
        ? 'Gemini runs with --yolo.'
        : provider === 'codex'
          ? 'Codex runs with --dangerously-bypass-approvals-and-sandbox.'
          : 'Runs with the provider’s closest unattended mode.'

  const handleClose = () => {
    setName('')
    setProjectId('')
    setUseMainRepo(false)
    setBypassPermissions(true)
    setRemoteControl(false)
    setProvider('')
    setModel('')
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
    if (!selectedProvider) {
      addToast('No supported provider was detected on this system', 'error')
      return
    }
    setSubmitting(true)
    try {
      const result = await createSession(
        effectiveProjectId,
        name.trim(),
        useMainRepo,
        bypassPermissions,
        remoteControl,
        selectedProvider.id,
        selectedProvider.supportsModelOverride ? model : ''
      )
      if (!result?.session) {
        addToast(result?.error || 'Failed to create session', 'error')
      } else {
        handleClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  let hintText: React.ReactNode
  if (!gitInfo) {
    hintText = null
  } else if (!gitInfo.hasGit) {
    hintText = `${selectedProvider?.name || 'Agent'} will run directly in this folder.`
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
            <DialogSelect
              value={projectId}
              onChange={setProjectId}
              options={[
                { value: '', label: 'Select a project...' },
                ...projects.map((p) => ({ value: p.id, label: p.name }))
              ]}
            />
          )}
        </DialogField>

        <div style={{ display: 'flex', gap: 12 }}>
          <DialogField label="AI Provider" style={{ flex: 1 }}>
            <DialogSelect
              value={provider}
              onChange={(nextValue) => {
                const nextProvider = getProvider(nextValue)
                setProvider(nextValue)
                setModel(nextProvider?.supportsModelOverride ? nextProvider.defaultModel || nextProvider.models[0] || '' : '')
                if (!nextProvider?.supportsRemoteControl) setRemoteControl(false)
              }}
              disabled={providersLoading || detectedProviders.length === 0}
              options={detectedProviders.map((providerOption) => ({
                value: providerOption.id,
                label: providerOption.name
              }))}
            />
          </DialogField>
          {selectedProvider?.supportsModelOverride && (
            <DialogField label="Model" style={{ flex: 1 }}>
              {hasSuggestedModels ? (
                <>
                  <DialogSelect
                    value={isCustomModel ? '__custom__' : model}
                    onChange={(nextValue) => {
                      if (nextValue === '__custom__') {
                        if (!isCustomModel) setModel('')
                        return
                      }
                      setModel(nextValue)
                    }}
                    options={[
                      ...selectedProvider.models.map((modelName) => ({
                        value: modelName,
                        label: modelName
                      })),
                      { value: '__custom__', label: 'Custom…' }
                    ]}
                  />
                  {(isCustomModel || model === '') && (
                    <input
                      className="dialog-input"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="Enter custom model"
                      style={{ marginTop: 8 }}
                    />
                  )}
                </>
              ) : (
                <input
                  className="dialog-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter model"
                />
              )}
            </DialogField>
          )}
        </div>
        {selectedProvider?.apiKeyEnv && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            Requires <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{selectedProvider.apiKeyEnv}</code> in your environment.
          </div>
        )}
        {selectedProvider?.usesFallbackModels && selectedProvider.supportsModelOverride && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            Using bundled model suggestions. You can still enter any model manually.
          </div>
        )}
        {detectedProviders.length === 0 && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            No supported providers were detected. Install a supported CLI or refresh Providers in Settings.
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
        {bypassPermissions && (
          <div className="dialog-hint" style={{ marginTop: 4 }}>
            {bypassHint}
          </div>
        )}
        {selectedProvider?.supportsRemoteControl && (
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
          <DialogButton variant="primary" type="submit" loading={submitting} disabled={submitting || detectedProviders.length === 0}>Create Session</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
