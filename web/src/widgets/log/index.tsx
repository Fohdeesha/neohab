import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { appLocale } from '../../i18n'
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
  const { t } = useTranslation()
  useEffect(() => subscribeLogs(), [])
  const live = useLogsStore((s) => s.entries)
  const status = useLogsStore((s) => s.status)
  const serverVersion = useLogsStore((s) => s.serverVersion)
  const admin = useIsAdmin()
  const [signIn, setSignIn] = useState(false)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<LogEntry[]>([])
  const entries = paused ? frozen : live

  const { source, minLevel, loggers, contains } = config
  const filter = useMemo(() => filterOf({ source, minLevel, loggers, contains }), [source, minLevel, loggers, contains])
  const keep = keepOf(config.keep)
  const shown = useMemo(() => lastMatching(entries, filter, keep), [entries, filter, keep])

  const needsSignIn = status === 'refused' && !admin
  const unsupported = status === 'unsupported'
  const empty = unsupported
    ? t('The server log needs openHAB 4.1 or newer.')
    : status === 'connecting' || status === 'idle'
      ? t('Connecting…')
      : entries.length === 0
        ? t('Waiting for log entries…')
        : t('Nothing matches the filters yet.')

  const pause =
    needsSignIn || unsupported ? undefined : (
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
          <LogLines entries={shown} wrap={wrapOf(config.wrap)} empty={empty} lang={appLocale()} />
        )}
        {unsupported && serverVersion ? (
          <div className="nh-log__status">{t('This server is openHAB {{version}}.', { version: serverVersion })}</div>
        ) : status === 'down' || (status === 'refused' && admin) ? (
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

// drawn rather than typed: the unicode pause and play glyphs are font-dependent
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
  // every select's default is carried here as well as in its reader, because the registry check reads this one
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
