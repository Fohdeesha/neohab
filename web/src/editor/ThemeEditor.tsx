/**
 * The custom-theme editor.
 *
 * Three things it deliberately does that the previous one did not:
 *
 *  - it previews. Every edit is applied to the running app immediately, and the real theme is put
 *    back when the editor closes. Picking colours through a save round-trip that also changed
 *    what every other device was showing was the single worst part of theming here.
 *  - it offers every token, grouped and explained, from the one list in `themes/tokens.ts`. A
 *    variable a person cannot find is not a feature they have.
 *  - it says whether the colours can be read, while they are being chosen.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteTheme, saveSettings, saveTheme, useConfigStore } from '../store/config'
import { useDeviceThemeStore } from '../store/deviceTheme'
import {
  applyTheme,
  resolveTheme,
  themeCss,
  TOKEN_GROUPS,
  tokensInGroup,
  type Theme,
  type TokenSpec,
} from '../themes/themes'
import { CONTRAST_PAIRS, contrastLevel, contrastOf, type ContrastLevel } from '../themes/contrast'
import { TOKEN_SPECS } from '../themes/tokens'

/** Re-apply whatever theme the app should actually be showing right now. */
function applyLiveTheme(): void {
  const config = useConfigStore.getState()
  const override = useDeviceThemeStore.getState().themeId
  applyTheme(resolveTheme(override ?? config.settings.theme, config.customThemes))
}

