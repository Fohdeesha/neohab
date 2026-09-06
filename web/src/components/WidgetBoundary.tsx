// without this one widget throwing during render unmounts the whole app - dashboard, editor and the way to
// Settings together
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
  resetKey: unknown
  type: string
  children: ReactNode
}

interface State {
  message: string | null
}

export class WidgetBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.message !== null) this.setState({ message: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`neohab: the "${this.props.type}" widget failed to render`, error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <div className="nh-widget nh-widget--error">
        <span className="nh-widget__errtitle">{i18n.t('This {{type}} widget could not be shown', { type: this.props.type })}</span>
        <span className="nh-widget__errtext">{this.state.message}</span>
        <span className="nh-widget__errhint">
          {i18n.t('Its settings are probably not what it expects. Edit the dashboard to change or remove it.')}
        </span>
      </div>
    )
  }
}
