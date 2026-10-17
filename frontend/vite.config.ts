import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the framework and the Markdown renderer in their own chunks so
        // the assistant's rendering dependencies are cached independently and
        // the entry chunk stays small.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
})
