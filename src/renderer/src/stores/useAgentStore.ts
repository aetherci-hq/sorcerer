import { create } from 'zustand'
import type { Agent } from '../types'
import { useUIStore, clearSessionFromTree } from './useUIStore'
import { useQuickNotesStore } from './useQuickNotesStore'
import { getApi } from '../api/client'

interface AgentState {
  agents: Agent[]
  loading: boolean

  loadAgents: () => Promise<void>
  addAgent: (data: { id?: string; name: string; description?: string; system_prompt?: string; mcp_config?: string; remote_control?: boolean }) => Promise<string | null>
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
      const agents = await getApi().agent.list()
      set({ agents, loading: false })
    } catch (err) {
      console.error('[agent-store] loadAgents failed:', err)
      set({ loading: false })
    }
  },

  addAgent: async (data) => {
    try {
      const agent = await getApi().agent.add(data)
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
      await getApi().agent.update(id, updates)
      set((state) => ({
        agents: state.agents.map((a) => a.id === id ? { ...a, ...updates } : a)
      }))
    } catch (err) {
      console.error('[agent-store] updateAgent failed:', err)
    }
  },

  removeAgent: async (id) => {
    try {
      await getApi().agent.remove(id)

      // Clean up quick notes
      getApi().quickNotes.delete(id, 'agent')
      const qnState = useQuickNotesStore.getState()
      if (qnState.overlayOpen && qnState.overlayParentId === id) {
        qnState.closeOverlay()
      }
      qnState.removeNotePanel(id)
      qnState.clearSaved(id)

      // Clear from split panels
      const { splitRoot } = useUIStore.getState()
      if (splitRoot) {
        let root = clearSessionFromTree(splitRoot, id)
        root = clearSessionFromTree(root, `quicknotes:agent:${id}`)
        useUIStore.setState({ splitRoot: root })
      }

      set((state) => ({ agents: state.agents.filter((a) => a.id !== id) }))
    } catch (err) {
      console.error('[agent-store] removeAgent failed:', err)
    }
  },

  startAgent: async (id) => {
    try {
      const agent = await getApi().agent.start(id)
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
      const agent = await getApi().agent.resume(id)
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
      const agent = await getApi().agent.restart(id)
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
      await getApi().agent.kill(id)
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
      await getApi().agent.update(id, { name })
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
