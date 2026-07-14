import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export type Toast = {
  id: number
  message: string
  type: ToastType
  timestamp: number
}

let nextId = 1

type ToastState = {
  toasts: Toast[]
  show: (message: string, type?: ToastType) => void
  dismiss: (id: number) => void
  _reset: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show(message, type = 'info') {
    const id = nextId++
    const toast: Toast = { id, message, type, timestamp: Date.now() }
    set(state => ({ toasts: [...state.toasts, toast] }))
    setTimeout(() => {
      get().dismiss(id)
    }, 5000)
  },

  dismiss(id) {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },

  _reset() {
    nextId = 1
    set({ toasts: [] })
  },
}))