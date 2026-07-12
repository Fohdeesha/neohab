/**
 * Settings: appearance (theme picker + custom theme editor) and backup (export/import).
 * Theme changes apply instantly; persisting them (and importing) needs an admin login.
 */
import { useRef, useState } from 'react'
import {
  buildExportBundle,
  deleteTheme,
  importBundle,
  saveSettings,
  saveTheme,
  useConfigStore,
  validateBundle,
  type ExportBundle,
} from '../store/config'
import {
  BUILTIN_THEMES,
  COLOR_TOKENS,
  resolveTheme,
  type Theme,
  type ThemeTokens,
} from '../themes/themes'
import { navigate } from './router'

export function SettingsView() {
  const { settings, customThemes, usingDemo } = useConfigStore()
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Theme | null>(null)

  const activeTheme = resolveTheme(settings.theme, customThemes)

  const choose = async (id: string) => {
    setNotice(null)
    const err = await saveSettings({ theme: id })
    if (err) setNotice('Theme applied on this device, but saving failed: ' + err + ' — sign in as an administrator.')
  }

  const newFromCurrent = () => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 8)
    setEditing({
      id,
      name: 'My theme',
      scheme: activeTheme.scheme,
      tokens: { ...activeTheme.tokens },
    })
  }

  return (
    <div className="nh-dash">
      <header className="nh-dash__bar">
        <button className="nh-iconbtn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
          ‹
        </button>
        <span className="nh-dash__title">Settings</span>
      </header>

      <div className="nh-settings">
        {notice ? <div className="nh-settings__notice">{notice}</div> : null}

        <section>
          <h2 className="nh-settings__h">Appearance</h2>
          <div className="nh-themes">
            {[...BUILTIN_THEMES, ...customThemes].map((theme) => (
              <div
                key={theme.id}
                className={'nh-theme' + (settings.theme === theme.id ? ' nh-theme--active' : '')}
              >
                <button type="button" className="nh-theme__pick" onClick={() => void choose(theme.id)}>
                  <span className="nh-theme__dots">
                    {(['bg', 'surface', 'primary', 'brand'] as const).map((k) => (
                      <span key={k} className="nh-theme__dot" style={{ background: theme.tokens[k] }} />
                    ))}
                  </span>
                  <span className="nh-theme__name">{theme.name}</span>
                </button>
                {customThemes.includes(theme) ? (
                  <button
                    type="button"
                    className="nh-theme__edit"
                    aria-label={'Edit theme ' + theme.name}
                    onClick={() => setEditing(structuredClone(theme))}
                  >
                    ✎
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button type="button" className="nh-btn nh-btn--ghost" onClick={newFromCurrent}>
            New theme from current
          </button>
        </section>

        {editing ? (
          <ThemeEditor
            theme={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onNotice={setNotice}
          />
        ) : null}

        <BackupSection usingDemo={usingDemo} onNotice={setNotice} />
      </div>
    </div>
  )
}

function ThemeEditor({
  theme,
  onChange,
  onClose,
  onNotice,
}: {
  theme: Theme
  onChange: (t: Theme) => void
  onClose: () => void
  onNotice: (msg: string | null) => void
}) {
  const setToken = (key: keyof ThemeTokens, value: string) =>
    onChange({ ...theme, tokens: { ...theme.tokens, [key]: value } })

  const save = async () => {
    onNotice(null)
    try {
      await saveTheme(theme)
      await saveSettings({ theme: theme.id })
      onClose()
    } catch (err) {
      onNotice('Saving the theme failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete theme “${theme.name}”?`)) return
    onNotice(null)
    try {
      await deleteTheme(theme.id)
      onClose()
    } catch (err) {
      onNotice('Deleting the theme failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <section className="nh-themeeditor">
      <h2 className="nh-settings__h">Theme editor</h2>
      <div className="nh-form">
        <label className="nh-field" htmlFor="theme-name">
          <span className="nh-field__label">Name</span>
          <input id="theme-name" type="text" value={theme.name} onChange={(e) => onChange({ ...theme, name: e.target.value })} />
        </label>
        <label className="nh-field nh-field--row" htmlFor="theme-scheme">
          <span className="nh-field__label">Dark scheme</span>
          <input
            id="theme-scheme"
            type="checkbox"
            checked={theme.scheme === 'dark'}
            onChange={(e) => onChange({ ...theme, scheme: e.target.checked ? 'dark' : 'light' })}
          />
        </label>
        {COLOR_TOKENS.map((key) => (
          <label key={key} className="nh-field nh-field--row" htmlFor={'tok-' + key}>
            <span className="nh-field__label">{key}</span>
            <input
              id={'tok-' + key}
              type="color"
              value={theme.tokens[key] ?? '#888888'}
              onChange={(e) => setToken(key, e.target.value)}
            />
          </label>
        ))}
        <label className="nh-field nh-field--row" htmlFor="tok-radius">
          <span className="nh-field__label">Corner radius (px)</span>
          <input
            id="tok-radius"
            type="number"
            min={0}
            max={32}
            value={parseInt(theme.tokens.radius ?? '12', 10)}
            onChange={(e) => setToken('radius', e.target.value + 'px')}
          />
        </label>
      </div>
      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
          Delete
        </button>
        <span className="nh-dash__spacer" />
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => void save()}>
          Save theme
        </button>
      </div>
    </section>
  )
}

function BackupSection({ usingDemo, onNotice }: { usingDemo: boolean; onNotice: (m: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const exportConfig = async () => {
    onNotice(null)
    try {
      const bundle = await buildExportBundle()
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'neohab-config.json'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) {
      onNotice('Export failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const importConfig = async (file: File) => {
    onNotice(null)
    let bundle: ExportBundle
    try {
      bundle = JSON.parse(await file.text()) as ExportBundle
    } catch {
      onNotice('Import failed: that file is not valid JSON.')
      return
    }
    const invalid = validateBundle(bundle)
    if (invalid) {
      onNotice('Import failed: ' + invalid)
      return
    }
    const dashboards = bundle.components.filter((c) => c.uid.startsWith('dashboard:')).length
    if (
      !window.confirm(
        `Replace the entire neohab configuration with this backup (${dashboards} dashboard${dashboards === 1 ? '' : 's'}, ${bundle.components.length} components)? This cannot be undone.`
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await importBundle(bundle)
      onNotice('Backup imported.')
    } catch (err) {
      onNotice(
        'Import failed: ' +
          (err instanceof Error ? err.message : String(err)) +
          ' — are you signed in as an administrator?'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">Backup</h2>
      <p className="nh-settings__text">
        Export your complete configuration (dashboards, themes, settings) as a JSON file to back it
        up or share it. Importing replaces everything with the backup's contents.
        {usingDemo ? ' Nothing is saved on the server yet — the export will contain the demo.' : ''}
      </p>
      <div className="nh-settings__row">
        <button type="button" className="nh-btn" onClick={() => void exportConfig()}>
          Export configuration
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Importing…' : 'Import configuration…'}
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
    </section>
  )
}
