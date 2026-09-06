// stages what the app serves from its own jar (icon packs, theme webfonts) so nothing reaches for the internet
// at runtime; each pack ships its own licence
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'icons')

rmSync(join(root, 'dist'), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })

const mdiSrc = join(root, 'node_modules', '@mdi', 'svg')
if (!existsSync(mdiSrc)) {
  console.error('stage-assets: @mdi/svg is not installed')
  process.exit(1)
}
const mdiMeta = JSON.parse(readFileSync(join(mdiSrc, 'meta.json'), 'utf8'))
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
const mdiIndex = mdiMeta.filter((m) => !m.deprecated).map((m) => (m.aliases?.length ? m.name + '|' + m.aliases.join(' ') : m.name))
writeFileSync(join(dest, 'mdi-index.json'), JSON.stringify(mdiIndex))
console.log(`stage-assets: mdi: ${mdiIndex.length} icons staged`)

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
    // pack without category metadata
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
      writeFileSync(join(packDir, name + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${ic.body}</svg>`)
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
  curate: (name, category) => category !== 'Flags' && !((category === 'People & Body' || category === undefined) && hasSkinTone(name))
})
stageIconifyPack({ pkg: 'flat-color-icons', dir: 'fc' })
stageIconifyPack({ pkg: 'meteocons', dir: 'meteo' })

const fontsDir = join(root, 'public', 'fonts')
rmSync(fontsDir, { recursive: true, force: true })
mkdirSync(fontsDir, { recursive: true })

const montSrc = join(root, 'node_modules', '@fontsource-variable', 'montserrat')
if (!existsSync(montSrc)) {
  console.error('stage-assets: @fontsource-variable/montserrat is not installed')
  process.exit(1)
}
cpSync(join(montSrc, 'files', 'montserrat-latin-wght-normal.woff2'), join(fontsDir, 'montserrat.woff2'))
cpSync(join(montSrc, 'LICENSE'), join(fontsDir, 'montserrat-LICENSE.txt'))
console.log('stage-assets: fonts: Montserrat staged')

const dsegSrc = join(root, 'node_modules', 'dseg')
if (!existsSync(dsegSrc)) {
  console.error('stage-assets: dseg is not installed')
  process.exit(1)
}
cpSync(join(dsegSrc, 'fonts', 'DSEG7-Classic', 'DSEG7Classic-BoldItalic.woff2'), join(fontsDir, 'dseg7.woff2'))
cpSync(join(dsegSrc, 'fonts', 'DSEG14-Classic', 'DSEG14Classic-BoldItalic.woff2'), join(fontsDir, 'dseg14.woff2'))
cpSync(join(dsegSrc, 'DSEG-LICENSE.txt'), join(fontsDir, 'dseg-LICENSE.txt'))
console.log('stage-assets: fonts: DSEG staged')

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
