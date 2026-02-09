import { useEffect } from 'react'
import { useUIStore } from '../stores/useUIStore'

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
