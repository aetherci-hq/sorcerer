import { useState } from 'react'
import { Dialog, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useSessionStore } from '../../stores/useSessionStore'

export function ArchiveDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const { sessions, archiveSession } = useSessionStore()
  const [loading, setLoading] = useState(false)

  const open = activeDialog === 'archive-session'

  const targetSession = dialogTargetId
    ? sessions.find((s) => s.id === dialogTargetId)
    : undefined
  const targetName = targetSession?.name ?? 'this session'

  const handleConfirm = async () => {
    if (!dialogTargetId) return
    setLoading(true)
    try {
      await archiveSession(dialogTargetId)
      closeDialog()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={closeDialog} title="Archive session">
      <div className="dialog-confirm-body">
        <div className="dialog-confirm-icon dialog-confirm-icon--archive">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
        </div>
        <p className="dialog-confirm-text">
          Archive <strong>{targetName}</strong>?
        </p>
        <p className="dialog-confirm-subtext">
          The session process will be stopped. Work will be auto-committed and pushed. You can restore it later.
        </p>
      </div>
      <DialogActions>
        <DialogButton onClick={closeDialog} disabled={loading}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={handleConfirm} loading={loading}>Archive</DialogButton>
      </DialogActions>
    </Dialog>
  )
}
