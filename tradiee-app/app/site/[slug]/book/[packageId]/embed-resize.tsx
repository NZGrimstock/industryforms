'use client'
import { useEffect } from 'react'

// When the booking widget is embedded in a tradie's own site via <iframe>, it
// can't know its parent's height. This posts the widget's real content height to
// the parent on every change (step change, slot list load, deposit form), so the
// snippet's tiny listener can resize the iframe to fit — no scrollbar, no clipping.
// Only runs when actually framed; posts to '*' because the parent origin is the
// tradie's own domain (unknown here). The parent validates our origin on its end.
export function EmbedAutoResize() {
  useEffect(() => {
    if (window.parent === window) return // not embedded — nothing to do
    // Measure the content wrapper, NOT documentElement/body: those are clamped to
    // the iframe's current viewport height, so the frame could never shrink to fit.
    const root = document.getElementById('if-booking-root')
    const post = () => {
      const height = root
        ? Math.ceil(root.getBoundingClientRect().bottom + window.scrollY)
        : document.body.scrollHeight
      window.parent.postMessage({ type: 'if-booking-height', height }, '*')
    }
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    const t = setTimeout(post, 300) // catch late font/image reflow
    window.addEventListener('load', post)
    return () => { ro.disconnect(); clearTimeout(t); window.removeEventListener('load', post) }
  }, [])
  return null
}
