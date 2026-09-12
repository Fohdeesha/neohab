import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime, loggerColumn, shortLogger, type LogEntry } from './model'

const AT_BOTTOM_PX = 12
// how long a scroll still counts as the reader's after they last touched the box, which covers the
// tail of a touch flick and of the keyboard's own smooth scrolling
const READER_MS = 1500

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
  // when the reader last had hold of the box, and never by default: a zero here would read as
  // "just now" for the page's first second and a half, which is when the first lines arrive
  const readerAt = useRef(Number.NEGATIVE_INFINITY)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !following) return
    el.scrollTop = el.scrollHeight
  }, [entries, following, wrap])

  useLayoutEffect(() => {
    if (entries.length === 0) setFollowing(true)
  }, [entries.length])

  const reader = () => (readerAt.current = performance.now())
  // a hover is not a drag, but a scrollbar or a selection dragged with the button down is
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 0) reader()
  }

  // Only the reader leaving the bottom stops the list following. A scroll also arrives from our own
  // jump to the newest line and from the browser settling a relayout - opening a settings panel moves
  // this box for a frame - and measuring then latched following off for good, after which every
  // trimmed line walked the view further from the newest one.
  const onScroll = () => {
    const el = ref.current
    if (!el || performance.now() - readerAt.current > READER_MS) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX
    if (atBottom !== following) setFollowing(atBottom)
  }

  return (
    <div className={'nh-log__list' + (wrap ? ' nh-log__list--wrap' : '') + (full ? ' nh-log__list--full' : '')}>
      <div
        className="nh-log__scroll"
        ref={ref}
        onScroll={onScroll}
        onWheel={reader}
        onPointerDown={reader}
        onPointerMove={onPointerMove}
        onTouchMove={reader}
        onKeyDown={reader}
        data-following={following ? 'true' : 'false'}>
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

// an entry never changes once parsed, so a flush carrying two new lines re-renders two rows rather
// than the five hundred the list is holding
const Line = memo(function Line({ entry, full, lang }: { entry: LogEntry; full: boolean; lang: string }) {
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
})
