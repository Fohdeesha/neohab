import { useState } from 'react'
import { useConfigStore } from '../store/config'
import { isLoggedIn } from '../api/auth'
import { navigate } from './router'
import { Wordmark } from './Wordmark'
import { NewDashboardSheet } from '../editor/NewDashboardSheet'
import { SignInSheet } from '../editor/SignInSheet'

export function Home({ ohVersion }: { ohVersion?: string }) {
  const { dashboards, error } = useConfigStore()
  const [newOpen, setNewOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const createFirst = () => (isLoggedIn() ? setNewOpen(true) : setSignInOpen(true))

  return (
    <div className="nh-home">
      <Wordmark />
      <p className="nh-home__status">
        {ohVersion ? (
          <>
            connected to openHAB <strong>{ohVersion}</strong>
          </>
        ) : (
          'connecting to openHAB…'
        )}
      </p>

      {dashboards.length === 0 ? (
        <div className="nh-welcome">
          <h2 className="nh-welcome__title">Welcome to neohab</h2>
          {error ? (
            <p className="nh-welcome__text">The configuration could not be loaded: {error}</p>
          ) : (
            <p className="nh-welcome__text">
              There are no dashboards yet. Create your first one, bring your HABPanel setup along,
              or restore a neohab backup.
            </p>
          )}
          <div className="nh-welcome__actions">
            <button type="button" className="nh-btn nh-btn--primary" onClick={createFirst}>
              Create your first dashboard
            </button>
            <button type="button" className="nh-btn" onClick={() => navigate({ name: 'settings' })}>
              Import from HABPanel
            </button>
            <button type="button" className="nh-btn" onClick={() => navigate({ name: 'settings' })}>
              Restore a backup
            </button>
          </div>
        </div>
      ) : (
        <div className="nh-tiles">
          {dashboards.map((d) => (
            <button key={d.id} className="nh-tile" onClick={() => navigate({ name: 'dashboard', id: d.id })}>
              <span className="nh-tile__name">{d.name}</span>
              <span className="nh-tile__meta">{d.widgets.length} widgets</span>
            </button>
          ))}
          <button type="button" className="nh-tile nh-tile--new" onClick={createFirst}>
            <span className="nh-tile__plus" aria-hidden="true">
              +
            </span>
            <span className="nh-tile__name">New dashboard</span>
          </button>
        </div>
      )}

      <button
        type="button"
        className="nh-btn nh-btn--ghost nh-home__settings"
        onClick={() => navigate({ name: 'settings' })}
      >
        ⚙ Settings
      </button>

      {newOpen ? <NewDashboardSheet onClose={() => setNewOpen(false)} /> : null}
      {signInOpen ? (
        <SignInSheet
          onClose={() => setSignInOpen(false)}
          onToken={() => {
            setSignInOpen(false)
            setNewOpen(true)
          }}
        />
      ) : null}
    </div>
  )
}
