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

  // keyed on the item names, not the config object, which is recloned on every keystroke
  const itemNames = itemsForInstance(instance.type, instance.config)
  const itemsKey = itemNames.join('\n')
  useEffect(() => subscribeItems(itemsKey ? itemsKey.split('\n') : []), [itemsKey])

  const states = useItemsStore(useShallow((s) => selectStates(s.states, itemNames)))

  // definition defaults under the stored config, memoised so widgets are not handed a new object every render
  const config = useMemo(() => {
    const merged: Record<string, unknown> = { ...def?.defaultConfig(), ...instance.config }
    // honoured here rather than in each widget, so one that forgot to check cannot ignore the setting
    if (merged.labelMode === 'none') delete merged.label
    return merged
  }, [def, instance.config])

  const ctx: WidgetContext = useMemo(
    () => ({
      widgetId: instance.id,
      getItem: (name) => states[name],
      sendCommand: (item, command) => commandItem(item, command),
      editing
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
    <WidgetBoundary type={instance.type} resetKey={instance.config}>
      <Component config={config} ctx={ctx} />
    </WidgetBoundary>
  )
}
