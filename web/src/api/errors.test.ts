import { describe, expect, it } from 'vitest'
import { ApiError } from './client'
import { errorText } from './errors'

describe('errorText', () => {
  it('never shows the request line an ApiError carries', () => {
    // What the notices used to interpolate, verbatim: method, path, status, message.
    const err = new ApiError(
      401,
      'PUT /rest/ui/components/neohab:config/dashboard%3Akitchen -> 401: Authentication required',
      'Authentication required'
    )
    const text = errorText(err)
    expect(text).not.toContain('/rest/')
    expect(text).not.toContain('PUT')
  })

  it('says what to do about a refusal rather than repeating the server’s HTTP wording', () => {
    // openHAB answers both of these with "Authentication required", which describes the protocol
    // and not the remedy, so the server's own detail is deliberately overruled here.
    for (const status of [401, 403]) {
      expect(errorText(new ApiError(status, 'x', 'Authentication required'))).toMatch(/administrator/)
    }
  })

  it('prefers the server’s own words for everything else', () => {
    expect(errorText(new ApiError(400, 'x', 'Simulated rejection'))).toBe('Simulated rejection')
  })

  it('describes a status the server said nothing about', () => {
    expect(errorText(new ApiError(404, 'x'))).toMatch(/404/)
    expect(errorText(new ApiError(502, 'x'))).toMatch(/502/)
    expect(errorText(new ApiError(418, 'x'))).toMatch(/418/)
  })

  it('turns a failed fetch into something about the server, not about fetch', () => {
    // What a browser throws when it cannot reach the host at all.
    expect(errorText(new TypeError('Failed to fetch'))).toMatch(/openHAB/)
    expect(errorText(new TypeError('Failed to fetch'))).not.toContain('fetch')
  })

  it('passes an ordinary Error through, and stringifies anything else', () => {
    expect(errorText(new Error('That file is not valid JSON'))).toBe('That file is not valid JSON')
    expect(errorText('plain string')).toBe('plain string')
    expect(errorText(undefined)).toBe('undefined')
  })
})
