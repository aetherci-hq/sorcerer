import { create } from 'zustand'
import { useSessionStore } from './session-store'
import { showToast } from '../components/Toast'
import {
  createLeaf,
  splitNode,
  removeNode,
  resizeNode,
  findLeaves,
  findLeafBySessionId,
  replaceLeafSession,
  getAdjacentLeaf,
  type TileNode,
  type TileId
} from '../lib/tile-utils'

interface TileStore {
  tree: TileNode | null
  focusedTileId: TileId | null

  /** Replace the entire tree with a single leaf for this session */
  initSingle: (sessionId: string) => void
  /** Split a pane, adding newSessionId beside it */
  split: (tileId: TileId, direction: 'horizontal' | 'vertical', newSessionId: string) => void
  /** Close a pane, promote its sibling */
  close: (tileId: TileId) => void
  /** Update split ratio */
  resize: (tileId: TileId, newRatio: number) => void
  /** Set focused pane and sync to session store */
  setFocus: (tileId: TileId) => void
  /** Navigate focus in a direction */
  moveFocus: (direction: 'left' | 'right' | 'up' | 'down') => void
  /** Replace the focused pane's session with a different one */
  replaceSession: (tileId: TileId, newSessionId: string) => void
  /** Remove a session from the tree (e.g. when session is deleted) */
  removeSession: (sessionId: string) => void
}

export const useTileStore = create<TileStore>((set, get) => ({
  tree: null,
  focusedTileId: null,

  initSingle: (sessionId: string) => {
    const leaf = createLeaf(sessionId)
    set({ tree: leaf, focusedTileId: leaf.id })
    useSessionStore.getState().setActiveSession(sessionId)
  },

  split: (tileId, direction, newSessionId) => {
    const { tree } = get()
    if (!tree) return

    // Don't allow same session in two tiles (xterm can only attach to one DOM element)
    const existing = findLeafBySessionId(tree, newSessionId)
    if (existing) {
      showToast('Session is already open — focus moved to its pane', 'info')
      set({ focusedTileId: existing.id })
      useSessionStore.setState({ activeSessionId: newSessionId })
      return
    }

    const newTree = splitNode(tree, tileId, direction, newSessionId)
    // Find the new leaf to focus it
    const newLeaf = findLeafBySessionId(newTree, newSessionId)
    set({
      tree: newTree,
      focusedTileId: newLeaf?.id ?? get().focusedTileId
    })
    useSessionStore.getState().setActiveSession(newSessionId)
  },

  close: (tileId) => {
    const { tree } = get()
    if (!tree) return

    const newTree = removeNode(tree, tileId)
    if (!newTree) {
      // Last pane closed
      set({ tree: null, focusedTileId: null })
      useSessionStore.getState().setActiveSession(null)
      return
    }

    // Focus the first remaining leaf
    const leaves = findLeaves(newTree)
    const focusLeaf = leaves[0]
    set({ tree: newTree, focusedTileId: focusLeaf?.id ?? null })
    if (focusLeaf) {
      useSessionStore.getState().setActiveSession(focusLeaf.sessionId)
    }
  },

  resize: (tileId, newRatio) => {
    const { tree } = get()
    if (!tree) return
    set({ tree: resizeNode(tree, tileId, newRatio) })
  },

  setFocus: (tileId) => {
    const { tree } = get()
    if (!tree) return
    set({ focusedTileId: tileId })

    // Sync to session store
    const leaves = findLeaves(tree)
    const leaf = leaves.find((l) => l.id === tileId)
    if (leaf) {
      // Use direct set to avoid auto-restart behavior in setActiveSession
      useSessionStore.setState({ activeSessionId: leaf.sessionId })
    }
  },

  moveFocus: (direction) => {
    const { tree, focusedTileId } = get()
    if (!tree || !focusedTileId) return

    const target = getAdjacentLeaf(tree, focusedTileId, direction)
    if (target) {
      set({ focusedTileId: target.id })
      useSessionStore.setState({ activeSessionId: target.sessionId })
    }
  },

  replaceSession: (tileId, newSessionId) => {
    const { tree } = get()
    if (!tree) return

    // Don't allow same session in two tiles
    const existing = findLeafBySessionId(tree, newSessionId)
    if (existing) {
      showToast('Session is already open — focus moved to its pane', 'info')
      set({ focusedTileId: existing.id })
      useSessionStore.setState({ activeSessionId: newSessionId })
      return
    }

    const newTree = replaceLeafSession(tree, tileId, newSessionId)
    set({ tree: newTree })
    useSessionStore.getState().setActiveSession(newSessionId)
  },

  removeSession: (sessionId) => {
    const { tree } = get()
    if (!tree) return
    const leaf = findLeafBySessionId(tree, sessionId)
    if (leaf) {
      get().close(leaf.id)
    }
  }
}))
