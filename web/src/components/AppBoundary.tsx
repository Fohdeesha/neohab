/**
 * The wall around the whole app, and around anything rendered outside a widget.
 *
 * `WidgetBoundary` makes one bad widget a tile instead of a blank page. Everything above it had no
 * such wall: a throw in `App`'s own render - which is where `useRoute()` runs - unmounted the tree
 * for good, leaving no header, no sidebar and no route to Settings. A malformed hash was enough to
 * do it, and the only way out was editing the address bar.
 *
 * Note where this has to sit to catch that case. React only catches what a boundary's CHILDREN
 * throw, so a boundary inside `App` cannot catch `App`'s own render: it has to wrap `<App />`
 * itself, which is why main.tsx is one of its three homes. The other two are the route switch, so
 * that one bad screen keeps the chrome around it, and the ambient runtimes (audio, kiosk, the
 * screensaver, the sidebar), which have no business taking a dashboard down with them - those pass
 * `silent`, because a runtime that cannot start should stop, not fill the screen with an apology.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

/**
 * A translation that cannot itself become the failure. Nothing catches what this panel throws, so
 * an error here is the blank page it exists to prevent. Keys are the English source strings, so
 * falling back to the key still reads as English.
 */
function say(key: string): string {
  try {
    return i18n.t(key)
  } catch {
    return key
  }
}

interface Props {
  children: ReactNode
  /** Render nothing rather than a panel. For the ambient runtimes, which draw nothing anyway. */
  silent?: boolean
  /** Named in the console so a report says which of the three walls caught it. */
  where?: string
}

interface State {
  message: string | null
}

export class AppBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`neohab: ${this.props.where ?? 'the app'} failed to render`, error, info.componentStack)
  }

  componentDidMount(): void {
    // A boundary never resets itself, so without this the panel would outlive the very navigation
    // it offers: the links below change the hash, the route changes underneath, and the user is
    // still looking at the error.
    window.addEventListener('hashchange', this.clear)
  }

  componentWillUnmount(): void {
    window.removeEventListener('hashchange', this.clear)
  }

  private clear = (): void => {
    if (this.state.message !== null) this.setState({ message: null })
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children
    if (this.props.silent) return null
    return (
      <div className="nh-appfail">
        <h1 className="nh-appfail__title">{say('This screen could not be shown')}</h1>
        <p className="nh-appfail__text">{this.state.message}</p>
        <div className="nh-appfail__actions">
          {/* Plain links, not the router: this is the wall that catches the router breaking.
              Reload is here because neither link moves you when the broken route is the one you
              are already on. */}
          <a className="nh-btn" href="#/">
            {say('Home')}
          </a>
          <a className="nh-btn" href="#/settings">
            {say('Settings')}
          </a>
          <button type="button" className="nh-btn nh-btn--ghost" onClick={() => window.location.reload()}>
            {say('Reload')}
          </button>
        </div>
      </div>
    )
  }
}
