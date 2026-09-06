import { describe, expect, it } from 'vitest'
import { collectBackgroundRefs, isUploadedBackground, resolveBackgroundRef } from './background'

const dashboardWithFloorPlan = {
  version: 1,
  id: 'home',
  name: 'Home',
  widgets: [
    { id: 'w1', type: 'clock', config: {} },
    { id: 'w2', type: 'floorplan', config: { image: 'bg:plan1', lights: [{ id: 'l1', item: 'Lamp' }] } }
  ]
}

describe('collectBackgroundRefs', () => {
  it('finds a top-level reference', () => {
    expect([...collectBackgroundRefs({ background: 'bg:top' })]).toEqual(['top'])
  })

  it("finds a reference inside a widget's own config", () => {
    expect([...collectBackgroundRefs(dashboardWithFloorPlan)]).toEqual(['plan1'])
  })

  it('walks arrays of dashboards and collects every reference once', () => {
    const refs = collectBackgroundRefs([{ background: 'bg:a' }, dashboardWithFloorPlan, { widgets: [{ config: { image: 'bg:a' } }] }])
    expect([...refs].sort()).toEqual(['a', 'plan1'])
  })

  it('finds one in a custom widget definition, where settings carry defaults', () => {
    const def = { id: 'd', name: 'D', settings: [{ id: 'bg', type: 'text', default: 'bg:fromdef' }] }
    expect([...collectBackgroundRefs(def)]).toEqual(['fromdef'])
  })

  it('ignores plain URLs and anything that is not a reference', () => {
    const refs = collectBackgroundRefs({
      background: 'https://example.invalid/a.png',
      other: 'icon:notabackground',
      n: 4,
      b: true,
      nothing: null,
      missing: undefined
    })
    expect([...refs]).toEqual([])
  })

  it('tolerates surrounding whitespace, so a stored ref is kept rather than dropped', () => {
    expect([...collectBackgroundRefs({ background: '  bg:spaced ' })]).toEqual(['spaced'])
  })

  it('collects into a caller-supplied set', () => {
    const into = new Set(['already'])
    collectBackgroundRefs({ background: 'bg:more' }, into)
    expect([...into].sort()).toEqual(['already', 'more'])
  })

  it('finds a reference wherever a widget config could hold one', () => {
    const config = {
      image: 'bg:direct',
      lights: [{ id: 'l1', item: 'Lamp', icon: 'bg:inrow' }],
      series: [{ style: { fill: 'bg:nested' } }],
      tabs: [[{ background: 'bg:deep' }]]
    }
    expect([...collectBackgroundRefs({ widgets: [{ config }] })].sort()).toEqual(['deep', 'direct', 'inrow', 'nested'])
  })
})

describe('resolveBackgroundRef', () => {
  const uploads = [{ version: 1, id: 'plan1', dataUri: 'data:image/png;base64,AAA', bytes: 3 }]

  it('resolves an upload to its data URI and passes a URL through', () => {
    expect(resolveBackgroundRef('bg:plan1', uploads)).toBe('data:image/png;base64,AAA')
    expect(resolveBackgroundRef('https://example.invalid/a.png', uploads)).toBe('https://example.invalid/a.png')
  })

  it('resolves a reference whose upload is gone to nothing, so callers can say so', () => {
    expect(resolveBackgroundRef('bg:deleted', uploads)).toBeUndefined()
    expect(isUploadedBackground('bg:deleted')).toBe(true)
  })
})
