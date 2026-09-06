// match on the server's message, not the status: 4.3.7 answers 400 where 5.x answers 404 or 405

export interface PersistenceService {
  id: string
  label?: string
  type?: string
}

export type HistoryFailure = 'nopersistence' | 'error'

const PERSISTENCE_MESSAGE = /persistence service not (found|queryable)/i

export function classifyHistoryError(err: unknown): HistoryFailure {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return PERSISTENCE_MESSAGE.test(message) ? 'nopersistence' : 'error'
}

export type PersistenceAdvice = 'install' | 'default' | 'ask'

export function persistenceAdvice(services: PersistenceService[] | null): PersistenceAdvice {
  if (!Array.isArray(services)) return 'ask'
  return services.length === 0 ? 'install' : 'default'
}

export function serviceNames(services: PersistenceService[]): string[] {
  return services.map((s) => (typeof s?.label === 'string' && s.label ? s.label : String(s?.id ?? '?')))
}
