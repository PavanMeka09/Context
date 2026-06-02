import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/searxng': {
        target: 'http://localhost:8082',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/searxng/, ''),
      }
    }
  }
})
