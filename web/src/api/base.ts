// openHAB paths resolve against whatever prefix openHAB itself is served under, so a sub-path proxy works

const APP_SEGMENT = '/neohab/'

function computeRoot(): string {
  try {
    const path = window.location.pathname
    const at = path.lastIndexOf(APP_SEGMENT)
    return at > 0 ? path.slice(0, at) : ''
  } catch {
    return ''
  }
}

let root: string | null = null

function ohRoot(): string {
  root ??= computeRoot()
  return root
}

export function ohUrl(path: string): string {
  return ohRoot() + path
}
