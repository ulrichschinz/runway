import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Vitest reads this config. The suite covers pure logic modules only — no component
  // mounting, no jsdom — so it needs no environment beyond node. See ADR 0007.
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
