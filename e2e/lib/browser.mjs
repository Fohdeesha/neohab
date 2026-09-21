/**
 * One place the suites get a browser from.
 *
 * Every suite launched its own with a literal option object, in about ten slightly different
 * shapes, which was fine while there was nothing to say to all of them at once. Testing against an
 * HTTPS target is exactly that: the certificate has to be accepted at launch, and a rule applied
 * in sixty-two places by hand is wrong in some of them.
 *
 * A drop-in for `chromium.launch`: same argument, same promise, with the target's own launch
 * arguments merged in. A suite that passes `args` of its own (the kiosk suite's insecure-origin
 * flag) keeps them.
 *
 * It is also where a browser is guaranteed to be shut: a profile left in %TEMP% is a launch that
 * never reached its close, and 68 of the 69 suites only close inside their own `finally`, which
 * cannot catch a Ctrl-C or a throw before the try begins. Both are handled here for all of them,
 * and `tempclean` clears what a hard kill still manages to leave.
 */
import { chromium } from 'playwright-core'
import { LAUNCH_ARGS } from './target.mjs'
import { sweepBrowserTemp, sweepSummary } from './tempclean.mjs'

const summary = sweepSummary(sweepBrowserTemp())
if (summary) console.log(summary)

const live = new Set()

function track(browser) {
  live.add(browser)
  browser.on('disconnected', () => live.delete(browser))
  return browser
}

function closeLive() {
  const all = [...live]
  live.clear()
  return Promise.race([
    Promise.allSettled(all.map((b) => b.close().catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ])
}

let bailing = false

function bail(code) {
  if (bailing) process.exit(code)
  bailing = true
  const done = () => process.exit(code)
  closeLive().then(done, done)
}

process.on('SIGINT', () => bail(130))
process.on('SIGTERM', () => bail(143))
// node would print these and exit 1 by itself; the point of taking them over is the close, so
// they print the same thing and keep the same exit code
process.on('uncaughtException', (err) => {
  console.error(err)
  bail(1)
})
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
  bail(1)
})

export async function launchChromium(opts = {}) {
  const args = [...(opts.args ?? []), ...LAUNCH_ARGS]
  return track(await chromium.launch(args.length ? { ...opts, args } : opts))
}

// Chrome first: Playwright gives each launch a fresh user-data-dir, and Edge derives a new
// AppUserModelID from it and writes a jump list under %APPDATA%\...\Recent\CustomDestinations - one
// permanent file per suite, per run, for ever. Chrome writes none. Measured on Windows over a full
// 63-suite battery: 155 files before, 155 after.
const CHANNELS = ['chrome', 'msedge']

export async function launchBrowser(opts = {}) {
  for (const channel of CHANNELS) {
    try {
      return await launchChromium({ headless: true, ...opts, channel })
    } catch {}
  }
  return launchChromium({ headless: true, ...opts })
}
