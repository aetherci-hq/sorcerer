import type { Project, ProjectGroup } from '../types'

export function getOrderedTopLevelKeys(
  ungroupedProjects: Project[],
  groups: ProjectGroup[],
  projectTopLevelOrder: string[]
): string[] {
  const topLevelProjectKeys = ungroupedProjects.map((project) => `project:${project.id}`)
  const topLevelGroupKeys = groups.map((group) => `group:${group.id}`)
  const knownTopLevelKeys = new Set([...topLevelProjectKeys, ...topLevelGroupKeys])
  const legacyTopLevelOrder = [...topLevelProjectKeys, ...topLevelGroupKeys]
  const seenTopLevelKeys = new Set<string>()

  return [
    ...projectTopLevelOrder.filter((key) => {
      if (!knownTopLevelKeys.has(key) || seenTopLevelKeys.has(key)) return false
      seenTopLevelKeys.add(key)
      return true
    }),
    ...legacyTopLevelOrder.filter((key) => {
      if (seenTopLevelKeys.has(key)) return false
      seenTopLevelKeys.add(key)
      return true
    })
  ]
}

export function getProjectsInSidebarOrder(
  projects: Project[],
  groups: ProjectGroup[],
  projectTopLevelOrder: string[]
): Project[] {
  const ungroupedProjects = projects.filter((project) => !project.group_id)
  const orderedTopLevelKeys = getOrderedTopLevelKeys(ungroupedProjects, groups, projectTopLevelOrder)
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const groupedProjectsById = new Map(
    groups.map((group) => [group.id, projects.filter((project) => project.group_id === group.id)])
  )
  const ordered: Project[] = []
  const seenProjectIds = new Set<string>()

  for (const key of orderedTopLevelKeys) {
    if (key.startsWith('project:')) {
      const project = projectById.get(key.slice('project:'.length))
      if (project && !seenProjectIds.has(project.id)) {
        ordered.push(project)
        seenProjectIds.add(project.id)
      }
      continue
    }

    const groupProjects = groupedProjectsById.get(key.slice('group:'.length)) || []
    for (const project of groupProjects) {
      if (!seenProjectIds.has(project.id)) {
        ordered.push(project)
        seenProjectIds.add(project.id)
      }
    }
  }

  for (const project of projects) {
    if (!seenProjectIds.has(project.id)) {
      ordered.push(project)
      seenProjectIds.add(project.id)
    }
  }

  return ordered
}
