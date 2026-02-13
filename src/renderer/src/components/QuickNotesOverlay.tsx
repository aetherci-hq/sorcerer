import { useEffect } from 'react'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { QuickNotesEditor } from './QuickNotesEditor'

export function QuickNotesOverlay() {
  const { overlayOpen, overlayParentId, overlayParentType, closeOverlay } = useQuickNotesStore()
  const sessions = useSessionStore((s) => s.sessions)
  const agents = useAgentStore((s) => s.agents)

  // Escape to close (capture phase to take priority)
  useEffect(() => {
    if (!overlayOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        closeOverlay()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [overlayOpen, closeOverlay])

  if (!overlayOpen || !overlayParentId || !overlayParentType) return null

  let parentName = 'Notes'
  if (overlayParentType === 'session') {
    const session = sessions.find((s) => s.id === overlayParentId)
    parentName = session ? session.name : 'Session'
  } else {
    const agent = agents.find((a) => a.id === overlayParentId)
    parentName = agent ? agent.name : 'Agent'
  }

  return (
    <div className="quick-notes-overlay-backdrop" onClick={closeOverlay}>
      <div className="quick-notes-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <QuickNotesEditor
          parentId={overlayParentId}
          parentType={overlayParentType}
          parentName={parentName}
        />
      </div>
    </div>
  )
}
