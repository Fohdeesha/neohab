import { describe, expect, it } from 'vitest'
import { classifyHistoryError, persistenceAdvice, serviceNames } from './persistence'

/**
 * The messages here are the ones a real server produced, not invented ones: openHAB 4.3.7 was
 * asked for history from a service that does not exist and from an empty service id, and its
 * answers are quoted verbatim. The 5.x wording is taken from core's PersistenceResource, which
 * uses a different status code for the same condition - which is exactly why nothing here keys
 * on the status.
 */
describe('classifying a history failure', () => {
  it('recognises 4.3.7 answering for a service that is not there', () => {
    // measured: HTTP 400, body {"error":{"message":"Persistence service not queryable: nosuchservice"}}
    const err = new Error('GET /rest/persistence/items/x -> 400: Persistence service not queryable: nosuchservice')
    expect(classifyHistoryError(err)).toBe('nopersistence')
  })

  it('recognises 4.3.7 answering for an empty service id', () => {
    // measured: HTTP 400, message ends with a bare colon and nothing after it
    const err = new Error('GET /rest/persistence/items/x -> 400: Persistence service not queryable: ')
    expect(classifyHistoryError(err)).toBe('nopersistence')
  })

  it('recognises the 5.x wording and status, which differ from 4.3', () => {
    const notFound = new Error('GET /rest/persistence/items/x -> 404: Persistence service not found: null')
    const notQueryable = new Error('GET /rest/persistence/items/x -> 405: Persistence service not queryable: foo')
    expect(classifyHistoryError(notFound)).toBe('nopersistence')
    expect(classifyHistoryError(notQueryable)).toBe('nopersistence')
  })

  it('leaves everything else an ordinary error', () => {
    // Sending someone to install add-ons they already have, over a blip, is worse than silence.
    expect(classifyHistoryError(new Error('Failed to fetch'))).toBe('error')
    expect(classifyHistoryError(new Error('GET /rest/persistence/items/x -> 500: Internal Server Error'))).toBe('error')
    expect(classifyHistoryError(new Error('GET /rest/persistence/items/x -> 401: Unauthorized'))).toBe('error')
    expect(classifyHistoryError(new Error('The operation was aborted'))).toBe('error')
  })

  it('survives a thrown non-Error', () => {
    expect(classifyHistoryError(undefined)).toBe('error')
    expect(classifyHistoryError(null)).toBe('error')
    expect(classifyHistoryError({ message: 'Persistence service not found: x' })).toBe('error')
    expect(classifyHistoryError('Persistence service not found: x')).toBe('nopersistence')
  })
})

describe('what to advise', () => {
  it('tells a device that cannot see the list to ask someone who can', () => {
    // The endpoint is admin-only, so null is "unknown" - never "nothing is installed".
    expect(persistenceAdvice(null)).toBe('ask')
  })

  it('says install one only when it has actually seen an empty list', () => {
    expect(persistenceAdvice([])).toBe('install')
  })

  it('says set a default when services exist but none answered', () => {
    // Core resolves no default at all when several are installed and none is chosen.
    expect(persistenceAdvice([{ id: 'rrd4j' }, { id: 'influxdb' }])).toBe('default')
    expect(persistenceAdvice([{ id: 'influxdb' }])).toBe('default')
  })

  it('treats a non-array as unknown rather than as empty', () => {
    expect(persistenceAdvice({} as never)).toBe('ask')
    expect(persistenceAdvice('rrd4j' as never)).toBe('ask')
  })
})

describe('naming the services for diagnostics', () => {
  it('prefers the label and falls back to the id', () => {
    expect(serviceNames([{ id: 'rrd4j', label: 'RRD4j' }, { id: 'influxdb' }])).toEqual(['RRD4j', 'influxdb'])
  })

  it('does not throw on a service the server described oddly', () => {
    expect(serviceNames([{} as never, { id: 'x', label: '' }])).toEqual(['?', 'x'])
  })
})
