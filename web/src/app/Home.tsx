import { useState } from 'react'
import { useConfigStore } from '../store/config'
import { isLoggedIn } from '../api/auth'
import { navigate } from './router'
import { Wordmark } from './Wordmark'
import { NewDashboardSheet } from '../editor/NewDashboardSheet'
import { SignInSheet } from '../editor/SignInSheet'

export function Home({ ohVersion }: { ohVersion?: string }) {
  const { dashboards, usingDemo } = useConfigStore()
  const [newOpen, setNewOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

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

      <div className="nh-tiles">
        {dashboards.map((d) => (
          <button key={d.id} className="nh-tile" onClick={() => navigate({ name: 'dashboard', id: d.id })}>
            <span className="nh-tile__name">{d.name}</span>
            <span className="nh-tile__meta">{d.widgets.length} widgets</span>
          </button>
        ))}
        <button
          type="button"
          className="nh-tile nh-tile--new"
          onClick={() => (isLoggedIn() ? setNewOpen(true) : setSignInOpen(true))}
        >
          <span className="nh-tile__plus" aria-hidden="true">
            +
          </span>
          <span className="nh-tile__name">New dashboard</span>
        </button>
      </div>

      {usingDemo ? (
        <p className="nh-home__hint">
          Showing a demo dashboard — sign in as an administrator to create and save your own.
        </p>
      ) : null}

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
