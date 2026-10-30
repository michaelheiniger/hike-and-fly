import { describe, expect, it } from 'vitest'
import { estimateBytes, planArea } from './areas'

// About 20 × 15 km around Grindelwald.
const bounds = { west: 7.95, south: 46.6, east: 8.2, north: 46.74 }

describe('planArea', () => {
  it('stores map and slope tiles for every map zoom', () => {
    const plan = planArea(bounds, 14)
    const swisstopo = plan.mapTiles.filter((u) => u.includes('pixelkarte'))
    const slope = plan.mapTiles.filter((u) => u.includes('hangneigung'))
    expect(swisstopo.length).toBe(slope.length)
    expect(swisstopo.some((u) => u.includes('/3857/8/'))).toBe(true)
    expect(swisstopo.some((u) => u.includes('/3857/14/'))).toBe(true)
    expect(swisstopo.some((u) => u.includes('/3857/15/'))).toBe(false)
  })

  it('stores fine elevation over the area and coarse elevation far around it', () => {
    const plan = planArea(bounds, 14)
    const zooms = new Set(plan.elevationTiles.map(([z]) => z))
    expect([...zooms].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 11, 12, 13])
    // Coarse tiles reach ~60 km out; fine tiles only ~5 km.
    const z9 = plan.elevationTiles.filter(([z]) => z === 9).length
    const z13 = plan.elevationTiles.filter(([z]) => z === 13).length
    expect(z9).toBeGreaterThanOrEqual(4)
    expect(z13).toBeGreaterThan(50)
    expect(z13).toBeLessThan(200)
  })

  it('estimates a size that grows with map detail', () => {
    expect(estimateBytes(planArea(bounds, 15))).toBeGreaterThan(estimateBytes(planArea(bounds, 14)))
  })
})
