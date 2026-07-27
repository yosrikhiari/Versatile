import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

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
        req.on('data', (c) => (body += c))
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
  plugins: [
    vue(),
    debugSnapshotPlugin(),
    // Pre-compress build output so a CDN/nginx can serve .br/.gz via content negotiation.
    // Only assets >1 KB are compressed; originals are kept for clients without br/gzip.
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
      deleteOriginFile: false
    }),
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 1024, deleteOriginFile: false }),
    process.env.ANALYZE === 'true' &&
      visualizer({
        open: true,
        filename: 'debug/bundle-stats.html',
        gzipSize: true,
        brotliSize: true
      })
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/vue') ||
            id.includes('node_modules/pinia') ||
            id.includes('node_modules/vue-router') ||
            id.includes('node_modules/vueuse') ||
            id.includes('node_modules/vuedraggable') ||
            id.includes('node_modules/focus-trap')
          )
            return 'vendor-vue'
          if (id.includes('node_modules/@tiptap')) return 'vendor-tiptap'
          if (id.includes('node_modules/@vue-flow')) return 'vendor-flow'
          if (id.includes('node_modules/dexie')) return 'vendor-dexie'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/pdfjs'))
            return 'vendor-pdf'
          if (id.includes('node_modules/lucide-vue')) return 'vendor-lucide'
          // The BPE rank tables are ~1.7MB (cl100k) and ~3.6MB (o200k) and are
          // only reached through the dynamic import in services/ai/tokenizer.ts.
          // Without this they land in vendor-misc, which is statically imported,
          // and every page load pays for them. Own chunk keeps them lazy.
          if (id.includes('node_modules/gpt-tokenizer')) return 'vendor-tokenizer'
          if (id.includes('node_modules')) return 'vendor-misc'
        }
      }
    }
  },
  server: {
    watch: {
      ignored: ['**/backend/**', '**/obj/**', '**/bin/**']
    },
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
      },
      '/hubs': {
        target: 'http://localhost:5171',
        changeOrigin: true,
        ws: true
      },
      '/api': {
        target: 'http://localhost:5171',
        changeOrigin: true
      }
    }
  }
})
