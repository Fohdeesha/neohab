/**
 * The list of log lines, shared by the tile and the full-screen page.
 *
 * It follows the newest entry the way a terminal tail does: new lines scroll the list to the
 * bottom for as long as the reader was at the bottom, and scrolling up to read something pauses
 * that - a "Jump to latest" pill then says so and takes them back. Scrolling back down resumes
 * following by itself. The rule is the reader's position, not a toggle they have to remember.
 *
 * The tile draws each line on one row - time, level, the logger's last segment, the message cut
 * with an ellipsis - and the page has the room for the whole logger, milliseconds and the stack
 * trace under an entry that carried one.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime, loggerColumn, shortLogger, type LogEntry } from './model'

/** Within this many pixels of the end counts as "at the bottom". A scrollbar's own step is bigger. */
const AT_BOTTOM_PX = 12

interface LogLinesProps {
  entries: LogEntry[]
  /** Wrap long messages instead of cutting them. The page always wraps. */
  wrap: boolean
  /** The full anatomy: whole logger names, milliseconds, stack traces. */
  full?: boolean
  /** What to say when there is nothing to show. */
  empty: string
  lang: string
}

export function LogLines({ entries, wrap, full = false, empty, lang }: LogLinesProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  // The two things a scroll event cannot tell apart on its own: the reader's own scrolling, and
  // the scroll this component performs to follow. The flag marks the latter for the handler.
  const scrollingSelf = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !following) return
    scrollingSelf.current = true
    el.scrollTop = el.scrollHeight
    // The scroll event fires after this effect, in the same task or the next; either way the
    // flag is down again before a reader can move.
    window.setTimeout(() => (scrollingSelf.current = false), 0)
  }, [entries, following, wrap])

  // Emptied (the page's Clear, or a filter that matches nothing yet): start following again, or
  // the first line to arrive would sit under a pill saying there is something newer.
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
