import { ApiError } from '../../api/client'
import { NetworkError } from '../../api/base'
import { errorText } from '../../api/errors'
import { runRule } from '../../api/rules'
import i18n from '../../i18n'
import { ruleBlock, ruleName, type RuleBlock } from '../../model/rules'
import { notify } from '../../store/notify'
import { knownRule, rereadRule, useRulesStore } from '../../store/rules'

function blockedText(name: string, block: RuleBlock): string {
  return block === 'disabled'
    ? i18n.t('“{{name}}” is disabled in openHAB, so it did not run.', { name })
    : i18n.t('openHAB reports “{{name}}” as not ready, so it did not run.', { name })
}

function failureText(name: string, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return i18n.t('Not allowed to run “{{name}}”', { name })
    if (err.status === 404) return i18n.t('“{{name}}” is not on this openHAB server anymore', { name })
  }
  if (err instanceof NetworkError && err.timedOut) {
    return i18n.t('No answer from openHAB after a minute. “{{name}}” may still be running.', { name })
  }
  return i18n.t('“{{name}}” could not run: {{error}}', { name, error: errorText(err) })
}

function blockOf(uid: string): RuleBlock | null {
  const rule = knownRule(useRulesStore.getState(), uid)
  return rule && rule !== 'missing' ? ruleBlock(rule) : null
}

function nameOf(uid: string, fallback: string): string {
  const rule = knownRule(useRulesStore.getState(), uid)
  return rule && rule !== 'missing' ? ruleName(rule) : fallback || uid
}

// openHAB 5 queues a second run behind the first, so a double tap would run the rule twice
const running = new Map<string, Promise<boolean>>()

/**
 * Runs a rule and says why when it did not; true once it has run. openHAB answers runnow only when the
 * rule has finished, and answers 200 even when it refused to run one, logging the refusal only, so the
 * rule list is read before and again after. A call for a rule this tab is still running joins that run.
 */
export function runRuleChecked(uid: string, fallbackName = '', onStart?: () => void): Promise<boolean> {
  const joined = running.get(uid)
  if (joined) {
    onStart?.()
    return joined
  }
  const name = nameOf(uid, fallbackName)
  const before = blockOf(uid)
  if (before) {
    notify(blockedText(name, before))
    return Promise.resolve(false)
  }
  onStart?.()
  const run = (async () => {
    try {
      await runRule(uid)
    } catch (err) {
      notify(failureText(name, err))
      // deleted since the list was read: read it again so the tile says so
      if (err instanceof ApiError && err.status === 404) void rereadRule(uid).catch(() => undefined)
      return false
    }
    const now = ruleBlock(await rereadRule(uid).catch(() => undefined))
    if (now) {
      notify(blockedText(name, now))
      return false
    }
    return true
  })()
  running.set(uid, run)
  void run.finally(() => running.delete(uid))
  return run
}
