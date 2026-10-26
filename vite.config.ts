import { svelte } from '@sveltejs/vite-plugin-svelte'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Public files to precache: everything except generated elevation data. */
function publicFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(dir, join(entry.parentPath, entry.name))}`)
    .filter((path) => !path.startsWith('/terrain/'))
}

/**
 * Emits sw.js from src/service-worker.js with the list of built files to precache
 * and a version derived from them, so each build replaces the cached app shell.
 */
function serviceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'hike-and-fly-service-worker',
    apply: 'build',
    // After the HTML plugin, so index.html is in the bundle.
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map'))
        .map((file) => `/${file}`)
      const precache = ['/', ...built, ...publicFiles(publicDir)].sort()
      const hash = createHash('sha256')
      for (const file of Object.values(bundle)) hash.update(file.type === 'chunk' ? file.code : file.source)
      const source = readFileSync('src/service-worker.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), serviceWorker()],
  worker: { format: 'es' },
})
