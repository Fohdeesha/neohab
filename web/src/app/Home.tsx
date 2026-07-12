import { useConfigStore } from '../store/config'
import { navigate } from './router'
import { Wordmark } from './Wordmark'

export function Home({ ohVersion }: { ohVersion?: string }) {
  const { dashboards, usingDemo } = useConfigStore()

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
      </div>

      {usingDemo ? (
        <p className="nh-home__hint">
          Showing a demo dashboard — sign in as an administrator to create and save your own.
        </p>
      ) : null}
    </div>
  )
}
