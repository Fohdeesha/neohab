import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { RuleSummary } from '../../model/presets'

type Pending = { resolve: (v?: unknown) => void; reject: (e: unknown) => void }
const runs: (Pending & { uid: string })[] = []
const lists: Pending[] = []
const notices: string[] = []

vi.mock('../../api/rules', () => ({
  runRule: vi.fn(
    (uid: string) =>
      new Promise((resolve, reject) => {
        runs.push({ uid, resolve, reject })
      })
  ),
  listRuleSummaries: vi.fn(
    () =>
      new Promise((resolve, reject) => {
        lists.push({ resolve, reject })
      })
  )
}))
vi.mock('../../store/notify', () => ({ notify: (text: string) => notices.push(text) }))

const { runRuleChecked } = await import('./rule')
const { forgetRules, useRulesStore } = await import('../../store/rules')

const rule = (uid: string, status = 'IDLE', statusDetail?: string): RuleSummary => ({
  uid,
  name: 'Name of ' + uid,
  tags: ['Script'],
  status: { status, statusDetail }
})
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('running a rule from a widget', () => {
  // a run a test left going reads the list when it ends, so both are answered until nothing is waiting
  const drain = async () => {
    while (runs.length > 0 || lists.length > 0) {
      for (const r of runs.splice(0)) r.resolve()
      for (const l of lists.splice(0)) l.resolve([])
      await settle()
    }
  }
  beforeEach(async () => {
    await drain()
    forgetRules()
    await drain()
    notices.length = 0
    useRulesStore.setState({ rules: [rule('a'), rule('off', 'UNINITIALIZED', 'DISABLED')], status: 'ready' })
  })

  it('runs it and reads the list again after, then answers true', async () => {
    const started = vi.fn()
    const done = runRuleChecked('a', '', started)
    expect(started).toHaveBeenCalledOnce()
    expect(runs.map((r) => r.uid)).toEqual(['a'])
    runs[0].resolve()
    await settle()
    expect(lists).toHaveLength(1)
    lists[0].resolve([rule('a')])
    expect(await done).toBe(true)
    expect(notices).toEqual([])
  })

  it('refuses a rule the list says is disabled, by its name, without sending anything', async () => {
    const started = vi.fn()
    expect(await runRuleChecked('off', '', started)).toBe(false)
    expect(runs).toHaveLength(0)
    expect(started).not.toHaveBeenCalled()
    expect(notices).toEqual(['“Name of off” is disabled in openHAB, so it did not run.'])
  })

  it('catches a rule disabled after the list was read, since openHAB answers 200 for it', async () => {
    const done = runRuleChecked('a')
    runs[0].resolve()
    await settle()
    lists[0].resolve([rule('a', 'UNINITIALIZED', 'DISABLED')])
    expect(await done).toBe(false)
    expect(notices).toEqual(['“Name of a” is disabled in openHAB, so it did not run.'])
  })

  it('joins a second call for a rule still running rather than queueing another run', async () => {
    const first = runRuleChecked('a')
    const started = vi.fn()
    const second = runRuleChecked('a', '', started)
    expect(runs).toHaveLength(1)
    expect(started).toHaveBeenCalledOnce()
    runs[0].resolve()
    await settle()
    lists[0].resolve([rule('a')])
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    // and once it has finished, the next call is a run of its own
    void runRuleChecked('a')
    expect(runs).toHaveLength(2)
  })

  it('says a rule is gone when openHAB has no such rule, and reads the list again', async () => {
    const done = runRuleChecked('gone', 'My tile')
    runs[0].reject(new ApiError(404, 'POST /rest/rules/gone/runnow -> 404', ''))
    expect(await done).toBe(false)
    expect(notices).toEqual(['“My tile” is not on this openHAB server anymore'])
    await settle()
    expect(lists).toHaveLength(1)
  })

  it('still runs a rule when the list could not be read, and trusts the run', async () => {
    useRulesStore.setState({ rules: [], status: 'denied' })
    const done = runRuleChecked('a')
    runs[0].resolve()
    await settle()
    lists[0].reject(new ApiError(401, 'GET /rest/rules -> 401', ''))
    expect(await done).toBe(true)
    expect(notices).toEqual([])
  })
})