export function ThemeEditor({
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
  const { t } = useTranslation()
  const sharedThemeId = useConfigStore((s) => s.settings.theme)
  const [makeShared, setMakeShared] = useState(() => sharedThemeId === theme.id)
  const [saving, setSaving] = useState(false)

  // Live preview: the draft is applied as it is edited, and whatever the app should really be
  // showing is put back when the editor closes - including after a save that did not adopt it.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  useEffect(() => () => applyLiveTheme(), [])

  const setToken = (key: string, value: string | undefined) => {
    const tokens = { ...theme.tokens }
    if (value === undefined || value === '') delete tokens[key]
    else tokens[key] = value
    onChange({ ...theme, tokens })
  }

  const save = async () => {
    onNotice(null)
    setSaving(true)
    try {
      await saveTheme(theme)
      // Saving a theme is not the same as adopting it. It used to be, which meant tweaking a
      // theme you were not using switched every device in the house onto it.
      if (makeShared) {
        const err = await saveSettings({ theme: theme.id })
        if (err) {
          onNotice(t('Theme saved, but sharing it failed: {{error}}', { error: err }))
          return
        }
      }
      onNotice(
        makeShared
          ? t('Theme saved and set as the shared theme.')
          : t('Theme saved. Pick it above, or under “Theme on this device”, to use it.')
      )
      onClose()
    } catch (err) {
      onNotice(t('Saving the theme failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(t('Delete theme “{{name}}”?', { name: theme.name }))) return
    onNotice(null)
    try {
      await deleteTheme(theme.id)
      onClose()
    } catch (err) {
      onNotice(t('Deleting the theme failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <section className="nh-themeeditor">
      <h2 className="nh-settings__h">{t('Theme editor')}</h2>
      <p className="nh-settings__text">
        {t('Changes preview on this screen as you make them. Nothing is stored until you save.')}
      </p>

      <div className="nh-form">
        <label className="nh-field" htmlFor="theme-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input id="theme-name" type="text" value={theme.name} onChange={(e) => onChange({ ...theme, name: e.target.value })} />
        </label>
        <label className="nh-field nh-field--row" htmlFor="theme-scheme">
          <span className="nh-field__label">{t('Dark scheme')}</span>
          <input
            id="theme-scheme"
            type="checkbox"
            checked={theme.scheme === 'dark'}
            onChange={(e) => onChange({ ...theme, scheme: e.target.checked ? 'dark' : 'light' })}
          />
        </label>
        <p className="nh-field__hint">
          {t('Tells the browser which way round the page is, so scrollbars and form controls match.')}
        </p>

        <ContrastReport theme={theme} />

        {TOKEN_GROUPS.map((group) => (
          <TokenGroupFields key={group} group={group} theme={theme} onSet={setToken} />
        ))}

        <StylesheetField theme={theme} onChange={onChange} />
      </div>

      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
          {t('Delete')}
        </button>
        <span className="nh-dash__spacer" />
        <label className="nh-field nh-field--row nh-themeeditor__share" htmlFor="theme-shared">
          <span className="nh-field__label">{t('Use on all devices')}</span>
          <input
            id="theme-shared"
            type="checkbox"
            checked={makeShared}
            onChange={(e) => setMakeShared(e.target.checked)}
          />
        </label>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onClose}>
          {t('Close')}
        </button>
        <button type="button" className="nh-btn nh-btn--primary" disabled={saving} onClick={() => void save()}>
          {saving ? t('Saving…') : t('Save theme')}
        </button>
      </div>
    </section>
  )
}

/** One editor section: every token in a group, each explained and each clearable back to Auto. */
function TokenGroupFields({
  group,
  theme,
  onSet,
}: {
  group: (typeof TOKEN_GROUPS)[number]
  theme: Theme
  onSet: (key: string, value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const specs = tokensInGroup(group)
  // Only the Core group is open to begin with: it is the one nearly every theme only needs, and
  // twenty-six fields unfolded at once is not a starting point anyone wants.
  const [open, setOpen] = useState(group === 'Core')
  const set = specs.filter((s) => theme.tokens[s.key] !== undefined).length

  return (
    <div className="nh-tokengroup">
      <button
        type="button"
        className="nh-tokengroup__head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="nh-tokengroup__name">{t(group)}</span>
        <span className="nh-tokengroup__count">
          {set > 0 ? t('{{count}} set', { count: set }) : t('all automatic')}
        </span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open ? specs.map((spec) => <TokenField key={spec.key} spec={spec} theme={theme} onSet={onSet} />) : null}
    </div>
  )
}

function TokenField({
  spec,
  theme,
  onSet,
}: {
  spec: TokenSpec
  theme: Theme
  onSet: (key: string, value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const value = theme.tokens[spec.key]
  const id = 'tok-' + spec.key
  // Any CSS colour is allowed (a theme may want `color-mix(...)`), so the text box is the real
  // field and the swatch is a shortcut that writes a hex value into it.
  const swatch = /^#[0-9a-f]{6}$/i.test(value ?? '') ? (value as string) : '#888888'

  return (
    <div className="nh-field nh-tokenfield">
      <label className="nh-field__label" htmlFor={id}>
        {t(spec.label)}
      </label>
      <div className="nh-tokenfield__row">
        {spec.kind === 'color' ? (
          <input
            type="color"
            aria-label={t('Pick {{name}}', { name: t(spec.label) })}
            value={swatch}
            onChange={(e) => onSet(spec.key, e.target.value)}
          />
        ) : null}
        <input
          id={id}
          type="text"
          value={value ?? ''}
          placeholder={t('Auto ({{value}})', { value: spec.fallback })}
          onChange={(e) => onSet(spec.key, e.target.value || undefined)}
        />
        {value !== undefined ? (
          <button type="button" className="nh-colorfield__clear" onClick={() => onSet(spec.key, undefined)}>
            {t('Auto')}
          </button>
        ) : null}
      </div>
      <p className="nh-field__hint">{t(spec.hint)}</p>
    </div>
  )
}

const LEVEL_LABEL: Record<ContrastLevel, string> = {
  AAA: 'AAA',
  AA: 'AA',
  'AA-large': 'large text only',
  fail: 'hard to read',
}

/**
 * Whether the colours can actually be read. Only the pairs that genuinely meet on screen, and
 * only where both are colours we can parse — a `color-mix()` accent is reported as unknown
 * rather than guessed at.
 */
function ContrastReport({ theme }: { theme: Theme }) {
  const { t } = useTranslation()
  const rows = CONTRAST_PAIRS.map((pair) => {
    const fg = theme.tokens[pair.fg] ?? TOKEN_SPECS.find((s) => s.key === pair.fg)?.fallback
    const bg = theme.tokens[pair.bg] ?? TOKEN_SPECS.find((s) => s.key === pair.bg)?.fallback
    const ratio = contrastOf(fg, bg)
    return { pair, ratio }
  })
  const worst = rows.reduce<number | null>((m, r) => (r.ratio === null ? m : m === null ? r.ratio : Math.min(m, r.ratio)), null)

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('Readability')}</span>
      <div className="nh-contrast">
        {rows.map(({ pair, ratio }) => {
          const level = ratio === null ? null : contrastLevel(ratio)
          // Where the text really is large, AA-large is a pass rather than a warning.
          const ok = level === 'AAA' || level === 'AA' || (level === 'AA-large' && pair.large)
          return (
            <div key={pair.label} className={'nh-contrast__row' + (ratio !== null && !ok ? ' nh-contrast__row--warn' : '')}>
              <span className="nh-contrast__what">{t(pair.label)}</span>
              <span className="nh-contrast__ratio">{ratio === null ? '—' : ratio.toFixed(1) + ':1'}</span>
              <span className="nh-contrast__level">{level === null ? t('not measurable') : t(LEVEL_LABEL[level])}</span>
            </div>
          )
        })}
      </div>
      <p className="nh-field__hint">
        {worst !== null && worst < 4.5
          ? t('Some text on this theme falls below the 4.5:1 the accessibility guidelines ask for. It will still render — this is a warning, not a limit.')
          : t('Contrast between the colours that meet on screen. 4.5:1 is the guideline for normal text, 3:1 for large.')}
      </p>
    </div>
  )
}

/**
 * The theme's own stylesheet.
 *
 * Starting a theme no longer copies the active one's stylesheet automatically. Doing that handed
 * anyone starting from a structural theme two hundred lines referencing bundled fonts and images,
 * full of colours that do NOT follow the tokens they were about to change — so the new theme
 * looked broken and the reason was invisible. It is offered explicitly instead, with that said.
 */
function StylesheetField({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const { t } = useTranslation()
  const sharedThemeId = useConfigStore((s) => s.settings.theme)
  const customThemes = useConfigStore((s) => s.customThemes)
  const source = resolveTheme(sharedThemeId, customThemes)
  const [busy, setBusy] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const copyFrom = async () => {
    setBusy(true)
    const css = await themeCss(source)
    setBusy(false)
    if (css) onChange({ ...theme, css })
    areaRef.current?.focus()
  }

  return (
    <label className="nh-field" htmlFor="theme-css">
      <span className="nh-field__label">{t('Custom CSS')}</span>
      <textarea
        id="theme-css"
        ref={areaRef}
        className="nh-defeditor__code"
        rows={10}
        spellCheck={false}
        value={theme.css ?? ''}
        onChange={(e) => onChange({ ...theme, css: e.target.value || undefined })}
      />
      <span className="nh-field__hint">
        {t(
          'Optional. A stylesheet applied with this theme, for looks the tokens above cannot express — fonts, widget-frame structure. It is applied here as you type, like everything else.'
        )}{' '}
        <a href="docs/theming.html" target="_blank" rel="noreferrer">
          {t('Class names, the rules that apply, and worked examples')}
        </a>
      </span>
      {!theme.css && source.cssModule ? (
        <div className="nh-settings__row">
          <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => void copyFrom()}>
            {busy ? t('Copying…') : t('Start from “{{name}}”’s stylesheet', { name: source.name })}
          </button>
          <span className="nh-field__hint">
            {t(
              'Copies it as a starting point. Be aware it contains colours written directly into it, which will not follow the tokens above — Swiss Sheet is the one built entirely from tokens, so it is the best one to copy.'
            )}
          </span>
        </div>
      ) : null}
    </label>
  )
}
