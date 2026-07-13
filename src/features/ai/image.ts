/**
 * Client-side receipt photo prep: decode → downscale → JPEG data URL.
 * Phone camera shots are 3–10MB; the vision model reads a 1280px JPEG just as
 * well, and the edge function caps request size, so we shrink before upload.
 */

const MAX_EDGE = 1280
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Matches the edge function's request cap with headroom to spare.
const MAX_CHARS = 1_800_000

export async function compressImage(file: File): Promise<string> {
  if (!TYPES.includes(file.type)) throw new Error('unsupported')

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode'))
      el.src = url
    })

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const cx = canvas.getContext('2d')
    if (!cx) throw new Error('canvas')
    // Receipts are white — a white backdrop keeps transparent PNGs readable.
    cx.fillStyle = '#fff'
    cx.fillRect(0, 0, w, h)
    cx.drawImage(img, 0, 0, w, h)

    let out = canvas.toDataURL('image/jpeg', 0.82)
    if (out.length > MAX_CHARS) out = canvas.toDataURL('image/jpeg', 0.6)
    if (out.length > MAX_CHARS) throw new Error('too-large')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
