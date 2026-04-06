import { ref } from 'vue'

interface Toast {
  id: number
  message: string
  type: string
  timestamp: number
}

const toasts = ref<Toast[]>([])
let nextId = 1

function show(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const id = nextId++
  const toast: Toast = {
    id,
    message,
    type,
    timestamp: Date.now(),
  }
  toasts.value.push(toast)

  setTimeout(() => {
    dismiss(id)
  }, 5000)
}

function dismiss(id: number): void {
  const index = toasts.value.findIndex((t) => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

export function useToast() {
  return {
    toasts,
    show,
    dismiss,
  }
}
