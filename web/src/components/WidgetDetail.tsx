/**
 * The widget detail sheet: what a hold or a right-click on a tile opens.
 *
 * A dashboard tile is a deliberate summary - one number, one button - and the question it always
 * raises is "and what has it been doing?". This answers it without leaving the dashboard or
 * editing anything: the full control for the item, its current value, when it last changed, and
 * its recent history.
 *
 * The history is the chart widget itself rather than a second plotting path, so a sheet and a
 * chart tile on the same item agree by construction and the sheet inherits the persistence
 * notice, the lazy plot chunk and the theme sampling for free.
 *
 * WHICH control to offer is asked of the widget (`WidgetDefinition.controlFor`), never guessed from
 * the item's state. Guessing is what made a slider configured 2000-6500 K come out as a 0-100 track
 * that would have commanded 47 to a lamp, gave a rollershutter a position slider where its tile
 * offers up/stop/down, and left a media player with no buttons at all - PLAY is not a shape a state
 * sniffer can recognise. The guess survives as `kind: 'auto'`, for the widgets that genuinely have
 * nothing to declare.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
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
  type HistoryChange,
} from '../model/itemDetail'
import type { WidgetInstance } from '../model/dashboard'
import { subscribeItems, useItemsStore } from '../store/items'
import { getWidgetDefinition, instanceCommands, instanceControl, itemsForInstance } from '../widgets'
import { chartWidget } from '../widgets/chart'
import { isPeriod } from '../widgets/chart/model'
import { ColorControl } from '../widgets/color/ColorControl'
import { commandItem } from '../widgets/common/command'
import type { ItemControl } from '../widgets/common/itemControl'
import { ChoiceControl, RangeControl, SwitchControl } from '../widgets/common/QuickControls'
import { stateKind } from '../widgets/common/stateKind'
import type { WidgetContext } from '../widgets/types'

/** A state change refetches the item for its timestamps, but no faster than this - a dimmer
 *  fading through twenty values must not become twenty requests. */
const REFETCH_DEBOUNCE_MS = 1500

