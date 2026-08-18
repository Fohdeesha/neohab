/**
 * Reading, patching and restoring a UI component on a server that may not have one yet.
 *
 * openHAB answers a missing component with **404 and an empty body**, so the obvious
 * `await (await fetch(url)).json()` raises `SyntaxError: Unexpected end of JSON input`. At module
 * top level that kills the suite before a single check has run: the first battery against a fresh
 * openHAB 5 lost six suites in 0s each, with a stack trace where a failure should have been.
 *
 * The `settings` component is the one that bites. It exists on every lived-in server and on no
 * fresh one, and several suites snapshot it so they can put the user's own settings back.
 *
 * Restoring is the other half: a suite that patches `settings` on a server that had none has
 * CREATED it, and leaving it behind is a change to the server like any other. `restoreSettings`
 * writes the snapshot back when there was one and deletes the component when there was not.
 */
import { AUTH, NS } from './target.mjs'

const JSON_HDR = { ...AUTH, 'Content-Type': 'application/json' }

/** The component at `url`, or null when the server has not got one. Never throws on 404. */
export async function getComponent(url) {
  const res = await fetch(url, { headers: AUTH })
  if (!res.ok) return null
  const body = await res.text()
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * Write a component whether or not it is already there. openHAB answers the wrong verb rather
 * than doing the other one: PUT to a missing uid is 404, POST to an existing one is 500. The app
 * itself learned this; suites need it too, because they run against both states.
 */
export async function putComponent(nsUrl, comp) {
  const res = await fetch(`${nsUrl}/${encodeURIComponent(comp.uid)}`, {
    method: 'PUT',
    headers: JSON_HDR,
    body: JSON.stringify(comp),
  })
  if (res.ok) return res
  return fetch(nsUrl, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(comp) })
}

/** Remove a component. 404 counts as success: the point is that it is gone. */
export function deleteComponent(nsUrl, uid) {
  return fetch(`${nsUrl}/${encodeURIComponent(uid)}`, { method: 'DELETE', headers: AUTH })
}

// ---------------------------------------------------------------------------
// The settings component, which is what all of this is really about.
// ---------------------------------------------------------------------------

export const SETTINGS_URL = NS + '/settings'

/** The live settings component, or null on a server where nobody has changed a setting yet. */
export const getSettings = () => getComponent(SETTINGS_URL)

/**
 * The snapshot with `patch` applied, ready to write. With no snapshot this is the component the
 * app itself would create on the first settings change, so a suite can patch a fresh server.
 */
export function settingsWith(snapshot, patch) {
  const base = snapshot ?? { uid: 'settings', component: 'neohab:settings', config: { version: 1 } }
  return { ...base, config: { ...(base.config ?? { version: 1 }), ...patch } }
}

/** Apply `patch` to the settings component, creating it if the server has none. */
export const patchSettings = (snapshot, patch) => putComponent(NS, settingsWith(snapshot, patch))

/**
 * Put settings back exactly as they were found, INCLUDING not existing at all.
 * Returns `{ ok, mode, detail }` for the suite to report as its own cleanup check.
 */
export async function restoreSettings(snapshot) {
  if (snapshot) {
    const res = await putComponent(NS, snapshot)
    const after = await getSettings()
    const same = JSON.stringify(after?.config) === JSON.stringify(snapshot.config)
    return { ok: res.ok && same, mode: 'restored', detail: `put=${res.status} verbatim=${same}` }
  }
  const res = await deleteComponent(NS, 'settings')
  const after = await getSettings()
  return {
    ok: (res.status === 200 || res.status === 404) && after === null,
    mode: 'removed (the server had none)',
    detail: `delete=${res.status} gone=${after === null}`,
  }
}
