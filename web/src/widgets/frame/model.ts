import { isSameOrigin } from '../../model/url'
import { sourceOf } from '../image/model'

export interface FrameConfig {
  source?: 'url' | 'item'
  url: string
  item?: string
  label?: string
  refresh?: number
  cacheBust?: boolean
  background?: string
  sandbox?: boolean
}

// openHAB will serve a page that anyone allowed to change an item has written (an Image item holding
// text/html goes out as a page, no account needed by default). An address an item chose is sandboxed
// wherever it points: a page in a frame without one can send that frame there later, or redirect to it,
// and the sandbox is fixed when the frame is made
export function sandboxFor(config: { source?: unknown; sandbox?: unknown }, url: string): boolean {
  if (sourceOf(config) === 'item') return true
  return config.sandbox === true && isSameOrigin(url, true)
}
