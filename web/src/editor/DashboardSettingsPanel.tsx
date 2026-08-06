/**
 * Dashboard-level settings (name, grid geometry) for the draft being edited, plus deletion.
 * Edits apply to the draft immediately — live preview, coalesced undo, persisted on Save —
 * exactly like the widget settings panel.
 */
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { IconPicker } from '../components/IconPicker'
import { BackgroundField } from '../components/BackgroundField'
import { NumberSetting } from '../components/NumberSetting'
import { downloadJson } from '../components/download'
import type { Dashboard } from '../model/dashboard'
import { partialFileName } from '../model/partial'
import { hasTabletLayout, mdColumnsOf } from '../model/layout'
import { clearTabletLayout, setDashSettingsOpen, stopEditing, updateDashboardMeta } from '../store/editor'
import { buildDashboardExport, collectUnusedBackgrounds, deleteDashboard, useConfigStore } from '../store/config'
import { notify } from '../store/notify'
import { navigate } from '../app/router'

export function DashboardSettingsPanel({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const fixed = dashboard.rowHeight !== 'match'
  // The tablet fields only exist once a tablet layout does - offering a column count for a layout
  // that is not there would be a setting with no effect.
  const tablet = hasTabletLayout(dashboard)
  const sidebarOn = useConfigStore((s) => s.settings.sidebar !== false)

  const remove = async () => {
    if (!window.confirm(t('Delete dashboard “{{name}}” and all its widgets? This cannot be undone.', { name: dashboard.name })))
      return
    stopEditing()
    try {
      await deleteDashboard(dashboard.id)
    } catch (err) {
      window.alert(t('Delete failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      return
    }
    void collectUnusedBackgrounds()
    navigate({ name: 'home' })
  }

  /**
   * Export this dashboard alone, with the custom widgets, icons and background it uses, so it
   * can be shared or kept aside. The draft is exported, not the saved version, so what you see
   * is what lands in the file.
   */
  const exportDashboard = async () => {
    try {
      const out = await buildDashboardExport(dashboard)
      if (!out) return
      downloadJson(partialFileName('dashboard', dashboard.id), out.bundle)
      if (out.missing.length > 0) {
        notify(
          t('Exported, but {{count}} referenced item(s) no longer exist and were left out: {{list}}', {
            count: out.missing.length,
            list: out.missing.join(', '),
          })
        )
      }
    } catch (err) {
      notify(t('Export failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  /** The label markup this panel's fields use, so NumberSetting sits in the form like the rest. */
  const fieldLabel = (text: string) => <span className="nh-field__label">{text}</span>
  const fieldHint = (text: string) => <span className="nh-field__hint">{text}</span>

  return (
    <Sheet side title={t('Dashboard settings')} onClose={() => setDashSettingsOpen(false)}>
      <div className="nh-form">
        <label className="nh-field" htmlFor="nh-dash-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input
            id="nh-dash-name"
            value={dashboard.name}
            onChange={(e) => updateDashboardMeta({ name: e.target.value }, 'dash:name')}
          />
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

        <div className="nh-field">
          <span className="nh-field__label">{t('Background image')}</span>
          <BackgroundField
            id="nh-dash-bg"
            value={dashboard.background}
            onChange={(ref) => updateDashboardMeta({ background: ref }, 'dash:bg')}
          />
          <span className="nh-field__hint">{t('Overrides the global background from Settings on this dashboard.')}</span>
        </div>

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

        <NumberSetting
          id="nh-dash-columns"
          className="nh-field"
          label={fieldLabel(t('Grid columns'))}
          mode="live"
          value={dashboard.columns}
          min={1}
          max={60}
          onCommit={(n) => updateDashboardMeta({ columns: n }, 'dash:columns')}
        />

        <label className="nh-field" htmlFor="nh-dash-rowmode">
          <span className="nh-field__label">{t('Row height')}</span>
          <select
            id="nh-dash-rowmode"
            value={fixed ? 'fixed' : 'match'}
            onChange={(e) =>
              updateDashboardMeta({ rowHeight: e.target.value === 'match' ? 'match' : 80 }, 'dash:rowheight')
            }
          >
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
          value={dashboard.gap ?? 8}
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
          // 100 is the default, so it is stored as "unset" rather than as a value to carry around.
          onCommit={(n) => updateDashboardMeta({ textSize: n === 100 ? undefined : n }, 'dash:textsize')}
        />

        {tablet ? (
          <>
            <NumberSetting
              id="nh-dash-mdcolumns"
              className="nh-field"
              label={fieldLabel(t('Columns on tablets'))}
              mode="live"
              value={mdColumnsOf(dashboard)}
              min={1}
              max={60}
              hint={fieldHint(
                t('The tablet layout can use a different grid. Fewer columns means bigger cells on a tablet.')
              )}
              onCommit={(n) => updateDashboardMeta({ mdColumns: n }, 'dash:mdcolumns')}
            />
            <div className="nh-field">
              <span className="nh-field__label">{t('Tablet layout')}</span>
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => clearTabletLayout()}>
                {t('Remove the tablet layout')}
              </button>
              <span className="nh-field__hint">
                {t('Tablets then show the desktop layout again, as they do without a tablet layout.')}
              </span>
            </div>
          </>
        ) : null}

        {dashboard.stackOrder && dashboard.stackOrder.length > 0 ? (
          <div className="nh-field">
            <span className="nh-field__label">{t('Phone layout')}</span>
            <button
              type="button"
              className="nh-btn nh-btn--ghost"
              onClick={() => updateDashboardMeta({ stackOrder: undefined })}
            >
              {t('Reset stack order to follow the grid')}
            </button>
          </div>
        ) : null}
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
