import { Keyboard, LogOut, Moon, Sun } from 'lucide-react'
import { useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useKeyboardShortcutsStore } from '@/lib/keyboardShortcuts'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

type SidebarUserMenuProps = {
  isOpen: boolean
  onClose: () => void
}

export function SidebarUserMenu({ isOpen, onClose }: SidebarUserMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore(state => state.user)
  const logout = useAuthStore(state => state.logout)
  const setShowHelp = useKeyboardShortcutsStore(state => state.setShowHelp)
  const { mode, toggle: toggleTheme } = useThemeStore()

  useClickOutside(menuRef, isOpen, onClose)

  if (!isOpen) return null

  async function handleLogout() {
    await logout()
    onClose()
  }

  function handleShowShortcuts() {
    setShowHelp(true)
    onClose()
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      ref={menuRef}
      data-testid="user-menu"
      className="animate-fade-in fixed z-[60] overflow-hidden"
      style={{
        left: '8px',
        bottom: '52px',
        width: '240px',
        backgroundColor: 'var(--color-surface-bright)',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid var(--color-stroke-subtle)',
      }}
      onKeyDown={handleKeydown}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-stroke-subtle)' }}>
        <div className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
          {user?.name || user?.email}
        </div>
        {user?.name && (
          <div
            className="mt-0.5 text-xs"
            style={{ color: 'var(--color-outline)', fontFamily: 'var(--font-mono)' }}
          >
            {user.email}
          </div>
        )}
      </div>

      <div className="py-1">
        <button
          type="button"
          data-testid="user-menu-theme-toggle"
          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-2 text-sm"
          style={{ color: 'var(--color-on-surface-variant)' }}
          onClick={toggleTheme}
        >
          {mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{mode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button
          type="button"
          data-testid="user-menu-shortcuts"
          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-2 text-sm"
          style={{ color: 'var(--color-on-surface-variant)' }}
          onClick={handleShowShortcuts}
        >
          <Keyboard size={14} />
          <span>Keyboard shortcuts</span>
        </button>
        <button
          type="button"
          data-testid="user-menu-logout"
          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-2 text-sm"
          style={{ color: 'var(--color-error)' }}
          onClick={() => void handleLogout()}
        >
          <LogOut size={14} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  )
}