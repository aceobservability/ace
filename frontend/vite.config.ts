import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'

// Handle both ESM and CommonJS default export
type MonacoEditorPluginModule = typeof monacoEditorPluginModule & {
  default?: typeof monacoEditorPluginModule
}

const monacoEditorPlugin =
  (monacoEditorPluginModule as MonacoEditorPluginModule).default || monacoEditorPluginModule

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService'],
      customWorkers: []
    })
  ],
  server: {
    port: 5173
  },
  test: {
    environment: 'happy-dom',
    globals: true
  }
})
