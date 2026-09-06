import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime, loggerColumn, shortLogger, type LogEntry } from './model'

const AT_BOTTOM_PX = 12

interface LogLinesProps {
  entries: LogEntry[]
  wrap: boolean
  full?: boolean
  empty: string
  lang: string
}

export function LogLines({ entries, wrap, full = false, empty, lang }: LogLinesProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  // tells the reader's own scrolling apart from the scroll this component does to follow
  const scrollingSelf = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !following) return
    scrollingSelf.current = true
    el.scrollTop = el.scrollHeight
    window.setTimeout(() => (scrollingSelf.current = false), 0)
  }, [entries, following, wrap])

  useLayoutEffect(() => {
    if (entries.length === 0) setFollowing(true)
  }, [entries.length])

  const onScroll = () => {
    if (scrollingSelf.current) return
    const el = ref.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX
    if (atBottom !== following) setFollowing(atBottom)
  }

  return (
    <div className={'nh-log__list' + (wrap ? ' nh-log__list--wrap' : '') + (full ? ' nh-log__list--full' : '')}>
      <div className="nh-log__scroll" ref={ref} onScroll={onScroll} data-following={following ? 'true' : 'false'}>
        {entries.length === 0 ? (
          <div className="nh-log__empty">{empty}</div>
        ) : (
          entries.map((e) => <Line key={e.id} entry={e} full={full} lang={lang} />)
        )}
      </div>
      {following ? null : (
        <button type="button" className="nh-log__jump" onClick={() => setFollowing(true)}>
          {t('Jump to latest')}
        </button>
      )}
    </div>
  )
}

function Line({ entry, full, lang }: { entry: LogEntry; full: boolean; lang: string }) {
  const { t } = useTranslation()
  const when = new Date(entry.time)
  return (
    <div className={'nh-log__line nh-log__line--' + entry.level.toLowerCase()} data-level={entry.level}>
      {/* The exact moment, date included, on hover: a tile shows the time alone. */}
      <span className="nh-log__time" title={when.toLocaleString(lang)}>
        {formatTime(entry.time, lang, full)}
      </span>
      <span className="nh-log__level">{entry.level}</span>
      <span className="nh-log__logger" title={entry.logger}>
        {full ? loggerColumn(entry.logger) : shortLogger(entry.logger)}
      </span>
      <span className="nh-log__msg">{entry.message}</span>
      {full && entry.stack ? (
        <details className="nh-log__stack">
          <summary>{t('Stack trace')}</summary>
          <pre>{entry.stack.trimEnd()}</pre>
        </details>
      ) : null}
    </div>
  )
}
