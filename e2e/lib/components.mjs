import { AUTH, NS } from './target.mjs'

const JSON_HDR = { ...AUTH, 'Content-Type': 'application/json' }

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

export async function putComponent(nsUrl, comp) {
  const res = await fetch(`${nsUrl}/${encodeURIComponent(comp.uid)}`, {
    method: 'PUT',
    headers: JSON_HDR,
    body: JSON.stringify(comp),
  })
  if (res.ok) return res
  return fetch(nsUrl, { method: 'POST', headers: JSON_HDR, body: JSON.stringify(comp) })
}

export function deleteComponent(nsUrl, uid) {
  return fetch(`${nsUrl}/${encodeURIComponent(uid)}`, { method: 'DELETE', headers: AUTH })
}

export const SETTINGS_URL = NS + '/settings'

export const getSettings = () => getComponent(SETTINGS_URL)

export function settingsWith(snapshot, patch) {
  const base = snapshot ?? { uid: 'settings', component: 'neohab:settings', config: { version: 1 } }
  return { ...base, config: { ...(base.config ?? { version: 1 }), ...patch } }
}

export const patchSettings = (snapshot, patch) => putComponent(NS, settingsWith(snapshot, patch))

export function settingsWithoutKeys(snapshot, keys) {
  const base = snapshot ?? { uid: 'settings', component: 'neohab:settings', config: { version: 1 } }
  const config = { ...(base.config ?? { version: 1 }) }
  for (const k of keys) delete config[k]
  return { ...base, config }
}

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
