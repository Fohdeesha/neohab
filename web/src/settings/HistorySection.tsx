/**
 * Settings > Version history: the restore points, what each one changed, and putting one back.
 *
 * A point is highlighted to reveal what happened at it. Two comparisons are offered, because they
 * answer different questions: what that step changed (against the point before it), and what
 * restoring it would change (against the configuration as it is now).
 */
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NumberSetting } from '../components/NumberSetting'
import { diffEntries, formatValue, type ChangeKind, type ComponentDiff } from '../history/diff'
import {
  clampLimit,
  clampWindow,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_WINDOW_MIN,
  MAX_HISTORY_LIMIT,
  MAX_HISTORY_WINDOW_MIN,
  type SnapshotMeta,
} from '../model/history'
import { saveSettings, useConfigStore } from '../store/config'
import {
  currentEntries,
  getSnapshot,
  loadHistory,
  renameSnapshot,
  restoreSnapshot,
  useHistoryStore,
} from '../store/history'

type CompareMode = 'step' | 'now'

export function HistorySection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const historyLimit = useConfigStore((s) => s.settings.historyLimit)
  const historyWindow = useConfigStore((s) => s.settings.historyWindowMin)
  const index = useHistoryStore((s) => s.index)
  const loading = useHistoryStore((s) => s.loading)
  const busy = useHistoryStore((s) => s.busy)
  const error = useHistoryStore((s) => s.error)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    void loadHistory()
  }, [])

  const limit = clampLimit(historyLimit ?? DEFAULT_HISTORY_LIMIT)
  const windowMin = clampWindow(historyWindow ?? DEFAULT_HISTORY_WINDOW_MIN)
  const snapshots = index?.snapshots ?? []

  return (
    <section>
      <h2 className="nh-settings__h">{t('Version history')}</h2>
      <p className="nh-settings__text">
        {t(
          'Before each change, neohab keeps a copy of your whole configuration. Highlight a point to see what changed there, and put everything back to it if you need to. Restore points are stored separately from your configuration, so they are not part of a backup file.'
        )}
      </p>

      <div className="nh-settings__row">
        <NumberSetting
          id="nh-hist-limit"
          className="nh-hist__num"
          label={t('Restore points kept')}
          value={limit}
          min={0}
          max={MAX_HISTORY_LIMIT}
          onCommit={(v) => void saveSettings({ historyLimit: clampLimit(v) })}
        />
        <NumberSetting
          id="nh-hist-window"
          className="nh-hist__num"
          label={t('New point after (minutes of quiet)')}
          value={windowMin}
          min={0}
          max={MAX_HISTORY_WINDOW_MIN}
          onCommit={(v) => void saveSettings({ historyWindowMin: clampWindow(v) })}
        />
      </div>
      <p className="nh-settings__text">
        {limit === 0
          ? t('History is off: no restore points are kept, and existing ones are removed at the next change.')
          : t(
              'Changes made within {{minutes}} minutes of each other share one restore point, so a single editing session leaves one entry rather than dozens.',
              { minutes: windowMin }
            )}
      </p>

      {error ? <p className="nh-settings__text">{t('The history could not be read: {{error}}', { error })}</p> : null}
      {loading ? <p className="nh-settings__text">{t('Loading…')}</p> : null}
      {!loading && snapshots.length === 0 ? (
        <p className="nh-settings__text">
          {t('No restore points yet — the first one is taken the next time something is saved.')}
        </p>
      ) : null}

      <div className="nh-hist">
        {snapshots.map((snapshot, i) => (
          <Fragment key={snapshot.id}>
            <button
              type="button"
              className={'nh-hist__row' + (selected === snapshot.id ? ' nh-hist__row--on' : '')}
              aria-expanded={selected === snapshot.id}
              onClick={() => setSelected(selected === snapshot.id ? null : snapshot.id)}
            >
              <span className="nh-hist__when">{snapshot.label || formatWhen(snapshot.createdAt)}</span>
              <span className="nh-hist__what">
                <SummaryText snapshot={snapshot} oldest={i === snapshots.length - 1} />
              </span>
            </button>
            {selected === snapshot.id ? (
              <HistoryDetail
                snapshot={snapshot}
                previousId={snapshots[i + 1]?.id ?? null}
                busy={busy}
                onNotice={onNotice}
                onRestored={() => setSelected(null)}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </section>
  )
}

/** A restore point's date, in the reader's own locale. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // Seconds included: with a short window two points can land in the same minute, and two rows
  // reading the same time would be indistinguishable.
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function SummaryText({ snapshot, oldest }: { snapshot: SnapshotMeta; oldest: boolean }) {
  const { t } = useTranslation()
  const { count, names } = snapshot.summary
  if (count === 0) return <>{oldest ? t('Starting point') : t('Nothing changed')}</>
  if (names.length === 0) return <>{t('{{count}} changes', { count })}</>
  const rest = count - names.length
  const listed = names.join(', ')
  return <>{rest > 0 ? t('{{names}} and {{count}} more', { names: listed, count: rest }) : listed}</>
}

function HistoryDetail({
  snapshot,
  previousId,
  busy,
  onNotice,
  onRestored,
}: {
  snapshot: SnapshotMeta
  previousId: string | null
  busy: boolean
  onNotice: (m: string | null) => void
  onRestored: () => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<CompareMode>('step')
  const [rows, setRows] = useState<ComponentDiff[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [label, setLabel] = useState(snapshot.label ?? '')

  useEffect(() => setLabel(snapshot.label ?? ''), [snapshot.id, snapshot.label])

  const compare = useCallback(async () => {
    setRows(null)
    setFailed(null)
    try {
      // The earliest point is a starting state, not a step. Comparing it with nothing would
      // report every component as newly added, which is not what happened.
      if (mode === 'step' && !previousId) {
        setRows([])
        return
      }
      const target = await getSnapshot(snapshot.id)
      if (!target) throw new Error(t('That restore point is no longer stored on the server.'))
      if (mode === 'now') {
        // "What restoring would change": from what is there now, to what the point holds.
        setRows(diffEntries(await currentEntries(), target.components))
        return
      }
      const previous = previousId ? await getSnapshot(previousId) : null
      setRows(diffEntries(previous?.components ?? [], target.components))
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err))
    }
  }, [mode, previousId, snapshot.id, t])

  useEffect(() => {
    void compare()
  }, [compare])

  const commitRename = async () => {
    const trimmed = label.trim()
    if (trimmed === (snapshot.label ?? '')) return
    try {
      await renameSnapshot(snapshot.id, trimmed)
    } catch (err) {
      onNotice(t('Renaming failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      setLabel(snapshot.label ?? '')
    }
  }

  const restore = async () => {
    const when = snapshot.label || formatWhen(snapshot.createdAt)
    if (
      !window.confirm(
        t(
          'Put the whole configuration back to “{{when}}”? Anything changed since then is replaced. The current state is saved as a new restore point first, so this can be undone.',
          { when }
        )
      )
    ) {
      return
    }
    onNotice(null)
    try {
      const result = await restoreSnapshot(snapshot.id)
      onNotice(
        t('Restored {{count}} components from {{when}}.', { count: result.restored, when }) +
          (result.removed > 0 ? ' ' + t('{{count}} added since then were removed.', { count: result.removed }) : '') +
          (result.skipped.length > 0
            ? ' ' + t('{{count}} could not be restored because their stored image is gone.', { count: result.skipped.length })
            : '')
      )
      await loadHistory()
      onRestored()
    } catch (err) {
      onNotice(
        t('Restore failed: {{error}} — are you signed in as an administrator?', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }

  return (
    <div className="nh-histdetail">
      <div className="nh-histdetail__head">
        <div className="nh-histdetail__modes" role="group" aria-label={t('What to compare')}>
          <button
            type="button"
            className={'nh-histmode' + (mode === 'step' ? ' nh-histmode--on' : '')}
            onClick={() => setMode('step')}
          >
            {t('Changes at this point')}
          </button>
          <button
            type="button"
            className={'nh-histmode' + (mode === 'now' ? ' nh-histmode--on' : '')}
            onClick={() => setMode('now')}
          >
            {t('Compared with now')}
          </button>
        </div>
        <input
          type="text"
          className="nh-histdetail__label"
          value={label}
          placeholder={t('Name this restore point')}
          aria-label={t('Name this restore point')}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button type="button" className="nh-btn nh-btn--primary" disabled={busy} onClick={() => void restore()}>
          {busy ? t('Working…') : t('Restore everything to this point')}
        </button>
      </div>

      <p className="nh-settings__text">
        {t('{{count}} components in this restore point.', { count: snapshot.entries })}
      </p>

      {failed ? <p className="nh-settings__text">{failed}</p> : null}
      {!failed && rows === null ? <p className="nh-settings__text">{t('Loading…')}</p> : null}
      {rows !== null && rows.length === 0 ? (
        <p className="nh-settings__text">
          {mode === 'now'
            ? t('Identical to the current configuration.')
            : previousId
              ? t('Nothing changed at this point.')
              : t('This is the earliest restore point, so there is nothing before it to compare with.')}
        </p>
      ) : null}

      {rows?.map((row) => (
        <div key={row.uid} className="nh-histrow">
          <button
            type="button"
            className="nh-histrow__head"
            aria-expanded={open === row.uid}
            disabled={row.fields.length === 0}
            onClick={() => setOpen(open === row.uid ? null : row.uid)}
          >
            <span className={'nh-histrow__kind nh-histrow__kind--' + row.kind}>{kindLabel(row.kind, t)}</span>
            <span className="nh-histrow__name">{row.name}</span>
            <span className="nh-histrow__cat">{categoryLabel(row.category, t)}</span>
            {row.fields.length > 0 ? (
              <span className="nh-histrow__count">{t('{{count}} fields', { count: row.fields.length })}</span>
            ) : null}
          </button>
          {open === row.uid ? (
            <div className="nh-histrow__fields">
              {row.fields.map((field, i) => (
                <div key={field.path + i} className="nh-histfield">
                  <code className="nh-histfield__path">{field.path}</code>
                  <span className="nh-histfield__before">{formatValue(field.before)}</span>
                  <span className="nh-histfield__arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="nh-histfield__after">{formatValue(field.after)}</span>
                </div>
              ))}
              {row.truncated ? <p className="nh-settings__text">{t('More differences are not listed.')}</p> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

type Translate = (key: string) => string

function kindLabel(kind: ChangeKind, t: Translate): string {
  if (kind === 'added') return t('added')
  if (kind === 'removed') return t('removed')
  return t('changed')
}

/** The uid prefixes, in words. Anything unrecognised keeps its prefix rather than being hidden. */
function categoryLabel(category: string, t: Translate): string {
  switch (category) {
    case 'dashboard':
      return t('Dashboard')
    case 'theme':
      return t('Theme')
    case 'widgetdef':
      return t('Custom widget')
    case 'icon':
      return t('Icon')
    case 'background':
      return t('Background')
    case 'settings':
      return t('Settings')
    default:
      return category
  }
}
