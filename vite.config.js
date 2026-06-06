import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function debugSnapshotPlugin() {
  const debugDir = resolve(__dirname, 'debug')

  return {
    name: 'debug-snapshot',
    configureServer(server) {
      if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true })

      server.middlewares.use('/__debug/snapshot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let body = ''
        req.on('data', c => (body += c))
        req.on('end', () => {
          try {
            const { stage, data } = JSON.parse(body)
            const safe = stage.replace(/[^a-z0-9-]/g, '_')
            writeFileSync(resolve(debugDir, `${safe}.json`), JSON.stringify(data, null, 2))
            res.end(JSON.stringify({ ok: true }))
          } catch {
            res.end(JSON.stringify({ ok: false }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), debugSnapshotPlugin()],
  build: {
    chunkSizeWarningLimit: 2500
  },
  server: {
    port: 5173,
    hmr: {
      port: 5173
    },
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, '')
      },
      '/sdapi': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sdapi/, '/sdapi')
      }
    }
  }
})
