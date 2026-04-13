import { useProjectStore } from '../stores/useProjectStore'
import { useSessionStore } from '../stores/useSessionStore'
import { useUIStore } from '../stores/useUIStore'

function getProjectIdForSession(sessionId: string): string | null {
  if (sessionId.startsWith('quicknotes:')) {
    const [, parentType, parentId] = sessionId.split(':')
    if (parentType === 'session' && parentId) {
      sessionId = parentId
    } else {
      return null
    }
  }
  const session = useSessionStore.getState().sessions.find((item) => item.id === sessionId)
  return session?.project_id || null
}

export function resolveNewSessionProjectId(): string | null {
  const { projects } = useProjectStore.getState()
  const { activeSessionId } = useSessionStore.getState()
  const { sidebarSelection } = useUIStore.getState()

  if (sidebarSelection?.type === 'project') {
    return sidebarSelection.id
  }

  if (sidebarSelection?.type === 'session') {
    return getProjectIdForSession(sidebarSelection.id)
  }

  if (sidebarSelection?.type === 'project-group') {
    return projects.find((project) => project.group_id === sidebarSelection.id)?.id || null
  }

  if (activeSessionId) {
    return getProjectIdForSession(activeSessionId)
  }

  return projects.length === 1 ? projects[0].id : null
}
