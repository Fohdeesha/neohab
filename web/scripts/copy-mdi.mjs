/**
 * Stages the Material Design Icons set (npm @mdi/svg, Apache-2.0) into public/ so the built
 * app serves them offline from the add-on jar:
 *   public/icons/mdi/<name>.svg   - one file per icon, fetched on demand
 *   public/icons/mdi-index.json   - compact search index: ["name|alias alias…", ...]
 *   public/icons/mdi/LICENSE      - upstream license, shipped alongside the icons
 * public/icons is generated output and gitignored. Runs before dev and build.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@mdi', 'svg')
const dest = join(root, 'public', 'icons')

// Clear dist/ here with retries: on Windows, vite's own emptyDir intermittently fails with
// ENOTEMPTY/EBUSY while a scanner holds one of the thousands of staged icon files open.
rmSync(join(root, 'dist'), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

if (!existsSync(src)) {
  console.error('copy-mdi: @mdi/svg is not installed')
  process.exit(1)
}

const meta = JSON.parse(readFileSync(join(src, 'meta.json'), 'utf8'))
const already = existsSync(join(dest, 'mdi')) ? readdirSync(join(dest, 'mdi')).length : 0

mkdirSync(join(dest, 'mdi'), { recursive: true })
if (already < meta.length) {
  cpSync(join(src, 'svg'), join(dest, 'mdi'), { recursive: true })
  cpSync(join(src, 'LICENSE'), join(dest, 'mdi', 'LICENSE'))
}

const index = meta
  .filter((m) => !m.deprecated)
  .map((m) => (m.aliases?.length ? m.name + '|' + m.aliases.join(' ') : m.name))
writeFileSync(join(dest, 'mdi-index.json'), JSON.stringify(index))
console.log(`copy-mdi: ${index.length} icons staged`)
