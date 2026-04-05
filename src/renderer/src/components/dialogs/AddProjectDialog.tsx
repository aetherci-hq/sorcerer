import { useState } from 'react'
import { Dialog, DialogField, DialogActions, DialogButton } from '../Dialog'
import { useUIStore } from '../../stores/useUIStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useToastStore } from '../../stores/useToastStore'

/** Extract the last folder segment from a path */
function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const sep = trimmed.lastIndexOf('\\') !== -1 ? '\\' : '/'
  return trimmed.slice(trimmed.lastIndexOf(sep) + 1)
}

export function AddProjectDialog() {
  const { activeDialog, closeDialog } = useUIStore()
  const { addProject, addProjectByPath } = useProjectStore()
  const { addToast } = useToastStore()
  const [nameOverride, setNameOverride] = useState('')
  const [path, setPath] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const open = activeDialog === 'add-project'

  // Derive name: user override wins, otherwise extract from path
  const derivedName = folderName(path)
  const effectiveName = nameOverride || derivedName

  const handleClose = () => {
    setNameOverride('')
    setPath('')
    closeDialog()
  }

  const handleBrowse = async () => {
    try {
      const project = await addProject()
      if (project) {
        // If user browsed, the backend already added it with folder name.
        // If they had a name override, update it.
        if (nameOverride && nameOverride !== project.name) {
          await useProjectStore.getState().updateProject(project.id, { name: nameOverride })
        }
        handleClose()
      }
    } catch (err) {
      addToast(`Failed: ${err}`, 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!path.trim()) {
      addToast('Please enter a project path', 'error')
      return
    }
    setSubmitting(true)
    try {
      const project = await addProjectByPath(path.trim(), effectiveName || undefined)
      if (project) {
        handleClose()
      }
    } catch (err) {
      addToast(`Failed: ${err}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add Project">
      <form onSubmit={handleSubmit}>
        <DialogField label="Path">
          <div className="dialog-path-row">
            <input
              className="dialog-input"
              type="text"
              placeholder="C:\Projects\my-app"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              autoFocus
            />
            <button type="button" className="dialog-browse-btn" onClick={handleBrowse}>
              Browse
            </button>
          </div>
        </DialogField>
        <DialogField label="Project name">
          <input
            className="dialog-input"
            type="text"
            placeholder={derivedName || 'Folder name'}
            value={nameOverride}
            onChange={(e) => setNameOverride(e.target.value)}
          />
          <div className="dialog-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Defaults to folder name. Override if you want a different display name.
          </div>
        </DialogField>
        <div className="dialog-hint">
          Any folder works — git repos get worktree isolation and branch tracking.
        </div>
        <DialogActions>
          <DialogButton onClick={handleClose} disabled={submitting}>Cancel</DialogButton>
          <DialogButton variant="primary" type="submit" loading={submitting}>Add Project</DialogButton>
        </DialogActions>
      </form>
    </Dialog>
  )
}
