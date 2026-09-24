/**
 * Target configuration for the e2e suites.
 *
 * The suites run against a live openHAB server with the neohab jar deployed. Nothing about
 * that server is hardcoded here: copy `target.example.json` to a `target.<name>.json` of your own
 * (gitignored) and fill in your server, token and test items, then name that file in
 * NEOHAB_E2E_TARGET on every command. There is no default. Environment variables override the
 * file: NEOHAB_E2E_BASE, NEOHAB_E2E_TOKEN, NEOHAB_E2E_TOKEN_FILE.
 *
 * `"production": true` in a target file marks a server somebody relies on: the wipe tools and the
 * wipe-cycle suites refuse to run against it, and suites that would create items skip that part.
 *
 * The test items are commanded by some suites (and always restored to their recorded initial
 * state) - see README.md for the exact semantics before pointing them at real devices.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

if (!process.env.NEOHAB_E2E_TARGET) {
  console.error(
    'e2e: NEOHAB_E2E_TARGET is not set, so there is no server to run against.\n' +
      'Name the target file on every command, for example:\n' +
      '  NEOHAB_E2E_TARGET=./target.test.json node e2e-corners.mjs\n' +
      'There is no default target, so nothing can reach a server by accident (see e2e/README.md).'
  )
  process.exit(2)
}

export const TARGET_FILE = resolve(process.env.NEOHAB_E2E_TARGET)
const cfgPath = TARGET_FILE

let cfg
try {
  cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
} catch {
  console.error(
    `e2e: no readable target configuration at ${cfgPath}\n` +
      'Copy e2e/target.example.json, fill it in and point NEOHAB_E2E_TARGET at it (see e2e/README.md).'
  )
  process.exit(2)
}

// anything but absent or false counts, so a typo in the flag fails safe
export const PRODUCTION = cfg.production !== undefined && cfg.production !== false

export const BASE = String(process.env.NEOHAB_E2E_BASE ?? cfg.baseUrl ?? '').replace(/\/+$/, '')
if (!BASE) {
  console.error('e2e: baseUrl missing from the target configuration')
  process.exit(2)
}

export const APP = BASE + '/neohab/index.html'
export const NS = BASE + '/rest/ui/components/neohab:config'

export const HTTPS = BASE.startsWith('https:')
export const UNREACHABLE = HTTPS ? 'https://' : 'http://'
// a plain-http origin for the mixed-content fixtures: this same server with its scheme swapped, so no
// suite carries anyone's network address. It never has to answer - a browser refuses mixed content
// before it opens a connection. Override with "plainHttp" in the target file if a real one is wanted.
export const PLAIN_HTTP = String(cfg.plainHttp ?? BASE.replace(/^https:/, 'http:')).replace(/\/+$/, '')
export const LAUNCH_ARGS = HTTPS ? ['--ignore-certificate-errors'] : []
if (HTTPS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
export const HISTORY_NS = BASE + '/rest/ui/components/neohab:history'
export const HISTORY_DATA_NS = BASE + '/rest/ui/components/neohab:historydata'

export const ALL_NS = [
  ['config', NS],
  ['history', HISTORY_NS],
  ['historydata', HISTORY_DATA_NS],
]

export function isAppResource(url) {
  if (!url) return true
  return url.startsWith(BASE + '/neohab/') || url.startsWith(BASE + '/rest/')
}

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

export const TOKEN = loadToken()
export const AUTH = { Authorization: 'Bearer ' + TOKEN }

export const ITEMS = cfg.items ?? {}
for (const key of ['dimmer', 'color', 'switch', 'temperature', 'player']) {
  if (typeof ITEMS[key] !== 'string' || !ITEMS[key]) {
    console.error(`e2e: items.${key} missing from the target configuration (see README.md)`)
    process.exit(2)
  }
}

export const FORMATTED_ITEM = process.env.NEOHAB_E2E_FORMATTED_ITEM ?? ITEMS.formatted ?? null

export const DECIMAL_ITEM = process.env.NEOHAB_E2E_DECIMAL_ITEM ?? ITEMS.decimal ?? null

const userName = process.env.NEOHAB_E2E_USER ?? cfg.user?.name
const userPassword = process.env.NEOHAB_E2E_PASSWORD ?? cfg.user?.password
export const TEST_USER = userName && userPassword ? { name: String(userName), password: String(userPassword) } : null

const cameraServer = process.env.NEOHAB_E2E_CAMERA_SERVER ?? cfg.camera?.server
const cameraStream = process.env.NEOHAB_E2E_CAMERA_STREAM ?? cfg.camera?.stream
export const CAMERA =
  cameraServer && cameraStream
    ? {
        server: String(cameraServer).replace(/\/+$/, ''),
        stream: String(cameraStream),
        kind: cfg.camera?.kind === 'frigate' ? 'frigate' : 'go2rtc',
      }
    : null
