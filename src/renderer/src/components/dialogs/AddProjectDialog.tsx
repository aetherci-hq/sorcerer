import { useState } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useToastStore } from '../../stores/useToastStore'

export function AddProjectDialog() {
  const { activeDialog, closeDialog } = useUIStore()
  const { addProject } = useProjectStore()
  const { addToast } = useToastStore()

  const open = activeDialog === 'add-project'

  const handleClose = () => {
    closeDialog()
  }

  const handleBrowse = async () => {
    const project = await addProject()
    if (project) {
      addToast(`Project "${project.name}" added`, 'success')
      handleClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add Project">
      <div className="dialog-confirm-body">
        <p className="dialog-confirm-text">
          Select a git repository folder to add as a project.
        </p>
        <p className="dialog-confirm-subtext">
          Worktrees will be created for each session under <span className="dialog-hint-mono">~/.sorcerer/workspaces/</span>
        </p>
      </div>
      <DialogActions>
        <DialogButton onClick={handleClose}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={handleBrowse}>Browse...</DialogButton>
      </DialogActions>
    </Dialog>
  )
}
