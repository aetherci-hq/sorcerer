import { create } from 'zustand'
import type { Project } from '../types'
import { getApi } from '../api/client'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean

  loadProjects: () => Promise<void>
  addProject: () => Promise<Project | null>
  addProjectByPath: (path: string, name?: string) => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  updateProject: (id: string, updates: { name?: string; setup_script?: string | null }) => Promise<void>
  reorderProjects: (projectIds: string[]) => Promise<void>
  setActiveProject: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await getApi().project.list()
      set({ projects, loading: false })
    } catch (err) {
      console.error('[project-store] loadProjects failed:', err)
      set({ loading: false })
    }
  },

  addProject: async () => {
    try {
      const project = await getApi().project.add()
      if (!project) return null
      set((state) => ({ projects: [project, ...state.projects] }))
      return project
    } catch (err) {
      console.error('[project-store] addProject failed:', err)
      return null
    }
  },

  addProjectByPath: async (path: string, name?: string) => {
    try {
      const project = await getApi().project.addPath(path, name)
      if (!project) return null
      set((state) => ({ projects: [project, ...state.projects] }))
      return project
    } catch (err) {
      console.error('[project-store] addProjectByPath failed:', err)
      return null
    }
  },

  removeProject: async (id: string) => {
    try {
      await getApi().project.remove(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
      }))
    } catch (err) {
      console.error('[project-store] removeProject failed:', err)
    }
  },

  updateProject: async (id, updates) => {
    try {
      await getApi().project.update(id, updates)
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        )
      }))
    } catch (err) {
      console.error('[project-store] updateProject failed:', err)
    }
  },

  reorderProjects: async (projectIds: string[]) => {
    // Optimistically reorder in store
    set((state) => {
      const projectMap = new Map(state.projects.map((p) => [p.id, p]))
      const reordered = projectIds.map((id) => projectMap.get(id)!).filter(Boolean)
      return { projects: reordered }
    })
    try {
      await getApi().project.reorder(projectIds)
    } catch (err) {
      console.error('[project-store] reorderProjects failed:', err)
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id })
}))
