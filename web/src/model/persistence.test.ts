import { describe, expect, it } from 'vitest'
import { classifyHistoryError, persistenceAdvice, serviceNames } from './persistence'

describe('classifying a history failure', () => {
  it('recognises 4.3.7 answering for a service that is not there', () => {
    const err = new Error('GET /rest/persistence/items/x -> 400: Persistence service not queryable: nosuchservice')
    expect(classifyHistoryError(err)).toBe('nopersistence')
  })

  it('recognises 4.3.7 answering for an empty service id', () => {
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
    expect(persistenceAdvice(null)).toBe('ask')
  })

  it('says install one only when it has actually seen an empty list', () => {
    expect(persistenceAdvice([])).toBe('install')
  })

  it('says set a default when services exist but none answered', () => {
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
