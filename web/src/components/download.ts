/**
 * Escape a value for interpolation into CSS `url("...")`. Data URIs never need it; a URL from
 * stored configuration might.
 */
export function cssUrl(url: string): string {
  return url.replace(/["\\]/g, '\\$&')
}

/**
 * Save data as a JSON file from the browser. Shared by every export in the app.
 *
 * The object URL is released on a later task rather than immediately after `click()`: revoking it
 * in the same tick races the browser's own read of the blob, and a backup carrying uploaded
 * background images is megabytes of it — long enough for the download to arrive truncated or not
 * at all. A minute is far longer than any browser needs and costs one blob until then.
 */
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
