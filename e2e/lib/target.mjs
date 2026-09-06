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
 * Testing against an HTTPS target.
 *
 * openHAB's own certificate is self-signed, so both halves of the harness refuse it by default:
 * Node's fetch (which every seed, read and cleanup runs on) rejects with a certificate error, and
 * the browser will not navigate. Accepting it is a decision about the TEST BOX, not about the app,
 * so it is made once, here, from the target's own address rather than by each suite.
 *
 * The browser flag rather than a per-context `ignoreHTTPSErrors`: a context option would have to
 * be threaded through every `newPage()` in 62 suites, and it would still leave the page an
 * INSECURE context - so a service worker never registers and the PWA half could not be tested at
 * all. The flag makes the origin trusted, which is what a real deployment with a real certificate
 * gets.
 */
export const HTTPS = BASE.startsWith('https:')
/**
 * The scheme for a fixture address on a host that deliberately never answers.
 *
 * Several suites frame or stream one to watch what a widget does when nothing arrives. The
 * scheme is incidental to that, but not to the browser: an `http://` subresource in an https
 * page is refused as mixed content before the widget gets a chance, so a hardcoded one turns
 * those checks into a mixed-content test by accident. Following the page's own scheme keeps
 * each check about what it was written for; e2e-https covers mixed content deliberately.
 */
export const UNREACHABLE = HTTPS ? 'https://' : 'http://'
export const LAUNCH_ARGS = HTTPS ? ['--ignore-certificate-errors'] : []
if (HTTPS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
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

/**
 * Is a failing resource one of OURS?
 *
 * A live openHAB carries the user's own configuration, and real configurations reference icon
 * sets that were renamed years ago and hosts that no longer answer. Those 404s are the user's
 * data, not a defect in the app, and a suite that fails on them cannot be run against a real
 * server. Anything under the add-on's own path or the REST API is ours and must still fail the
 * run; an error with no URL at all is a real exception and is always kept.
 *
 * Pair it with the URL: `page.on('console')` gives "Failed to load resource: ... 404" with no
 * hint of WHICH resource, and a failure nobody can act on is barely a failure at all.
 */
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
 * Optional display-only item whose formatted state carries exactly one decimal digit (e.g. a
 * `%.1f` temperature). e2e-lcd uses it to prove the lone tenths digit splits into its own
 * raised span for the segment-display typography; it is only ever read, never commanded.
 * Without one that check self-skips. Env override: NEOHAB_E2E_DECIMAL_ITEM.
 */
export const DECIMAL_ITEM = process.env.NEOHAB_E2E_DECIMAL_ITEM ?? ITEMS.decimal ?? null

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
