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

/**
 * Confirmation card for a single-dashboard / widget / theme file. A copy never touches anything
 * that is already here; overwrite is only offered when something would actually be replaced, and
 * says exactly how much.
 */
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
  // Everything in the file is already here, byte for byte: there is nothing an import could do,
  // so offering one would be a dead end that reports "nothing to import" after the round trip.
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
            ? t(
                'Something with the same name is already here. Importing a copy leaves it untouched and adds a numbered copy; overwriting replaces {{count}} item(s).',
                { count: conflicts }
              )
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

export function BackupSection({ onNotice }: { onNotice: (m: string | null) => void }) {
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
    // One import button for both kinds of file: a single dashboard/widget/theme is offered as a
    // copy or an overwrite, a whole-configuration backup as merge or replace.
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
          'Export your complete configuration (dashboards, themes, settings) as a JSON file to back it up or share it. Importing can replace everything or merge the backup into what you have. The same Import button also takes a single dashboard, custom widget or theme file - those are offered as a copy so nothing of yours is replaced.'
        )}
      </p>
      {backgrounds.length > 0 ? (
        <>
          <label className="nh-field nh-field--row" htmlFor="nh-export-bg">
            <span className="nh-field__label">{t('Include background images')}</span>
            <input id="nh-export-bg" type="checkbox" checked={withBackgrounds} onChange={(e) => setWithBackgrounds(e.target.checked)} />
          </label>
          <p className="nh-settings__text">
            {t(
              'Uploaded background images can make the export large. Turn this off for a smaller, easier-to-read file - dashboards will then reference images the export does not contain.'
            )}
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
              'Backup contains {{dashboards}} dashboard(s), {{components}} components. Merge keeps your current configuration and overwrites only what the backup also contains; replace deletes everything first.',
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
