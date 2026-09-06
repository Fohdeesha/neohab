/**
 * Log widget: the server's openhab.log or its events.log, as it happens, on a dashboard tile.
 *
 * Entries come over the log websocket openHAB's own Main UI viewer reads (see model.ts for the
 * feed and its two protocols), shared between every log tile on the page through `store/logs`.
 * A tile is a filter over that one buffer: which file, a minimum level, logger patterns, a text
 * the message must contain, and how many lines to keep. Holding the tile opens the same log full
 * screen, with a search box and the filters as chips.
 *
 * Pause is the one control the tile carries itself, at the top right of the name row: reading a
 * line that is scrolling away is the thing a log makes hard, and having to open the whole log
 * full screen to stop it is a poor answer. It freezes what the tile shows while the socket keeps
 * collecting, exactly as the full-screen viewer's does, so resuming catches up rather than losing
 * what happened meanwhile. Pausing one tile leaves the others running: each is its own view.
 *
 * openHAB 5 hands the log to administrators only; 4.3 hands it to whoever its user role admits.
 * The widget asks for it either way and shows what happened: a device the server refuses while it
 * is not signed in as an administrator is told so, with the sign-in one tap away.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { SignInSheet } from '../../editor/SignInSheet'
import { useIsAdmin } from '../../store/auth'
import { subscribeLogs, useLogsStore } from '../../store/logs'
import { LogLines } from './lines'
import { filterOf, keepOf, lastMatching, wrapOf, type LogEntry, KEEP_DEFAULT, KEEP_MAX, KEEP_MIN } from './model'

export interface LogConfig extends Record<string, unknown> {
  label?: string
  source?: string
  minLevel?: string
  loggers?: string
  contains?: string
  keep?: number
  wrap?: boolean
}

function LogWidget({ config }: WidgetProps<LogConfig>) {
  const { t, i18n } = useTranslation()
  useEffect(() => subscribeLogs(), [])
  const live = useLogsStore((s) => s.entries)
  const status = useLogsStore((s) => s.status)
  const admin = useIsAdmin()
  const [signIn, setSignIn] = useState(false)
  // Paused shows the snapshot taken when the button was pressed; the socket carries on filling
  // the shared buffer behind it, so resuming shows what happened rather than a gap.
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<LogEntry[]>([])
  const entries = paused ? frozen : live

  const { source, minLevel, loggers, contains } = config
  // Rebuilt only when a filter setting moves: the logger patterns compile to regexes.
  const filter = useMemo(() => filterOf({ source, minLevel, loggers, contains }), [source, minLevel, loggers, contains])
  const keep = keepOf(config.keep)
  const shown = useMemo(() => lastMatching(entries, filter, keep), [entries, filter, keep])

  // A socket that never opened, on a device that is not signed in as an administrator, is a
  // refusal in all likelihood - and the remedy is the sign-in, so that is what is offered. An
  // administrator whose socket never opened has a server problem instead, and is told that.
  const needsSignIn = status === 'refused' && !admin
  const empty =
    status === 'connecting' || status === 'idle'
      ? t('Connecting…')
      : entries.length === 0
        ? t('Waiting for log entries…')
        : t('Nothing matches the filters yet.')

  // Not offered where there is nothing to pause: a device the server refuses sees the sign-in
  // notice and no lines at all. Passing it always would also draw a name row on a tile whose
  // name is hidden, which is the right trade for a working control and the wrong one for a dead
  // button. Where the tile is showing a log, the row is worth its ~1.05em.
  const pause = needsSignIn ? undefined : (
    <button
      type="button"
      className={'nh-log__pause' + (paused ? ' nh-log__pause--on' : '')}
      aria-pressed={paused}
      aria-label={paused ? t('Resume') : t('Pause')}
      title={paused ? t('Resume') : t('Pause')}
      onClick={() => {
        if (!paused) setFrozen(live)
        setPaused(!paused)
      }}>
      <PauseGlyph paused={paused} />
      {paused ? <span className="nh-log__pausetext">{t('Paused')}</span> : null}
    </button>
  )

  return (
    <WidgetFrame label={config.label} aside={pause}>
      <div className="nh-log" data-status={status}>
        {needsSignIn ? (
          <div className="nh-log__notice">
            <p>{t('Sign in as an administrator to see the log.')}</p>
            <button type="button" className="nh-btn nh-btn--primary" onClick={() => setSignIn(true)}>
              {t('Sign in')}
            </button>
          </div>
        ) : (
          <LogLines entries={shown} wrap={wrapOf(config.wrap)} empty={empty} lang={i18n.language} />
        )}
        {status === 'down' || (status === 'refused' && admin) ? (
          <div className="nh-log__status">{t('Could not reach the server’s log. Retrying…')}</div>
        ) : null}
      </div>
      {/* Into the body: a grid cell is a size container, which would keep a fixed sheet inside
          the tile and clip it there. */}
      {signIn
        ? createPortal(<SignInSheet reason="view" onClose={() => setSignIn(false)} onToken={() => setSignIn(false)} />, document.body)
        : null}
    </WidgetFrame>
  )
}

