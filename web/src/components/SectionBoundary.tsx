// one Settings section throwing used to take the whole page with it, including Backup and Version
// history, which are the way back from whatever stored configuration caused it
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
  name: string
  children: ReactNode
}

interface State {
  message: string | null
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`neohab: the "${this.props.name}" section failed to render`, error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <section role="alert">
        <p className="nh-settings__notice">{i18n.t('This section could not be shown: {{error}}', { error: this.state.message })}</p>
        <button type="button" className="nh-btn" onClick={() => this.setState({ message: null })}>
          {i18n.t('Try again')}
        </button>
      </section>
    )
  }
}
