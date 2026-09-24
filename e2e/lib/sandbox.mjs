/**
 * Keeps the app's writes to shared server state inside the browser.
 *
 * Two things a suite can write without meaning to are read by everybody else on that server: the
 * version history (a restore point per save, pruned to a retention limit, so a run's points push a
 * person's own out for good) and the `settings` component, which every real wall panel obeys the
 * moment it changes. Both are answered here, in the browser, so the server never sees them.
 *
 * keepHistoryLocal() is put on every browser context by lib/browser.mjs. It wraps the page's own
 * fetch rather than routing, because a route on every context would switch the HTTP cache off in
 * every suite, and a service worker cannot get in front of it.
 *
 * sharedSettings() is per suite and routes, the way e2e-launch fakes its failures: it presents the
 * server's settings with a patch on top, keeps whatever the app saves, and records which
 * components the app created so cleanup can delete exactly those. A service worker can answer a
 * request before a route sees it, so install() also stops one registering in that context.
 */
import { getSettings, restoreSettings } from './components.mjs'
import { AUTH, NS } from './target.mjs'

const CONFIG_RE = /\/rest\/ui\/components\/neohab(?::|%3A)config(?:\/([^?#]*))?(?:[?#].*)?$/i

const json = (route, status, value) =>
  route.fulfill({ status, contentType: 'application/json', body: value === undefined ? '' : JSON.stringify(value) })

// never hand a fetched response straight back: its length and encoding headers describe the wire,
// not the decoded body route.fetch() gives us
const relay = async (route, res) =>
  route.fulfill({ status: res.status(), contentType: res.headers()['content-type'] ?? 'text/plain', body: await res.body() })

const parseBody = (req) => {
  try {
    const v = JSON.parse(req.postData() ?? '')
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

const uidOf = (match) => (match?.[1] === undefined || match[1] === '' ? null : decodeURIComponent(match[1]))

// what Playwright's own serviceWorkers: 'block' does, applied from here so no suite has to remember it
const noServiceWorker = () => {
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.register = async () => undefined
  } catch {
    // a sandboxed frame with no same-origin flag throws on the read over https, and can register nothing anyway
  }
}

// runs in the page, so it closes over nothing; reads go to the server, anything else stays here
function historyInPage() {
  if (window.top !== window || window.__nhHistoryLocal) return
  window.__nhHistoryLocal = { writes: 0 }
  const RE = /\/rest\/ui\/components\/neohab(?::|%3A)(historydata|history)(?:\/([^?#]*))?(?:[?#].*)?$/i
  const stores = { history: new Map(), historydata: new Map() }
  const realFetch = window.fetch.bind(window)
  const reply = (status, value) =>
    new Response(value === undefined ? null : JSON.stringify(value), {
      status,
      headers: value === undefined ? {} : { 'Content-Type': 'application/json' },
    })
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    const m = typeof url === 'string' ? RE.exec(url) : null
    if (!m) return realFetch(input, init)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const store = stores[m[1].toLowerCase()]
    const uid = m[2] ? decodeURIComponent(m[2]) : null
    if (method === 'GET' || method === 'HEAD') {
      if (uid !== null) {
        if (!store.has(uid)) return realFetch(input, init)
        const c = store.get(uid)
        return c ? reply(200, c) : reply(404)
      }
      const res = await realFetch(input, init)
      if (store.size === 0 || !res.ok) return res
      let list
      try {
        list = await res.clone().json()
      } catch {
        return res
      }
      if (!Array.isArray(list)) return res
      return reply(200, list.filter((c) => !store.has(c?.uid)).concat([...store.values()].filter(Boolean)))
    }
    let body = null
    try {
      body = JSON.parse(typeof init?.body === 'string' ? init.body : '')
    } catch {}
    window.__nhHistoryLocal.writes++
    if (method === 'PUT' || method === 'POST') {
      const key = uid ?? body?.uid
      if (!key) return reply(400, { error: { message: 'no uid' } })
      store.set(key, body)
      return reply(200, body)
    }
    if (method === 'DELETE' && uid !== null) {
      store.set(uid, null)
      return reply(200)
    }
    return reply(405)
  }
}

export async function keepHistoryLocal(context) {
  await context.addInitScript(historyInPage)
}

const SETTINGS = 'settings'

function withPatch(component, patch) {
  const keys = Object.keys(patch)
  if (keys.length === 0) return component
  if (!component && keys.every((k) => patch[k] === undefined)) return null
  const base = component ?? { uid: SETTINGS, component: 'neohab:settings', config: { version: 1 } }
  const config = { ...(base.config ?? { version: 1 }) }
  for (const k of keys) {
    if (patch[k] === undefined) delete config[k]
    else config[k] = patch[k]
  }
  return { ...base, config }
}

const configOf = (c) => JSON.stringify(c?.config ?? null)

/**
 * `patch` keys are merged into the server's own settings as the browser sees them; a key set to
 * undefined is removed. The server copy is never written.
 */
export async function sharedSettings(patch = {}) {
  const snapshot = await getSettings()
  const state = { patch: { ...patch }, local: undefined }
  const created = new Set()
  const gone = new Set()
  const kept = []
  const shown = new Set()
  let guarded = null

  const presented = (real) => {
    const c = state.local !== undefined ? state.local : withPatch(real, state.patch)
    if (c) shown.add(configOf(c))
    return c
  }
  const quiet = () => state.local === undefined && Object.keys(state.patch).length === 0 && gone.size === 0

  const answer = async (route) => {
    const req = route.request()
    const m = CONFIG_RE.exec(req.url())
    if (!m) return route.fallback()
    const uid = uidOf(m)
    const method = req.method()

    if (method === 'GET') {
      if (uid !== null && gone.has(uid)) return route.fulfill({ status: 404, body: '' })
      if (uid === SETTINGS) {
        if (quiet()) return route.fallback()
        if (state.local !== undefined) {
          const c = presented(null)
          return c ? json(route, 200, c) : route.fulfill({ status: 404, body: '' })
        }
        const res = await route.fetch()
        if (!res.ok() && res.status() !== 404) return relay(route, res)
        let real = null
        if (res.ok()) {
          try {
            real = await res.json()
          } catch {
            return relay(route, res)
          }
        }
        const c = presented(real)
        return c ? json(route, 200, c) : route.fulfill({ status: 404, body: '' })
      }
      if (uid !== null || quiet()) return route.fallback()
      const res = await route.fetch()
      if (!res.ok()) return relay(route, res)
      let list
      try {
        list = await res.json()
      } catch {
        return relay(route, res)
      }
      if (!Array.isArray(list)) return relay(route, res)
      const at = list.findIndex((c) => c?.uid === SETTINGS)
      const c = presented(at >= 0 ? list[at] : null)
      const rest = list.filter((x) => x?.uid !== SETTINGS && !gone.has(x?.uid))
      if (c) rest.splice(at >= 0 ? Math.min(at, rest.length) : 0, 0, c)
      return json(route, 200, rest)
    }

    if (method === 'PUT' && uid === SETTINGS) {
      state.local = parseBody(req)
      if (state.local) shown.add(configOf(state.local))
      return json(route, 200, state.local)
    }
    if (method === 'DELETE' && uid === SETTINGS) {
      state.local = null
      return route.fulfill({ status: 200, body: '' })
    }
    if (method === 'POST' && uid === null) {
      const body = parseBody(req)
      if (body?.uid === SETTINGS) {
        state.local = body
        shown.add(configOf(body))
        return json(route, 200, body)
      }
      const res = await route.fetch()
      if (res.ok() && typeof body?.uid === 'string') {
        created.add(body.uid)
        gone.delete(body.uid)
      }
      return relay(route, res)
    }
    if (method === 'DELETE' && uid !== null && guarded?.has(uid)) {
      kept.push(uid)
      gone.add(uid)
      return route.fulfill({ status: 200, body: '' })
    }
    return route.fallback()
  }
  // a page closing with a request still in here must not surface as an unhandled rejection, which
  // lib/browser.mjs treats as a reason to stop the whole suite
  const handler = async (route) => {
    try {
      await answer(route)
    } catch {
      await route.fallback().catch(() => {})
    }
  }

  return {
    // before the target's first navigation: a page already controlled by a service worker is not
    // covered
    async install(target) {
      await target.addInitScript(noServiceWorker)
      await target.route(CONFIG_RE, handler)
    },
    // a new patch replaces the old one and forgets anything the app saved since
    present(next = {}) {
      state.patch = { ...next }
      state.local = undefined
    },
    // what the browser is being shown as settings right now
    async current() {
      if (state.local !== undefined) return state.local
      return withPatch(await getSettings(), state.patch)
    },
    // uids the app created in neohab:config through this sandbox, for exact cleanup
    created,
    // uids the app deleted that were left on the server because they were there before the run
    kept,
    // from now on the app may delete only what was not on the server at this moment
    async guardExisting() {
      const res = await fetch(NS, { headers: AUTH })
      const list = res.ok ? await res.json() : null
      if (!Array.isArray(list)) throw new Error('could not list neohab:config to guard it (HTTP ' + res.status + ')')
      guarded = new Set(list.map((c) => c.uid))
      return guarded.size
    },
    // the server copy must be exactly what it was when the sandbox was made
    async verify() {
      const now = await getSettings()
      if (configOf(now) === configOf(snapshot) && !now === !snapshot) {
        return { ok: true, detail: 'the server copy never changed' }
      }
      // put it back only when it is recognisably something this run showed or saved
      if (now && shown.has(configOf(now))) {
        const back = await restoreSettings(snapshot)
        return { ok: false, detail: `a write got past the sandbox and was put back (${back.mode}, ${back.detail})` }
      }
      return { ok: false, detail: 'the server copy changed during the run to something this run never wrote, so it was left alone' }
    },
  }
}
