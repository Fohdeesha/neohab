import { describe, expect, it } from 'vitest'
import { atLeast, hasAnonymousRuleSummary, hasLogSocket, hasSemanticTagsApi, parseServerVersion, serverGaps } from './serverVersion'

describe('parseServerVersion', () => {
  it('reads the shapes openHAB actually reports', () => {
    expect(parseServerVersion('3.4.5')).toMatchObject({ major: 3, minor: 4 })
    expect(parseServerVersion('4.0.0')).toMatchObject({ major: 4, minor: 0 })
    expect(parseServerVersion('5.3.0-SNAPSHOT')).toMatchObject({ major: 5, minor: 3 })
    expect(parseServerVersion('5')).toMatchObject({ major: 5, minor: 0 })
    expect(parseServerVersion(' 4.3.11 ')).toMatchObject({ major: 4, minor: 3, raw: '4.3.11' })
  })

  it('answers null for anything it cannot read, rather than guessing a number', () => {
    for (const bad of [null, undefined, 42, {}, [], '', 'unknown', 'v4.1']) {
      expect(parseServerVersion(bad)).toBeNull()
    }
  })
})

describe('atLeast', () => {
  it('compares minor as a number, not a string', () => {
    // '4.10' sorts before '4.9' as text, which would put a newer server on the old path
    expect(atLeast(parseServerVersion('4.10.0'), 4, 9)).toBe(true)
    expect(atLeast(parseServerVersion('4.9.0'), 4, 10)).toBe(false)
  })

  it('treats an unknown version as capable so nothing is disabled on a guess', () => {
    expect(atLeast(null, 4, 1)).toBe(true)
  })
})

describe('the three capabilities, at their exact boundaries', () => {
  const v = (s: string) => parseServerVersion(s)

  it('the log socket is 4.1 and newer', () => {
    expect(hasLogSocket(v('4.0.4'))).toBe(false)
    expect(hasLogSocket(v('4.1.0'))).toBe(true)
    expect(hasLogSocket(v('3.4.5'))).toBe(false)
    expect(hasLogSocket(v('5.3.0-SNAPSHOT'))).toBe(true)
  })

  it('the semantic tags API is 4.0 and newer', () => {
    expect(hasSemanticTagsApi(v('3.4.5'))).toBe(false)
    expect(hasSemanticTagsApi(v('4.0.0'))).toBe(true)
  })

  it('a signed-out rules summary is 4.0 and newer', () => {
    expect(hasAnonymousRuleSummary(v('3.4.5'))).toBe(false)
    expect(hasAnonymousRuleSummary(v('4.0.0'))).toBe(true)
  })
})

describe('serverGaps', () => {
  it('names all three on openHAB 3', () => {
    expect(serverGaps(parseServerVersion('3.4.5'))).toEqual(['logSocket', 'semanticTags', 'anonymousPresets'])
  })

  it('names only the log socket on 4.0, which is the one thing that line is missing', () => {
    expect(serverGaps(parseServerVersion('4.0.4'))).toEqual(['logSocket'])
  })

  it('names nothing from 4.1 on, or for a server it cannot read', () => {
    expect(serverGaps(parseServerVersion('4.1.0'))).toEqual([])
    expect(serverGaps(parseServerVersion('5.3.0-SNAPSHOT'))).toEqual([])
    expect(serverGaps(null)).toEqual([])
  })
})
