import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nextFreeId } from '../model/components'
import type { CustomWidgetDef } from '../model/widgetdef'
import { saveWidgetDef, useConfigStore } from '../store/config'
import { loadBundledGallery, loadGalleryWidget, type GalleryEntry } from '../gallery/gallery'
import { errorText } from '../api/errors'
import type { NoticeFn } from '../store/notify'

function sameDef(a: CustomWidgetDef, b: CustomWidgetDef): boolean {
  const norm = (d: CustomWidgetDef) =>
    JSON.stringify({ kind: d.kind ?? 'template', template: d.template ?? '', script: d.script ?? '', settings: d.settings ?? [] })
  return norm(a) === norm(b)
}

export function WidgetExamples({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const defs = useConfigStore((s) => s.widgetDefs)
  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadBundledGallery()
      .then((index) => setEntries(index.widgets))
      .catch((err) => setError(errorText(err)))
  }, [])

  const add = async (entry: GalleryEntry) => {
    onNotice(null)
    setBusy(true)
    try {
      const def = await loadGalleryWidget(entry)
      const existing = defs.find((d) => d.id === def.id)
      if (existing && sameDef(existing, def)) {
        onNotice(t('“{{name}}” is already in your custom widgets.', { name: def.name }), 'done')
        return
      }
      // a local edit under the same id is someone's work: add beside it, never over it
      const id = existing ? nextFreeId(def.id, new Set(defs.map((d) => d.id))) : def.id
      const name = id === def.id ? def.name : `${def.name} (${id.split('-').pop()})`
      await saveWidgetDef({ ...def, id, name })
      onNotice(
        id === def.id
          ? t('Added “{{name}}”. Edit it above, or place it from the widget palette.', { name })
          : t('Added as “{{name}}”, leaving your edited copy alone.', { name }),
        'done'
      )
    } catch (err) {
      onNotice(t('Could not add that example: {{error}}', { error: errorText(err) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error ? <p className="nh-settings__notice">{error}</p> : null}
      {entries.length > 0 ? (
        <div className="nh-examples">
          <span className="nh-examples__label">{t('Start from an example')}</span>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="nh-btn nh-btn--ghost"
              title={entry.description}
              disabled={busy}
              onClick={() => void add(entry)}>
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}
      <p className="nh-settings__text">
        {t(
          'To use a widget from the community forum, paste it into a new template widget. The forum only answers its own site, so neohab cannot fetch one for you.'
        )}
      </p>
    </>
  )
}
