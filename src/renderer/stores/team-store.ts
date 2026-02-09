import { create } from 'zustand'
import type { TeamConfig, TaskData } from '../types'

interface TeamStore {
  teams: TeamConfig[]
  tasksByTeam: Record<string, TaskData[]>
  loading: boolean

  loadTeams: () => Promise<void>
  loadTasks: (teamName: string) => Promise<void>
  refreshAll: () => Promise<void>
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  teams: [],
  tasksByTeam: {},
  loading: false,

  loadTeams: async () => {
    try {
      const teams = await window.sorcerer.teams.list()
      set({ teams })
      // Auto-load tasks for all teams so sidebar has task data
      for (const team of teams) {
        get().loadTasks(team.name)
      }
    } catch (err) {
      console.error('Failed to load teams:', err)
    }
  },

  loadTasks: async (teamName: string) => {
    try {
      const tasks = await window.sorcerer.teams.getTasks(teamName)
      set((state) => ({
        tasksByTeam: { ...state.tasksByTeam, [teamName]: tasks }
      }))
    } catch (err) {
      console.error('Failed to load tasks:', err)
    }
  },

  refreshAll: async () => {
    const { loadTeams } = get()
    await loadTeams()
  }
}))
