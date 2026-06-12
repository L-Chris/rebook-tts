import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4177',
      '/audio': 'http://127.0.0.1:4177',
      '/health': 'http://127.0.0.1:4177',
    },
  },
})
