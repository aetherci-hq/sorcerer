import { create } from 'zustand'
import type { Project } from '../types'

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean

  loadProjects: () => Promise<void>
  addProject: () => Promise<Project | null>
  addProjectByPath: (path: string, name?: string) => Promise<Project | null>
  removeProject: (id: string) => Promise<void>
  updateProject: (id: string, updates: { name?: string; setup_script?: string | null }) => Promise<void>
  setActiveProject: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await window.sorcerer.project.list()
      set({ projects, loading: false })
    } catch (err) {
      console.error('[project-store] loadProjects failed:', err)
      set({ loading: false })
    }
  },

  addProject: async () => {
    try {
      const project = await window.sorcerer.project.add()
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
      const project = await window.sorcerer.project.addPath(path, name)
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
      await window.sorcerer.project.remove(id)
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
      await window.sorcerer.project.update(id, updates)
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        )
      }))
    } catch (err) {
      console.error('[project-store] updateProject failed:', err)
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id })
}))
