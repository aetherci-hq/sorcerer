import { create } from 'zustand'

export type ToastType = 'success' | 'info' | 'error'

export interface Toast {
  id: string
  message: string
  type: ToastType
  dismissing?: boolean
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
  pauseToast: (id: string) => void
  resumeToast: (id: string) => void
}

let toastId = 0

const DISPLAY_MS = 3000
const DISMISS_MS = 200

// Track timers per toast so we can cancel on hover
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleDismiss(id: string, set: (fn: (state: ToastState) => Partial<ToastState>) => void, delay: number) {
  const timer = setTimeout(() => {
    timers.delete(id)
    set((state) => ({
      toasts: state.toasts.map((t) => t.id === id ? { ...t, dismissing: true } : t)
    }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, DISMISS_MS)
  }, delay)
  timers.set(id, timer)
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'info') => {
    const id = `toast-${++toastId}`
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    scheduleDismiss(id, set, DISPLAY_MS)
  },

  removeToast: (id) => {
    // Cancel any pending timer
    const timer = timers.get(id)
    if (timer) { clearTimeout(timer); timers.delete(id) }

    set((state) => ({
      toasts: state.toasts.map((t) => t.id === id ? { ...t, dismissing: true } : t)
    }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, DISMISS_MS)
  },

  pauseToast: (id) => {
    const timer = timers.get(id)
    if (timer) { clearTimeout(timer); timers.delete(id) }
  },

  resumeToast: (id) => {
    // Resume with a shorter delay (1s) after un-hover
    scheduleDismiss(id, set, 1000)
  }
}))
