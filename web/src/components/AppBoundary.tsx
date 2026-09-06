// has to wrap <App /> itself in main.tsx: React only catches what a boundary's CHILDREN throw, and useRoute()
// runs in App's own render
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

function say(key: string): string {
  try {
    return i18n.t(key)
  } catch {
    return key
  }
}

interface Props {
  children: ReactNode
  silent?: boolean
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
