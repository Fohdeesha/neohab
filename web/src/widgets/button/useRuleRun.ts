import { useEffect, useRef, useState } from 'react'
import { ruleBlock } from '../../model/rules'
import { ensureRules, knownRule, useRulesStore } from '../../store/rules'
import { runRuleChecked } from '../common/rule'

export type RunPhase = 'idle' | 'running' | 'done'

// long enough to see on a wall panel, short enough that a second press does not meet it
const DONE_MS = 1500

/** Runs a rule from a tile: `running` lasts exactly as long as the rule does, since runnow answers at its end. */
export function useRuleRun(uids: (string | undefined)[], current: string | undefined, fallbackName: string) {
  const wanted = uids.filter((u): u is string => typeof u === 'string' && u !== '')
  const key = wanted.join('\n')
  const [phase, setPhase] = useState<RunPhase>('idle')
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (key) ensureRules()
  }, [key])

  useEffect(() => () => clearTimeout(timer.current), [])

  const missing = useRulesStore((s) => wanted.find((uid) => knownRule(s, uid) === 'missing'))
  // what the tile shows: whether the rule a press would run now is one openHAB will refuse
  const block = useRulesStore((s) => {
    const rule = current ? knownRule(s, current) : undefined
    return rule && rule !== 'missing' ? ruleBlock(rule) : null
  })

  // one run at a time per tile: a second press while openHAB is still running the first is dropped
  const run = async (uid: string, quietWhenDone: boolean): Promise<void> => {
    if (busy.current) return
    clearTimeout(timer.current)
    busy.current = true
    const ran = await runRuleChecked(uid, fallbackName, () => setPhase('running'))
    busy.current = false
    if (!ran || quietWhenDone) {
      setPhase('idle')
      return
    }
    setPhase('done')
    timer.current = setTimeout(() => setPhase('idle'), DONE_MS)
  }

  return { phase, missing, block, run }
}
