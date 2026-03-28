import { useState, useEffect } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { getApi } from '../../api/client'
import { useUIStore } from '../../stores/useUIStore'
import { useAgentStore } from '../../stores/useAgentStore'
import { useToastStore } from '../../stores/useToastStore'

export function EditMissionDialog() {
  const { activeDialog, dialogTargetId, closeDialog } = useUIStore()
  const agents = useAgentStore((s) => s.agents)
  const { addToast } = useToastStore()
  const [mission, setMission] = useState('')

  const open = activeDialog === 'edit-agent-mission'
  const agent = agents.find((a) => a.id === dialogTargetId)

  useEffect(() => {
    if (open && agent) {
      setMission(agent.mission || '')
    }
  }, [open, agent])

  const handleClose = () => {
    setMission('')
    closeDialog()
  }

  const handleSave = async () => {
    if (!dialogTargetId) return
    await getApi().agent.update(dialogTargetId, { mission: mission.trim() })
    useAgentStore.getState().updateAgentInStore(dialogTargetId, { mission: mission.trim() })
    addToast(mission.trim() ? 'Mission updated' : 'Mission cleared', 'success')
    handleClose()
  }

  if (!open || !agent) return null

  return (
    <Dialog open={open} onClose={handleClose} title={`Edit Mission — ${agent.name}`}>
      <DialogField label="Mission">
        <textarea
          className="dialog-input dialog-textarea"
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          rows={6}
          autoFocus
        />
      </DialogField>
      <div className="dialog-hint">
        Changes take effect on the next scheduled run.
      </div>
      <DialogActions>
        <DialogButton onClick={handleClose}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={handleSave}>Save Mission</DialogButton>
      </DialogActions>
    </Dialog>
  )
}
