/**
 * Dashboard-level settings (name, grid geometry) for the draft being edited, plus deletion.
 * Edits apply to the draft immediately — live preview, coalesced undo, persisted on Save —
 * exactly like the widget settings panel.
 */
import { Sheet } from '../components/Sheet'
import { IconPicker } from '../components/IconPicker'
import type { Dashboard } from '../model/dashboard'
import { setDashSettingsOpen, stopEditing, updateDashboardMeta } from '../store/editor'
import { deleteDashboard, useConfigStore } from '../store/config'
import { navigate } from '../app/router'

export function DashboardSettingsPanel({ dashboard }: { dashboard: Dashboard }) {
  const fixed = dashboard.rowHeight !== 'match'
  const sidebarOn = useConfigStore((s) => s.settings.sidebar !== false)

  const remove = async () => {
    if (!window.confirm(`Delete dashboard “${dashboard.name}” and all its widgets? This cannot be undone.`)) return
    stopEditing()
    try {
      await deleteDashboard(dashboard.id)
    } catch (err) {
      window.alert('Delete failed: ' + (err instanceof Error ? err.message : String(err)))
      return
    }
    navigate({ name: 'home' })
  }

  const num = (raw: string, min: number, max: number): number | null => {
    const n = Math.round(Number(raw))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }

  return (
    <Sheet side title="Dashboard settings" onClose={() => setDashSettingsOpen(false)}>
      <div className="nh-form">
        <label className="nh-field" htmlFor="nh-dash-name">
          <span className="nh-field__label">Name</span>
          <input
            id="nh-dash-name"
            value={dashboard.name}
            onChange={(e) => updateDashboardMeta({ name: e.target.value }, 'dash:name')}
          />
        </label>

        <div className="nh-field">
          <span className="nh-field__label">Icon</span>
          <IconPicker
            id="nh-dash-icon"
            value={dashboard.icon ?? ''}
            onChange={(icon) => updateDashboardMeta({ icon: icon || undefined }, 'dash:icon')}
          />
          <span className="nh-field__hint">Shown on the Home tile and in the sidebar.</span>
        </div>

        {sidebarOn ? (
          <label className="nh-field nh-field--row" htmlFor="nh-dash-hide">
            <span className="nh-field__label">Hide from the sidebar</span>
            <input
              id="nh-dash-hide"
              type="checkbox"
              checked={dashboard.hideInSidebar === true}
              onChange={(e) => updateDashboardMeta({ hideInSidebar: e.target.checked || undefined })}
            />
          </label>
        ) : null}

        <label className="nh-field" htmlFor="nh-dash-columns">
          <span className="nh-field__label">Grid columns</span>
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
          <span className="nh-field__label">Row height</span>
          <select
            id="nh-dash-rowmode"
            value={fixed ? 'fixed' : 'match'}
            onChange={(e) =>
              updateDashboardMeta({ rowHeight: e.target.value === 'match' ? 'match' : 80 }, 'dash:rowheight')
            }
          >
            <option value="match">Square cells (match column width)</option>
            <option value="fixed">Fixed height</option>
          </select>
        </label>

        {fixed ? (
          <label className="nh-field" htmlFor="nh-dash-rowpx">
            <span className="nh-field__label">Row height (px)</span>
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
          <span className="nh-field__label">Grid gap (px)</span>
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

        {dashboard.stackOrder && dashboard.stackOrder.length > 0 ? (
          <div className="nh-field">
            <span className="nh-field__label">Phone layout</span>
            <button
              type="button"
              className="nh-btn nh-btn--ghost"
              onClick={() => updateDashboardMeta({ stackOrder: undefined })}
            >
              Reset stack order to follow the grid
            </button>
          </div>
        ) : null}
      </div>

      <div className="nh-form__footer">
        <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
          Delete dashboard…
        </button>
      </div>
    </Sheet>
  )
}
