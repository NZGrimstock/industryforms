// Tiny client-side dominant-colour extractor.
//
// Downscale the image into a 64×64 canvas, then bucket pixels into 24 hues.
// Skip pixels that are nearly white/black/grey (low saturation or extreme
// luminance) so backgrounds and outlines don't win. The winning bucket's
// average colour is returned as a CSS hex.

export async function extractAccent(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data

    const BUCKETS = 24
    const buckets: { r: number; g: number; b: number; count: number; sat: number }[] =
      Array.from({ length: BUCKETS }, () => ({ r: 0, g: 0, b: 0, count: 0, sat: 0 }))

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 200) continue
      const [h, s, l] = rgbToHsl(r, g, b)
      // Skip near-white / near-black / near-grey
      if (l < 0.08 || l > 0.92 || s < 0.18) continue
      const bi = Math.floor((h * BUCKETS)) % BUCKETS
      const bucket = buckets[bi]
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.sat += s
      bucket.count++
    }

    // Score each bucket by count × avg saturation so a small but vivid logo
    // colour can beat a large pale wash.
    let best = -1, bestScore = 0
    for (let i = 0; i < BUCKETS; i++) {
      const b = buckets[i]
      if (!b.count) continue
      const score = b.count * (b.sat / b.count)
      if (score > bestScore) { bestScore = score; best = i }
    }
    if (best < 0) return null
    const win = buckets[best]
    const r = Math.round(win.r / win.count)
    const g = Math.round(win.g / win.count)
    const b = Math.round(win.b / win.count)
    return rgbToHex(r, g, b)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
    case g: h = ((b - r) / d + 2); break
    case b: h = ((r - g) / d + 4); break
  }
  return [h / 6, s, l]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// Top-N distinct dominant colours from an image URL (e.g. an uploaded logo).
// Same hue bucketing as extractAccent, but returns the top `count` winners
// instead of just one. Used by the website builder's AI palette suggestions.
export async function extractPalette(url: string, count = 4): Promise<string[]> {
  const img = await loadImage(url)
  const size = 80
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  const BUCKETS = 36
  const buckets: { r: number; g: number; b: number; count: number; sat: number }[] =
    Array.from({ length: BUCKETS }, () => ({ r: 0, g: 0, b: 0, count: 0, sat: 0 }))
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    if (a < 200) continue
    const [h, s, l] = rgbToHsl(r, g, b)
    if (l < 0.08 || l > 0.92 || s < 0.18) continue
    const bi = Math.floor(h * BUCKETS) % BUCKETS
    const bucket = buckets[bi]
    bucket.r += r; bucket.g += g; bucket.b += b
    bucket.sat += s; bucket.count++
  }
  const scored = buckets
    .map((b, i) => ({ i, b, score: b.count ? b.count * (b.sat / b.count) : 0 }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
  return scored.map(({ b }) => rgbToHex(Math.round(b.r / b.count), Math.round(b.g / b.count), Math.round(b.b / b.count)))
}

// Sample the colour of a single pixel from an image at a normalised
// (0–1, 0–1) position. Used when the user clicks on the logo preview to
// pick a specific colour.
export async function samplePixel(url: string, nx: number, ny: number): Promise<string | null> {
  const img = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(nx * canvas.width)))
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(ny * canvas.height)))
  const [r, g, b, a] = Array.from(ctx.getImageData(x, y, 1, 1).data)
  if (a < 20) return null
  return rgbToHex(r, g, b)
}

// Darken a hex colour by `amount` (0–1) for hover states. Keeps the file
// dep-free so DashboardShell can derive --accent-hover from --brand.
export function darken(hex: string, amount = 0.1): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = Math.max(0, Math.round(parseInt(m[1], 16) * (1 - amount)))
  const g = Math.max(0, Math.round(parseInt(m[2], 16) * (1 - amount)))
  const b = Math.max(0, Math.round(parseInt(m[3], 16) * (1 - amount)))
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
