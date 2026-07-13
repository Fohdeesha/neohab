/** Shared card chrome for widgets: surface background, optional header label, content area. */
import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'

interface WidgetFrameProps {
  label?: string
  /** Header icon: "mdi:<name>" or "oh:<name>[@iconset]". */
  icon?: string
  iconSize?: number
  /** Current item state, for state-aware openHAB icons. */
  iconState?: string
  /** Center content both axes (the common case for controls). */
  center?: boolean
  /** Remove the card background/padding (e.g. image, label widgets). */
  bare?: boolean
  children: ReactNode
}

export function WidgetFrame({ label, icon, iconSize, iconState, center, bare, children }: WidgetFrameProps) {
  return (
    <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '')}>
      {label || icon ? (
        <div className="nh-widget__label">
          {icon ? <Icon icon={icon} size={iconSize ?? 20} state={iconState} /> : null}
          {label ? <span className="nh-widget__labeltext">{label}</span> : null}
        </div>
      ) : null}
      <div className={'nh-widget__body' + (center ? ' nh-widget__body--center' : '')}>{children}</div>
    </div>
  )
}
