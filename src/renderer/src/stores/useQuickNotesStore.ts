import { create } from 'zustand'
import { getApi } from '../api/client'

interface QuickNotesState {
  overlayOpen: boolean
  overlayParentId: string | null
  overlayParentType: 'session' | 'agent' | null
  openNotePanels: Set<string>
  /** IDs that have notes saved in the DB (persists even when panel is closed) */
  savedNotes: Set<string>

  openOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  closeOverlay: () => void
  toggleOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  addNotePanel: (parentId: string) => void
  removeNotePanel: (parentId: string) => void
  markSaved: (parentId: string) => void
  clearSaved: (parentId: string) => void
  loadNotePanels: () => Promise<void>
}

export const useQuickNotesStore = create<QuickNotesState>((set, get) => ({
  overlayOpen: false,
  overlayParentId: null,
  overlayParentType: null,
  openNotePanels: new Set(),
  savedNotes: new Set(),

  openOverlay: (parentId, parentType) => {
    set({ overlayOpen: true, overlayParentId: parentId, overlayParentType: parentType })
  },

  closeOverlay: () => {
    set({ overlayOpen: false, overlayParentId: null, overlayParentType: null })
  },

  toggleOverlay: (parentId, parentType) => {
    const { overlayOpen, overlayParentId } = get()
    if (overlayOpen && overlayParentId === parentId) {
      set({ overlayOpen: false, overlayParentId: null, overlayParentType: null })
    } else {
      set({ overlayOpen: true, overlayParentId: parentId, overlayParentType: parentType })
    }
  },

  addNotePanel: (parentId) => {
    set((state) => {
      const next = new Set(state.openNotePanels)
      next.add(parentId)
      return { openNotePanels: next }
    })
  },

  removeNotePanel: (parentId) => {
    set((state) => {
      const next = new Set(state.openNotePanels)
      next.delete(parentId)
      return { openNotePanels: next }
    })
  },

  markSaved: (parentId) => {
    set((state) => {
      const next = new Set(state.savedNotes)
      next.add(parentId)
      return { savedNotes: next }
    })
  },

  clearSaved: (parentId) => {
    set((state) => {
      const next = new Set(state.savedNotes)
      next.delete(parentId)
      return { savedNotes: next }
    })
  },

  loadNotePanels: async () => {
    const parents = await getApi().quickNotes.listParents()
    const panelIds = new Set(parents.map((p) => p.parent_id))
    set({ openNotePanels: panelIds, savedNotes: new Set(panelIds) })
  }
}))
