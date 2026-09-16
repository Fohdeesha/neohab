import { describe, expect, it } from 'vitest'
import { missingFrom } from './catalog'

describe('missingFrom', () => {
  const names = new Set(['a', 'b'])

  it('names the items this server does not have', () => {
    expect(missingFrom(names, 'ready', ['a', 'nope', 'b', 'gone'])).toEqual(['nope', 'gone'])
  })

  it('finds nothing when every item is there', () => {
    expect(missingFrom(names, 'ready', ['a', 'b'])).toEqual([])
  })

  // the important half: an unanswered question is not an answer. Claiming "missing" while the
  // list is still loading would put a configuration error on screen for a perfectly good item.
  it('claims nothing while the list is loading', () => {
    expect(missingFrom(null, 'loading', ['nope'])).toEqual([])
    expect(missingFrom(names, 'loading', ['nope'])).toEqual([])
  })

  it('claims nothing when the server refused to list items', () => {
    expect(missingFrom(names, 'denied', ['nope'])).toEqual([])
  })

  it('claims nothing when the request failed', () => {
    expect(missingFrom(names, 'failed', ['nope'])).toEqual([])
  })

  it('claims nothing before anything has been asked', () => {
    expect(missingFrom(null, 'idle', ['nope'])).toEqual([])
  })

  // a name the caller made up must not walk the prototype chain into a match
  it('is not fooled by a name that exists on Object.prototype', () => {
    expect(missingFrom(names, 'ready', ['constructor', 'toString', '__proto__'])).toEqual(['constructor', 'toString', '__proto__'])
  })
})
