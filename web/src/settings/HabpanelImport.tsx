import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listComponentsIn } from '../api/components'
import type { UIComponent } from '../api/types'
import {
  convertHabpanel,
  panelConfigFromComponent,
  parseHabpanelFile,
  sharedSettingsNotes,
  withoutSharedSettings,
  type HabpanelImportResult,
  type HPPanelConfig
} from '../importer/habpanel'
import { beginBulkConfigWrite, saveDashboard, saveRawComponent, saveSettings, useConfigStore } from '../store/config'
import { navigate } from '../app/router'
import { errorText } from '../api/errors'
import { Sheet } from '../components/Sheet'
import { resolveTheme } from '../themes/themes'
import type { NoticeFn } from '../store/notify'

type Probe = { state: 'looking' } | { state: 'read'; configs: UIComponent[] } | { state: 'failed'; error: string }

interface Pending {
  converted: HabpanelImportResult
  source: string
}

export function HabpanelImport({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [probe, setProbe] = useState<Probe>({ state: 'looking' })
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<HabpanelImportResult | null>(null)

  const look = useCallback((signal?: AbortSignal) => {
    setProbe({ state: 'looking' })
    listComponentsIn('habpanel:panelconfig', signal)
      .then((found) => setProbe({ state: 'read', configs: found }))
      .catch((err) => {
        // a server that could not be asked is not a server with nothing on it: answering "no HABPanel
        // configuration is saved here" sent people off to export their panels by hand instead
        if (signal?.aborted) return
        setProbe({ state: 'failed', error: errorText(err) })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    look(controller.signal)
    return () => controller.abort()
  }, [look])

  // reading a panel configuration is where a hand-edited or half-written one throws, and that is
  // before anything has been written, so it is a message rather than a broken screen
  const offer = (cfg: HPPanelConfig, source: string) => {
    onNotice(null)
    setResult(null)
    try {
      const existingIds = useConfigStore.getState().dashboards.map((d) => d.id)
      setPending({ converted: convertHabpanel(cfg, existingIds), source })
    } catch (err) {
      onNotice(t('Could not read that configuration: {{error}}', { error: errorText(err) }))
    }
  }

  const runImport = async (applyShared: boolean) => {
    if (!pending) return
    const converted = applyShared ? pending.converted : withoutSharedSettings(pending.converted)
    setPending(null)
    setBusy(true)
    try {
      await beginBulkConfigWrite()
      for (const dashboard of converted.dashboards) {
        await saveDashboard(dashboard)
      }
      for (const def of converted.widgetDefs) {
        await saveRawComponent(def)
      }
      if (Object.keys(converted.settingsPatch).length > 0) {
        await saveSettings(converted.settingsPatch)
      }
      setResult(converted)
    } catch (err) {
      onNotice(
        t('Import failed: {{error}}', {
          error: errorText(err)
        })
      )
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (file: File) => {
    try {
      offer(parseHabpanelFile(JSON.parse(await file.text())), `“${file.name}”`)
    } catch (err) {
      onNotice(t('Could not read that file: {{error}}', { error: errorText(err) }))
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Migrate from HABPanel')}</h2>
      <p className="nh-settings__text">
        {t(
          'Bring your HABPanel dashboards into neohab. Widgets are mapped to their closest neohab equivalents and a report shows anything that needs attention. Your HABPanel configuration is never modified.'
        )}
      </p>

      {probe.state === 'read' && probe.configs.length > 0 ? (
        <div className="nh-hpimport__found">
          {probe.configs.map((c) => {
            const dashCount = c.slots?.dashboards?.length ?? 0
            return (
              <div key={c.uid} className="nh-hpimport__row">
                <span>
                  {t('HABPanel configuration “{{uid}}” found on this server - {{count}} dashboards', {
                    uid: c.uid,
                    count: dashCount
                  })}
                </span>
                <button
                  type="button"
                  className="nh-btn nh-btn--primary"
                  disabled={busy}
                  onClick={() => offer(panelConfigFromComponent(c), t('panel configuration “{{uid}}”', { uid: c.uid }))}>
                  {busy ? t('Importing…') : t('Import')}
                </button>
              </div>
            )
          })}
        </div>
      ) : probe.state === 'read' ? (
        <p className="nh-settings__text">
          {t(
            'No HABPanel configuration is saved on this server. If your panels only exist in HABPanel’s own browser storage, open HABPanel, save the panel configuration to the server or export it, and come back with the file.'
          )}
        </p>
      ) : probe.state === 'failed' ? (
        <div className="nh-hpimport__failed">
          <p className="nh-settings__notice">
            {t('This server could not be asked what HABPanel has saved on it: {{error}}', { error: probe.error })}
          </p>
          <button type="button" className="nh-btn" onClick={() => look()}>
            {t('Try again')}
          </button>
        </div>
      ) : null}

      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('Import habpanel-config.json…')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importFile(file)
          }}
        />
      </div>

      {pending ? <ConfirmSheet pending={pending} onCancel={() => setPending(null)} onConfirm={runImport} /> : null}
      {result ? <ImportReport result={result} /> : null}
    </section>
  )
}

function ConfirmSheet({
  pending,
  onCancel,
  onConfirm
}: {
  pending: Pending
  onCancel: () => void
  onConfirm: (applyShared: boolean) => void
}) {
  const { t } = useTranslation()
  const customThemes = useConfigStore((s) => s.customThemes)
  const [applyShared, setApplyShared] = useState(true)
  const { converted, source } = pending
  const shared = sharedSettingsNotes(converted.settingsPatch)
  const attention = converted.notes.filter((n) => n.level !== 'info').length

  return (
    <Sheet wide title={t('Import from HABPanel')} onClose={onCancel}>
      <div className="nh-hpconfirm">
        <p className="nh-settings__text">{t('From {{source}}:', { source })}</p>
        <ul className="nh-hpconfirm__list">
          <li>{t('{{count}} dashboards', { count: converted.dashboards.length })}</li>
          <li>{t('{{count}} widgets', { count: converted.widgetCount })}</li>
          {converted.widgetDefs.length > 0 ? <li>{t('{{count}} custom widgets', { count: converted.widgetDefs.length })}</li> : null}
          {attention > 0 ? (
            <li>{t('{{count}} things will need attention - a report is shown afterwards.', { count: attention })}</li>
          ) : null}
        </ul>
        <p className="nh-settings__text">{t('Existing dashboards are kept.')}</p>

        {shared.length > 0 ? (
          <div className="nh-hpconfirm__shared">
            <label className="nh-field nh-field--row" htmlFor="nh-hp-shared">
              <span className="nh-field__label">{t('Also apply HABPanel’s shared settings')}</span>
              <input id="nh-hp-shared" type="checkbox" checked={applyShared} onChange={(e) => setApplyShared(e.target.checked)} />
            </label>
            <ul className="nh-hpconfirm__list">
              {shared.map((s) => {
                const value = s.key === 'theme' && s.value ? resolveTheme(s.value, customThemes).name : s.value
                return (
                  <li key={s.key}>
                    {t(s.label)}
                    {value ? ': ' + value : ''}
                  </li>
                )
              })}
            </ul>
            <p className="nh-field__hint">
              {t('These are saved on the openHAB server, so they change what every device sees, not only this one.')}
            </p>
          </div>
        ) : null}
      </div>
      <div className="nh-form__footer">
        <button type="button" className="nh-btn" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => onConfirm(applyShared)}>
          {t('Import')}
        </button>
      </div>
    </Sheet>
  )
}

function ImportReport({ result }: { result: HabpanelImportResult }) {
  const { t } = useTranslation()
  return (
    <div className="nh-report">
      <div className="nh-report__head">
        {'✓ '}
        {t('Imported {{dashboards}} dashboards with {{widgets}} widgets', {
          dashboards: result.dashboards.length,
          widgets: result.widgetCount
        })}
        {result.widgetDefs.length ? ' ' + t('and {{count}} custom widget definitions', { count: result.widgetDefs.length }) : ''}
        {'. '}
        <button type="button" className="nh-report__link" onClick={() => navigate({ name: 'home' })}>
          {t('View them →')}
        </button>
      </div>
      {result.notes.length > 0 ? (
        <ul className="nh-report__list">
          {result.notes.map((note) => (
            <li key={note.message + JSON.stringify(note.params ?? {})} className={'nh-report__item nh-report__item--' + note.level}>
              <span className="nh-report__chip">
                {note.level === 'skip' ? t('skipped') : note.level === 'warn' ? t('attention') : t('note')}
              </span>
              {t(note.message, note.params)}
              {note.count > 1 ? <span className="nh-report__count"> ×{note.count}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="nh-settings__text">{t('Everything mapped cleanly.')}</p>
      )}
    </div>
  )
}
