import { useSessionStore } from '../stores/useSessionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useQuickNotesStore } from '../stores/useQuickNotesStore'
import { useUIStore, findLeafBySession } from '../stores/useUIStore'
import { QuickNotesEditor } from './QuickNotesEditor'

/**
 * Parse a quicknotes panel ID like "quicknotes:session:{uuid}" or "quicknotes:agent:{uuid}"
 * into { parentId, parentType } or null if the format doesn't match.
 */
export function parseQuickNotesPanelId(id: string): { parentId: string; parentType: 'session' | 'agent' } | null {
  const match = id.match(/^quicknotes:(session|agent):(.+)$/)
  if (!match) return null
  return { parentType: match[1] as 'session' | 'agent', parentId: match[2] }
}

interface QuickNotesPanelProps {
  panelSessionId: string
}

export function QuickNotesPanel({ panelSessionId }: QuickNotesPanelProps) {
  const parsed = parseQuickNotesPanelId(panelSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const agents = useAgentStore((s) => s.agents)

  if (!parsed) return null

  const { parentId, parentType } = parsed

  let parentName = 'Notes'
  if (parentType === 'session') {
    const session = sessions.find((s) => s.id === parentId)
    parentName = session ? session.name : 'Session'
  } else {
    const agent = agents.find((a) => a.id === parentId)
    parentName = agent ? agent.name : 'Agent'
  }

  const handleDeleted = () => {
    useQuickNotesStore.getState().removeNotePanel(parentId)
    const { splitRoot: root } = useUIStore.getState()
    if (root) {
      const leaf = findLeafBySession(root, panelSessionId)
      if (leaf) useUIStore.getState().closePanel(leaf.id)
    }
  }

  return (
    <QuickNotesEditor
      parentId={parentId}
      parentType={parentType}
      parentName={parentName}
      onDeleted={handleDeleted}
    />
  )
}
