/**
 * Renders one widget instance: looks up its definition, subscribes to just the items it needs,
 * and hands it the uniform widget context. Re-renders are scoped to the widget's own items.
 */
import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getWidgetDefinition, itemsForInstance } from '../widgets'
import type { WidgetContext } from '../widgets/types'
import type { WidgetInstance } from '../model/dashboard'
import { subscribeItems, useItemsStore } from '../store/items'
import { sendCommand } from '../api/items'

export function WidgetHost({ instance, editing }: { instance: WidgetInstance; editing: boolean }) {
  const def = getWidgetDefinition(instance.type)

  const itemNames = useMemo(
    () => itemsForInstance(instance.type, instance.config),
    [instance.type, instance.config]
  )

  useEffect(() => subscribeItems(itemNames), [itemNames])

  // Select only this widget's item states (shallow-compared) to limit re-renders.
  const states = useItemsStore(
    useShallow((s) => Object.fromEntries(itemNames.map((n) => [n, s.states[n]])))
  )

  const ctx: WidgetContext = useMemo(
    () => ({
      getItem: (name) => states[name],
      sendCommand: (item, command) => void sendCommand(item, command),
      editing,
    }),
    [states, editing]
  )

  if (!def) {
    return <div className="nh-widget nh-widget--error">Unknown widget: {instance.type}</div>
  }

  const Component = def.Component
  return <Component config={instance.config} ctx={ctx} />
}
