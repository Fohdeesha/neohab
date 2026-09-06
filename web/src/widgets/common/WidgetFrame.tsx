import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'

interface WidgetFrameProps {
  label?: string
  icon?: string
  iconSize?: number
  iconState?: string
  iconColor?: string
  aside?: ReactNode
  center?: boolean
  bare?: boolean
  children: ReactNode
}

export function WidgetFrame({ label, icon, iconSize, iconState, iconColor, aside, center, bare, children }: WidgetFrameProps) {
  const headed = Boolean(label || icon || aside)
  return (
    <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '') + (headed ? ' nh-widget--headed' : '')}>
      {headed ? (
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
