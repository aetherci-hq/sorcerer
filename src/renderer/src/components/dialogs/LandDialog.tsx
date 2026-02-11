import { useState } from 'react'
import { Dialog, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useSessionStore } from '../../stores/useSessionStore'
import { useToastStore } from '../../stores/useToastStore'

export function LandDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { sessions, landOnMain } = useSessionStore()
  const { addToast } = useToastStore()
  const [landing, setLanding] = useState(false)

  const open = activeDialog === 'land-session'

  const session = dialogTargetId ? sessions.find((s) => s.id === dialogTargetId) : undefined
  const sessionName = session?.name ?? 'this session'

  const handleConfirm = async () => {
    if (!dialogTargetId || landing) return
    setLanding(true)
    try {
      await landOnMain(dialogTargetId)
      addToast(`"${sessionName}" landed on main`, 'success')
    } catch (err: any) {
      console.error('[LandDialog] land-on-main failed:', err)
      addToast(err?.message || 'Failed to land on main', 'error')
    } finally {
      setLanding(false)
      closeDialog()
    }
  }

  // Prevent closing while the operation is in progress
  const handleClose = () => {
    if (!landing) closeDialog()
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
            <p className="dialog-confirm-subtext">The worktree and branch will be cleaned up after merging.</p>
          </>
        )}
      </div>
      <DialogActions>
        <DialogButton onClick={handleClose} disabled={landing}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={handleConfirm} disabled={landing}>
          {landing ? 'Landing...' : 'Land'}
        </DialogButton>
      </DialogActions>
    </Dialog>
  )
}
