import { create } from 'zustand'
import type { Agent } from '../types'
import { useUIStore, clearSessionFromTree } from './useUIStore'

interface AgentState {
  agents: Agent[]
  loading: boolean

  loadAgents: () => Promise<void>
  addAgent: (data: { name: string; description?: string; system_prompt?: string; mcp_config?: string }) => Promise<string | null>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>
  removeAgent: (id: string) => Promise<void>
  startAgent: (id: string) => Promise<void>
  resumeAgent: (id: string) => Promise<void>
  restartAgent: (id: string) => Promise<void>
  killAgent: (id: string) => Promise<void>
  renameAgent: (id: string, name: string) => Promise<void>
  updateAgentInStore: (id: string, updates: Partial<Agent>) => void
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  loading: false,

  loadAgents: async () => {
    set({ loading: true })
    try {
      const agents = await window.sorcerer.agent.list()
      set({ agents, loading: false })
    } catch (err) {
      console.error('[agent-store] loadAgents failed:', err)
      set({ loading: false })
    }
  },

  addAgent: async (data) => {
    try {
      const agent = await window.sorcerer.agent.add(data)
      if (!agent) return null
      set((state) => ({ agents: [agent, ...state.agents] }))
      return agent.id
    } catch (err) {
      console.error('[agent-store] addAgent failed:', err)
      return null
    }
  },

  updateAgent: async (id, updates) => {
    try {
      await window.sorcerer.agent.update(id, updates)
      set((state) => ({
        agents: state.agents.map((a) => a.id === id ? { ...a, ...updates } : a)
      }))
    } catch (err) {
      console.error('[agent-store] updateAgent failed:', err)
    }
  },

  removeAgent: async (id) => {
    try {
      await window.sorcerer.agent.remove(id)

      // Clear from split panels
      const { splitRoot } = useUIStore.getState()
      if (splitRoot) {
        useUIStore.setState({ splitRoot: clearSessionFromTree(splitRoot, id) })
      }

      set((state) => ({ agents: state.agents.filter((a) => a.id !== id) }))
    } catch (err) {
      console.error('[agent-store] removeAgent failed:', err)
    }
  },

  startAgent: async (id) => {
    try {
      const agent = await window.sorcerer.agent.start(id)
      if (agent) {
        set((state) => ({
          agents: state.agents.map((a) => a.id === id ? agent : a)
        }))
      }
    } catch (err) {
      console.error('[agent-store] startAgent failed:', err)
    }
  },

  resumeAgent: async (id) => {
    try {
      const agent = await window.sorcerer.agent.resume(id)
      if (agent) {
        set((state) => ({
          agents: state.agents.map((a) => a.id === id ? agent : a)
        }))
      }
    } catch (err) {
      console.error('[agent-store] resumeAgent failed:', err)
    }
  },

  restartAgent: async (id) => {
    try {
      const agent = await window.sorcerer.agent.restart(id)
      if (agent) {
        set((state) => ({
          agents: state.agents.map((a) => a.id === id ? agent : a)
        }))
      }
    } catch (err) {
      console.error('[agent-store] restartAgent failed:', err)
    }
  },

  killAgent: async (id) => {
    try {
      await window.sorcerer.agent.kill(id)
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === id ? { ...a, status: 'idle' as const, pid: null } : a
        )
      }))
    } catch (err) {
      console.error('[agent-store] killAgent failed:', err)
    }
  },

  renameAgent: async (id, name) => {
    try {
      await window.sorcerer.agent.update(id, { name })
      set((state) => ({
        agents: state.agents.map((a) => a.id === id ? { ...a, name } : a)
      }))
    } catch (err) {
      console.error('[agent-store] renameAgent failed:', err)
    }
  },

  updateAgentInStore: (id, updates) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      )
    }))
  }
}))
