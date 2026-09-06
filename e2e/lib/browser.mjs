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

/**
 * The same, choosing a browser that is actually installed.
 *
 * Playwright's own chromium is not downloaded on every box, so the suites try the system Edge and
 * Chrome first and fall back to it. `await` inside the try on purpose: `launch` returns a rejected
 * promise for a channel that is missing, and a `try` without it catches nothing at all.
 */
export async function launchBrowser(opts = {}) {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await launchChromium({ headless: true, ...opts, channel })
    } catch {}
  }
  return launchChromium({ headless: true, ...opts })
}
