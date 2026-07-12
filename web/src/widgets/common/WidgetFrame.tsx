/** Shared card chrome for widgets: surface background, optional header label, content area. */
import type { ReactNode } from 'react'

interface WidgetFrameProps {
  label?: string
  /** Center content both axes (the common case for controls). */
  center?: boolean
  /** Remove the card background/padding (e.g. image, label widgets). */
  bare?: boolean
  children: ReactNode
}

export function WidgetFrame({ label, center, bare, children }: WidgetFrameProps) {
  return (
    <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '')}>
      {label ? <div className="nh-widget__label">{label}</div> : null}
      <div className={'nh-widget__body' + (center ? ' nh-widget__body--center' : '')}>{children}</div>
    </div>
  )
}