export function WidgetDetail({ instance, onClose }: { instance: WidgetInstance; onClose: () => void }) {
  const { t } = useTranslation()
  // The effective config, exactly as WidgetHost builds it: definition defaults under the stored
  // keys. An imported config often omits a key the widget has a default for, and the sheet has to
  // read the same values the tile is drawing itself with.
  const config = useMemo(
    () => ({ ...getWidgetDefinition(instance.type)?.defaultConfig(), ...instance.config }),
    [instance.type, instance.config]
  )
  const items = useMemo(() => itemsForInstance(instance.type, config), [instance.type, config])
  // Whether the tile you held is a control at all. A read-only gauge, a value readout or a chart
  // is a display, and being handed a slider from one is a surprise rather than a shortcut.
  const commands = useMemo(() => instanceCommands(instance.type, config), [instance.type, config])
  // One item goes straight to it; several ask which, rather than guessing at the first.
  const [chosen, setChosen] = useState<string | null>(items.length === 1 ? items[0] : null)
  // The item's own label, once the pane has fetched it. A dashboard is read in labels, so that is
  // the better title; the name stays underneath, because it is what a rule or a link refers to.
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => setLabel(null), [chosen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Into the body, not where this sits in the tree: every grid cell is a size container, which
  // makes it the containing block for fixed descendants, so a panel rendered inside the grid
  // could be laid out and clipped to a tile rather than the screen.
  return createPortal(
    <div className="nh-detail" onClick={onClose}>
      <div
        className="nh-detail__panel"
        role="dialog"
        aria-label={t('Details')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nh-detail__head">
          {chosen && items.length > 1 ? (
            <button type="button" className="nh-iconbtn" aria-label={t('Back')} onClick={() => setChosen(null)}>
              ‹
            </button>
          ) : null}
          <span className="nh-detail__title">
            {chosen ? (label ?? chosen) : t('Details')}
            {chosen && label ? <span className="nh-detail__sub">{chosen}</span> : null}
          </span>
          <button type="button" className="nh-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="nh-detail__body">
          {chosen ? (
            // Keyed on the item, so choosing another in the picker starts from nothing rather
            // than showing the previous item's facts until each request lands.
            <ItemPane
              key={chosen}
              name={chosen}
              commands={commands}
              control={instanceControl(instance.type, config, chosen)}
              period={historyPeriodOf(config)}
              onLabel={setLabel}
            />
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

/**
 * The window the history opens on: the widget's own when it has one, so holding a chart set to 7d
 * opens on 7d instead of starting the reader back at a day. Validated rather than trusted - it
 * comes out of stored configuration - and the chips are there to change it either way.
 */
function historyPeriodOf(config: Record<string, unknown>): string {
  if (isPeriod(config.period)) return config.period
  // What the gauge's own sparkline is set to.
  if (isPeriod(config.historyPeriod)) return config.historyPeriod
  return '24h'
}

/**
 * The control a widget asked for, or nothing when it comes to nothing.
 *
 * `auto` is the old rule, and it is still the right answer where a widget cannot know what it is
 * bound to (a floor plan's lights). The item's own declared command options come BEFORE the
 * numeric slider inside it: an item that lists the commands it accepts is telling you exactly
 * that, and a projector input at "3" is not something to drag a 0-100 track over.
 */
function renderControl(
  control: ItemControl,
  name: string,
  ctx: WidgetContext,
  state: string | undefined,
  options: CommandOption[]
) {
  switch (control.kind) {
    case 'color':
      return <ColorControl item={name} ctx={ctx} />
    case 'range':
      return (
        <RangeControl item={name} ctx={ctx} min={control.min} max={control.max} step={control.step} unit={control.unit} />
      )
    case 'onoff':
      return <SwitchControl item={name} ctx={ctx} on={control.on} off={control.off} />
    case 'choices':
      return control.choices.length ? <ChoiceControl item={name} ctx={ctx} choices={control.choices} /> : null
    case 'auto': {
      const kind = stateKind(state)
      if (kind === 'color') return <ColorControl item={name} ctx={ctx} />
      if (kind === 'onoff') return <SwitchControl item={name} ctx={ctx} />
      if (options.length) {
        return (
          <ChoiceControl
            item={name}
            ctx={ctx}
            // A server's own option labels are its text, not ours, so they are shown verbatim.
            choices={options.map((o) => ({ command: o.command, label: o.label ?? o.command }))}
          />
        )
      }
      return kind === 'level' ? <RangeControl item={name} ctx={ctx} /> : null
    }
  }
}

function ItemPane({
  name,
  commands,
  control,
  period,
  onLabel,
}: {
  name: string
  commands: boolean
  control: ItemControl | undefined
  period: string
  onLabel: (label: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const [item, setItem] = useState<Item | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => subscribeItems([name]), [name])
  const live = useItemsStore((s) => s.states[name])

  // Fetched per item rather than taken from the catalog: the catalog deliberately asks for only
  // the fields it needs across thousands of items, and the registry's own state history is not
  // among them. One request for the single item somebody is looking at.
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

  // A change means the timestamps just moved, so read them again - debounced, or a dimmer fading
  // through twenty values would become twenty requests.
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

  // Rebuilt when the state moves, so the controls below re-render against the current value.
  const ctx = useMemo<WidgetContext>(
    () => ({
      widgetId: 'detail:' + name,
      getItem: (n) => (n === name ? live : useItemsStore.getState().states[n]),
      sendCommand: (i, c) => commandItem(i, c),
      editing: false,
    }),
    [name, live]
  )

  // openHAB 4.x serves no change timestamp at all, so the history answers instead. Asked only
  // once the item has been read and only when the server did not answer, so a 5.x server costs
  // no request; a failure (no persistence service) simply leaves the row out, and the chart
  // below is already where that gets explained.
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

  // A change watched happening is the most accurate answer there is, and beats the persistence
  // resolution outright. The FIRST state to arrive is the subscription delivering what was
  // already there, which is not a change - hence the previous value rather than a plain effect.
  const [observed, setObserved] = useState<number | undefined>(undefined)
  const previousState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const before = previousState.current
    previousState.current = liveState
    if (before !== undefined && liveState !== undefined && before !== liveState) setObserved(Date.now())
  }, [liveState])

  const readOnly = item?.stateDescription?.readOnly === true
  // Array.isArray, not `?? []`: this sheet renders outside any WidgetBoundary, so a response
  // whose commandOptions is not a list would take the dashboard down rather than one tile.
  const optionsRaw = item?.commandDescription?.commandOptions
  const options = Array.isArray(optionsRaw) ? optionsRaw : []
  // Two independent refusals, either of which is enough: the widget saying it is a display, and
  // the item saying it will not be written. Built as a node rather than a flag, so a control that
  // comes to nothing leaves no empty box behind - which is what a media player used to get.
  const controlNode =
    commands && !readOnly && control ? renderControl(control, name, ctx, live?.state ?? item?.state, options) : null
  const stored = history.kind === 'at' ? history.time : undefined
  const reported = serverChange ?? stored
  const changed = observed !== undefined && (reported === undefined || observed > reported) ? observed : reported
  const relative = changed === undefined ? undefined : relativeTime(changed, Date.now(), i18n.language)
  // History exists and the value held right across the window. Saying so beats leaving the row
  // out, which reads as "nothing is known" when what is known is that this thing is steady.
  const heldAllWindow = changed === undefined && history.kind === 'before'

  const chartConfig = useMemo(
    () => ({
      series: [{ item: name }],
      period,
      // The expand route addresses a real dashboard widget; this chart is synthesized, so it has
      // nowhere to expand to.
      expand: false,
      legend: false,
      label: '',
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
            <dd title={new Date(changed as number).toLocaleString(i18n.language)}>{relative}</dd>
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

      {/* Where you go to change what the item IS, rather than what it currently holds. */}
      <a className="nh-detail__link" href={ohUrl(mainUiItemPath(name))} target="_blank" rel="noreferrer">
        {t('Open in Main UI')}
      </a>
      {failed && !item ? <p className="nh-detail__hint">{t('Could not read this item from the server.')}</p> : null}
    </>
  )
}
