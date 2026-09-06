/**
 * A wall around one widget.
 *
 * Everything a widget renders from is stored configuration, which is untrusted input: a backup, a
 * shared export or a hand edit is written verbatim. Individual reads are guarded where they are
 * made, but "every read, forever, in every widget" is not an invariant a codebase can hold by
 * discipline alone, and without a boundary, one widget throwing during render unmounts the entire
 * React tree. The dashboard, the editor and the way to Settings all disappear together, leaving a
 * blank page and no route back to the configuration that caused it.
 *
 * So a widget that throws becomes a tile saying so, beside its working neighbours, with the editor
 * still there to fix or delete it. React offers no hook form of this, which is why it is the one
 * class component in the app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
  /** Changing this resets the boundary, so an edit that fixes the widget renders it again. */
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
    // A widget only gets another go when something about it actually changed; re-rendering the
    // same broken configuration would just throw again, once per parent render.
    if (prev.resetKey !== this.props.resetKey && this.state.message !== null) this.setState({ message: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The tile says what happened; the console is where the stack belongs.
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
