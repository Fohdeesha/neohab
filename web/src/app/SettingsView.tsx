/**
 * Settings: appearance (theme picker + custom theme editor) and backup (export/import).
 * Theme changes apply instantly; persisting them (and importing) needs an admin login.
 */
import { useEffect, useRef, useState } from 'react'
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
import { navigate } from './router'
import { setKioskSettings, useKioskStore, type ScreensaverMode } from '../store/kiosk'
import { setDeviceTextSize, useTextSizeStore } from '../store/textsize'
import { useWakeLockStore, wakeLockSupported } from '../kiosk/wakeLock'
import { ItemPicker } from '../components/ItemPicker'
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
  const textPct = useTextSizeStore((s) => s.percent)

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

          <label className="nh-field" htmlFor="nh-set-textsize">
            <span className="nh-field__label">Text size on this device (%)</span>
            <input
              id="nh-set-textsize"
              type="number"
              min={50}
              max={300}
              step={5}
              value={textPct}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value))
                if (Number.isFinite(n) && n >= 50 && n <= 300) setDeviceTextSize(n)
              }}
            />
            <span className="nh-field__hint">
              Scales dashboard text on this device only — other devices and the dashboards
              themselves are unchanged. 100 = normal.
            </span>
          </label>
        </section>

        {editing ? (
          <ThemeEditor
            theme={editing}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onNotice={setNotice}
          />
        ) : null}

        <KioskSection onNotice={setNotice} />

        <WidgetDefManager onNotice={setNotice} />

        <CustomIconsSection onNotice={setNotice} />

        <HabpanelImport onNotice={setNotice} />

        <BackupSection onNotice={setNotice} />

        <AccountSection onNotice={setNotice} />
      </div>
    </div>
  )
}

/**
 * Kiosk / wall-panel settings. Everything here is per-device (localStorage) except the
 * dashboard-control item, which is part of the server configuration.
 */
function KioskSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const kioskSettings = useKioskStore((s) => s.settings)
  const sessionKiosk = useKioskStore((s) => s.sessionKiosk)
  const dashboards = useConfigStore((s) => s.dashboards)
  const controlItem = useConfigStore((s) => s.settings.controlItem) ?? ''
  const wakeActive = useWakeLockStore((s) => s.active)
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const kioskOn = sessionKiosk ?? kioskSettings.kiosk

  const setKioskMode = (on: boolean) => {
    setKioskSettings({ kiosk: on })
    if (on) {
      // All chrome (including the way back from this screen) is gone now - land somewhere useful.
      const pinned = kioskSettings.pinnedDashboard
      if (pinned && dashboards.some((d) => d.id === pinned)) navigate({ name: 'dashboard', id: pinned })
      else navigate({ name: 'home' })
    }
  }

  const setControlItem = async (name: string) => {
    onNotice(null)
    const err = await saveSettings({ controlItem: name || undefined })
    if (err) onNotice('Applied on this device, but saving failed: ' + err + ' — sign in as an administrator.')
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen().catch(() => onNotice('Fullscreen was blocked by the browser.'))
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">Kiosk &amp; wall panel</h2>
      <p className="nh-settings__text">
        These settings apply to this device only, so a wall panel and a phone can each have their
        own. The dashboard-control item at the bottom is the exception — it is shared.
      </p>

      <label className="nh-field" htmlFor="kiosk-pinned">
        <span className="nh-field__label">Open this dashboard at start</span>
        <select
          id="kiosk-pinned"
          value={kioskSettings.pinnedDashboard ?? ''}
          onChange={(e) => setKioskSettings({ pinnedDashboard: e.target.value || undefined })}
        >
          <option value="">Home screen (default)</option>
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label className="nh-field nh-field--row" htmlFor="kiosk-wake">
        <span className="nh-field__label">Keep the screen awake</span>
        <input
          id="kiosk-wake"
          type="checkbox"
          checked={kioskSettings.wakeLock}
          disabled={!wakeLockSupported()}
          onChange={(e) => setKioskSettings({ wakeLock: e.target.checked })}
        />
      </label>
      {!wakeLockSupported() ? (
        <p className="nh-settings__text">
          Not available here: browsers only offer the wake lock over HTTPS (or on localhost).
          Kiosk-browser apps usually keep the screen on themselves instead.
        </p>
      ) : kioskSettings.wakeLock ? (
        <p className="nh-settings__text">
          {wakeActive ? 'The screen is being kept awake.' : 'Waiting for the browser to grant the wake lock…'}
        </p>
      ) : null}

      <label className="nh-field" htmlFor="kiosk-saver">
        <span className="nh-field__label">Screensaver</span>
        <select
          id="kiosk-saver"
          value={kioskSettings.screensaver}
          onChange={(e) => setKioskSettings({ screensaver: e.target.value as ScreensaverMode })}
        >
          <option value="off">Off</option>
          <option value="blank">Blank screen</option>
          <option value="clock">Clock</option>
        </select>
      </label>
      {kioskSettings.screensaver !== 'off' ? (
        <label className="nh-field nh-field--row" htmlFor="kiosk-saver-min">
          <span className="nh-field__label">Start after (minutes)</span>
          <input
            id="kiosk-saver-min"
            type="number"
            min={1}
            max={720}
            value={kioskSettings.screensaverMinutes}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 1) setKioskSettings({ screensaverMinutes: v })
            }}
          />
        </label>
      ) : null}

      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--ghost" onClick={toggleFullscreen}>
          {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        </button>
      </div>

      <label className="nh-field nh-field--row" htmlFor="kiosk-mode">
        <span className="nh-field__label">Kiosk mode</span>
        <input id="kiosk-mode" type="checkbox" checked={kioskOn} onChange={(e) => setKioskMode(e.target.checked)} />
      </label>
      <p className="nh-settings__text">
        Hides all navigation and editing controls so the dashboard fills the screen. To exit, tap
        any screen corner five times in a row, or open the app with <code>?kiosk=off</code> in the
        address. <code>?kiosk=on</code> turns it on for one session — handy as the pinned address
        in a kiosk-browser app.
      </p>

      <label className="nh-field nh-field--row" htmlFor="kiosk-follow">
        <span className="nh-field__label">Follow the dashboard-control item</span>
        <input
          id="kiosk-follow"
          type="checkbox"
          checked={kioskSettings.followControl ?? kioskOn}
          onChange={(e) => setKioskSettings({ followControl: e.target.checked })}
        />
      </label>

      <label className="nh-field" htmlFor="kiosk-controlitem">
        <span className="nh-field__label">Dashboard-control item (all devices)</span>
        <ItemPicker
          id="kiosk-controlitem"
          value={controlItem}
          onChange={(n) => void setControlItem(n)}
          itemTypes={['String']}
          placeholder="No control item"
        />
      </label>
      {controlItem ? (
        <div className="nh-settings__row">
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => void setControlItem('')}>
            Clear control item
          </button>
        </div>
      ) : null}
      <p className="nh-settings__text">
        A String item whose state names a dashboard (by id, or by name). When a rule changes it,
        every device that follows it switches to that dashboard — the classic way to drive wall
        panels remotely. Saving it needs an administrator sign-in; whether a device follows it is
        that device's own choice above (kiosk-mode devices follow by default).
      </p>
    </section>
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
