import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDialog } from './dialog'
import { createPortal } from 'react-dom'
import { holdTookGesture } from './useLongPress'
import { useTranslation } from 'react-i18next'
import { appLocale } from '../i18n'
import { getItem } from '../api/items'
import { ohUrl } from '../api/base'
import { getItemHistory } from '../api/persistence'
import type { CommandOption, Item } from '../api/types'
import {
  CHANGE_LOOKBACK_MS,
  lastChangeAt,
  lastChangeFromHistory,
  mainUiItemPath,
  relativeTime,
  type HistoryChange
} from '../model/itemDetail'
import type { WidgetInstance } from '../model/dashboard'
import { selectStates, subscribeItems, useItemsStore } from '../store/items'
import { useKioskMode } from '../store/kiosk'
import { useShallow } from 'zustand/react/shallow'
import { getWidgetDefinition, instanceCommands, instanceControl, instanceLiveDrag, itemsForInstance, widgetDetailView } from '../widgets'
import { WidgetBoundary } from './WidgetBoundary'
import { chartWidget } from '../widgets/chart'
import { isPeriod } from '../widgets/chart/model'
import { ColorControl } from '../widgets/color/ColorControl'
import { commandItem } from '../widgets/common/command'
import type { ItemControl } from '../widgets/common/itemControl'
import { ChoiceControl, RangeControl, SwitchControl } from '../widgets/common/QuickControls'
import { stateKind } from '../widgets/common/stateKind'
import type { WidgetContext } from '../widgets/types'

const REFETCH_DEBOUNCE_MS = 1500

