/**
 * Target configuration for the e2e suites.
 *
 * The suites run against a live openHAB server with the neohab jar deployed. Nothing about
 * that server is hardcoded here: copy `target.example.json` to `target.local.json` (gitignored)
 * next to the suites and fill in your server, token and test items. Environment variables
 * override the file: NEOHAB_E2E_BASE, NEOHAB_E2E_TOKEN, NEOHAB_E2E_TOKEN_FILE,
 * NEOHAB_E2E_TARGET (path to an alternative target json).
 *
 * The test items are commanded by some suites (and always restored to their recorded initial
 * state) - see README.md for the exact semantics before pointing them at real devices.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cfgPath = process.env.NEOHAB_E2E_TARGET ?? resolve(here, '..', 'target.local.json')

let cfg
try {
  cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
} catch {
  console.error(
    `e2e: no target configuration at ${cfgPath}\n` +
      'Copy e2e/target.example.json to e2e/target.local.json and fill it in (see e2e/README.md).'
  )
  process.exit(2)
}

export const BASE = String(process.env.NEOHAB_E2E_BASE ?? cfg.baseUrl ?? '').replace(/\/+$/, '')
if (!BASE) {
  console.error('e2e: baseUrl missing from the target configuration')
  process.exit(2)
}

export const APP = BASE + '/neohab/index.html'
export const NS = BASE + '/rest/ui/components/neohab:config'

function loadToken() {
  if (process.env.NEOHAB_E2E_TOKEN) return process.env.NEOHAB_E2E_TOKEN.trim()
  if (typeof cfg.token === 'string' && cfg.token) return cfg.token.trim()
  const file = process.env.NEOHAB_E2E_TOKEN_FILE ?? cfg.tokenFile
  if (!file) {
    console.error('e2e: no token: set "token" or "tokenFile" in the target configuration')
    process.exit(2)
  }
  try {
    return readFileSync(resolve(dirname(cfgPath), file), 'utf8').trim()
  } catch {
    console.error(`e2e: token file not readable: ${file}`)
    process.exit(2)
  }
}

/** Admin API token ("oh." prefixed) - required, the suites verify admin-only paths with it. */
export const TOKEN = loadToken()
export const AUTH = { Authorization: 'Bearer ' + TOKEN }

/** The five test items - semantics documented in README.md. */
export const ITEMS = cfg.items ?? {}
for (const key of ['dimmer', 'color', 'switch', 'temperature', 'player']) {
  if (typeof ITEMS[key] !== 'string' || !ITEMS[key]) {
    console.error(`e2e: items.${key} missing from the target configuration (see README.md)`)
    process.exit(2)
  }
}
