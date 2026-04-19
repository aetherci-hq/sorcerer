import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'
import type { ExternalSessionImportCandidate } from '../../types'

function formatWhen(timestamp: number | null): string {
  if (!timestamp) return 'Unknown'
  const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000
  return new Date(ms).toLocaleString()
}

function formatProvider(provider: 'claude' | 'codex'): string {
  return provider === 'claude' ? 'Claude Code' : 'Codex'
}

export function ImportSessionsDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { projects, loadProjects } = useProjectStore()
  const { loadSessions, setActiveSession } = useSessionStore()
  const { addToast } = useToastStore()
  const [candidates, setCandidates] = useState<ExternalSessionImportCandidate[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const open = activeDialog === 'import-sessions'
  const targetProject = useMemo(
    () => projects.find((project) => project.id === dialogTargetId) || null,
    [projects, dialogTargetId]
  )

  useEffect(() => {
    if (!open) {
      setCandidates([])
      setSelectedIds([])
      setLoading(false)
      setSubmitting(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void getApi().session.scanImports(dialogTargetId || undefined)
      .then((result: ExternalSessionImportCandidate[]) => {
        if (cancelled) return
        setCandidates(result)
        setSelectedIds(result.map((candidate) => candidate.id))
      })
      .catch((error: any) => {
        if (cancelled) return
        addToast(error?.message || 'Failed to scan importable sessions', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, dialogTargetId, addToast])

  const selectedCount = selectedIds.length

  const handleClose = () => {
    if (submitting) return
    closeDialog()
  }

  const toggleCandidate = (candidateId: string) => {
    setSelectedIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    )
  }

  const toggleAll = () => {
    setSelectedIds((current) =>
      current.length === candidates.length ? [] : candidates.map((candidate) => candidate.id)
    )
  }

  const handleImport = async () => {
    if (selectedIds.length === 0 || submitting) return

    setSubmitting(true)
    try {
      const imported = await getApi().session.import(selectedIds)
      const importedSessions = Array.isArray(imported) ? imported : []
      await loadProjects()
      await loadSessions()

      const importedProjectIds = new Set<string>()
      let firstSessionId: string | null = null
      for (const session of importedSessions) {
        if (session?.project_id) importedProjectIds.add(session.project_id)
        if (!firstSessionId && session?.id) firstSessionId = session.id
      }

      if (importedProjectIds.size > 0) {
        const expanded = new Set(useUIStore.getState().expandedProjects)
        for (const projectId of importedProjectIds) expanded.add(projectId)
        useUIStore.setState({ expandedProjects: expanded })
      }

      if (firstSessionId) {
        setActiveSession(firstSessionId)
      }

      if (importedSessions.length === 0) {
        addToast('No external sessions were imported', 'error')
        closeDialog()
        return
      }

      addToast(
        importedSessions.length === 1 ? 'Imported 1 external session' : `Imported ${importedSessions.length} external sessions`,
        'success'
      )
      closeDialog()
    } catch (error: any) {
      addToast(error?.message || 'Failed to import selected sessions', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title={targetProject ? `Import Sessions to ${targetProject.name}` : 'Import Sessions'}>
      <div className="import-sessions-dialog">
        <div className="dialog-hint">
          Scans provider state for sessions created outside Sorcerer and imports them as normal resumable Sorcerer sessions.
        </div>

        {targetProject && (
          <div className="dialog-hint" style={{ marginTop: 8 }}>
            Only sessions rooted at <span className="dialog-hint-mono">{targetProject.path}</span> are shown here.
          </div>
        )}

        <div className="import-sessions-toolbar">
          <label className="dialog-checkbox import-sessions-toggle-all">
            <input
              type="checkbox"
              checked={candidates.length > 0 && selectedCount === candidates.length}
              onChange={toggleAll}
              disabled={loading || candidates.length === 0}
            />
            Select all
          </label>
          <div className="dialog-hint" style={{ margin: 0 }}>
            {loading
              ? 'Scanning provider state...'
              : candidates.length === 0
                ? 'No importable sessions found.'
                : `${selectedCount} of ${candidates.length} selected`}
          </div>
        </div>

        <div className="import-sessions-list" aria-busy={loading}>
          {loading && (
            <div className="import-sessions-empty">
              <span className="btn-spinner" />
              <span>Scanning sessions...</span>
            </div>
          )}

          {!loading && candidates.length === 0 && (
            <div className="import-sessions-empty">
              <span>No external Claude or Codex sessions are available to import.</span>
            </div>
          )}

          {!loading && candidates.map((candidate) => (
            <label key={candidate.id} className="import-session-card">
              <div className="import-session-card__check">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(candidate.id)}
                  onChange={() => toggleCandidate(candidate.id)}
                />
              </div>
              <div className="import-session-card__body">
                <div className="import-session-card__topline">
                  <span className="import-session-card__title">{candidate.title || candidate.providerSessionId}</span>
                  <span className={`import-session-card__provider import-session-card__provider--${candidate.provider}`}>
                    {formatProvider(candidate.provider)}
                  </span>
                </div>
                <div className="import-session-card__meta">
                  <span>{candidate.projectName}</span>
                  <span>{candidate.branch || 'No branch detected'}</span>
                  <span>{formatWhen(candidate.updatedAt || candidate.createdAt)}</span>
                  {candidate.model ? <span>{candidate.model}</span> : null}
                </div>
                <div className="import-session-card__path">{candidate.cwd}</div>
                <div className="import-session-card__footer">
                  <span>
                    {candidate.willCreateProject
                      ? `Will create project: ${candidate.projectName}`
                      : `Project: ${candidate.projectName}`}
                  </span>
                  <span className="import-session-card__id">{candidate.providerSessionId}</span>
                </div>
              </div>
            </label>
          ))}
        </div>

        <DialogActions>
          <DialogButton onClick={handleClose} disabled={submitting}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={handleImport} disabled={loading || selectedCount === 0} loading={submitting}>
            Import Selected
          </DialogButton>
        </DialogActions>
      </div>
    </Dialog>
  )
}
