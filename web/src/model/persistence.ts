/**
 * Telling "this server has no persistence" apart from "something went wrong".
 *
 * Every history-backed widget - chart, timeline, the gauge's sparkline, a stat tile's trend -
 * fails the same way on a server with no usable persistence service, and until 1.11 they all
 * said "Could not load history", which describes a fault rather than a missing prerequisite.
 * A fresh openHAB has no persistence add-on at all, so this is the first thing many people see.
 *
 * Detection is on the SERVER'S MESSAGE, not the status code, because the code differs by
 * version: openHAB 4.3.7 answers 400 for both branches, while the 5.x source returns 404 for an
 * unknown service and 405 for one that cannot be queried. The message ("Persistence service not
 * found: x" / "Persistence service not queryable: x") is a plain English constant in core and is
 * stable across both, so it is the thing worth matching. Anything else stays an ordinary error:
 * calling a network blip a configuration problem would send someone off installing add-ons they
 * already have.
 *
 * Pure: no imports, so it can be exercised without a browser or a client.
 */

/** A persistence service as `GET /rest/persistence` reports it. That endpoint is admin-only. */
export interface PersistenceService {
  id: string
  label?: string
  type?: string
}

/** What a failed history fetch actually means. */
export type HistoryFailure = 'nopersistence' | 'error'

/**
 * openHAB's own wording for both "no such service" and "that service cannot be queried". An
 * empty or unresolvable default lands here too - core builds the same message around a null id.
 */
const PERSISTENCE_MESSAGE = /persistence service not (found|queryable)/i

export function classifyHistoryError(err: unknown): HistoryFailure {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return PERSISTENCE_MESSAGE.test(message) ? 'nopersistence' : 'error'
}

/**
 * Which advice fits what we can see of the server.
 *
 * `services` is null whenever the list could not be read - the endpoint is admin-only, so every
 * viewer and every wall panel is in that position, and guessing on their behalf would be wrong.
 * They are told what is missing and who can fix it; only a device that has actually SEEN the
 * list is told which of the two problems it is.
 *
 *  - `install`  nothing is installed: any persistence add-on will do.
 *  - `default`  services exist but none answered, which is what a missing default looks like -
 *               core resolves no default at all when several are installed and none is chosen.
 *  - `ask`      we cannot tell from here.
 */
export type PersistenceAdvice = 'install' | 'default' | 'ask'

export function persistenceAdvice(services: PersistenceService[] | null): PersistenceAdvice {
  if (!Array.isArray(services)) return 'ask'
  return services.length === 0 ? 'install' : 'default'
}

/** Service ids in a form a person can read, for the diagnostics line. Never used as advice. */
export function serviceNames(services: PersistenceService[]): string[] {
  return services.map((s) => (typeof s?.label === 'string' && s.label ? s.label : String(s?.id ?? '?')))
}
