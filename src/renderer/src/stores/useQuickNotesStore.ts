import { create } from 'zustand'

interface QuickNotesState {
  overlayOpen: boolean
  overlayParentId: string | null
  overlayParentType: 'session' | 'agent' | null
  openNotePanels: Set<string>

  openOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  closeOverlay: () => void
  toggleOverlay: (parentId: string, parentType: 'session' | 'agent') => void
  addNotePanel: (parentId: string) => void
  removeNotePanel: (parentId: string) => void
}

export const useQuickNotesStore = create<QuickNotesState>((set, get) => ({
  overlayOpen: false,
  overlayParentId: null,
  overlayParentType: null,
  openNotePanels: new Set(),

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
  }
}))
