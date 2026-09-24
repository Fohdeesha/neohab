import { EXIT_SKIPPED } from './suites.mjs'
import { AUTH, NS, PRODUCTION, TARGET_FILE } from './target.mjs'

export function refuseOnProduction(what) {
  if (!PRODUCTION) return
  console.log(`REFUSED: ${what}, and ${TARGET_FILE} is marked "production": true`)
  process.exit(2)
}

function abort(message) {
  console.log('ABORT: ' + message)
  process.exit(2)
}

// the wipe-cycle suites delete whole namespaces in cleanup, so this reads with the token and fails
// closed: a 401, an error page or anything else that is not a list is a refusal, never "empty"
export async function requireEmptyNamespaces(namespaces = [['config', NS]]) {
  refuseOnProduction('a wipe-cycle suite deletes whole namespaces')
  const counts = []
  for (const [kind, url] of namespaces) {
    let list
    try {
      const res = await fetch(url, { headers: AUTH })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      list = await res.json()
    } catch (err) {
      abort(`could not read neohab:${kind} (${err.message}) - a wipe-cycle suite will not run on a namespace it cannot see`)
    }
    if (!Array.isArray(list)) abort(`neohab:${kind} did not answer with a list - a wipe-cycle suite will not run on it`)
    counts.push([kind, list.length])
  }
  if (counts.some(([, n]) => n > 0)) {
    abort(
      counts.map(([k, n]) => `${n} ${k}`).join(' + ') +
        ' components present - wipe-cycle suite needs empty namespaces (snapshot + wipe first).'
    )
  }
}

// creating managed items on a production server is not ours to do, so the part of a suite that needs
// them says so out loud and is left out
export function skipOnProduction(ok, what) {
  if (!PRODUCTION) return false
  console.log(`SKIP (production target): ${what}`)
  ok(`SKIP (production target): ${what}`, true)
  return true
}

// for a suite that is built on items it creates from its first line to its last; run.mjs reports the
// exit code as SKIP rather than as a pass or a failure
export function skipSuiteOnProduction(what) {
  if (!PRODUCTION) return
  console.log(`SKIP (production target): ${what}`)
  process.exit(EXIT_SKIPPED)
}
