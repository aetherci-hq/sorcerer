import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useToastStore } from '../stores/useToastStore'

interface OrphanWorkspace {
  dirName: string
  sessionCount: number
  fullPath: string
}

export function OrphanWorkspaceBanner() {
  const [orphans, setOrphans] = useState<OrphanWorkspace[]>([])
  const [linking, setLinking] = useState<string | null>(null)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    window.sorcerer.workspace.scanOrphans().then((result: OrphanWorkspace[]) => {
      setOrphans(result)
    })
  }, [])

  if (orphans.length === 0) return null

  const handleLink = async (orphan: OrphanWorkspace) => {
    setLinking(orphan.dirName)
    try {
      const project = await window.sorcerer.project.add()
      if (!project) {
        setLinking(null)
        return
      }

      // Validate the selected project matches the orphan workspace name
      const projectBasename = project.path.replace(/\\/g, '/').split('/').pop()
      if (projectBasename !== orphan.dirName) {
        addToast(`Expected "${orphan.dirName}" but selected "${projectBasename}"`, 'error')
        setLinking(null)
        return
      }

      // Sync worktrees to recover sessions
      const result = await window.sorcerer.project.syncWorktrees(project.id)
      await loadProjects()
      await loadSessions()

      setOrphans((prev) => prev.filter((o) => o.dirName !== orphan.dirName))
      addToast(`Linked "${orphan.dirName}" — ${result.created} session${result.created !== 1 ? 's' : ''} recovered`, 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to link project', 'error')
    } finally {
      setLinking(null)
    }
  }

  const handleDismiss = async (dirName: string) => {
    await window.sorcerer.workspace.dismissOrphan(dirName)
    setOrphans((prev) => prev.filter((o) => o.dirName !== dirName))
  }

  const handleDismissAll = async () => {
    await Promise.all(orphans.map((o) => window.sorcerer.workspace.dismissOrphan(o.dirName)))
    setOrphans([])
  }

  return (
    <div className="orphan-banner">
      <div className="orphan-banner-header">
        <div className="orphan-banner-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
          </svg>
          <span>{orphans.length} orphaned workspace{orphans.length !== 1 ? 's' : ''} found</span>
        </div>
        <button className="orphan-banner-dismiss-all" onClick={handleDismissAll}>
          Dismiss All
        </button>
      </div>
      {orphans.map((orphan) => (
        <div key={orphan.dirName} className="orphan-banner-row">
          <span className="orphan-banner-name">{orphan.dirName}</span>
          <span className="orphan-banner-count">{orphan.sessionCount} session{orphan.sessionCount !== 1 ? 's' : ''}</span>
          <div className="orphan-banner-actions">
            <button
              className="orphan-banner-link"
              onClick={() => handleLink(orphan)}
              disabled={linking === orphan.dirName}
            >
              {linking === orphan.dirName ? 'Linking...' : 'Link Project'}
            </button>
            <button
              className="orphan-banner-dismiss"
              onClick={() => handleDismiss(orphan.dirName)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
