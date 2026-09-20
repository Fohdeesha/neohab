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
 */
import { chromium } from 'playwright-core'
import { LAUNCH_ARGS } from './target.mjs'

export function launchChromium(opts = {}) {
  const args = [...(opts.args ?? []), ...LAUNCH_ARGS]
  return chromium.launch(args.length ? { ...opts, args } : opts)
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