/**
 * Two bars, or a triangle. Drawn rather than typed: the unicode pause and play characters are
 * font-dependent, and several platforms answer the triangle with an emoji.
 */
function PauseGlyph({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {paused ? (
        <path d="M5.7 3.5 12.9 8l-7.2 4.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      ) : (
        <>
          <rect x="4.4" y="3.2" width="2.5" height="9.6" rx="0.9" fill="currentColor" />
          <rect x="9.1" y="3.2" width="2.5" height="9.6" rx="0.9" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

export const logWidget: WidgetDefinition<LogConfig> = {
  type: 'log',
  name: 'Log',
  description: 'The server log or the events log, as it happens',
  defaultSize: { w: 6, h: 3 },
  minPixelHeight: 120,
  hasHeader: true,
  // Every select's default is carried here as well as in its reader (model.ts): a select whose
  // value resolves to nothing renders blank, and the registry check for that reads this.
  defaultConfig: () => ({
    source: 'openhab',
    minLevel: 'all',
    loggers: '',
    contains: '',
    keep: KEEP_DEFAULT,
    wrap: false
  }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'source',
      type: 'select',
      label: 'Source',
      options: [
        { value: 'openhab', label: 'openhab.log' },
        { value: 'events', label: 'events.log' },
        { value: 'both', label: 'Both' }
      ],
      hint: 'openhab.log is everything the server writes about itself; events.log is the item, thing and rule events. Both come from the same feed, so this costs nothing extra.'
    },
    {
      key: 'minLevel',
      type: 'select',
      label: 'Minimum level',
      options: [
        { value: 'all', label: 'Everything' },
        { value: 'info', label: 'Info and above' },
        { value: 'warn', label: 'Warnings and errors' },
        { value: 'error', label: 'Errors only' }
      ]
    },
    {
      key: 'loggers',
      type: 'multiline',
      label: 'Logger filter (one per line)',
      placeholder: 'org.openhab.binding.mqtt\nopenhab.event.Item*Event',
      hint: 'Only entries from these loggers. A name covers everything under it, and a star stands for anything. Leave it empty for every logger.'
    },
    { key: 'contains', type: 'text', label: 'Message contains' },
    {
      key: 'keep',
      type: 'number',
      label: 'Lines to keep',
      min: KEEP_MIN,
      max: KEEP_MAX,
      hint: 'The oldest lines drop off as new ones arrive, so a chatty binding cannot grow the tile forever.'
    },
    { key: 'wrap', type: 'boolean', label: 'Wrap lines' }
  ],
  detailRoute: (dashboard, widget) => ({ name: 'log', dashboard, widget }),
  Component: LogWidget
}
