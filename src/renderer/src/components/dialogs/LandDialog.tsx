import { useState, useEffect } from 'react'
import { Dialog, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'

interface HealthCheck {
  behind: number
  ahead: number
  loading: boolean
}

function HealthCheckInfo({ health }: { health: HealthCheck }) {
  if (health.loading) {
    return <p className="dialog-confirm-subtext" style={{ opacity: 0.6 }}>Checking branch health...</p>
  }

  if (health.behind === 0) {
    return (
      <div className="land-health land-health--clean">
        <span className="land-health-icon">&#10003;</span>
        <span>Branch is up to date with main. {health.ahead > 0 && `${health.ahead} commit${health.ahead !== 1 ? 's' : ''} to merge.`}</span>
      </div>
    )
  }

  const severity = health.behind >= 10 ? 'danger' : health.behind >= 3 ? 'warning' : 'info'

  return (
    <div className={`land-health land-health--${severity}`}>
      <span className="land-health-icon">
        {severity === 'danger' ? '!' : severity === 'warning' ? '!' : 'i'}
      </span>
      <div>
        <span className="land-health-text">
          {health.behind} commit{health.behind !== 1 ? 's' : ''} behind main
          {health.ahead > 0 && `, ${health.ahead} ahead`}
        </span>
        {severity === 'danger' && (
          <p className="land-health-hint">
            Significant divergence detected. The squash merge may encounter conflicts. Consider rebasing first.
          </p>
        )}
        {severity === 'warning' && (
          <p className="land-health-hint">
            Moderate drift from main. Sorcerer will attempt to rebase before merging.
          </p>
        )}
      </div>
    </div>
  )
}

export function LandDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { sessions, landOnMain } = useSessionStore()
  const { addToast } = useToastStore()
  const [landing, setLanding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthCheck>({ behind: 0, ahead: 0, loading: true })

  const open = activeDialog === 'land-session'

  const session = dialogTargetId ? sessions.find((s) => s.id === dialogTargetId) : undefined
  const sessionName = session?.name ?? 'this session'

  // Run health check when dialog opens
  useEffect(() => {
    if (!open || !dialogTargetId) return
    setHealth({ behind: 0, ahead: 0, loading: true })
    setError(null)
    getApi().session.divergence(dialogTargetId).then((d) => {
      setHealth({
        behind: d?.behind ?? 0,
        ahead: d?.ahead ?? 0,
        loading: false
      })
    }).catch(() => {
      setHealth({ behind: 0, ahead: 0, loading: false })
    })
  }, [open, dialogTargetId])

  const handleConfirm = async () => {
    if (!dialogTargetId || landing) return
    setLanding(true)
    setError(null)
    try {
      await landOnMain(dialogTargetId)
      addToast(`"${sessionName}" landed on main`, 'success')
      closeDialog()
    } catch (err: any) {
      console.error('[LandDialog] land-on-main failed:', err)
      setError(err?.message || 'Failed to land on main')
    } finally {
      setLanding(false)
    }
  }

  const handleClose = () => {
    if (!landing) {
      setError(null)
      closeDialog()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Land on main">
      <div className="dialog-confirm-body">
        <div className="dialog-confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M6 9v9" />
            <path d="M9 6h6a3 3 0 0 1 3 3v6" />
          </svg>
        </div>
        {landing ? (
          <p className="dialog-confirm-text">
            Landing <strong>{sessionName}</strong> onto main...
          </p>
        ) : (
          <>
            <p className="dialog-confirm-text">
              Land <strong>{sessionName}</strong> onto main? This will squash-merge all commits into a single commit on main.
            </p>
            <HealthCheckInfo health={health} />
            <p className="dialog-confirm-subtext">The worktree and branch will be cleaned up after merging.</p>
          </>
        )}
        {error && (
          <div className="dialog-error">
            <strong>Landing failed</strong>
            <p>{error}</p>
          </div>
        )}
      </div>
      <DialogActions>
        <DialogButton onClick={handleClose} disabled={landing}>
          {error ? 'Close' : 'Cancel'}
        </DialogButton>
        <DialogButton variant="primary" onClick={handleConfirm} disabled={landing || health.loading}>
          {landing ? 'Landing...' : error ? 'Retry' : 'Land'}
        </DialogButton>
      </DialogActions>
    </Dialog>
  )
}
