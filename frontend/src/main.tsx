import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { bootstrapTheme } from '@/lib/theme'
import '@/style.css'

bootstrapTheme()

const root = document.getElementById('app')
if (!root) {
  throw new Error('Root element #app not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)