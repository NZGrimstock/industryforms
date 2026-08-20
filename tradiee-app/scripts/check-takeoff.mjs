// Takeoff tool geometry — pixel-space measurement + real-world scale
// conversion. Run from tradiee-app/:  node scripts/check-takeoff.mjs

import assert from 'node:assert/strict'
import { pixelDistance, calibrateScale, polylineLength, polygonArea, realLinear, realArea } from '../lib/takeoff.ts'

// ---------------------------------------------------------------------------
// pixelDistance / calibrateScale
// ---------------------------------------------------------------------------
assert.equal(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, '3-4-5 triangle')
assert.equal(calibrateScale(100, 5), 0.05, '100px represents 5 real units -> 0.05 units/px')
assert.equal(calibrateScale(0, 5), 0, 'zero pixel distance never divides by zero')

// ---------------------------------------------------------------------------
// polylineLength — a length/perimeter measurement
// ---------------------------------------------------------------------------
assert.equal(polylineLength([]), 0, 'no points, no length')
assert.equal(polylineLength([{ x: 0, y: 0 }]), 0, 'a single point has no length')
assert.equal(
  polylineLength([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]),
  20,
  'two straight segments sum',
)

// ---------------------------------------------------------------------------
// polygonArea — shoelace formula
// ---------------------------------------------------------------------------
assert.equal(polygonArea([]), 0, 'no points, no area')
assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 0, 'two points is not a polygon')
assert.equal(
  polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]),
  100,
  '10x10 square',
)
// Winding order must not matter — a builder clicking a room's corners
// anticlockwise must get the same area as clicking clockwise.
assert.equal(
  polygonArea([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]),
  100,
  'reversed winding order gives the same area',
)
// A right triangle: base 10, height 10 -> area 50.
assert.equal(
  polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]),
  50,
  'right triangle',
)

// ---------------------------------------------------------------------------
// Real-world conversion — the actual point of the tool.
// ---------------------------------------------------------------------------
{
  // Calibrate: 200px on the plan represents a real 4m wall.
  const unitsPerPixel = calibrateScale(200, 4)
  assert.equal(unitsPerPixel, 0.02)

  // A 100px wall run -> 2m real.
  assert.equal(realLinear([{ x: 0, y: 0 }, { x: 100, y: 0 }], unitsPerPixel), 2)

  // A 100x100px square room -> (100*0.02)^2 = 4 m^2.
  const room = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  assert.equal(realArea(room, unitsPerPixel), 4)
}

// A non-square scale sanity check reproducing the module's own worked
// example: 0.5 sheets/m2 style reasoning doesn't apply here, but the same
// "20 real units of driving quantity" shape does — confirm a plausible
// real-world plan (a 12.5m x 8m building footprint scaled onto a 500px-wide
// image) comes out at a sane number, not a wildly wrong order of magnitude.
{
  // Suppose 500px on screen represents the building's 12.5m width.
  const unitsPerPixel = calibrateScale(500, 12.5) // 0.025 m/px
  const footprint = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 320 }, { x: 0, y: 320 }] // 320px tall
  const area = realArea(footprint, unitsPerPixel)
  assert.equal(area, 100) // 12.5m x 8m = 100 m^2 (320 * 0.025 = 8)
}

console.log('OK — takeoff geometry verified (distance, calibration, polyline length, polygon area/winding, real-world conversion).')
