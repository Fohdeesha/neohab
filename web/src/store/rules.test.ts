import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { RuleSummary } from '../model/presets'

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void }
const calls: Pending[] = []

vi.mock('../api/rules', () => ({
  listRuleSummaries: vi.fn(
    () =>
      new Promise((resolve, reject) => {
        calls.push({ resolve, reject })
      })
  )
}))

const { ensureRules, forgetRules, knownRule, rereadRule, useRulesStore } = await import('./rules')

const rule = (uid: string, status = 'IDLE'): RuleSummary => ({ uid, name: uid, tags: ['Script'], status: { status } })
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('the rule list', () => {
  // forgetting re-asks on behalf of whoever asked before, so that question is answered and cleared first
  beforeEach(async () => {
    forgetRules()
    for (const c of calls) c.resolve([])
    await settle()
    calls.length = 0
    useRulesStore.setState({ rules: [], status: 'idle' })
  })

  it('asks once however many tiles want it', async () => {
    ensureRules()
    ensureRules()
    expect(calls).toHaveLength(1)
    calls[0].resolve([rule('a')])
    await settle()
    ensureRules()
    expect(calls).toHaveLength(1)
    expect(useRulesStore.getState().status).toBe('ready')
  })

  it('knows nothing while loading, and calls a uid missing only once the list is read', async () => {
    ensureRules()
    expect(knownRule(useRulesStore.getState(), 'a')).toBeUndefined()
    calls[0].resolve([rule('a')])
    await settle()
    expect((knownRule(useRulesStore.getState(), 'a') as RuleSummary).uid).toBe('a')
    expect(knownRule(useRulesStore.getState(), 'gone')).toBe('missing')
  })

  it('calls nothing missing when the server refused the read', async () => {
    ensureRules()
    calls[0].reject(new ApiError(401, 'GET /rest/rules -> 401', ''))
    await settle()
    expect(useRulesStore.getState().status).toBe('denied')
    expect(knownRule(useRulesStore.getState(), 'gone')).toBeUndefined()
  })

  it('re-reads AFTER a run rather than handing back a list asked for before it', async () => {
    ensureRules()
    const after = rereadRule('a')
    // the load that was already in flight answers with the world from before the run
    calls[0].resolve([rule('a', 'IDLE')])
    await settle()
    expect(calls).toHaveLength(2)
    calls[1].resolve([rule('a', 'UNINITIALIZED')])
    expect((await after)?.status?.status).toBe('UNINITIALIZED')
  })

  it('keeps the list it has when a refresh fails', async () => {
    ensureRules()
    calls[0].resolve([rule('a')])
    await settle()
    const again = rereadRule('a')
    calls[1].reject(new Error('the server did not answer'))
    await again.catch(() => undefined)
    expect(useRulesStore.getState().status).toBe('ready')
    expect(useRulesStore.getState().rules.map((r) => r.uid)).toEqual(['a'])
  })

  it('drops an answer that arrives after the credentials changed', async () => {
    ensureRules()
    const stale = calls[0]
    forgetRules()
    stale.resolve([rule('from-before')])
    await settle()
    expect(useRulesStore.getState().rules.map((r) => r.uid)).not.toContain('from-before')
  })
})
