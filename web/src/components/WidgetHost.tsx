/**
 * Renders one widget instance: looks up its definition, subscribes to just the items it needs,
 * and hands it the uniform widget context. Re-renders are scoped to the widget's own items, and
 * a widget that throws is contained here (see WidgetBoundary) rather than taking the app with it.
 */
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { getWidgetDefinition, itemsForInstance } from '../widgets'
import type { WidgetContext } from '../widgets/types'
import type { WidgetInstance } from '../model/dashboard'
import { selectStates, subscribeItems, useItemsStore } from '../store/items'
import { commandItem } from '../widgets/common/command'
import { WidgetBoundary } from './WidgetBoundary'

export function WidgetHost({ instance, editing }: { instance: WidgetInstance; editing: boolean }) {
  const { t } = useTranslation()
  const def = getWidgetDefinition(instance.type)

  // Key the subscription on the item names themselves, not config identity - the config object
  // is recloned on every edit and would otherwise resubscribe per keystroke.
  const itemNames = itemsForInstance(instance.type, instance.config)
  const itemsKey = itemNames.join('\n')
  useEffect(
    () => subscribeItems(itemsKey ? itemsKey.split('\n') : []),
    [itemsKey]
  )

  // Select only this widget's item states (shallow-compared) to limit re-renders.
  const states = useItemsStore(useShallow((s) => selectStates(s.states, itemNames)))

  // Definition defaults fill any keys the stored config doesn't set (e.g. imported configs), so
  // widget behavior and the settings form always agree on effective values. Memoised on the
  // stored config's identity: rebuilding it every render handed every widget a new object, which
  // makes memoising a widget impossible for anyone who later wants to.
  const config = useMemo(() => {
    const merged: Record<string, unknown> = { ...def?.defaultConfig(), ...instance.config }
    // "Show the name: Not at all" is honoured here rather than inside each widget. Every widget
    // draws its own header from config.label, so one that forgot to check would silently ignore
    // the setting - dropping the name centrally makes that impossible.
    if (merged.labelMode === 'none') delete merged.label
    return merged
  }, [def, instance.config])

  const ctx: WidgetContext = useMemo(
    () => ({
      widgetId: instance.id,
      getItem: (name) => states[name],
      sendCommand: (item, command) => commandItem(item, command),
      editing,
    }),
    [states, editing, instance.id]
  )

  if (!def) {
    return (
      <div className="nh-widget nh-widget--error">
        <span className="nh-widget__errtitle">{t('Unknown widget type “{{type}}”', { type: instance.type })}</span>
        <span className="nh-widget__errhint">
          {t('It may come from a newer version of neohab, or from a configuration this one cannot read.')}
        </span>
      </div>
    )
  }

  const Component = def.Component
  return (
    // Reset on the stored config, so an edit that fixes a broken widget renders it again without
    // a reload; the instance id covers a paste replacing what is in this slot.
    <WidgetBoundary type={instance.type} resetKey={instance.config}>
      <Component config={config} ctx={ctx} />
    </WidgetBoundary>
  )
}
