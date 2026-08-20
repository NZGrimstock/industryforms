// Pure geometry for the takeoff tool (app/(dashboard)/takeoff) — pixel-space
// measurements, converted to real-world units via a scale calibrated from two
// clicked points and a known real-world distance between them.

export type Point = { x: number; y: number }

export function pixelDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// unitsPerPixel: real-world units represented by one pixel of the loaded
// image, at its natural (unscaled) resolution — the canvas draws the image
// scaled to fit, so callers must convert click coordinates back to natural
// pixels before using this (see toNaturalPoint in client.tsx).
export function calibrateScale(pixelDist: number, realDist: number): number {
  return pixelDist > 0 ? realDist / pixelDist : 0
}

// Sum of segment lengths along an open path — a wall run, a pipe route.
export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += pixelDistance(points[i - 1], points[i])
  return total
}

// Shoelace formula for a closed polygon's area — a room floor, a roof plane.
// Point order (CW/CCW) doesn't matter; area is always returned positive.
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function realLinear(points: Point[], unitsPerPixel: number): number {
  return polylineLength(points) * unitsPerPixel
}

export function realArea(points: Point[], unitsPerPixel: number): number {
  return polygonArea(points) * unitsPerPixel * unitsPerPixel
}
