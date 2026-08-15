/** Shared card chrome for widgets: surface background, optional header label, content area. */
import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'

interface WidgetFrameProps {
  label?: string
  /** Header icon, any Icon source ("mdi:", "fluent:", "custom:", "oh:", ...). */
  icon?: string
  iconSize?: number
  /** Current item state, for state-aware openHAB icons. */
  iconState?: string
  /** Explicit tint for monochrome (mdi) header icons. */
  iconColor?: string
  /** Extra content at the right end of the header row (e.g. the chart's period chips). */
  aside?: ReactNode
  /** Center content both axes (the common case for controls). */
  center?: boolean
  /** Remove the card background/padding (e.g. image, label widgets). */
  bare?: boolean
  children: ReactNode
}

export function WidgetFrame({ label, icon, iconSize, iconState, iconColor, aside, center, bare, children }: WidgetFrameProps) {
  return (
    <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '')}>
      {label || icon || aside ? (
        <div className="nh-widget__label">
          {/* icon + name travel together so the per-widget Name alignment (--nh-labelalign,
              set on the cell) can center or right-align them in the space before the aside */}
          {icon || label ? (
            <span className="nh-widget__labelmain">
              {icon ? <Icon icon={icon} size={iconSize ?? 20} state={iconState} color={iconColor} /> : null}
              {label ? <span className="nh-widget__labeltext">{label}</span> : null}
            </span>
          ) : null}
          {aside ? <span className="nh-widget__aside">{aside}</span> : null}
        </div>
      ) : null}
      <div className={'nh-widget__body' + (center ? ' nh-widget__body--center' : '')}>{children}</div>
    </div>
  )
}