export function WidgetDetail({ instance, onClose }: { instance: WidgetInstance; onClose: () => void }) {
  const { t } = useTranslation()
  const config = useMemo(
    () => ({ ...getWidgetDefinition(instance.type)?.defaultConfig(), ...instance.config }),
    [instance.type, instance.config]
  )
  const items = useMemo(() => itemsForInstance(instance.type, config), [instance.type, config])
  const def = getWidgetDefinition(instance.type)
  const DetailView = widgetDetailView(instance.type)
  const ownTitle = typeof config.label === 'string' && config.label.trim() !== '' ? config.label : t(def?.name ?? 'Details')
  const commands = useMemo(() => instanceCommands(instance.type, config), [instance.type, config])
  // the sheet's slider is the widget's own control, so it drags the way the widget does: its own setting
  // where it has one, and never live where the widget is not (a thermostat setpoint drives a boiler)
  const liveConfig = useMemo(
    () => ({ liveDrag: instanceLiveDrag(instance.type, config) ? config.liveDrag : 'release' }),
    [instance.type, config]
  )
  const [chosen, setChosen] = useState<string | null>(items.length === 1 ? items[0] : null)
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => setLabel(null), [chosen])

  const panelRef = useRef<HTMLDivElement>(null)
  useDialog(panelRef, onClose, true)

  // portalled into the body (a grid cell is a size container, so a fixed child would be laid out and clipped to
  // the tile), and the scrim ignores the click that ends the hold which opened it
  const onScrimClick = () => {
    if (holdTookGesture()) return
    onClose()
  }

  return createPortal(
    <div className="nh-detail" onClick={onScrimClick}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="nh-detail__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('Details')}
        onClick={(e) => e.stopPropagation()}>
        <header className="nh-detail__head">
          {!DetailView && chosen && items.length > 1 ? (
            <button type="button" className="nh-iconbtn" aria-label={t('Back')} onClick={() => setChosen(null)}>
              ‹
            </button>
          ) : null}
          <span className="nh-detail__title">
            {DetailView ? ownTitle : chosen ? (label ?? chosen) : t('Details')}
            {!DetailView && chosen && label ? <span className="nh-detail__sub">{chosen}</span> : null}
          </span>
          <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="nh-detail__body">
          {DetailView ? (
            <WidgetPane instance={instance} config={config} items={items} View={DetailView} />
          ) : chosen ? (
            // its own boundary: a throw in here would otherwise take the whole dashboard with it
            <WidgetBoundary type={instance.type} resetKey={chosen}>
              <ItemPane
                key={chosen}
                name={chosen}
                commands={commands}
                control={instanceControl(instance.type, config, chosen)}
                liveConfig={liveConfig}
                period={historyPeriodOf(config)}
                onLabel={setLabel}
              />
            </WidgetBoundary>
          ) : (
            <>
              <p className="nh-detail__hint">{t('This widget uses several items. Which one?')}</p>
              <ul className="nh-detail__pick">
                {items.map((name) => (
                  <li key={name}>
                    <button type="button" className="nh-detail__pickrow" onClick={() => setChosen(name)}>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function WidgetPane({
  instance,
  config,
  items,
  View
}: {
  instance: WidgetInstance
  config: Record<string, unknown>
  items: string[]
  View: NonNullable<ReturnType<typeof widgetDetailView>>
}) {
  const itemsKey = items.join('\n')
  useEffect(() => subscribeItems(itemsKey ? itemsKey.split('\n') : []), [itemsKey])
  const states = useItemsStore(useShallow((st) => selectStates(st.states, items)))
  const ctx = useMemo<WidgetContext>(
    () => ({
      widgetId: 'detail:' + instance.id,
      getItem: (n) => states[n],
      sendCommand: (i, c) => commandItem(i, c),
      editing: false
    }),
    [instance.id, states]
  )
  return (
    <WidgetBoundary type={instance.type} resetKey={config}>
      <View config={config} ctx={ctx} />
    </WidgetBoundary>
  )
}

function historyPeriodOf(config: Record<string, unknown>): string {
  if (isPeriod(config.period)) return config.period
  if (isPeriod(config.historyPeriod)) return config.historyPeriod
  return '24h'
}

// the item's own command options come BEFORE the numeric slider: an item listing what it accepts is telling
// you exactly that
function renderControl(
  control: ItemControl,
  name: string,
  ctx: WidgetContext,
  state: string | undefined,
  options: CommandOption[],
  live: { liveDrag?: unknown }
) {
  switch (control.kind) {
    case 'color':
      return <ColorControl item={name} ctx={ctx} power={control.power === true} config={live} />
    case 'range':
      return (
        <RangeControl item={name} ctx={ctx} min={control.min} max={control.max} step={control.step} unit={control.unit} config={live} />
      )
    case 'onoff':
      return <SwitchControl item={name} ctx={ctx} on={control.on} off={control.off} nonZeroIsOn={control.nonZeroIsOn === true} />
    case 'choices':
      return control.choices.length ? <ChoiceControl item={name} ctx={ctx} choices={control.choices} /> : null
    case 'auto': {
      const kind = stateKind(state)
      if (kind === 'color') return <ColorControl item={name} ctx={ctx} config={live} />
      if (kind === 'onoff') return <SwitchControl item={name} ctx={ctx} />
      if (options.length) {
        return <ChoiceControl item={name} ctx={ctx} choices={options.map((o) => ({ command: o.command, label: o.label ?? o.command }))} />
      }
      return kind === 'level' ? <RangeControl item={name} ctx={ctx} config={live} /> : null
    }
  }
}

function ItemPane({
  name,
  commands,
  control,
  liveConfig,
  period,
  onLabel
}: {
  name: string
  commands: boolean
  control: ItemControl | undefined
  liveConfig: { liveDrag?: unknown }
  period: string
  onLabel: (label: string | null) => void
}) {
  const { t } = useTranslation()
  const kiosk = useKioskMode()
  const [item, setItem] = useState<Item | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => subscribeItems([name]), [name])
  const live = useItemsStore((s) => s.states[name])

  const load = useCallback(
    (signal: AbortSignal) => {
      getItem(name, signal)
        .then((i) => {
          setItem(i)
          onLabel(typeof i.label === 'string' ? i.label : null)
        })
        .catch(() => !signal.aborted && setFailed(true))
    },
    [name, onLabel]
  )

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const liveState = live?.state
  useEffect(() => {
    if (liveState === undefined) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => load(ctrl.signal), REFETCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [liveState, load])

  const ctx = useMemo<WidgetContext>(
    () => ({
      widgetId: 'detail:' + name,
      getItem: (n) => (n === name ? live : useItemsStore.getState().states[n]),
      sendCommand: (i, c) => commandItem(i, c),
      editing: false
    }),
    [name, live]
  )

  // openHAB 4.x serves no change timestamp, so persistence answers instead
  const [history, setHistory] = useState<HistoryChange>({ kind: 'unknown' })
  const serverChange = lastChangeAt(item)
  const needHistory = item !== null && serverChange === undefined
  useEffect(() => {
    if (!needHistory) return
    const ctrl = new AbortController()
    getItemHistory(name, new Date(Date.now() - CHANGE_LOOKBACK_MS), { boundary: true, signal: ctrl.signal })
      .then((points) => setHistory(lastChangeFromHistory(points)))
      .catch(() => {})
    return () => ctrl.abort()
  }, [name, needHistory])

  const [observed, setObserved] = useState<number | undefined>(undefined)
  const previousState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const before = previousState.current
    previousState.current = liveState
    if (before !== undefined && liveState !== undefined && before !== liveState) setObserved(Date.now())
  }, [liveState])

  const readOnly = item?.stateDescription?.readOnly === true
  // Array.isArray, not `?? []`: this renders outside any WidgetBoundary
  const optionsRaw = item?.commandDescription?.commandOptions
  const options = Array.isArray(optionsRaw) ? optionsRaw : []
  const controlNode =
    commands && !readOnly && control ? renderControl(control, name, ctx, live?.state ?? item?.state, options, liveConfig) : null
  const stored = history.kind === 'at' ? history.time : undefined
  const reported = serverChange ?? stored
  const changed = observed !== undefined && (reported === undefined || observed > reported) ? observed : reported
  const relative = changed === undefined ? undefined : relativeTime(changed, Date.now(), appLocale())
  const heldAllWindow = changed === undefined && history.kind === 'before'

  const chartConfig = useMemo(
    () => ({
      series: [{ item: name }],
      period,
      expand: false,
      legend: false,
      label: ''
    }),
    [name, period]
  )
  const Chart = chartWidget.Component

  return (
    <>
      {controlNode ? <section className="nh-detail__control">{controlNode}</section> : null}

      <dl className="nh-detail__facts">
        <div className="nh-detail__row">
          {/* 'State', not 'Now': the existing 'Now' key is ChartView's jump-to-the-present button
              and is translated as the time adverb ("Jetzt", "Maintenant"). */}
          <dt>{t('State')}</dt>
          <dd>{live?.displayState ?? live?.state ?? t('No state yet')}</dd>
        </div>
        {relative ? (
          <div className="nh-detail__row">
            <dt>{t('Last changed')}</dt>
            {/* The exact moment on hover; the relative form is what is worth reading at a glance. */}
            <dd title={new Date(changed as number).toLocaleString(appLocale())}>{relative}</dd>
          </div>
        ) : heldAllWindow ? (
          <div className="nh-detail__row">
            <dt>{t('Last changed')}</dt>
            {/* Says "a day" because CHANGE_LOOKBACK_MS is a day; move one and move the other. */}
            <dd>{t('Over a day ago')}</dd>
          </div>
        ) : null}
        {/* No Label row: the label IS the title above, and repeating it wastes a line. */}
        {item?.type ? (
          <div className="nh-detail__row">
            <dt>{t('Type')}</dt>
            <dd>{item.type}</dd>
          </div>
        ) : null}
      </dl>

      <section className="nh-detail__chart">
        <h3 className="nh-detail__subhead">{t('History')}</h3>
        <div className="nh-detail__plot">
          <Chart config={chartConfig} ctx={ctx} />
        </div>
      </section>

      {/* Where you go to change what the item IS, rather than what it currently holds.
          Not in kiosk mode: the whole point of that mode is that the panel shows one thing and
          offers no way out of it, and this opens a second tab of a different application. */}
      {kiosk ? null : (
        <a className="nh-detail__link" href={ohUrl(mainUiItemPath(name))} target="_blank" rel="noreferrer">
          {t('Open in Main UI')}
        </a>
      )}
      {failed && !item ? <p className="nh-detail__hint">{t('Could not read this item from the server.')}</p> : null}
    </>
  )
}
