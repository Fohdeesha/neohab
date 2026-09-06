// the way back from a theme that made the app unusable, since a theme's CSS applies to the Settings screen you
// would undo it on

function readParam(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  const q = hash.indexOf('?')
  const fromHash = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('theme') : null
  return fromHash ?? new URLSearchParams(window.location.search).get('theme')
}

// read once at load: re-reading on navigation would let an ordinary route change silently pin a theme
export const urlThemeId: string | null = readParam()

export const urlThemeForced: boolean = urlThemeId !== null
