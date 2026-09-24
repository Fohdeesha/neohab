import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collectUnusedBackgrounds, saveSettings, useConfigStore } from '../store/config'
import { setDeviceTextSize, useTextSizeStore } from '../store/textsize'
import { useEditingAllowed } from '../store/auth'
import { listThemes, type Theme } from '../themes/themes'
import { useActiveTheme } from '../themes/active'
import { urlThemeForced } from '../themes/urlTheme'
import { BackgroundField } from '../components/BackgroundField'
import { NumberSetting } from '../components/NumberSetting'
import { useSurfaceBounds } from '../components/useSurfaceBounds'
import { PHONE_BELOW_RANGE, surfaceBounds, TABLET_BELOW_RANGE } from '../model/layout'
import { exportComponent } from '../editor/exportComponent'
import { ThemeEditor } from './ThemeEditor'
import { DeviceThemeField } from './DeviceThemeField'
import { LanguageField } from './LanguageField'
import type { NoticeFn } from '../store/notify'

export function AppearanceSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation()
  const settings = useConfigStore((s) => s.settings)
  const customThemes = useConfigStore((s) => s.customThemes)
  const textPct = useTextSizeStore((s) => s.percent)
  const canEdit = useEditingAllowed()
  const bounds = useSurfaceBounds()
  const [editing, setEditing] = useState<Theme | null>(null)

  const activeTheme = useActiveTheme()

  const choose = async (id: string) => {
    onNotice(null)
    const err = await saveSettings({ theme: id })
    if (err) onNotice(t('Theme applied on this device, but saving failed: {{error}}', { error: err }))
  }

  const toggleSidebarSetting = async (on: boolean) => {
    onNotice(null)
    const err = await saveSettings({ sidebar: on })
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
  }

  // The reader's rule for a contradictory pair is "tablet is at least phone + 1", which has to be
  // total because it also runs over a hand-edited settings component. Here we know which field was
  // typed into, so the other one gives way instead - typing 600 into a field and watching it become
  // 901 is not an answer anybody can work with. Written back through surfaceBounds either way, so
  // what is stored is what the app will use.
  const saveBounds = async (patch: { phoneBelow?: number; tabletBelow?: number }) => {
    onNotice(null)
    const wanted = { ...bounds, ...patch }
    if (patch.tabletBelow !== undefined && wanted.phoneBelow >= patch.tabletBelow) wanted.phoneBelow = patch.tabletBelow - 1
    if (patch.phoneBelow !== undefined && wanted.tabletBelow <= patch.phoneBelow) wanted.tabletBelow = patch.phoneBelow + 1
    const err = await saveSettings(surfaceBounds(wanted))
    if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
  }

  // the stylesheet is not copied: a structural theme's CSS is full of colours written into it, which would fight
  // the tokens you are about to change
  const newFromCurrent = () => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 8)
    const { 'accent-ink': _pinnedInk, ...tokens } = activeTheme.tokens
    setEditing({ id, name: t('My theme'), scheme: activeTheme.scheme, tokens })
  }

  return (
    <>
      <section>
        <h2 className="nh-settings__h">{t('Appearance')}</h2>

        {/* Someone here via ?theme= is most likely here because a theme broke something. Say what
            is going on, or the screen looks like it is ignoring the theme they picked. */}
        {urlThemeForced ? (
          <p className="nh-settings__notice">
            {t('Showing “{{name}}” because of ?theme= in the address. Nothing was saved - reload without it to go back.', {
              name: activeTheme.name
            })}
          </p>
        ) : null}

        {/* The cards set the SHARED theme - panel configuration, so view-only devices do not
            get them. Their own way to a different look is the per-device select below. */}
        {/* Which of these travel and which stay here. Two kinds of setting sat next to each other
            with nothing saying so, and the theme cards are the ones that change what everybody
            else sees. */}
        {canEdit ? (
          <>
            <p className="nh-settings__text">
              {t('Theme, background and sidebar are shared with every device. The rest here is this device only.')}
            </p>
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
                  {customThemes.includes(theme) ? (
                    <>
                      <button
                        type="button"
                        className="nh-theme__export"
                        aria-label={t('Export theme {{name}}', { name: theme.name })}
                        title={t('Export this theme as a file')}
                        onClick={() => void exportComponent('theme', theme.id, onNotice)}>
                        ⭳
                      </button>
                      <button
                        type="button"
                        className="nh-theme__edit"
                        aria-label={t('Edit theme {{name}}', { name: theme.name })}
                        onClick={() => setEditing(structuredClone(theme))}>
                        ✎
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>

            {/* The cards set the SHARED theme, so the highlighted one is not necessarily the one
                on screen. Say so, or the highlight reads as a bug. */}
            {activeTheme.id !== settings.theme ? (
              <p className="nh-settings__text">
                {t('The highlight is the shared theme. This device shows “{{name}}” instead.', {
                  name: activeTheme.name
                })}
              </p>
            ) : null}
          </>
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
                if (err) onNotice(t('Applied on this device, but saving failed: {{error}}', { error: err }))
                void collectUnusedBackgrounds()
              }}
            />
            <span className="nh-field__hint">{t('Behind the Home screen and any dashboard with no background of its own.')}</span>
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
              {t('Puts a ☰ in the top-left that slides out the dashboard list, so you can switch without going Home.')}
            </p>
          </>
        ) : null}

        {/* Which layout a screen gets. The pair is clamped and ordered on the way back out
            (surfaceBounds), so a tablet threshold typed below the phone one cannot erase a whole
            surface. */}
        {canEdit ? (
          <>
            <NumberSetting
              id="nh-set-phonebelow"
              className="nh-field"
              label={<span className="nh-field__label">{t('Stack widgets below (px)')}</span>}
              value={bounds.phoneBelow}
              min={PHONE_BELOW_RANGE.min}
              max={PHONE_BELOW_RANGE.max}
              step={10}
              hint={
                <span className="nh-field__hint">
                  {t(
                    'Narrower than this, a dashboard becomes one column of cards. Measured across the dashboard area, so the sidebar counts against it.'
                  )}
                </span>
              }
              onCommit={(n) => void saveBounds({ phoneBelow: n })}
            />
            <NumberSetting
              id="nh-set-tabletbelow"
              className="nh-field"
              label={<span className="nh-field__label">{t('Use the tablet layout below (px)')}</span>}
              value={bounds.tabletBelow}
              min={TABLET_BELOW_RANGE.min}
              max={TABLET_BELOW_RANGE.max}
              step={10}
              hint={
                <span className="nh-field__hint">
                  {t(
                    'Between the two widths, a dashboard with a tablet layout shows it. Wider than this, every dashboard shows its desktop layout.'
                  )}
                </span>
              }
              onCommit={(n) => void saveBounds({ tabletBelow: n })}
            />
          </>
        ) : null}

        <LanguageField />

        {/* Live: this one only writes localStorage and a root CSS variable, so previewing as it
            is typed costs nothing. */}
        <NumberSetting
          id="nh-set-textsize"
          className="nh-field"
          label={<span className="nh-field__label">{t('Text size on this device (%)')}</span>}
          mode="live"
          value={textPct}
          min={50}
          max={300}
          step={5}
          hint={<span className="nh-field__hint">{t('This device only. 100 = normal.')}</span>}
          onCommit={setDeviceTextSize}
        />
      </section>

      {/* keyed, so opening another theme starts a fresh editor rather than keeping the last one's ticks */}
      {editing ? (
        <ThemeEditor key={editing.id} theme={editing} onChange={setEditing} onClose={() => setEditing(null)} onNotice={onNotice} />
      ) : null}
    </>
  )
}
