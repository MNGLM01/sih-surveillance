import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/cameras': 'http://127.0.0.1:8000',
      '/events': 'http://127.0.0.1:8000',
      '/incidents': 'http://127.0.0.1:8000',
      '/evidence': 'http://127.0.0.1:8000',
      '/live': 'http://127.0.0.1:8000',
      '/anpr': 'http://127.0.0.1:8000',
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
})
