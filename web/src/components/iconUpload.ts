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
    throw new Error(i18n.t('Icon is {{kb}} KB - the limit is {{max}} KB.', { kb: Math.round(bytes / 1024), max: maxKB }) + ' ' + hint)
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
  checkSize(file.size, maxKB, i18n.t('GIFs are stored unchanged to keep animation - shrink it first.'))
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
    for (const dimension of [MAX_DIMENSION, MAX_DIMENSION / 2]) {
      const dataUri = drawToPng(img, dimension)
      const bytes = dataUriBytes(dataUri)
      if (bytes <= maxKB * 1024) return { dataUri, bytes }
    }
    throw new Error(
      i18n.t(
        'Icon is too detailed to fit the {{max}} KB limit even after downscaling. Use a simpler image or raise the limit in Settings.',
        {
          max: maxKB
        }
      )
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

// every client downloads every background with the configuration, so a 4K screen's worth is the ceiling
const BACKGROUND_DIMENSIONS = [3840, 2560, 1920]
const MAX_BACKGROUND_BYTES = 6 * 1024 * 1024

const dataUriBytes = (uri: string): number => Math.round((uri.length - uri.indexOf(',') - 1) * 0.75)

export async function processBackgroundFile(file: File): Promise<ProcessedIcon> {
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    return processSvg(file, Math.round(MAX_BACKGROUND_BYTES / 1024))
  }
  if (!file.type.startsWith('image/')) throw new Error(i18n.t('That file is not an image.'))
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error(i18n.t('That image could not be decoded by the browser.'))
    })
    const alpha = file.type !== 'image/jpeg' && hasTransparency(img)
    for (const dimension of BACKGROUND_DIMENSIONS) {
      const canvas = drawToCanvas(img, dimension)
      // a photo is a fraction of the size as JPEG and a floor plan's line art is usually smaller as PNG, so an
      // opaque image keeps whichever is smaller; one with real transparency has to stay PNG
      const png = canvas.toDataURL('image/png')
      const jpeg = alpha ? null : canvas.toDataURL('image/jpeg', 0.85)
      const dataUri = jpeg !== null && jpeg.startsWith('data:image/jpeg') && jpeg.length < png.length ? jpeg : png
      const bytes = dataUriBytes(dataUri)
      if (bytes <= MAX_BACKGROUND_BYTES) return { dataUri, bytes }
    }
    throw new Error(i18n.t('That image is too large to store even after downscaling.'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// read at a reduced size: smoothing averages a transparent pixel into its neighbours, so none is missed
function hasTransparency(img: HTMLImageElement): boolean {
  const canvas = drawToCanvas(img, 1024)
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
  if (!data) return true
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

function drawToCanvas(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('Canvas is unavailable in this browser.'))
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

function drawToPng(img: HTMLImageElement, maxDimension: number): string {
  return drawToCanvas(img, maxDimension).toDataURL('image/png')
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
