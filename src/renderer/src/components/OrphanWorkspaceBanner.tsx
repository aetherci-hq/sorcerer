import { useState, useEffect } from 'react'
import { getApi } from '../api/client'
import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useToastStore } from '../stores/useToastStore'

interface OrphanWorkspace {
  dirName: string
  sessionCount: number
  fullPath: string
}

interface OrphanAgent {
  dirName: string
  agentName: string
  fullPath: string
  hasManifest: boolean
  manifest?: {
    name: string
    description?: string
    system_prompt?: string
    mcp_config?: string
  }
}

export function OrphanWorkspaceBanner() {
  const [orphans, setOrphans] = useState<OrphanWorkspace[]>([])
  const [orphanAgents, setOrphanAgents] = useState<OrphanAgent[]>([])
  const [linking, setLinking] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const loadAgents = useAgentStore((s) => s.loadAgents)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    Promise.all([
      getApi().workspace.scanOrphans(),
      getApi().workspace.scanOrphanAgents()
    ]).then(([workspaces, agents]: [OrphanWorkspace[], OrphanAgent[]]) => {
      setOrphans(workspaces)
      setOrphanAgents(agents)
    })
  }, [])

  if (orphans.length === 0 && orphanAgents.length === 0) return null

  const totalCount = orphans.length + orphanAgents.length

  const handleLink = async (orphan: OrphanWorkspace) => {
    setLinking(orphan.dirName)
    try {
      const project = await getApi().project.add()
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
      const result = await getApi().project.syncWorktrees(project.id)
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
    await getApi().workspace.dismissOrphan(dirName)
    setOrphans((prev) => prev.filter((o) => o.dirName !== dirName))
  }

  const handleImportAgent = async (orphan: OrphanAgent) => {
    setImporting(orphan.dirName)
    try {
      const data = orphan.manifest
        ? {
            id: orphan.dirName,
            name: orphan.manifest.name,
            description: orphan.manifest.description,
            system_prompt: orphan.manifest.system_prompt,
            mcp_config: orphan.manifest.mcp_config
          }
        : { id: orphan.dirName, name: orphan.agentName }
      await getApi().agent.add(data)
      await loadAgents()
      setOrphanAgents((prev) => prev.filter((o) => o.dirName !== orphan.dirName))
      addToast(`Re-imported agent "${orphan.agentName}"`, 'success')
    } catch (err: any) {
      addToast(err.message || 'Failed to re-import agent', 'error')
    } finally {
      setImporting(null)
    }
  }

  const handleDismissAgent = async (dirName: string) => {
    await getApi().workspace.dismissOrphanAgent(dirName)
    setOrphanAgents((prev) => prev.filter((o) => o.dirName !== dirName))
  }

  const handleDismissAll = async () => {
    await Promise.all([
      ...orphans.map((o) => getApi().workspace.dismissOrphan(o.dirName)),
      ...orphanAgents.map((o) => getApi().workspace.dismissOrphanAgent(o.dirName))
    ])
    setOrphans([])
    setOrphanAgents([])
  }

  return (
    <div className="orphan-banner">
      <div className="orphan-banner-header">
        <div className="orphan-banner-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
          </svg>
          <span>{totalCount} orphaned {totalCount === 1 ? 'item' : 'items'} found</span>
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
      {orphanAgents.map((orphan) => (
        <div key={orphan.dirName} className="orphan-banner-row">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM5.5 6a.5.5 0 0 0 0 1h.01a.5.5 0 0 0 0-1H5.5zm5 0a.5.5 0 0 0 0 1h.01a.5.5 0 0 0 0-1h-.01z"/>
            <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v2.003C2 8.985 3.893 11 6.275 11h3.45C12.107 11 14 8.985 14 6.503V4.5A2.5 2.5 0 0 0 11.5 2h-7zM3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v2.003C13 8.45 11.514 10 9.725 10h-3.45C4.486 10 3 8.45 3 6.503V4.5z"/>
            <path d="M8 12a1 1 0 0 0-1 1v1h2v-1a1 1 0 0 0-1-1zM5 15h6v-2a3 3 0 0 0-6 0v2z"/>
          </svg>
          <span className="orphan-banner-name">{orphan.agentName}</span>
          {!orphan.hasManifest && <span className="orphan-banner-count">no manifest</span>}
          <div className="orphan-banner-actions">
            {orphan.hasManifest && (
              <button
                className="orphan-banner-link"
                onClick={() => handleImportAgent(orphan)}
                disabled={importing === orphan.dirName}
              >
                {importing === orphan.dirName ? 'Importing...' : 'Re-import'}
              </button>
            )}
            <button
              className="orphan-banner-dismiss"
              onClick={() => handleDismissAgent(orphan.dirName)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
