/**
 * Settings section listing the widget gallery: ready-made custom widgets, installed with one tap.
 *
 * Installing writes a `widgetdef:<id>` component exactly like a hand-written one, so an installed
 * widget is then editable, exportable and usable from the palette with nothing special about it.
 * A widget already installed and unchanged says so instead of piling up copies; one that was
 * edited locally installs alongside under a free id, so local changes are never overwritten.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nextFreeId } from '../model/components'
import type { CustomWidgetDef } from '../model/widgetdef'
import { saveWidgetDef, useConfigStore } from '../store/config'
import { useEditingAllowed } from '../store/auth'
import { REMOTE_INDEX, loadBundledGallery, loadGalleryWidget, loadRemoteGallery, type GalleryEntry } from '../gallery/gallery'
import { errorText } from '../api/errors'

const BUNDLED_URL = 'gallery/index.json'

/** Same definition, ignoring the bookkeeping fields, so a re-install is recognised as a no-op. */
function sameDef(a: CustomWidgetDef, b: CustomWidgetDef): boolean {
  const norm = (d: CustomWidgetDef) =>
    JSON.stringify({ kind: d.kind ?? 'template', template: d.template ?? '', script: d.script ?? '', settings: d.settings ?? [] })
  return norm(a) === norm(b)
}

export function GallerySection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const defs = useConfigStore((s) => s.widgetDefs)
  const canEdit = useEditingAllowed()
  const [entries, setEntries] = useState<GalleryEntry[] | null>(null)
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    loadBundledGallery()
      .then((index) => setEntries(index.widgets))
      .catch((err) => {
        setEntries([])
        setError(errorText(err))
      })
  }, [])

  const browseRemote = async () => {
    setError(null)
    setBusy('remote')
    try {
      const index = await loadRemoteGallery()
      setRemoteUrl(REMOTE_INDEX)
      setEntries((prev) => {
        const have = new Set((prev ?? []).map((e) => e.id))
        return [...(prev ?? []), ...index.widgets.filter((e) => !have.has(e.id))]
      })
    } catch (err) {
      setError(
        t('Could not reach the online gallery ({{error}}). The widgets below ship with neohab and always work.', {
          error: errorText(err)
        })
      )
    } finally {
      setBusy(null)
    }
  }

  const install = async (entry: GalleryEntry) => {
    onNotice(null)
    setBusy(entry.id)
    try {
      const def = await loadGalleryWidget(entry, entry.remote && remoteUrl ? remoteUrl : BUNDLED_URL)
      const existing = defs.find((d) => d.id === def.id)
      if (existing && sameDef(existing, def)) {
        onNotice(t('“{{name}}” is already installed.', { name: def.name }))
        return
      }
      // A local edit under the same id is someone's work: install beside it, never over it.
      const id = existing ? nextFreeId(def.id, new Set(defs.map((d) => d.id))) : def.id
      const name = id === def.id ? def.name : `${def.name} (${id.split('-').pop()})`
      await saveWidgetDef({ ...def, id, name })
      onNotice(
        id === def.id
          ? t('Installed “{{name}}” - it is now in the widget palette.', { name })
          : t('Installed as “{{name}}”, leaving your edited copy alone.', { name })
      )
    } catch (err) {
      onNotice(
        t('Could not install that widget: {{error}}', {
          error: errorText(err)
        })
      )
    } finally {
      setBusy(null)
    }
  }

  if (!canEdit) return null

  return (
    <section>
      <h2 className="nh-settings__h">{t('Widget gallery')}</h2>
      <p className="nh-settings__text">
        {t(
          'Ready-made custom widgets that ship with neohab. Installing one adds it to your own custom widgets, where you can edit it like any other.'
        )}
      </p>
      {error ? <p className="nh-settings__notice">{error}</p> : null}
      {entries === null ? (
        <p className="nh-settings__text">{t('Loading…')}</p>
      ) : entries.length === 0 ? (
        <p className="nh-settings__text">{t('No gallery widgets are available.')}</p>
      ) : (
        <div className="nh-gallery">
          {entries.map((entry) => {
            const installed = defs.some((d) => d.id === entry.id)
            return (
              <div className="nh-gallery__card" key={entry.id}>
                <div className="nh-gallery__head">
                  <span className="nh-gallery__name">{entry.name}</span>
                  {entry.remote ? <span className="nh-gallery__badge">{t('online')}</span> : null}
                  {installed ? <span className="nh-gallery__badge">{t('installed')}</span> : null}
                </div>
                {entry.description ? <p className="nh-gallery__desc">{entry.description}</p> : null}
                <div className="nh-gallery__foot">
                  <span className="nh-gallery__meta">{[entry.author, entry.license].filter(Boolean).join(' · ')}</span>
                  <button type="button" className="nh-btn nh-btn--ghost" disabled={busy !== null} onClick={() => void install(entry)}>
                    {busy === entry.id ? t('Installing…') : installed ? t('Reinstall') : t('Install')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {remoteUrl === null ? (
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy !== null} onClick={() => void browseRemote()}>
          {busy === 'remote' ? t('Looking…') : t('Look for more online')}
        </button>
      ) : null}
      <p className="nh-settings__text">
        {t(
          'Widgets shared on the openHAB community forum cannot be listed here: the forum only answers its own site, and its posts carry no licence to redistribute. A HABPanel widget from a forum post can still be imported - paste it into a new custom widget, or bring in a whole HABPanel configuration above.'
        )}
      </p>
    </section>
  )
}
