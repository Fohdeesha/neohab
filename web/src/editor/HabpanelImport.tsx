/**
 * "Migrate from HABPanel" settings section. Offers two paths: importing a
 * habpanel-config.json export file, or importing a panel configuration found live on this
 * openHAB server. Shows an honest per-import report of what was mapped and approximated.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listComponentsIn } from '../api/components'
import type { UIComponent } from '../api/types'
import {
  convertHabpanel,
  panelConfigFromComponent,
  parseHabpanelFile,
  type HabpanelImportResult,
  type HPPanelConfig,
} from '../importer/habpanel'
import { saveDashboard, saveRawComponent, saveSettings, useConfigStore } from '../store/config'
import { navigate } from '../app/router'

export function HabpanelImport({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [serverConfigs, setServerConfigs] = useState<UIComponent[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HabpanelImportResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listComponentsIn('habpanel:panelconfig', controller.signal)
      .then(setServerConfigs)
      .catch(() => setServerConfigs([]))
    return () => controller.abort()
  }, [])

  const runImport = async (cfg: HPPanelConfig, sourceName: string) => {
    onNotice(null)
    setResult(null)
    const existingIds = useConfigStore.getState().dashboards.map((d) => d.id)
    const converted = convertHabpanel(cfg, existingIds)

    const warnCount = converted.notes.filter((n) => n.level !== 'info').length
    const proceed = window.confirm(
      t('Import {{dashboards}} dashboards ({{widgets}} widgets{{defs}}) from {{source}}?', {
        dashboards: converted.dashboards.length,
        widgets: converted.widgetCount,
        defs: converted.widgetDefs.length
          ? ', ' + t('{{count}} custom widgets', { count: converted.widgetDefs.length })
          : '',
        source: sourceName,
      }) +
        (warnCount ? ' ' + t('{{count}} things will need attention — a report is shown afterwards.', { count: warnCount }) : '') +
        ' ' +
        t('Existing dashboards are kept.')
    )
    if (!proceed) return

    setBusy(true)
    try {
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
        t('Import failed: {{error}} — are you signed in as an administrator?', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (file: File) => {
    try {
      const parsed = parseHabpanelFile(JSON.parse(await file.text()))
      await runImport(parsed, `“${file.name}”`)
    } catch (err) {
      onNotice(t('Could not read that file: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const importServer = async (component: UIComponent) => {
    await runImport(panelConfigFromComponent(component), t('panel configuration “{{uid}}”', { uid: component.uid }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Migrate from HABPanel')}</h2>
      <p className="nh-settings__text">
        {t(
          'Bring your HABPanel dashboards into neohab. Widgets are mapped to their closest neohab equivalents and a report shows anything that needs attention. Your HABPanel configuration is never modified.'
        )}
      </p>

      {serverConfigs.length > 0 ? (
        <div className="nh-hpimport__found">
          {serverConfigs.map((c) => {
            const dashCount = c.slots?.dashboards?.length ?? 0
            return (
              <div key={c.uid} className="nh-hpimport__row">
                <span>
                  {t('HABPanel configuration “{{uid}}” found on this server — {{count}} dashboards', {
                    uid: c.uid,
                    count: dashCount,
                  })}
                </span>
                <button type="button" className="nh-btn nh-btn--primary" disabled={busy} onClick={() => void importServer(c)}>
                  {busy ? t('Importing…') : t('Import')}
                </button>
              </div>
            )
          })}
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

      {result ? <ImportReport result={result} /> : null}
    </section>
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
          widgets: result.widgetCount,
        })}
        {result.widgetDefs.length
          ? ' ' + t('and {{count}} custom widget definitions', { count: result.widgetDefs.length })
          : ''}
        {'. '}
        <button type="button" className="nh-report__link" onClick={() => navigate({ name: 'home' })}>
          {t('View them →')}
        </button>
      </div>
      {result.notes.length > 0 ? (
        <ul className="nh-report__list">
          {result.notes.map((note) => (
            <li
              key={note.message + JSON.stringify(note.params ?? {})}
              className={'nh-report__item nh-report__item--' + note.level}
            >
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
