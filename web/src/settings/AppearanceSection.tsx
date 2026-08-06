/**
 * Appearance: the theme picker, the custom-theme editor, and the per-device presentation choices
 * that sit beside it (background, sidebar, language, text size).
 *
 * The theme cards set the SHARED theme, and the select below them pins one for this device only.
 * Those two disagreeing is the normal case for a wall panel, so anything here that says "current"
 * means the theme actually on screen, not the shared setting.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collectUnusedBackgrounds, saveSettings, useConfigStore } from '../store/config'
import { setDeviceTextSize, useTextSizeStore } from '../store/textsize'
import { useEditingAllowed } from '../store/auth'
import { listThemes, type Theme } from '../themes/themes'
import { useActiveTheme } from '../themes/active'
import { BackgroundField } from '../components/BackgroundField'
import { exportComponent } from '../editor/exportComponent'
import { ThemeEditor } from './ThemeEditor'
import { DeviceThemeField } from './DeviceThemeField'
import { LanguageField } from './LanguageField'

export function AppearanceSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const settings = useConfigStore((s) => s.settings)
  const customThemes = useConfigStore((s) => s.customThemes)
  const textPct = useTextSizeStore((s) => s.percent)
  const canEdit = useEditingAllowed()
  const [editing, setEditing] = useState<Theme | null>(null)

  // The theme on screen, which is what "current" means to the person looking at it.
  const activeTheme = useActiveTheme()

  const choose = async (id: string) => {
    onNotice(null)
    const err = await saveSettings({ theme: id })
    if (err) onNotice(t('Theme applied on this device, but saving failed: {{error}} — sign in as an administrator.', { error: err }))
  }

  const toggleSidebarSetting = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ sidebar: on })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}} — sign in as an administrator.', { error: err }))
  }

  /**
   * Start a theme from the colours of the one on screen. Its stylesheet is not copied: a
   * structural theme's CSS is full of colours written directly into it that would not follow the
   * tokens being edited, so a copy looks broken for reasons nothing on screen explains. The
   * editor offers that copy explicitly instead, and says what it costs.
   */
  const newFromCurrent = () => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 8)
    // `accent-ink` is derived from the accent unless a theme pins it, and the built-ins pin it
    // for the specific accent they ship with. Carrying that pin into a copy would silently
    // disable the automatic choice for a theme whose accent is about to become something else -
    // and leave unreadable text with nothing on screen explaining it.
    const { 'accent-ink': _pinnedInk, ...tokens } = activeTheme.tokens
    setEditing({ id, name: t('My theme'), scheme: activeTheme.scheme, tokens })
  }

  return (
    <>
      <section>
        <h2 className="nh-settings__h">{t('Appearance')}</h2>

        <div className="nh-themes">
          {listThemes(customThemes).map((theme) => (
            <div key={theme.id} className={'nh-theme' + (settings.theme === theme.id ? ' nh-theme--active' : '')}>
              <button type="button" className="nh-theme__pick" onClick={() => void choose(theme.id)}>
                <span className="nh-theme__dots">
                  {(['bg', 'surface', 'primary', 'brand'] as const).map((k) => (
                    <span key={k} className="nh-theme__dot" style={{ background: theme.tokens[k] }} />
                  ))}
                </span>
                <span className="nh-theme__name">{theme.name}</span>
              </button>
              {canEdit && customThemes.includes(theme) ? (
                <>
                  <button
                    type="button"
                    className="nh-theme__export"
                    aria-label={t('Export theme {{name}}', { name: theme.name })}
                    title={t('Export this theme as a file')}
                    onClick={() => void exportComponent('theme', theme.id, onNotice)}
                  >
                    ⭳
                  </button>
                  <button
                    type="button"
                    className="nh-theme__edit"
                    aria-label={t('Edit theme {{name}}', { name: theme.name })}
                    onClick={() => setEditing(structuredClone(theme))}
                  >
                    ✎
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>

        {/* The cards set the SHARED theme, so the highlighted one is not necessarily the one on
            screen. Say so, or the highlight reads as a bug. */}
        {activeTheme.id !== settings.theme ? (
          <p className="nh-settings__text">
            {t('The highlighted theme is the shared one. This device is showing “{{name}}” instead, set below.', {
              name: activeTheme.name,
            })}
          </p>
        ) : null}

        {canEdit ? (
          <button type="button" className="nh-btn nh-btn--ghost" onClick={newFromCurrent}>
            {t('New theme from “{{name}}”', { name: activeTheme.name })}
          </button>
        ) : null}

        <DeviceThemeField />

        {canEdit ? (
          <div className="nh-field">
            <span className="nh-field__label">{t('Background image')}</span>
            <BackgroundField
              id="nh-set-bg"
              value={settings.background}
              onChange={async (ref) => {
                onNotice(null)
                const err = await saveSettings({ background: ref })
                if (err) onNotice(t('Applied on this device, but saving failed: {{error}} — sign in as an administrator.', { error: err }))
                void collectUnusedBackgrounds()
              }}
            />
            <span className="nh-field__hint">
              {t('Shown behind the Home screen and every dashboard that has no background of its own.')}
            </span>
          </div>
        ) : null}

        {canEdit ? (
          <>
            <label className="nh-field nh-field--row" htmlFor="nh-set-sidebar">
              <span className="nh-field__label">{t('Dashboard sidebar')}</span>
              <input
                id="nh-set-sidebar"
                type="checkbox"
                checked={settings.sidebar !== false}
                onChange={(e) => void toggleSidebarSetting(e.target.checked)}
              />
            </label>
            <p className="nh-settings__text">
              {t(
                'Adds a ☰ to the top-left of every screen that slides out the dashboard list, so you can switch dashboards without going back Home. Turn it off to navigate from the Home screen only.'
              )}
            </p>
          </>
        ) : null}

        <LanguageField />

        <label className="nh-field" htmlFor="nh-set-textsize">
          <span className="nh-field__label">{t('Text size on this device (%)')}</span>
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
            {t(
              'Scales dashboard text on this device only — other devices and the dashboards themselves are unchanged. 100 = normal.'
            )}
          </span>
        </label>
      </section>

      {editing ? (
        <ThemeEditor theme={editing} onChange={setEditing} onClose={() => setEditing(null)} onNotice={onNotice} />
      ) : null}
    </>
  )
}
