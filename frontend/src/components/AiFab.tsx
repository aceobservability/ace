import { Sparkles } from 'lucide-react'
import { useAiSidebarStore } from '@/stores/aiSidebarStore'

export function AiFab() {
  const isOpen = useAiSidebarStore(state => state.isOpen)
  const open = useAiSidebarStore(state => state.open)

  if (isOpen) return null

  return (
    <button
      type="button"
      data-testid="ai-fab"
      className="fixed z-40 flex cursor-pointer items-center justify-center border-none transition-transform duration-150 hover:scale-105"
      style={{
        bottom: '20px',
        right: '20px',
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        backgroundColor: 'var(--color-primary)',
        color: '#0B0D0F',
        boxShadow: '0 4px 20px rgba(201, 150, 15, 0.3)',
      }}
      title="AI Copilot"
      onClick={() => open()}
    >
      <Sparkles size={18} aria-hidden />
    </button>
  )
}
