import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildExportBundle,
  importBundle,
  importPartialBundle,
  planPartialImportOnServer,
  useConfigStore,
  validateBundle,
  type ExportBundle,
  type ImportMode
} from '../store/config'
import { looksPartial, validatePartialBundle, type PartialBundle, type PartialImportMode, type PartialPlan } from '../model/partial'
import { downloadJson } from '../components/download'
import { errorText } from '../api/errors'
import type { NoticeFn } from '../store/notify'

function PartialImportCard({
  state,
  busy,
  onRun,
  onCancel
}: {
  state: { bundle: PartialBundle; plan: PartialPlan }
  busy: boolean
  onRun: (mode: PartialImportMode) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const { plan } = state
  const kindLabel = plan.kind === 'dashboard' ? t('Dashboard') : plan.kind === 'widgetdef' ? t('Custom widget') : t('Theme')
  const deps = plan.dependencies.length
  const conflicts = plan.conflicts.length
  const nothingToDo = plan.primary.status === 'identical' && plan.dependencies.every((d) => d.status === 'identical')

  return (
    <div className="nh-settings__importchoice">
      <p className="nh-settings__text">
        {t('{{kind}} “{{name}}” from a file, with {{count}} things it references.', {
          kind: kindLabel,
          name: plan.name,
          count: deps
        })}
      </p>
      <p className="nh-settings__text">
        {nothingToDo
          ? t('This file matches what you already have, so there is nothing to import.')
          : conflicts > 0
            ? t('That name is already taken. A copy leaves yours alone; overwriting replaces {{count}} items.', { count: conflicts })
            : t('Nothing here has these names, so nothing of yours is touched.')}
      </p>
      <div className="nh-settings__row">
        {nothingToDo ? null : (
          <button type="button" className="nh-btn nh-btn--primary" disabled={busy} onClick={() => onRun('copy')}>
            {conflicts > 0 ? t('Import as a copy') : t('Import')}
          </button>
        )}
        {conflicts > 0 ? (
          <button type="button" className="nh-btn" disabled={busy} onClick={() => onRun('overwrite')}>
            {t('Overwrite existing')}
          </button>
        ) : null}
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={onCancel}>
          {nothingToDo ? t('Close') : t('Cancel')}
        </button>
      </div>
    </div>
  )
}

export function BackupSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [withBackgrounds, setWithBackgrounds] = useState(true)
  const [pending, setPending] = useState<ExportBundle | null>(null)
  const [pendingPartial, setPendingPartial] = useState<{ bundle: PartialBundle; plan: PartialPlan } | null>(null)

  const exportConfig = async () => {
    onNotice(null)
    try {
      downloadJson('neohab-config.json', await buildExportBundle(withBackgrounds))
    } catch (err) {
      onNotice(t('Export failed: {{error}}', { error: errorText(err) }))
    }
  }

  const importConfig = async (file: File) => {
    onNotice(null)
    setPending(null)
    setPendingPartial(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      onNotice(t('Import failed: that file is not valid JSON.'))
      return
    }
    if (looksPartial(parsed)) {
      const invalid = validatePartialBundle(parsed)
      if (invalid) {
        onNotice(t('Import failed: {{error}}', { error: invalid }))
        return
      }
      const bundle = parsed as PartialBundle
      try {
        setPendingPartial({ bundle, plan: await planPartialImportOnServer(bundle) })
      } catch (err) {
        onNotice(t('Import failed: {{error}}', { error: errorText(err) }))
      }
      return
    }
    const bundle = parsed as ExportBundle
    const invalid = validateBundle(bundle)
    if (invalid) {
      onNotice(t('Import failed: {{error}}', { error: invalid }))
      return
    }
    setPending(bundle)
  }

  const runPartialImport = async (mode: PartialImportMode) => {
    if (!pendingPartial) return
    if (
      mode === 'overwrite' &&
      !window.confirm(
        t('Overwrite {{count}} existing items with this file? The version history keeps a restore point.', {
          count: pendingPartial.plan.conflicts.length
        })
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await importPartialBundle(pendingPartial.bundle, mode)
      setPendingPartial(null)
      onNotice(
        result.written === 0
          ? t('Nothing to import - that file matches what you already have.')
          : result.renamed.length > 0
            ? t('Imported as a copy: {{name}}.', { name: result.primaryUid.slice(result.primaryUid.indexOf(':') + 1) })
            : t('Imported {{count}} items.', { count: result.written })
      )
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

  const runImport = async (mode: ImportMode) => {
    if (!pending) return
    if (mode === 'replace' && !window.confirm(t('Replace the entire configuration with this backup? This cannot be undone.'))) {
      return
    }
    setBusy(true)
    try {
      await importBundle(pending, mode)
      setPending(null)
      onNotice(mode === 'replace' ? t('Backup imported.') : t('Backup merged into the current configuration.'))
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

  return (
    <section>
      <h2 className="nh-settings__h">{t('Backup')}</h2>
      <p className="nh-settings__text">
        {t(
          'Your whole configuration as one JSON file, to keep or to share. Import can merge it or replace everything, and it also takes a single dashboard, widget or theme file.'
        )}
      </p>
      {backgrounds.length > 0 ? (
        <>
          <label className="nh-field nh-field--row" htmlFor="nh-export-bg">
            <span className="nh-field__label">{t('Include background images')}</span>
            <input id="nh-export-bg" type="checkbox" checked={withBackgrounds} onChange={(e) => setWithBackgrounds(e.target.checked)} />
          </label>
          <p className="nh-settings__text">
            {t('They make the file big. Leave them out and dashboards will point at images the file does not carry.')}
          </p>
        </>
      ) : null}
      <div className="nh-settings__row">
        <button type="button" className="nh-btn" onClick={() => void exportConfig()}>
          {t('Export configuration')}
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? t('Importing…') : t('Import configuration…')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importConfig(file)
          }}
        />
      </div>
      {pendingPartial ? (
        <PartialImportCard state={pendingPartial} busy={busy} onRun={runPartialImport} onCancel={() => setPendingPartial(null)} />
      ) : null}
      {pending ? (
        <div className="nh-settings__importchoice">
          <p className="nh-settings__text">
            {t(
              '{{dashboards}} dashboards, {{components}} components. Merge overwrites only what the backup also has; replace deletes everything first.',
              {
                dashboards: pending.components.filter((c) => c.uid.startsWith('dashboard:')).length,
                components: pending.components.length
              }
            )}
          </p>
          <div className="nh-settings__row">
            <button type="button" className="nh-btn nh-btn--primary" disabled={busy} onClick={() => void runImport('merge')}>
              {t('Merge into current')}
            </button>
            <button type="button" className="nh-btn" disabled={busy} onClick={() => void runImport('replace')}>
              {t('Replace everything')}
            </button>
            <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => setPending(null)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
