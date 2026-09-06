import type { ReactNode } from 'react'

export interface FaderView {
  fraction: number
  reading: string
  bounds: [string, string]
  input: ReactNode
}

function Rail({ view, children }: { view: FaderView; children?: ReactNode }) {
  return (
    <div className="nh-fader__rail">
      <div className="nh-fader__track" aria-hidden="true" />
      <div className="nh-fader__fill" aria-hidden="true" />
      {view.input}
      {children}
    </div>
  )
}

export function TrackLook({ view }: { view: FaderView }) {
  return (
    <>
      <div className="nh-fader__read">{view.reading}</div>
      <Rail view={view} />
    </>
  )
}

export function BubbleLook({ view }: { view: FaderView }) {
  return (
    <Rail view={view}>
      <div className="nh-fader__badge" aria-hidden="true">
        {view.reading}
      </div>
    </Rail>
  )
}

export function InsetLook({ view }: { view: FaderView }) {
  return (
    <>
      <div className="nh-fader__read">{view.reading}</div>
      <div className="nh-fader__plate">
        <span className="nh-fader__bound">{view.bounds[0]}</span>
        <Rail view={view} />
        <span className="nh-fader__bound">{view.bounds[1]}</span>
      </div>
    </>
  )
}
