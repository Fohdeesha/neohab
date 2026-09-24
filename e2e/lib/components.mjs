import { AUTH, NS } from './target.mjs'

const JSON_HDR = { ...AUTH, 'Content-Type': 'application/json' }

// null means the server said it has no such component (404), and nothing else: restoreSettings(null)
// deletes, so a refused or garbled read must never look like "absent"
export async function getComponent(url) {
  const res = await fetch(url, { headers: AUTH })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`reading ${url} answered HTTP ${res.status}`)
  const body = await res.text()
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {}
  throw new Error(`reading ${url} answered HTTP ${res.status} with a body that is not a component`)
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

// a suite that needs other settings shows them to its browser with lib/sandbox.mjs sharedSettings();
// this is only for putting the server's copy back if something wrote it anyway
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
