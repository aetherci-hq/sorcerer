import { create } from 'zustand'
import type { Project } from '../types'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean

  loadProjects: () => Promise<void>
  addProject: () => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  setActiveProject: (id: string | null) => void
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await window.sorcerer.project.list()
      set({ projects, loading: false })
    } catch (err) {
      console.error('Failed to load projects:', err)
      set({ loading: false })
    }
  },

  addProject: async () => {
    try {
      const project = await window.sorcerer.project.add()
      if (project) {
        // Only add to store if not already there
        const { projects } = get()
        if (!projects.find((p) => p.id === project.id)) {
          set((state) => ({ projects: [...state.projects, project] }))
        }
        return project
      }
      return null
    } catch (err: any) {
      console.error('Failed to add project:', err)
      // Re-throw with clean message for UI to display
      throw new Error(err?.message || 'Failed to add project')
    }
  },

  removeProject: async (id: string) => {
    try {
      await window.sorcerer.project.remove(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId
      }))
    } catch (err) {
      console.error('Failed to remove project:', err)
    }
  },

  setActiveProject: (id: string | null) => {
    set({ activeProjectId: id })
  },

  updateProject: async (id: string, updates: Partial<Project>) => {
    try {
      await window.sorcerer.project.update(id, updates)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p))
      }))
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }
}))
