import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { appLocale } from '../i18n'
import { useConfigStore } from '../store/config'
import { useIsAdmin } from '../store/auth'
import { clearLogs, subscribeLogs, useLogsStore } from '../store/logs'
import { notify } from '../store/notify'
import { SignInSheet } from '../editor/SignInSheet'
import { logWidget } from '../widgets/log'
import { LogLines } from '../widgets/log/lines'
import {
  entryText,
  filterOf,
  keepOf,
  lastMatching,
  minLevelOf,
  minRank,
  searchMatches,
  sourceSetting,
  type LogEntry,
  type LogSource,
  type MinLevel
} from '../widgets/log/model'
import { navigate } from './router'

const LEVELS: { value: MinLevel; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'info', label: 'Info and above' },
  { value: 'warn', label: 'Warnings and errors' },
  { value: 'error', label: 'Errors only' }
]

const SOURCES: { value: LogSource; label: string }[] = [
  { value: 'openhab', label: 'openhab.log' },
  { value: 'events', label: 'events.log' },
  { value: 'both', label: 'Both' }
]

export function LogView({ dashboardId, widgetId }: { dashboardId: string; widgetId: string }) {
  const { t } = useTranslation()
  const dashboards = useConfigStore((s) => s.dashboards)
  const loaded = useConfigStore((s) => s.loaded)
  const dashboard = dashboards.find((d) => d.id === dashboardId)
  const widget = dashboard?.widgets.find((w) => w.id === widgetId)
  const isLog = widget?.type === 'log'
  const config = useMemo(() => ({ ...logWidget.defaultConfig(), ...(widget?.config ?? {}) }), [widget])

  useEffect(() => (isLog ? subscribeLogs() : undefined), [isLog])
  const live = useLogsStore((s) => s.entries)
  const status = useLogsStore((s) => s.status)
  const serverVersion = useLogsStore((s) => s.serverVersion)
  const admin = useIsAdmin()
  const [signIn, setSignIn] = useState(false)

  const [source, setSource] = useState<LogSource>(() => sourceSetting(config.source))
  const [minLevel, setMinLevel] = useState<MinLevel>(() => minLevelOf(config.minLevel))
  const [query, setQuery] = useState('')
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<LogEntry[]>([])
  const bodyRef = useRef<HTMLDivElement>(null)

  const entries = paused ? frozen : live
  const filter = useMemo(() => ({ ...filterOf(config), source, minRank: minRank(minLevel) }), [config, source, minLevel])
  const keep = keepOf(config.keep)
  const matching = useMemo(() => lastMatching(entries, filter, keep), [entries, filter, keep])
  const shown = useMemo(() => (query.trim() === '' ? matching : matching.filter((e) => searchMatches(e, query))), [matching, query])

  const back = () => navigate({ name: 'dashboard', id: dashboardId })
  const togglePause = () => {
    if (!paused) setFrozen(live)
    setPaused(!paused)
  }
  const clear = () => {
    clearLogs()
    setFrozen([])
  }

  // navigator.clipboard exists only in a secure context, and a LAN openHAB is not one - so select the text
  // instead
  const copy = async () => {
    const text = shown.map((e) => entryText(e, appLocale())).join('\n')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        notify(t('Copied'))
        return
      }
    } catch {
      // refused, or an insecure context that still exposes the object
    }
    const list = bodyRef.current?.querySelector('.nh-log__scroll')
    if (!list) return
    const range = document.createRange()
    range.selectNodeContents(list)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    notify(t('Selected - press Ctrl+C'))
  }

  if (!loaded) {
    return (
      <div className="nh-dash">
        <p className="nh-dash__empty">{t('Loading…')}</p>
      </div>
    )
  }
  if (!isLog) {
    return (
      <div className="nh-dash">
        <header className="nh-dash__bar">
          <button className="nh-iconbtn" onClick={back} aria-label={t('Back')} title={t('Back')}>
            ‹
          </button>
          <span className="nh-dash__title">{t('Log')}</span>
        </header>
        <p className="nh-dash__empty">{t('That log widget is no longer on this dashboard.')}</p>
      </div>
    )
  }

  const title = typeof config.label === 'string' && config.label.trim() !== '' ? config.label : t('Log')
  const needsSignIn = status === 'refused' && !admin
  const unsupported = status === 'unsupported'
  const state = paused
    ? 'paused'
    : unsupported
      ? 'unsupported'
      : status === 'live'
        ? 'live'
        : status === 'connecting' || status === 'idle'
          ? 'connecting'
          : 'down'
  const stateText =
    state === 'paused'
      ? t('Paused')
      : state === 'unsupported'
        ? t('Unavailable')
        : state === 'live'
          ? t('Live')
          : state === 'connecting'
            ? t('Connecting…')
            : t('Reconnecting…')
  const empty = unsupported
    ? t('The server log needs openHAB 4.1 or newer.')
    : status === 'connecting' || status === 'idle'
      ? t('Connecting…')
      : entries.length === 0
        ? t('Waiting for log entries…')
        : t('Nothing matches the filters yet.')

  return (
    <div className="nh-dash nh-logview">
      <header className="nh-dash__bar">
        <button className="nh-iconbtn" onClick={back} aria-label={t('Back')} title={t('Back to the dashboard')}>
          ‹
        </button>
        <span className="nh-dash__title">{title}</span>
        <span className="nh-dash__spacer" />
        <span className={'nh-logview__state nh-logview__state--' + state}>{stateText}</span>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={togglePause} disabled={unsupported}>
          {paused ? t('Resume') : t('Pause')}
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={clear} disabled={unsupported}>
          {t('Clear')}
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={copy} disabled={shown.length === 0}>
          {t('Copy')}
        </button>
      </header>

      <div className="nh-logview__tools">
        <input
          type="search"
          className="nh-logview__search"
          placeholder={t('Search')}
          aria-label={t('Search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="nh-logview__chips" role="group" aria-label={t('Minimum level')}>
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={'nh-chip' + (minLevel === l.value ? ' nh-chip--on' : '')}
              onClick={() => setMinLevel(l.value)}>
              {t(l.label)}
            </button>
          ))}
        </div>
        <div className="nh-logview__chips" role="group" aria-label={t('Source')}>
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={'nh-chip' + (source === s.value ? ' nh-chip--on' : '')}
              onClick={() => setSource(s.value)}>
              {t(s.label)}
            </button>
          ))}
        </div>
        <span className="nh-logview__count">{t('Showing {{shown}} of {{total}}', { shown: shown.length, total: matching.length })}</span>
      </div>

      <div className="nh-logview__body" ref={bodyRef}>
        <div className="nh-log" data-status={status}>
          {needsSignIn ? (
            <div className="nh-log__notice">
              <p>{t('Sign in as an administrator to see the log.')}</p>
              <button type="button" className="nh-btn nh-btn--primary" onClick={() => setSignIn(true)}>
                {t('Sign in')}
              </button>
            </div>
          ) : (
            <LogLines entries={shown} wrap full empty={empty} lang={appLocale()} />
          )}
          {unsupported && serverVersion ? (
            <div className="nh-log__status">{t('This server is openHAB {{version}}.', { version: serverVersion })}</div>
          ) : status === 'down' || (status === 'refused' && admin) ? (
            <div className="nh-log__status">{t('Could not reach the server’s log. Retrying…')}</div>
          ) : null}
        </div>
      </div>
      {signIn
        ? createPortal(<SignInSheet reason="view" onClose={() => setSignIn(false)} onToken={() => setSignIn(false)} />, document.body)
        : null}
    </div>
  )
}
