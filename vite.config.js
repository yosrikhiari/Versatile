import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const isDocker = process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production'
const ollamaTarget = isDocker ? 'http://ollama:11434' : 'http://localhost:11434'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/ollama': {
        target: ollamaTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, '')
      }
    }
  }
})
