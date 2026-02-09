import React, { useEffect, useState, useCallback } from 'react'

interface ToastMessage {
  id: string
  message: string
  type: 'error' | 'info' | 'success'
}

let addToastFn: ((message: string, type?: 'error' | 'info' | 'success') => void) | null = null

export function showToast(message: string, type: 'error' | 'info' | 'success' = 'info') {
  if (addToastFn) addToastFn(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((message: string, type: 'error' | 'info' | 'success' = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  const icon = (type: string) => {
    if (type === 'error') return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-red-400 flex-shrink-0">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z" />
      </svg>
    )
    if (type === 'success') return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-green-400 flex-shrink-0">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.844-8.791a.5.5 0 0 1 0 .707l-4.5 4.5a.5.5 0 0 1-.707 0l-2-2a.5.5 0 1 1 .707-.707L7 9.566l4.137-4.137a.5.5 0 0 1 .707 0z" />
      </svg>
    )
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--accent)] flex-shrink-0">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm1-5.5a1 1 0 1 1-2 0v-3a1 1 0 0 1 2 0v3zm-1 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
      </svg>
    )
  }

  return (
    <div className="fixed bottom-10 right-5 z-[100] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-lg border text-[13px] max-w-[400px] animate-slide-in cursor-pointer ${
            toast.type === 'error'
              ? 'bg-red-950/90 border-red-800/50 text-red-200'
              : toast.type === 'success'
              ? 'bg-green-950/90 border-green-800/50 text-green-200'
              : 'bg-[var(--bg-elevated)] border-[var(--border-emphasis)] text-[var(--text-primary)]'
          }`}
          onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
        >
          {icon(toast.type)}
          <span className="leading-relaxed">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
