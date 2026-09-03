/**
 * Stages everything the built app serves from its own jar rather than fetching: the icon packs,
 * the webfonts the structural themes use, and (nothing here, but next in the build) the rendered
 * documentation. Nothing neohab ships reaches for the internet at runtime, and this is where that
 * is arranged. It also clears `dist/`, for the Windows reason noted below.
 *
 * One directory + one compact search index per icon pack:
 *   public/icons/mdi/<name>.svg    + icons/mdi-index.json    - Material Design Icons (@mdi/svg,
 *       Apache-2.0): ~7k monochrome glyphs, tinted by the app via CSS mask
 *   public/icons/fluent/<name>.svg + icons/fluent-index.json - Fluent Emoji flat (MIT): full-color
 *       set, curated for dashboards (skin-tone variants and flags removed)
 *   public/icons/fc/<name>.svg     + icons/fc-index.json     - icons8 flat-color-icons (MIT)
 *   public/icons/meteo/<name>.svg  + icons/meteo-index.json  - Meteocons (MIT): animated
 *       full-color weather icons
 * Each pack directory also carries its upstream LICENSE/ATTRIBUTION file.
 * public/icons is generated output and gitignored. Runs before dev and build.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'icons')

// Clear dist/ here with retries: on Windows, vite's own emptyDir intermittently fails with
// ENOTEMPTY/EBUSY while a scanner holds one of the thousands of staged icon files open.
rmSync(join(root, 'dist'), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

/* ------------------------------ Material Design Icons ------------------------------ */

