import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'
import { useSessionStore } from '../stores/useSessionStore'

export function useKeyboardShortcuts() {
  const { openDialog, activeDialog } = useUIStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when a dialog is open
      if (activeDialog) return

      // Ctrl+K — focus search
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null
        searchInput?.focus()
      }

      // Ctrl+N — new session
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        openDialog('new-session')
      }

      // Ctrl+B — toggle sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        useUIStore.getState().toggleSidebar()
      }

      // Ctrl+\ — split right
      if (e.ctrlKey && !e.shiftKey && e.key === '\\') {
        e.preventDefault()
        const sessionId = useSessionStore.getState().activeSessionId
        if (sessionId) {
          useUIStore.getState().splitRight(sessionId)
        }
      }

      // Ctrl+Shift+\ — split down
      if (e.ctrlKey && e.shiftKey && e.key === '|') {
        e.preventDefault()
        const sessionId = useSessionStore.getState().activeSessionId
        if (sessionId) {
          useUIStore.getState().splitDown(sessionId)
        }
      }

      // Ctrl+W — close focused panel (only in split mode)
      if (e.ctrlKey && e.key === 'w') {
        const { splitRoot, focusedPanelId, closePanel } = useUIStore.getState()
        if (splitRoot && focusedPanelId) {
          e.preventDefault()
          closePanel(focusedPanelId)
        }
      }

      // Escape — clear search if focused, otherwise blur
      if (e.key === 'Escape') {
        const searchInput = document.querySelector('.search-input') as HTMLInputElement | null
        if (document.activeElement === searchInput) {
          const { searchQuery, setSearchQuery } = useUIStore.getState()
          if (searchQuery) {
            setSearchQuery('')
          } else {
            searchInput?.blur()
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openDialog, activeDialog])
}
