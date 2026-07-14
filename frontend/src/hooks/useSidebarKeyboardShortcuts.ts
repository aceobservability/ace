import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerKeydownHandler } from '@/lib/globalKeyboard'
import { SHORTCUT_NAV } from '@/lib/navigation'
import { useSidebarStore } from '@/stores/sidebarStore'

export function useSidebarKeyboardShortcuts(currentPath: string) {
  const navigate = useNavigate()

  useEffect(() => {
    return registerKeydownHandler(event => {
      const { isPinned, togglePin, closeSection } = useSidebarStore.getState()

      if (event.key === 'Escape') {
        if (isPinned) {
          togglePin(currentPath)
        } else {
          closeSection()
        }
        return true
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault()
        togglePin(currentPath)
        return true
      }

      if ((event.metaKey || event.ctrlKey) && SHORTCUT_NAV[event.key]) {
        event.preventDefault()
        const { section, route } = SHORTCUT_NAV[event.key]
        navigate(route)
        if (section !== 'home') {
          useSidebarStore.setState({ expandedSection: section })
        }
        return true
      }

      return false
    })
  }, [currentPath, navigate])
}