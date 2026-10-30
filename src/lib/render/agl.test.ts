import { describe, expect, it } from 'vitest'
import { aglBands, renderAgl } from './agl'
import type { GeoGrid } from '../terrain/geo'

// One row of five cells along the equator (no Mercator stretch to speak of).
const grid: GeoGrid = { north: 0.0005, west: 0, rows: 1, cols: 5, dLat: 0.001, dLng: 0.001 }
const alpha = (rgba: Uint8ClampedArray, c: number) => rgba[c * 4 + 3]
const red = (rgba: Uint8ClampedArray, c: number) => rgba[c * 4]

describe('renderAgl', () => {
  it('leaves the launch zone transparent and marks its edge next to the colored area', () => {
    const agl = new Float32Array([0, 10, 20, 300, NaN])
    const distance = new Float32Array([0, 100, 200, 600, Infinity])
    const { rgba } = renderAgl(agl, distance, 500, grid, aglBands(50))
    // Start and inner launch zone: transparent.
    expect(alpha(rgba, 0)).toBe(0)
    expect(alpha(rgba, 1)).toBe(0)
    // Last launch zone cell before the colored one: the dark edge.
    expect(alpha(rgba, 2)).toBe(210)
    expect(red(rgba, 2)).toBe(26)
    // Beyond the launch zone: colored; unreachable: transparent.
    expect(alpha(rgba, 3)).toBe(255)
    expect(alpha(rgba, 4)).toBe(0)
  })

  it('draws no edge without a launch zone', () => {
    const agl = new Float32Array([0, 10, 20, 300, NaN])
    const distance = new Float32Array([0, 100, 200, 600, Infinity])
    const { rgba } = renderAgl(agl, distance, 0, grid, aglBands(50))
    expect([0, 1, 2, 3].map((c) => alpha(rgba, c))).toEqual([255, 255, 255, 255])
  })
})
