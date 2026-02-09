import { create } from 'zustand'
import type { TeamConfig, TaskData } from '../types'

interface TeamState {
  teams: TeamConfig[]
  tasksByTeam: Record<string, TaskData[]>
  loading: boolean

  loadTeams: () => Promise<void>
  loadTasks: (teamName: string) => Promise<void>
  refreshAll: () => Promise<void>
}

export const useTeamStore = create<TeamState>((set, get) => ({
  teams: [],
  tasksByTeam: {},
  loading: false,

  loadTeams: async () => {
    set({ loading: true })
    try {
      const teams = await window.sorcerer.teams.list()
      set({ teams, loading: false })
      // Eager-load tasks for each team
      for (const team of teams) {
        get().loadTasks(team.name)
      }
    } catch (err) {
      console.error('[team-store] loadTeams failed:', err)
      set({ loading: false })
    }
  },

  loadTasks: async (teamName) => {
    try {
      const tasks = await window.sorcerer.teams.getTasks(teamName)
      set((state) => ({
        tasksByTeam: { ...state.tasksByTeam, [teamName]: tasks }
      }))
    } catch (err) {
      console.error('[team-store] loadTasks failed:', err)
    }
  },

  refreshAll: async () => {
    const { loadTeams } = get()
    await loadTeams()
  }
}))
