import { getApi } from '../api/client'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore, clearSessionFromTree, findLeafBySession } from '../stores/useUIStore'

function clearFromMainWorkspace(panelId: string): void {
  const ui = useUIStore.getState()
  if (ui.splitRoot) {
    const leaf = findLeafBySession(ui.splitRoot, panelId)
    if (leaf) {
      ui.setPanelSession(leaf.id, null)
    } else {
      const nextRoot = clearSessionFromTree(ui.splitRoot, panelId)
      useUIStore.setState({ splitRoot: nextRoot })
    }
  } else if (useSessionStore.getState().activeSessionId === panelId) {
    useSessionStore.setState({ activeSessionId: null })
  }
}

export async function assignPanelToPopoutTarget(panelId: string): Promise<boolean> {
  const assigned = await getApi().popout.assignToSelectionTarget(panelId).catch(() => false)
  if (!assigned) return false
  clearFromMainWorkspace(panelId)
  return true
}
