import { getDashboard } from '../store/config'
import { Grid } from '../components/Grid'
import { navigate } from './router'

export function DashboardView({ id }: { id: string }) {
  const dashboard = getDashboard(id)

  if (!dashboard) {
    return (
      <div className="nh-dash">
        <header className="nh-dash__bar">
          <button className="nh-iconbtn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
            ‹
          </button>
          <span className="nh-dash__title">Not found</span>
        </header>
        <p className="nh-dash__empty">Dashboard “{id}” does not exist.</p>
      </div>
    )
  }

  return (
    <div className="nh-dash">
      <header className="nh-dash__bar">
        <button className="nh-iconbtn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
          ‹
        </button>
        <span className="nh-dash__title">{dashboard.name}</span>
      </header>
      <div className="nh-dash__surface">
        <Grid dashboard={dashboard} />
      </div>
    </div>
  )
}
