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
/**
 * The version history's own namespaces: the index, and the snapshots plus shared image bodies.
 * Separate from the configuration, and just as much a user's data - the snapshot/wipe/restore
 * tools cover all three, so a wipe cycle cannot destroy someone's restore points.
 */
export const HISTORY_NS = BASE + '/rest/ui/components/neohab:history'
export const HISTORY_DATA_NS = BASE + '/rest/ui/components/neohab:historydata'

/** Every namespace neohab owns, in the order a restore should write them. */
export const ALL_NS = [
  ['config', NS],
  ['history', HISTORY_NS],
  ['historydata', HISTORY_DATA_NS],
]

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

/**
 * Optional display-only item whose state pattern appends a unit (e.g. `%.0f %%` on a
 * humidity item). e2e-ember uses it to prove a formatted state splits into number + unit for
 * the stat-tile typography; it is only ever read, never commanded. Without one that check
 * self-skips. Env override: NEOHAB_E2E_FORMATTED_ITEM.
 */
export const FORMATTED_ITEM = process.env.NEOHAB_E2E_FORMATTED_ITEM ?? ITEMS.formatted ?? null

/**
 * Optional throwaway login for the full credential-exchange test (e2e-signin): a user that
 * exists on the target server and may be signed in and out freely. Without one the exchange
 * section self-skips - everything up to the server's login form is still covered. Create one
 * with `openhab:users add <name> <password> administrator` in the karaf console and remove it
 * with `openhab:users remove <name>` afterwards. Env overrides: NEOHAB_E2E_USER /
 * NEOHAB_E2E_PASSWORD.
 */
const userName = process.env.NEOHAB_E2E_USER ?? cfg.user?.name
const userPassword = process.env.NEOHAB_E2E_PASSWORD ?? cfg.user?.password
export const TEST_USER = userName && userPassword ? { name: String(userName), password: String(userPassword) } : null

/**
 * Optional camera server for the camera suite (e2e-camera): a go2rtc or Frigate server
 * reachable from the machine running the suites, plus the name of a stream on it. Without one
 * the live-video sections self-skip; URL building, the settings form and the failure paths are
 * covered either way. Env overrides: NEOHAB_E2E_CAMERA_SERVER / NEOHAB_E2E_CAMERA_STREAM.
 */
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
