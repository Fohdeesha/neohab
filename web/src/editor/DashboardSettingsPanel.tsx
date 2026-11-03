import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { IconPicker } from '../components/IconPicker'
import { BackgroundField } from '../components/BackgroundField'
import { NumberSetting } from '../components/NumberSetting'
import { downloadJson } from '../components/download'
import { pageOf, type Dashboard, type DashboardPage } from '../model/dashboard'
import { partialFileName } from '../model/partial'
import { columnsOf, gapOf, hasTabletLayout, layoutCustomized, MAX_COLUMNS, mdColumnsOf } from '../model/layout'
import { resetPhoneLayout, resetTabletLayout, setDashSettingsOpen, stopEditing, updateDashboardMeta } from '../store/editor'
import { buildDashboardExport, collectUnusedBackgrounds, deleteDashboard, useConfigStore } from '../store/config'
import { notify } from '../store/notify'
import { navigate } from '../app/router'
import { errorText } from '../api/errors'

export function DashboardSettingsPanel({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const fixed = dashboard.rowHeight !== 'match'
  const tablet = hasTabletLayout(dashboard)
  const sidebarOn = useConfigStore((s) => s.settings.sidebar !== false)
  const page = pageOf(dashboard)

  const remove = async () => {
    if (!window.confirm(t('Delete dashboard “{{name}}” and all its widgets? This cannot be undone.', { name: dashboard.name }))) return
    stopEditing()
    try {
      await deleteDashboard(dashboard.id)
    } catch (err) {
      window.alert(t('Delete failed: {{error}}', { error: errorText(err) }))
      return
    }
    void collectUnusedBackgrounds()
    navigate({ name: 'home' })
  }

  const exportDashboard = async () => {
    try {
      const out = await buildDashboardExport(dashboard)
      if (!out) return
      downloadJson(partialFileName('dashboard', dashboard.id), out.bundle)
      if (out.missing.length > 0) {
        notify(
          t('Exported, but {{count}} referenced items no longer exist and were left out: {{list}}', {
            count: out.missing.length,
            list: out.missing.join(', ')
          })
        )
      }
    } catch (err) {
      notify(t('Export failed: {{error}}', { error: errorText(err) }))
    }
  }

  const fieldLabel = (text: string) => <span className="nh-field__label">{text}</span>
  const fieldHint = (text: string) => <span className="nh-field__hint">{text}</span>

  return (
    <Sheet side title={t('Dashboard settings')} onClose={() => setDashSettingsOpen(false)}>
      <div className="nh-form">
        <label className="nh-field" htmlFor="nh-dash-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input id="nh-dash-name" value={dashboard.name} onChange={(e) => updateDashboardMeta({ name: e.target.value }, 'dash:name')} />
        </label>

        <div className="nh-field">
          <span className="nh-field__label">{t('Icon')}</span>
          <IconPicker
            id="nh-dash-icon"
            value={dashboard.icon ?? ''}
            onChange={(icon) => updateDashboardMeta({ icon: icon || undefined }, 'dash:icon')}
          />
          <span className="nh-field__hint">{t('Shown on the Home tile and in the sidebar.')}</span>
        </div>

        {page ? null : (
          <div className="nh-field">
            <span className="nh-field__label">{t('Background image')}</span>
            <BackgroundField
              id="nh-dash-bg"
              value={dashboard.background}
              onChange={(ref) => updateDashboardMeta({ background: ref }, 'dash:bg')}
            />
            <span className="nh-field__hint">{t('Overrides the global background from Settings on this dashboard.')}</span>
          </div>
        )}

        {sidebarOn ? (
          <label className="nh-field nh-field--row" htmlFor="nh-dash-hide">
            <span className="nh-field__label">{t('Hide from the sidebar')}</span>
            <input
              id="nh-dash-hide"
              type="checkbox"
              checked={dashboard.hideInSidebar === true}
              onChange={(e) => updateDashboardMeta({ hideInSidebar: e.target.checked || undefined })}
            />
          </label>
        ) : null}

        {page ? (
          <PageFields key={dashboard.id + '|' + page.url} page={page} />
        ) : (
          <>
            <NumberSetting
              id="nh-dash-columns"
              className="nh-field"
              label={fieldLabel(t('Grid columns'))}
              mode="live"
              value={columnsOf(dashboard)}
              min={1}
              max={MAX_COLUMNS}
              onCommit={(n) => updateDashboardMeta({ columns: n }, 'dash:columns')}
            />

            <label className="nh-field" htmlFor="nh-dash-rowmode">
              <span className="nh-field__label">{t('Row height')}</span>
              <select
                id="nh-dash-rowmode"
                value={fixed ? 'fixed' : 'match'}
                onChange={(e) => updateDashboardMeta({ rowHeight: e.target.value === 'match' ? 'match' : 80 }, 'dash:rowheight')}>
                <option value="match">{t('Square cells (match column width)')}</option>
                <option value="fixed">{t('Fixed height')}</option>
              </select>
            </label>

            {fixed ? (
              <NumberSetting
                id="nh-dash-rowpx"
                className="nh-field"
                label={fieldLabel(t('Row height (px)'))}
                mode="live"
                value={dashboard.rowHeight as number}
                min={8}
                max={400}
                onCommit={(n) => updateDashboardMeta({ rowHeight: n }, 'dash:rowheight')}
              />
            ) : null}

            <NumberSetting
              id="nh-dash-gap"
              className="nh-field"
              label={fieldLabel(t('Grid gap (px)'))}
              mode="live"
              value={gapOf(dashboard)}
              min={0}
              max={64}
              onCommit={(n) => updateDashboardMeta({ gap: n }, 'dash:gap')}
            />

            <NumberSetting
              id="nh-dash-textsize"
              className="nh-field"
              label={fieldLabel(t('Text size (%)'))}
              mode="live"
              value={dashboard.textSize ?? 100}
              min={50}
              max={300}
              step={5}
              hint={fieldHint(t('Scales all widget text on this dashboard, on top of the automatic sizing. 100 = normal.'))}
              onCommit={(n) => updateDashboardMeta({ textSize: n === 100 ? undefined : n }, 'dash:textsize')}
            />

            {tablet ? (
              <NumberSetting
                id="nh-dash-mdcolumns"
                className="nh-field"
                label={fieldLabel(t('Columns on tablets'))}
                mode="live"
                value={mdColumnsOf(dashboard)}
                min={1}
                max={MAX_COLUMNS}
                hint={fieldHint(t('The tablet layout can use a different grid. Fewer columns means bigger cells on a tablet.'))}
                onCommit={(n) => updateDashboardMeta({ mdColumns: n }, 'dash:mdcolumns')}
              />
            ) : null}

            {/* always here, greyed out until there is something to reset, so they can be found before they are needed */}
            <div className="nh-field">
              <span className="nh-field__label">{t('Tablet layout')}</span>
              <button
                type="button"
                className="nh-btn nh-btn--ghost"
                disabled={!layoutCustomized(dashboard, 'tablet')}
                onClick={() => resetTabletLayout()}>
                {t('Reset the tablet layout')}
              </button>
              <span className="nh-field__hint">
                {t(
                  'Rebuilds it from the desktop layout, as it is before anyone changes it. Widgets hidden on tablets but not on the desktop come back.'
                )}
              </span>
            </div>

            <div className="nh-field">
              <span className="nh-field__label">{t('Phone layout')}</span>
              <button
                type="button"
                className="nh-btn nh-btn--ghost"
                disabled={!layoutCustomized(dashboard, 'phone')}
                onClick={() => resetPhoneLayout()}>
                {t('Reset the phone layout')}
              </button>
              <span className="nh-field__hint">
                {t(
                  'Rebuilds it from the desktop layout, stacked in reading order. Widgets hidden on phones but not on the desktop come back.'
                )}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="nh-form__footer">
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => void exportDashboard()}>
          {t('Export this dashboard…')}
        </button>
        <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
          {t('Delete dashboard…')}
        </button>
      </div>
    </Sheet>
  )
}

// the address is held while it is typed and committed on leaving the field or Enter, so the page behind the panel
// is not reloaded at every keystroke
function PageFields({ page }: { page: DashboardPage }) {
  const { t } = useTranslation()
  const [text, setText] = useState(page.url)
  const commit = () => {
    if (text.trim() !== page.url) updateDashboardMeta({ page: { ...page, url: text.trim() } })
  }
  return (
    <>
      <label className="nh-field" htmlFor="nh-dash-pageurl">
        <span className="nh-field__label">{t('Page URL')}</span>
        <input
          id="nh-dash-pageurl"
          value={text}
          placeholder="https://…"
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
        />
        <span className="nh-field__hint">{t('The page fills the screen under the bar, and may go fullscreen.')}</span>
      </label>
      <label className="nh-field nh-field--row" htmlFor="nh-dash-pagesandbox">
        <span className="nh-field__label">{t('Sandbox the embedded page')}</span>
        <input
          id="nh-dash-pagesandbox"
          type="checkbox"
          checked={page.sandbox === true}
          onChange={(e) => updateDashboardMeta({ page: { ...page, sandbox: e.target.checked || undefined } })}
        />
      </label>
      <p className="nh-field__hint">
        {t(
          'A page served by openHAB itself can otherwise read this dashboard and your session token. Sandboxing walls it off, but it can then no longer reach openHAB at all: Basic UI, Main UI and HABPanel still draw themselves and quietly stop updating. Pages on any other address are already isolated by the browser, so this does nothing for them.'
        )}
      </p>
    </>
  )
}
