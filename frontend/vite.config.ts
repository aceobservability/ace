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
    // Listen on all interfaces so Tailscale (and other LAN) can reach the dev server.
    host: true,
    port: 5173,
    // Dev-only: Vite 6+ rejects unknown Host headers (machine name, MagicDNS, etc.).
    // Production is nginx/static — this only affects `vite` / `vite preview`.
    allowedHosts: true,
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
    ],
  },
} as UserConfig & { test: unknown })