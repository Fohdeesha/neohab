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
  type ImportMode,
} from '../store/config'
import {
  BUILTIN_THEMES,
  COLOR_TOKENS,
  resolveTheme,
  type Theme,
  type ThemeTokens,
} from '../themes/themes'
import { NavButton } from './Sidebar'
import { HabpanelImport } from '../editor/HabpanelImport'
import { WidgetDefManager } from '../editor/WidgetDefManager'
import { clearApiToken, isLoggedIn, logout } from '../api/auth'
import { deleteCustomIcon, saveCustomIcon } from '../store/config'
import { Icon } from '../components/Icon'
import { slugifyIconId, type CustomIcon } from '../model/customIcon'
import { DEFAULT_MAX_ICON_KB, processIconFile } from '../components/iconUpload'

export function SettingsView() {
  const { settings, customThemes } = useConfigStore()
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Theme | null>(null)

  const activeTheme = resolveTheme(settings.theme, customThemes)

  const choose = async (id: string) => {
    setNotice(null)
    const err = await saveSettings({ theme: id })
    if (err) setNotice('Theme applied on this device, but saving failed: ' + err + ' — sign in as an administrator.')
  }

  const toggleSidebarSetting = async (on: boolean) => {
    setNotice(null)
    const err = await saveSettings({ sidebar: on })
    if (err) setNotice('Applied on this device, but saving failed: ' + err + ' — sign in as an administrator.')
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
        <NavButton />
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

          <label className="nh-field nh-field--row" htmlFor="nh-set-sidebar">
            <span className="nh-field__label">Dashboard sidebar</span>
            <input
              id="nh-set-sidebar"
              type="checkbox"
              checked={settings.sidebar !== false}
              onChange={(e) => void toggleSidebarSetting(e.target.checked)}
            />
          </label>
          <p className="nh-settings__text">
            Adds a ☰ to the top-left of every screen that slides out the dashboard list, so you can
            switch dashboards without going back Home. Turn it off to navigate from the Home screen
            only.
          </p>
        </section>

        {editing ? (
          <ThemeEditor
            theme={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onNotice={setNotice}
          />
        ) : null}

        <WidgetDefManager onNotice={setNotice} />

        <CustomIconsSection onNotice={setNotice} />

        <HabpanelImport onNotice={setNotice} />

        <BackupSection onNotice={setNotice} />

        <AccountSection onNotice={setNotice} />
      </div>
    </div>
  )
}

/** Manager for user-uploaded icons: upload, rename, delete, and the upload size limit. */
function CustomIconsSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { customIcons, settings } = useConfigStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const maxKB = settings.maxIconKB ?? DEFAULT_MAX_ICON_KB
  const totalKB = Math.round(customIcons.reduce((sum, i) => sum + (i.bytes || 0), 0) / 1024)

  const upload = async (file: File) => {
    onNotice(null)
    setUploading(true)
    try {
      const processed = await processIconFile(file, maxKB)
      const name = file.name.replace(/\.[^.]+$/, '') || 'icon'
      const id = slugifyIconId(name, new Set(customIcons.map((i) => i.id)))
      await saveCustomIcon({ version: 1, id, name, ...processed })
    } catch (err) {
      onNotice(
        'Upload failed: ' +
          (err instanceof Error ? err.message : String(err)) +
          ' — uploads need an administrator sign-in.'
      )
    } finally {
      setUploading(false)
    }
  }

  const remove = async (icon: CustomIcon) => {
    if (!window.confirm(`Delete icon “${icon.name}”? Widgets using it will show no icon.`)) return
    onNotice(null)
    try {
      await deleteCustomIcon(icon.id)
    } catch (err) {
      onNotice('Deleting the icon failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">Custom icons</h2>
      <p className="nh-settings__text">
        Upload your own icons (PNG, JPG, GIF, WebP, BMP or SVG — transparency and GIF animation
        survive) and pick them from the icon picker's Custom tab on any widget. They are stored in
        the openHAB configuration, so backups and exports include them.
        {customIcons.length > 0 ? ` Using ${totalKB} KB across ${customIcons.length} icon(s).` : ''}
      </p>
      {customIcons.length > 0 ? (
        <div className="nh-iconman">
          {customIcons.map((icon) => (
            <CustomIconRow key={icon.id} icon={icon} onNotice={onNotice} onDelete={() => void remove(icon)} />
          ))}
        </div>
      ) : null}
      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : 'Upload icon…'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.svg,.png,.jpg,.jpeg,.gif,.webp,.bmp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
        <label className="nh-iconman__limit" htmlFor="icon-maxkb">
          Upload limit (KB)
          <input
            id="icon-maxkb"
            type="number"
            min={50}
            max={2000}
            value={maxKB}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v > 0) void saveSettings({ maxIconKB: v })
            }}
          />
        </label>
      </div>
    </section>
  )
}

function CustomIconRow({
  icon,
  onNotice,
  onDelete,
}: {
  icon: CustomIcon
  onNotice: (m: string | null) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(icon.name)

  const commitRename = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === icon.name) {
      setName(icon.name)
      return
    }
    try {
      await saveCustomIcon({ ...icon, name: trimmed })
    } catch (err) {
      onNotice('Renaming the icon failed: ' + (err instanceof Error ? err.message : String(err)))
      setName(icon.name)
    }
  }

  return (
    <div className="nh-iconman__row">
      <Icon icon={'custom:' + icon.id} size={28} />
      <input
        type="text"
        className="nh-iconman__name"
        value={name}
        aria-label={'Rename icon ' + icon.name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitRename()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span className="nh-iconman__meta">
        custom:{icon.id} · {Math.max(1, Math.round((icon.bytes || 0) / 1024))} KB
      </span>
      <button type="button" className="nh-btn nh-btn--danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}

function AccountSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  if (!isLoggedIn()) return null
  return (
    <section>
      <h2 className="nh-settings__h">Account</h2>
      <p className="nh-settings__text">
        This device is signed in for editing (openHAB login or a stored API token).
      </p>
      <button
        type="button"
        className="nh-btn nh-btn--ghost"
        onClick={() => {
          logout()
          clearApiToken()
          onNotice('Signed out on this device.')
        }}
      >
        Sign out on this device
      </button>
    </section>
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

function BackupSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ExportBundle | null>(null)

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
    setPending(null)
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
    setPending(bundle)
  }

  const runImport = async (mode: ImportMode) => {
    if (!pending) return
    if (
      mode === 'replace' &&
      !window.confirm('Replace the entire configuration with this backup? This cannot be undone.')
    ) {
      return
    }
    setBusy(true)
    try {
      await importBundle(pending, mode)
      setPending(null)
      onNotice(mode === 'replace' ? 'Backup imported.' : 'Backup merged into the current configuration.')
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
        up or share it. Importing can replace everything or merge the backup into what you have.
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
      {pending ? (
        <div className="nh-settings__importchoice">
          <p className="nh-settings__text">
            Backup contains {pending.components.filter((c) => c.uid.startsWith('dashboard:')).length}{' '}
            dashboard(s), {pending.components.length} components. Merge keeps your current
            configuration and overwrites only what the backup also contains; replace deletes
            everything first.
          </p>
          <div className="nh-settings__row">
            <button type="button" className="nh-btn nh-btn--primary" disabled={busy} onClick={() => void runImport('merge')}>
              Merge into current
            </button>
            <button type="button" className="nh-btn" disabled={busy} onClick={() => void runImport('replace')}>
              Replace everything
            </button>
            <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
