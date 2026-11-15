import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RuleSummary } from '../model/presets'
import { findRule, groupRules, ruleBlock, ruleKind, ruleName, type RuleKind } from '../model/rules'
import type { TFunction } from 'i18next'
import { ensureRules, useRulesStore } from '../store/rules'
import { useAnchoredList } from './popover'

interface RulePickerProps {
  id: string
  value: string
  onChange: (uid: string, rule?: RuleSummary) => void
}

type Entry = { kind: 'rule'; rule: RuleSummary } | { kind: 'more'; count: number }

// written out rather than read from a table, so the translation check can see every one of them
export function ruleKindLabel(kind: RuleKind, t: TFunction): string {
  if (kind === 'scene') return t('Scene')
  if (kind === 'script') return t('Script')
  return t('Rule')
}

/**
 * Picks a scene, script or rule by its name. The uid is what gets stored, but a script made in Main UI
 * has a random one, so the box shows the name and a tag saying which of the three it is.
 */
export function RulePicker({ id, value, onChange }: RulePickerProps) {
  const { t } = useTranslation()
  const rules = useRulesStore((s) => s.rules)
  const status = useRulesStore((s) => s.status)
  const [query, setQuery] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const list = useAnchoredList<HTMLUListElement>({ flipBelow: 260, minHeight: 180, onClose: () => setQuery(null) })
  const { rootRef, boxRef, listRef, open, pos, close } = list
  const inputRef = useRef<HTMLInputElement>(null)
  const restoringFocus = useRef(false)

  useEffect(() => {
    ensureRules()
  }, [])

  const current = value ? findRule(rules, value) : undefined
  const shown = current ? ruleName(current) : value

  const groups = useMemo(() => groupRules(rules, query ?? '', showAll, value), [rules, query, showAll, value])
  const sections: { key: RuleKind; label: string; rules: RuleSummary[] }[] = [
    { key: 'scene', label: t('Scenes'), rules: groups.scenes },
    { key: 'script', label: t('Scripts'), rules: groups.scripts },
    { key: 'rule', label: t('Rules'), rules: groups.rules }
  ]
  const entries: Entry[] = [
    ...sections.flatMap((s) => s.rules.map((rule): Entry => ({ kind: 'rule', rule }))),
    ...(groups.hiddenRules > 0 ? [{ kind: 'more', count: groups.hiddenRules } as const] : [])
  ]

  const openList = () => {
    list.openList()
    setHighlight(0)
    ensureRules({ refresh: true })
  }

  const refocus = () => {
    // focus() dispatches synchronously, so guard around it or onFocus reopens the list just closed
    restoringFocus.current = true
    inputRef.current?.focus()
    restoringFocus.current = false
  }

  const choose = (entry: Entry) => {
    if (entry.kind === 'more') {
      setShowAll(true)
      return
    }
    onChange(entry.rule.uid, entry.rule)
    close()
    refocus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      openList()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, Math.min(highlight + (e.key === 'ArrowDown' ? 1 : -1), entries.length - 1))
      setHighlight(next)
      listRef.current?.querySelector(`#${CSS.escape(`${id}-opt-${next}`)}`)?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = entries[highlight]
      if (entry) choose(entry)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  // keep focus in the input: the blur resets the search, the list re-renders under the pointer, and the
  // click lands on nothing
  const keepFocus = (e: React.PointerEvent) => e.preventDefault()

  let at = 0
  const option = (entry: Entry) => {
    const i = at++
    const hi = i === highlight ? ' nh-picker__option--hi' : ''
    if (entry.kind === 'more') {
      return (
        <li
          key="more"
          id={`${id}-opt-${i}`}
          role="option"
          aria-selected={false}
          className={'nh-picker__option nh-rulepicker__more' + hi}
          onPointerEnter={() => setHighlight(i)}
          onPointerDown={keepFocus}
          onClick={() => choose(entry)}>
          {t('Show {{count}} other rules', { count: entry.count })}
        </li>
      )
    }
    const { rule } = entry
    const block = ruleBlock(rule)
    return (
      <li
        key={rule.uid}
        id={`${id}-opt-${i}`}
        role="option"
        aria-selected={rule.uid === value}
        data-uid={rule.uid}
        className={'nh-picker__option' + hi + (rule.uid === value ? ' nh-picker__option--current' : '')}
        onPointerEnter={() => setHighlight(i)}
        onPointerDown={keepFocus}
        onClick={() => choose(entry)}>
        <span className="nh-picker__name">{ruleName(rule)}</span>
        <span className="nh-picker__meta">
          {rule.uid}
          {block ? <span className="nh-rulepicker__flag">{block === 'disabled' ? t('disabled') : t('not ready')}</span> : null}
        </span>
      </li>
    )
  }

  const loading = status === 'idle' || status === 'loading'
  const failed = status === 'failed' || status === 'denied'

  return (
    <div className="nh-picker nh-rulepicker" ref={rootRef}>
      <div className="nh-picker__box" ref={boxRef}>
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open && entries[highlight] ? `${id}-opt-${highlight}` : undefined}
          autoComplete="off"
          value={query ?? shown}
          placeholder={t('Search scenes, scripts and rules…')}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) openList()
            setHighlight(0)
          }}
          onBlur={() => setQuery(null)}
          onFocus={() => {
            if (!restoringFocus.current) openList()
          }}
          onKeyDown={onKeyDown}
        />
        {current && query === null ? <span className="nh-rulepicker__kind">{ruleKindLabel(ruleKind(current), t)}</span> : null}
        {value !== '' || (query ?? '') !== '' ? (
          <button
            type="button"
            className="nh-picker__clear"
            aria-label={t('Clear selection')}
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault()
              onChange('')
              close()
              refocus()
            }}>
            ✕
          </button>
        ) : null}
        <button
          type="button"
          className={'nh-picker__toggle' + (open ? ' nh-picker__toggle--open' : '')}
          aria-label={open ? t('Close rule list') : t('Show rule list')}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            if (open) close()
            else {
              openList()
              inputRef.current?.focus()
            }
          }}>
          ▾
        </button>
      </div>

      {open && pos ? (
        <ul
          className="nh-picker__list"
          id={id + '-list'}
          role="listbox"
          ref={listRef}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
          {sections.map((s) =>
            s.rules.length > 0 ? (
              <li key={s.key} role="presentation" className="nh-rulepicker__group">
                <span className="nh-rulepicker__head">{s.label}</span>
                <ul role="group" aria-label={s.label} className="nh-rulepicker__rows">
                  {s.rules.map((rule) => option({ kind: 'rule', rule }))}
                </ul>
              </li>
            ) : null
          )}
          {groups.hiddenRules > 0 ? option({ kind: 'more', count: groups.hiddenRules }) : null}
          {entries.length === 0 ? (
            failed ? (
              <li className="nh-picker__empty">
                {t('The rule list could not be read.')}{' '}
                <button type="button" className="nh-report__link" onPointerDown={keepFocus} onClick={() => ensureRules({ refresh: true })}>
                  {t('Try again')}
                </button>
              </li>
            ) : loading ? (
              <li className="nh-picker__empty">{t('Loading scenes, scripts and rules…')}</li>
            ) : query ? (
              <li className="nh-picker__empty">{t('No matching scenes, scripts or rules')}</li>
            ) : (
              <li className="nh-picker__empty">{t('This server has no scenes, scripts or rules yet. Make one in Main UI first.')}</li>
            )
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
