/**
 * The bundled SHA-256, which is what makes PKCE sign-in work at all on a plain-HTTP LAN openHAB.
 *
 * Browsers expose `crypto.subtle` only to secure contexts, so on the deployment this project
 * actually targets it is simply absent - and when that went unhandled, `authorize()` threw before
 * the redirect and the sign-in button did nothing at all, silently, on every device (fixed
 * 2026-07-22). A wrong digest here would be worse than a missing one: the login page would load
 * and the token exchange would then fail with an opaque error.
 *
 * So it is checked two ways: against the published FIPS 180-4 vectors, and against
 * `crypto.subtle` itself - the implementation it stands in for - over every length across a
 * padding-block boundary.
 */
import { describe, expect, it } from 'vitest'
import { sha256 } from './sha256'

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

const digest = (s: string | Uint8Array): string => hex(sha256(typeof s === 'string' ? utf8(s) : s))

/** The platform's own SHA-256, which is what this module exists to replace. */
const reference = async (data: Uint8Array): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource)))

const randomBytes = (len: number): Uint8Array => crypto.getRandomValues(new Uint8Array(len))

describe('the published FIPS 180-4 vectors', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
  ])('hashes %j', (input, expected) => {
    expect(digest(input)).toBe(expected)
  })

  it('hashes a million "a" characters', () => {
    expect(digest(new Uint8Array(1_000_000).fill(0x61))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    )
  })
})

describe('agreement with the platform implementation it replaces', () => {
  it('matches for every length across a padding block boundary', async () => {
    // 55/56 and 119/120 are where the 64-bit length field stops fitting and a whole extra block
    // appears - the classic place a hand-written padding routine is wrong.
    for (let len = 0; len <= 130; len++) {
      const input = randomBytes(len)
      expect(hex(sha256(input)), `length ${len}`).toBe(await reference(input))
    }
  })

  it('matches over random inputs of random length', async () => {
    for (let i = 0; i < 25; i++) {
      const input = randomBytes(Math.floor(Math.random() * 4096))
      expect(hex(sha256(input)), `length ${input.length}`).toBe(await reference(input))
    }
  })

  it('handles bytes above 0x7f, which a string-based implementation would mangle', async () => {
    const input = new Uint8Array([0x00, 0x7f, 0x80, 0xff, 0xfe, 0xc3, 0xa9])
    expect(hex(sha256(input))).toBe(await reference(input))
  })

  it('hashes the UTF-8 bytes of non-ASCII text, not its code units', async () => {
    const input = utf8('sécurité ✓ 日本語')
    expect(hex(sha256(input))).toBe(await reference(input))
  })
})

describe('the shape PKCE actually needs', () => {
  it('returns 32 bytes for any input', () => {
    for (const input of ['', 'a', 'x'.repeat(1000)]) {
      expect(sha256(utf8(input))).toHaveLength(32)
    }
  })

  it('digests a real verifier to the challenge the token endpoint will recompute', () => {
    // The worked example from RFC 7636 appendix B, which is what proves the whole chain agrees
    // with the spec rather than merely being self-consistent.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const base64url = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const challenge = base64url(sha256(utf8(verifier)))
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(challenge).toHaveLength(43)
  })

  it('does not mutate the input it was given', () => {
    const input = utf8('leave me alone')
    const copy = new Uint8Array(input)
    sha256(input)
    expect([...input]).toEqual([...copy])
  })
})
