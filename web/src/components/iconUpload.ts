/**
 * Client-side processing for user-uploaded icons. Everything is normalized before storage:
 * raster images (PNG/JPEG/WebP/BMP/…) are downscaled to fit MAX_DIMENSION and re-encoded as
 * PNG — transparency survives, exotic formats come out uniform. GIFs are kept byte-for-byte
 * so animation survives; SVGs are sanitized (no scripts) and kept as vectors.
 *
 * The size cap exists because icons live inside openHAB's JSON config store, which is held in
 * memory and rewritten on every change — this is for icons, not artwork. The default cap can
 * be overridden via the `maxIconKB` app setting.
 */
import i18n from '../i18n'

export const DEFAULT_MAX_ICON_KB = 300

const MAX_DIMENSION = 512

export interface ProcessedIcon {
  dataUri: string
  bytes: number
}

export async function processIconFile(file: File, maxKB: number): Promise<ProcessedIcon> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return processSvg(file, maxKB)
  }
  if (file.type === 'image/gif') return processGif(file, maxKB)
  if (!file.type.startsWith('image/')) throw new Error(i18n.t('That file is not an image.'))
  return processRaster(file, maxKB)
}

function checkSize(bytes: number, maxKB: number, hint: string): void {
  if (bytes > maxKB * 1024) {
    throw new Error(
      i18n.t('Icon is {{kb}} KB — the limit is {{max}} KB.', { kb: Math.round(bytes / 1024), max: maxKB }) + ' ' + hint
    )
  }
}

async function processSvg(file: File, maxKB: number): Promise<ProcessedIcon> {
  const { default: DOMPurify } = await import('dompurify')
  const clean = DOMPurify.sanitize(await file.text(), { USE_PROFILES: { svg: true, svgFilters: true } })
  if (!clean.includes('<svg')) throw new Error(i18n.t('That SVG file could not be read.'))
  const encoded = bytesToBase64(new TextEncoder().encode(clean))
  const bytes = encoded.length * 0.75
  checkSize(bytes, maxKB, i18n.t('Simplify the SVG or raise the limit in Settings.'))
  return { dataUri: 'data:image/svg+xml;base64,' + encoded, bytes: Math.round(bytes) }
}

async function processGif(file: File, maxKB: number): Promise<ProcessedIcon> {
  // Kept as-is: re-encoding through a canvas would drop the animation.
  checkSize(file.size, maxKB, i18n.t('GIFs are stored unchanged to keep animation — shrink it first.'))
  return { dataUri: await readAsDataUrl(file), bytes: file.size }
}

async function processRaster(file: File, maxKB: number): Promise<ProcessedIcon> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error(i18n.t('That image could not be decoded by the browser.'))
    })
    // Try full-size (capped) first; if the PNG still busts the cap, retry at half scale.
    for (const dimension of [MAX_DIMENSION, MAX_DIMENSION / 2]) {
      const dataUri = drawToPng(img, dimension)
      const bytes = Math.round((dataUri.length - dataUri.indexOf(',') - 1) * 0.75)
      if (bytes <= maxKB * 1024) return { dataUri, bytes }
    }
    throw new Error(
      i18n.t('Icon is too detailed to fit the {{max}} KB limit even after downscaling. Use a simpler image or raise the limit in Settings.', {
        max: maxKB,
      })
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Backgrounds go through their own pipeline: much larger dimensions than icons, re-encoded as
 * JPEG (a 1920px photo as PNG would be several MB; any transparency flattens to black, which
 * photos never carry anyway). SVGs are sanitized and kept as vectors, like icons.
 */
export const MAX_BACKGROUND_KB = 800

export async function processBackgroundFile(file: File): Promise<ProcessedIcon> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return processSvg(file, MAX_BACKGROUND_KB)
  }
  if (!file.type.startsWith('image/')) throw new Error(i18n.t('That file is not an image.'))
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error(i18n.t('That image could not be decoded by the browser.'))
    })
    // Full size first, then progressively smaller/rougher until it fits the cap.
    for (const [dimension, quality] of [
      [1920, 0.85],
      [1280, 0.75],
      [960, 0.6],
    ] as const) {
      const dataUri = drawToJpeg(img, dimension, quality)
      const bytes = Math.round((dataUri.length - dataUri.indexOf(',') - 1) * 0.75)
      if (bytes <= MAX_BACKGROUND_KB * 1024) return { dataUri, bytes }
    }
    throw new Error(i18n.t('That image could not be compressed under {{max}} KB.', { max: MAX_BACKGROUND_KB }))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawToJpeg(img: HTMLImageElement, maxDimension: number, quality: number): string {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('Canvas is unavailable in this browser.'))
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

function drawToPng(img: HTMLImageElement, maxDimension: number): string {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('Canvas is unavailable in this browser.'))
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(i18n.t('Could not read the file.')))
    reader.readAsDataURL(file)
  })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
