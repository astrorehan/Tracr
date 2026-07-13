/**
 * Client-side document image preparation. Normal photos stay as one image;
 * tall bank/e-wallet screenshots are split into overlapping readable tiles so
 * the vision model can reliably see every transaction row.
 */

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_FILES = 6
const MAX_OUTPUT_IMAGES = 6
const MAX_WIDTH = 1600
const MAX_TILE_HEIGHT = 1900
const TILE_OVERLAP = 90
// Must stay below the edge function's per-image request limit.
const MAX_CHARS = 1_200_000

export async function prepareScanImages(files: FileList | File[]): Promise<string[]> {
  const sourceFiles = Array.from(files)
  if (sourceFiles.length === 0 || sourceFiles.length > MAX_SOURCE_FILES) throw new Error('unsupported')
  if (sourceFiles.some((file) => !TYPES.includes(file.type))) throw new Error('unsupported')

  const out: string[] = []
  for (const file of sourceFiles) {
    const image = await decode(file)
    const scale = Math.min(1, MAX_WIDTH / image.naturalWidth)
    const sourceTileHeight = Math.max(1, Math.floor(MAX_TILE_HEIGHT / scale))
    const sourceOverlap = Math.min(sourceTileHeight - 1, Math.ceil(TILE_OVERLAP / scale))
    const step = Math.max(1, sourceTileHeight - sourceOverlap)

    for (let top = 0; top < image.naturalHeight; top += step) {
      if (out.length >= MAX_OUTPUT_IMAGES) throw new Error('too-many-images')
      const sourceHeight = Math.min(sourceTileHeight, image.naturalHeight - top)
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, top, image.naturalWidth, sourceHeight, 0, 0, width, height)

      const encoded = encode(canvas)
      out.push(encoded)
      if (top + sourceHeight >= image.naturalHeight) break
    }
  }
  return out
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('decode'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement): string {
  let out = canvas.toDataURL('image/jpeg', 0.84)
  if (out.length > MAX_CHARS) out = canvas.toDataURL('image/jpeg', 0.68)
  if (out.length > MAX_CHARS) out = canvas.toDataURL('image/jpeg', 0.52)
  if (out.length > MAX_CHARS) throw new Error('too-large')
  return out
}