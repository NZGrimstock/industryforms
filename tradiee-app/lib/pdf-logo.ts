import sharp from 'sharp'

// react-pdf only embeds PNG/JPEG, and when the PDF renders in the browser
// (web Print/PDF buttons) it can't fetch the logo cross-origin — CORS silently
// drops the image, so no logo appears. Fix both at once: fetch the logo
// server-side and inline it as a PNG data URI. Returns null on any failure so
// the PDF just falls back to the company name.
// ponytail: fetch+transcode on each render; add a cache if invoice pages get slow.
export async function logoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    const png = await sharp(input).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}
