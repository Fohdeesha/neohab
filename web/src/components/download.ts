export function cssUrl(url: string): string {
  return url.replace(/["\\]/g, '\\$&')
}

// revoked on a later task - doing it in the same tick as click() races the browser's read of a megabyte-sized
// blob
const RELEASE_DELAY_MS = 60_000

export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), RELEASE_DELAY_MS)
}