const mdiSrc = join(root, 'node_modules', '@mdi', 'svg')
if (!existsSync(mdiSrc)) {
  console.error('stage-assets: @mdi/svg is not installed')
  process.exit(1)
}
const mdiMeta = JSON.parse(readFileSync(join(mdiSrc, 'meta.json'), 'utf8'))
// Version-stamped like the Iconify packs below, and for the same reason: the previous test was
// "does the directory hold fewer files than the package lists?", which is false after an upgrade
// to a version with the same or fewer icons - so the old SVGs stayed on disk while the search
// index listed the new names, and the difference rendered as missing icons.
const mdiVersion = JSON.parse(readFileSync(join(mdiSrc, 'package.json'), 'utf8')).version
const mdiStampFile = join(dest, 'mdi.stamp')
const mdiStamp = `${mdiVersion}:${mdiMeta.length}`
if (!existsSync(mdiStampFile) || readFileSync(mdiStampFile, 'utf8') !== mdiStamp) {
  rmSync(join(dest, 'mdi'), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  mkdirSync(join(dest, 'mdi'), { recursive: true })
  cpSync(join(mdiSrc, 'svg'), join(dest, 'mdi'), { recursive: true })
  cpSync(join(mdiSrc, 'LICENSE'), join(dest, 'mdi', 'LICENSE'))
  writeFileSync(mdiStampFile, mdiStamp)
}
const mdiIndex = mdiMeta
  .filter((m) => !m.deprecated)
  .map((m) => (m.aliases?.length ? m.name + '|' + m.aliases.join(' ') : m.name))
writeFileSync(join(dest, 'mdi-index.json'), JSON.stringify(mdiIndex))
console.log(`stage-assets: mdi: ${mdiIndex.length} icons staged`)

/* ------------------------------ Iconify JSON packs ------------------------------ */

// Fluent emoji skin-tone variants: "-light", "-medium-dark", doubled on two-person emoji.
const TONE_SUFFIX = /-(?:light|medium-light|medium|medium-dark|dark)$/
function hasSkinTone(name) {
  let n = name
  let found = false
  while (TONE_SUFFIX.test(n)) {
    n = n.replace(TONE_SUFFIX, '')
    found = true
  }
  return found
}

function stageIconifyPack({ pkg, dir, curate }) {
  const base = join(root, 'node_modules', '@iconify-json', pkg)
  if (!existsSync(base)) {
    console.error(`stage-assets: @iconify-json/${pkg} is not installed`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(join(base, 'icons.json'), 'utf8'))
  const info = JSON.parse(readFileSync(join(base, 'info.json'), 'utf8'))
  const version = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')).version
  let catByName = {}
  try {
    const categories = JSON.parse(readFileSync(join(base, 'metadata.json'), 'utf8')).categories ?? {}
    for (const [cat, names] of Object.entries(categories)) for (const n of names) catByName[n] = cat
  } catch {
    /* pack without category metadata */
  }

  const kept = Object.keys(data.icons)
    .filter((n) => !data.icons[n].hidden && (!curate || curate(n, catByName[n])))
    .sort()

  const packDir = join(dest, dir)
  const stampFile = join(dest, dir + '.stamp')
  const stamp = `${version}:${kept.length}`
  if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== stamp) {
    rmSync(packDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    mkdirSync(packDir, { recursive: true })
    for (const name of kept) {
      const ic = data.icons[name]
      const w = ic.width ?? data.width ?? 16
      const h = ic.height ?? data.height ?? 16
      const viewBox = `${ic.left ?? 0} ${ic.top ?? 0} ${w} ${h}`
      writeFileSync(
        join(packDir, name + '.svg'),
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${ic.body}</svg>`
      )
    }
    writeFileSync(
      join(packDir, 'ATTRIBUTION.txt'),
      `${info.name}\n` +
        `Author: ${info.author?.name ?? 'unknown'} (${info.author?.url ?? ''})\n` +
        `License: ${info.license?.title ?? ''} (${info.license?.spdx ?? ''}) ${info.license?.url ?? ''}\n` +
        `Bundled unmodified from https://www.npmjs.com/package/@iconify-json/${pkg} (icon data via Iconify).\n`
    )
    writeFileSync(stampFile, stamp)
  }

  // Fold alias names (alternate spellings) into their parent's search terms.
  const aliasTerms = {}
  const keptSet = new Set(kept)
  for (const [alias, spec] of Object.entries(data.aliases ?? {})) {
    if (keptSet.has(spec.parent)) (aliasTerms[spec.parent] ??= []).push(alias)
  }
  const index = kept.map((n) => (aliasTerms[n] ? n + '|' + aliasTerms[n].join(' ') : n))
  writeFileSync(join(dest, dir + '-index.json'), JSON.stringify(index))
  console.log(`stage-assets: ${pkg} -> ${dir}: ${index.length} icons staged`)
}

stageIconifyPack({
  pkg: 'fluent-emoji-flat',
  dir: 'fluent',
  // Dashboard curation: no flags, no skin-tone variants (a handful of tone variants are
  // missing from the category metadata, so uncategorized names get the tone filter too).
  curate: (name, category) =>
    category !== 'Flags' && !((category === 'People & Body' || category === undefined) && hasSkinTone(name)),
})
stageIconifyPack({ pkg: 'flat-color-icons', dir: 'fc' })
stageIconifyPack({ pkg: 'meteocons', dir: 'meteo' })

/* ------------------------------ Fonts ------------------------------ */

// Each theme that needs a font declares it via @font-face in its own CSS, so a face is only ever
// downloaded when that theme is active. The directory is rebuilt from scratch on every run: a
// face a theme stopped using would otherwise stay staged and ride into the jar for good.
const fontsDir = join(root, 'public', 'fonts')
rmSync(fontsDir, { recursive: true, force: true })
mkdirSync(fontsDir, { recursive: true })

// Montserrat (OFL-1.1) - the Operations theme's geometric sans: light weights for the big
// readouts, semibold for the spaced uppercase micro-labels, from one variable file.
const montSrc = join(root, 'node_modules', '@fontsource-variable', 'montserrat')
if (!existsSync(montSrc)) {
  console.error('stage-assets: @fontsource-variable/montserrat is not installed')
  process.exit(1)
}
cpSync(join(montSrc, 'files', 'montserrat-latin-wght-normal.woff2'), join(fontsDir, 'montserrat.woff2'))
cpSync(join(montSrc, 'LICENSE'), join(fontsDir, 'montserrat-LICENSE.txt'))
console.log('stage-assets: fonts: Montserrat staged')

// DSEG (OFL-1.1) - segment-display faces for the LCD Console theme: 7-segment for digits,
// 14-segment for alphanumerics, both in the slanted weight the real consoles use. Declared
// via @font-face in the theme's CSS, so they only download when that theme is active.
const dsegSrc = join(root, 'node_modules', 'dseg')
if (!existsSync(dsegSrc)) {
  console.error('stage-assets: dseg is not installed')
  process.exit(1)
}
cpSync(join(dsegSrc, 'fonts', 'DSEG7-Classic', 'DSEG7Classic-BoldItalic.woff2'), join(fontsDir, 'dseg7.woff2'))
cpSync(join(dsegSrc, 'fonts', 'DSEG14-Classic', 'DSEG14Classic-BoldItalic.woff2'), join(fontsDir, 'dseg14.woff2'))
cpSync(join(dsegSrc, 'DSEG-LICENSE.txt'), join(fontsDir, 'dseg-LICENSE.txt'))
console.log('stage-assets: fonts: DSEG staged')

// Poppins (OFL-1.1) - the Assembly theme's rounded geometric sans, in the three weights the
// board uses (labels / titles / readings). Static faces, so one file per weight.
const popSrc = join(root, 'node_modules', '@fontsource', 'poppins')
if (!existsSync(popSrc)) {
  console.error('stage-assets: @fontsource/poppins is not installed')
  process.exit(1)
}
for (const w of [400, 500, 600]) {
  cpSync(join(popSrc, 'files', `poppins-latin-${w}-normal.woff2`), join(fontsDir, `poppins-${w}.woff2`))
}
cpSync(join(popSrc, 'LICENSE'), join(fontsDir, 'poppins-LICENSE.txt'))
console.log('stage-assets: fonts: Poppins staged')
