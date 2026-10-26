import { describe, expect, it } from 'vitest'
import { corridorMask, requiredGlideRatioFor, shareInside, straightenRoute, type RouteContext } from './geometry'
import { searchGlide, traceRoute, type ElevationGrid } from './search'

const CELL = 10

function makeGrid(cols: number, rows: number, terrain: (c: number, r: number) => number): ElevationGrid {
  const elevation = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = terrain(c, r)
  return { cols, rows, elevation, cellHeight: CELL, rowCellWidth: new Float32Array(rows).fill(CELL) }
}

function route(grid: ElevationGrid, from: [number, number], to: [number, number], startAltitude: number, glideRatio: number) {
  const ctx: RouteContext = {
    startAltitude,
    clearance: 0,
    launchZone: 0,
    start: from[1] * grid.cols + from[0],
    target: to[1] * grid.cols + to[0],
    targetElevation: 0,
    arrivalHeight: 0,
  }
  const result = searchGlide(grid, { startCol: from[0], startRow: from[1], startAltitude, glideRatio, clearance: 0, launchZone: 0 })
  return { ctx, geometry: straightenRoute(grid, traceRoute(result, ctx.target), ctx, glideRatio), grid: result.distance[ctx.target] }
}

describe('straightenRoute', () => {
  it('turns a clear grid route into one straight segment', () => {
    const grid = makeGrid(101, 101, () => 0)
    const { geometry } = route(grid, [10, 10], [90, 50], 1000, 10)
    expect(geometry.vertices).toEqual([
      [10, 10],
      [90, 50],
    ])
    expect(geometry.length).toBeCloseTo(Math.hypot(80, 40) * CELL, 3)
  })

  it('bends only at obstacle corners', () => {
    // Wall at column 50 with a gap at rows 80-84.
    const grid = makeGrid(101, 101, (c, r) => (c === 50 && (r < 80 || r > 84) ? 5000 : 0))
    const { geometry, grid: gridDistance } = route(grid, [40, 50], [60, 50], 1000, 10)
    expect(geometry.vertices.length).toBeLessThanOrEqual(4)
    expect(geometry.length).toBeLessThanOrEqual(gridDistance + 1e-3)
    // Close to the exact detour around the gap corner.
    expect(geometry.length).toBeLessThan(2 * Math.hypot(10, 30) * CELL * 1.03)
    for (const s of geometry.samples) expect(grid.elevation[s.cell]).toBe(0)
  })
})

describe('requiredGlideRatioFor', () => {
  it('is the straight-line ratio over flat ground', () => {
    const grid = makeGrid(101, 101, () => 0)
    const { ctx, geometry } = route(grid, [0, 50], [100, 50], 1000, 10)
    expect(requiredGlideRatioFor(geometry, { ...ctx, arrivalHeight: 100 })).toBeCloseTo(1000 / 900, 6)
  })

  it('is set by a ridge on the way', () => {
    // 500 m ridge at 400 m from the start; start at 600 m, 1000 m to the landing.
    const grid = makeGrid(101, 3, (c) => (c === 40 ? 500 : 0))
    const { ctx, geometry } = route(grid, [0, 1], [100, 1], 600, 10)
    // The landing alone needs 1000 / 600 = 1.7; over the ridge cell the glider must
    // stay above 500 m: its last sample at 400 m needs 400 / 100 = 4.
    expect(requiredGlideRatioFor(geometry, ctx)).toBeCloseTo(4, 6)
  })
})

describe('corridorMask', () => {
  it('covers the route away from its ends', () => {
    const grid = makeGrid(101, 101, () => 0)
    const { geometry } = route(grid, [0, 50], [100, 50], 1000, 10)
    const mask = corridorMask(grid, geometry, 50, 100)
    expect(mask[50 * 101 + 50]).toBe(1)
    expect(mask[54 * 101 + 50]).toBe(1)
    expect(mask[56 * 101 + 50]).toBe(0)
    expect(mask[50 * 101 + 2]).toBe(0) // near the start
    expect(shareInside(geometry, mask, 100)).toBe(1)
  })
})
