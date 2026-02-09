import { create } from 'zustand'
import type { Session } from '../types'

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null
  loading: boolean

  loadSessions: (projectId?: string) => Promise<void>
  createSession: (projectId: string, name: string) => Promise<Session | null>
  killSession: (sessionId: string) => Promise<void>
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  restartSession: (sessionId: string) => Promise<void>
  pushBranch: (sessionId: string) => Promise<{ pushed: boolean; error?: string }>
  restoreSession: (sessionId: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  updateSessionInStore: (id: string, updates: Partial<Session>) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  loading: false,

  loadSessions: async (projectId?: string) => {
    set({ loading: true })
    try {
      const sessions = await window.sorcerer.session.list(projectId)
      set({ sessions, loading: false })
    } catch (err) {
      console.error('Failed to load sessions:', err)
      set({ loading: false })
    }
  },

  createSession: async (projectId: string, name: string) => {
    try {
      const session = await window.sorcerer.session.create(projectId, name)
      set((state) => ({
        sessions: [...state.sessions, session],
        activeSessionId: session.id
      }))
      return session
    } catch (err) {
      console.error('Failed to create session:', err)
      return null
    }
  },

  killSession: async (sessionId: string) => {
    try {
      await window.sorcerer.session.kill(sessionId)
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, status: 'idle', pid: null } : s
        )
      }))
    } catch (err) {
      console.error('Failed to kill session:', err)
    }
  },

  archiveSession: async (sessionId: string) => {
    try {
      await window.sorcerer.session.archive(sessionId)
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, status: 'archived', pid: null, archived_at: Math.floor(Date.now() / 1000) } : s
        ),
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId
      }))
    } catch (err) {
      console.error('Failed to archive session:', err)
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await window.sorcerer.session.delete(sessionId)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId
      }))
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  },

  restartSession: async (sessionId: string) => {
    try {
      const session = await window.sorcerer.session.restart(sessionId)
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === sessionId ? session : s))
      }))
    } catch (err) {
      console.error('Failed to restart session:', err)
    }
  },

  pushBranch: async (sessionId: string) => {
    try {
      return await window.sorcerer.session.pushBranch(sessionId)
    } catch (err) {
      console.error('Failed to push branch:', err)
      return { pushed: false, error: String(err) }
    }
  },

  restoreSession: async (sessionId: string) => {
    try {
      const session = await window.sorcerer.session.restore(sessionId)
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === sessionId ? session : s))
      }))
    } catch (err) {
      console.error('Failed to restore session:', err)
    }
  },

  setActiveSession: async (id: string | null) => {
    set({ activeSessionId: id })

    // Auto-restart PTY for stale sessions (sessions that have no running process)
    if (id) {
      const session = get().sessions.find((s) => s.id === id)
      if (session && (session.status === 'idle' || !session.pid)) {
        try {
          const restarted = await window.sorcerer.session.restart(id)
          set((state) => ({
            sessions: state.sessions.map((s) => (s.id === id ? restarted : s))
          }))
        } catch (err) {
          console.error('Failed to auto-restart session:', err)
        }
      }
    }
  },

  updateSessionInStore: (id: string, updates: Partial<Session>) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s))
    }))
  }
}))
