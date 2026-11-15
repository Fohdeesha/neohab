import { describe, expect, it } from 'vitest'
import type { RuleSummary } from './presets'
import { findRule, groupRules, pickable, ruleBlock, ruleKind, ruleName, ruleSummaries } from './rules'

const rule = (uid: string, over: Partial<RuleSummary> = {}): RuleSummary => ({ uid, name: uid, tags: [], ...over })

describe('what kind of rule it is', () => {
  it('follows the tags Main UI gives scenes and scripts', () => {
    expect(ruleKind(rule('a', { tags: ['Scene'] }))).toBe('scene')
    expect(ruleKind(rule('a', { tags: ['Script'] }))).toBe('script')
    expect(ruleKind(rule('a', { tags: ['Schedule'] }))).toBe('rule')
    expect(ruleKind(rule('a', { tags: undefined }))).toBe('rule')
  })

  it('calls a floor plan preset a scene, which is what openHAB calls it', () => {
    expect(ruleKind(rule('nh-scene-evening', { tags: ['Scene', 'neohab', 'neohab:status:Evening:ON'] }))).toBe('scene')
  })

  it('reads a tags field that is not a list as no tags', () => {
    expect(ruleKind(rule('a', { tags: 'Scene' as unknown as string[] }))).toBe('rule')
  })
})

describe('the name a person sees', () => {
  it('is the rule name, or the uid when it has none', () => {
    expect(ruleName(rule('a3f9c1e2b4', { name: 'All lights on' }))).toBe('All lights on')
    expect(ruleName(rule('a3f9c1e2b4', { name: '  ' }))).toBe('a3f9c1e2b4')
    expect(ruleName(rule('a3f9c1e2b4', { name: undefined }))).toBe('a3f9c1e2b4')
  })
})

describe('reading the rule list', () => {
  it('refuses an answer that is not a list, such as an error page served with 200', () => {
    expect(() => ruleSummaries('<html>Bad gateway</html>')).toThrow()
    expect(() => ruleSummaries({ uid: 'a' })).toThrow()
  })

  it('drops entries without a usable uid', () => {
    const read = ruleSummaries([rule('a'), null, 7, { name: 'no uid' }, { uid: '' }, { uid: 42 }, rule('b')])
    expect(read.map((r) => r.uid)).toEqual(['a', 'b'])
  })

  it('finds a rule by uid without walking the prototype', () => {
    const rules = [rule('a')]
    expect(findRule(rules, 'a')?.uid).toBe('a')
    expect(findRule(rules, 'constructor')).toBeUndefined()
    expect(findRule(rules, '__proto__')).toBeUndefined()
  })
})

describe('what the picker leaves out', () => {
  it('leaves out a preset bridge and anything openHAB hides', () => {
    expect(pickable(rule('nh-bridge-nh-scene-evening'))).toBe(false)
    expect(pickable(rule('a', { visibility: 'HIDDEN' }))).toBe(false)
    expect(pickable(rule('a', { visibility: 'EXPERT' }))).toBe(true)
    expect(pickable(rule('a', { visibility: 'VISIBLE' }))).toBe(true)
    expect(pickable(rule('nh-scene-evening'))).toBe(true)
  })
})

describe('whether openHAB would run it', () => {
  it('refuses only an uninitialized rule, and says whether it is disabled or broken', () => {
    expect(ruleBlock(rule('a', { status: { status: 'IDLE', statusDetail: 'NONE' } }))).toBeNull()
    expect(ruleBlock(rule('a', { status: { status: 'RUNNING' } }))).toBeNull()
    expect(ruleBlock(rule('a', { status: { status: 'INITIALIZING' } }))).toBeNull()
    expect(ruleBlock(rule('a', { status: { status: 'UNINITIALIZED', statusDetail: 'DISABLED' } }))).toBe('disabled')
    expect(ruleBlock(rule('a', { status: { status: 'UNINITIALIZED', statusDetail: 'HANDLER_INITIALIZING_ERROR' } }))).toBe('broken')
  })

  it('knows nothing about a rule it has no status for', () => {
    expect(ruleBlock(undefined)).toBeNull()
    expect(ruleBlock(rule('a'))).toBeNull()
  })
})

describe('what the picker lists', () => {
  const rules = [
    rule('s2', { name: 'Movie night', tags: ['Scene'] }),
    rule('s1', { name: 'Dinner', tags: ['Scene'] }),
    rule('x1', { name: 'All lights on', tags: ['Script'] }),
    rule('x2', { name: 'Goodnight', tags: ['Script'] }),
    rule('r1', { name: 'Doorbell to speakers' }),
    rule('r2', { name: 'Bathroom fan timer' }),
    rule('nh-bridge-s1', { name: 'Bridge' }),
    rule('h1', { name: 'Hidden thing', visibility: 'HIDDEN' })
  ]
  const uids = (list: RuleSummary[]) => list.map((r) => r.uid)

  it('shows scenes and scripts, sorted by name, and folds the plain rules behind a count', () => {
    const g = groupRules(rules, '', false)
    expect(uids(g.scenes)).toEqual(['s1', 's2'])
    expect(uids(g.scripts)).toEqual(['x1', 'x2'])
    expect(g.rules).toEqual([])
    // the bridge and the hidden rule are not counted either
    expect(g.hiddenRules).toBe(2)
  })

  it('unfolds the plain rules when asked', () => {
    const g = groupRules(rules, '', true)
    expect(uids(g.rules)).toEqual(['r2', 'r1'])
    expect(g.hiddenRules).toBe(0)
  })

  it('searches every group by name or uid as soon as something is typed', () => {
    expect(uids(groupRules(rules, 'fan', false).rules)).toEqual(['r2'])
    expect(uids(groupRules(rules, 'NIGHT', false).scenes)).toEqual(['s2'])
    expect(uids(groupRules(rules, 'NIGHT', false).scripts)).toEqual(['x2'])
    expect(uids(groupRules(rules, 'x1', false).scripts)).toEqual(['x1'])
    expect(groupRules(rules, 'bridge', false).rules).toEqual([])
  })

  it('unfolds the plain rules when one of them is the current pick, so it can be seen', () => {
    expect(uids(groupRules(rules, '', false, 'r1').rules)).toEqual(['r2', 'r1'])
    expect(groupRules(rules, '', false, 'x1').rules).toEqual([])
  })

  it('offers no fold when there are no plain rules', () => {
    expect(groupRules(rules.slice(0, 4), '', false).hiddenRules).toBe(0)
  })
})
