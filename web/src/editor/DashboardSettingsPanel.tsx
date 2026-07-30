/**
 * Dashboard-level settings (name, grid geometry) for the draft being edited, plus deletion.
 * Edits apply to the draft immediately — live preview, coalesced undo, persisted on Save —
 * exactly like the widget settings panel.
 */
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { IconPicker } from '../components/IconPicker'
import { BackgroundField } from '../components/BackgroundField'
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

  const num = (raw: string, min: number, max: number): number | null => {
    const n = Math.round(Number(raw))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }

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

        <label className="nh-field" htmlFor="nh-dash-columns">
          <span className="nh-field__label">{t('Grid columns')}</span>
          <input
            id="nh-dash-columns"
            type="number"
            min={1}
            max={60}
            value={dashboard.columns}
            onChange={(e) => {
              const n = num(e.target.value, 1, 60)
              if (n !== null) updateDashboardMeta({ columns: n }, 'dash:columns')
            }}
          />
        </label>

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
          <label className="nh-field" htmlFor="nh-dash-rowpx">
            <span className="nh-field__label">{t('Row height (px)')}</span>
            <input
              id="nh-dash-rowpx"
              type="number"
              min={8}
              max={400}
              value={dashboard.rowHeight as number}
              onChange={(e) => {
                const n = num(e.target.value, 8, 400)
                if (n !== null) updateDashboardMeta({ rowHeight: n }, 'dash:rowheight')
              }}
            />
          </label>
        ) : null}

        <label className="nh-field" htmlFor="nh-dash-gap">
          <span className="nh-field__label">{t('Grid gap (px)')}</span>
          <input
            id="nh-dash-gap"
            type="number"
            min={0}
            max={64}
            value={dashboard.gap ?? 8}
            onChange={(e) => {
              const n = num(e.target.value, 0, 64)
              if (n !== null) updateDashboardMeta({ gap: n }, 'dash:gap')
            }}
          />
        </label>

        <label className="nh-field" htmlFor="nh-dash-textsize">
          <span className="nh-field__label">{t('Text size (%)')}</span>
          <input
            id="nh-dash-textsize"
            type="number"
            min={50}
            max={300}
            step={5}
            value={dashboard.textSize ?? 100}
            onChange={(e) => {
              const n = num(e.target.value, 50, 300)
              if (n !== null) updateDashboardMeta({ textSize: n === 100 ? undefined : n }, 'dash:textsize')
            }}
          />
          <span className="nh-field__hint">
            {t('Scales all widget text on this dashboard, on top of the automatic sizing. 100 = normal.')}
          </span>
        </label>

        {tablet ? (
          <>
            <label className="nh-field" htmlFor="nh-dash-mdcolumns">
              <span className="nh-field__label">{t('Columns on tablets')}</span>
              <input
                id="nh-dash-mdcolumns"
                type="number"
                min={1}
                max={60}
                value={mdColumnsOf(dashboard)}
                onChange={(e) => {
                  const n = num(e.target.value, 1, 60)
                  if (n !== null) updateDashboardMeta({ mdColumns: n }, 'dash:mdcolumns')
                }}
              />
              <span className="nh-field__hint">
                {t('The tablet layout can use a different grid. Fewer columns means bigger cells on a tablet.')}
              </span>
            </label>
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
