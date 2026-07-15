import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, type UserConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Vue legacy specs (.spec.ts) — React ports use .spec.tsx in the same folders
      'src/components/**/*.spec.ts',
      'src/views/**',
      'src/composables/**',
      'src/App.spec.ts',
      'src/utils/panelRegistry.spec.ts',
    ],
  },
} as UserConfig & { test: unknown })