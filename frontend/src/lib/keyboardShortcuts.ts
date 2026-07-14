import { registerKeydownHandler } from '@/lib/globalKeyboard'
import { createShortcutRegistry } from '@/lib/keyboardShortcutsCore'
import { create } from 'zustand'

const registry = createShortcutRegistry()

type ShortcutState = {
  showHelp: boolean
  shortcuts: ReturnType<typeof registry.list>
  register: (shortcut: string, callback: () => void, label: string, category: string) => () => void
  toggleHelp: () => void
  setShowHelp: (show: boolean) => void
  _reset: () => void
}

function registerHelpShortcut(): void {
  registry.register(
    'Cmd+/',
    () => {
      const { showHelp } = useKeyboardShortcutsStore.getState()
      useKeyboardShortcutsStore.setState({ showHelp: !showHelp })
    },
    'Toggle shortcuts help',
    'General',
  )
}

export const useKeyboardShortcutsStore = create<ShortcutState>((set, get) => ({
  showHelp: false,
  shortcuts: registry.list(),

  register(shortcut, callback, label, category) {
    const unregister = registry.register(shortcut, callback, label, category)
    set({ shortcuts: registry.list() })
    return () => {
      unregister()
      set({ shortcuts: registry.list() })
    }
  },

  toggleHelp() {
    set({ showHelp: !get().showHelp })
  },

  setShowHelp(show) {
    set({ showHelp: show })
  },

  _reset() {
    registry.reset()
    set({ showHelp: false, shortcuts: [] })
    registerHelpShortcut()
    set({ shortcuts: registry.list() })
  },
}))

registerHelpShortcut()
useKeyboardShortcutsStore.setState({ shortcuts: registry.list() })

registerKeydownHandler(event => registry.dispatch(event))