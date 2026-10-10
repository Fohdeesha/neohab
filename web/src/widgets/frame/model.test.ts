import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sandboxFor } from './model'

const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe('sandboxFor', () => {
  beforeEach(() => vi.stubGlobal('location', new URL('http://openhab.local:8080/neohab/index.html#/d/home')))
  afterEach(() => vi.unstubAllGlobals())

  // the addresses openHAB itself answers, written every way an item could hold one
  const SAME = [
    '/rest/items/cam/state',
    'rest/items/cam/state',
    '../rest/items/cam/state',
    'http://openhab.local:8080/static/page.html',
    'HTTP://OPENHAB.LOCAL:8080/static/page.html',
    '//openhab.local:8080/basicui/app',
    'Hello'
  ]
  const OTHER = [
    'https://grafana.example/d/x',
    'http://openhab.local:8081/',
    'http://openhab:8080/static/page.html',
    'https://openhab.local:8080/'
  ]

  it('always sandboxes an address an item chose, whatever the switch says', () => {
    for (const url of SAME) {
      expect(sandboxFor({ source: 'item' }, url)).toBe(true)
      // a switch an item-bound frame does not even show
      expect(sandboxFor({ source: 'item', sandbox: false }, url)).toBe(true)
    }
  })

  // a page elsewhere can send its own frame to openHAB later, or redirect there, after the sandbox was decided
  it('sandboxes an item’s address on any other origin too', () => {
    for (const url of [...OTHER, 'data:image/svg+xml,<svg/>', 'blob:http://openhab.local:8080/x']) {
      expect(sandboxFor({ source: 'item' }, url)).toBe(true)
      expect(sandboxFor({ source: 'item', sandbox: false }, url)).toBe(true)
    }
  })

  it('leaves another origin typed by the author to the browser, as before', () => {
    for (const url of OTHER) expect(sandboxFor({ source: 'url', sandbox: true }, url)).toBe(false)
  })

  it('leaves a typed address to its author, as before', () => {
    for (const url of SAME) {
      expect(sandboxFor({ source: 'url', sandbox: true }, url)).toBe(true)
      expect(sandboxFor({ source: 'url', sandbox: false }, url)).toBe(false)
      expect(sandboxFor({}, url)).toBe(false)
    }
  })

  it('treats only a real true as the switch and only the exact word as an item source', () => {
    for (const v of ['true', 1, {}, ...PROTO_KEYS]) expect(sandboxFor({ sandbox: v }, '/static/x.html')).toBe(false)
    for (const source of ['Item', 'items', ...PROTO_KEYS]) expect(sandboxFor({ source }, '/static/x.html')).toBe(false)
  })

  it('sandboxes an address it cannot even parse, rather than trust it', () => {
    expect(sandboxFor({ source: 'item' }, 'http://[bad')).toBe(true)
    expect(sandboxFor({ source: 'url', sandbox: true }, 'http://[bad')).toBe(true)
  })
})
