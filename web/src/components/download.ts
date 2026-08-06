/**
 * Escape a value for interpolation into CSS `url("...")`. Data URIs never need it; a URL from
 * stored configuration might.
 */
export function cssUrl(url: string): string {
  return url.replace(/["\\]/g, '\\$&')
}

/** Save data as a JSON file from the browser. Shared by every export in the app. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}
