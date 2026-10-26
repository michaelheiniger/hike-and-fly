import { describe, expect, it } from 'vitest'
import { computeAgl, searchGlide, traceRoute, type ElevationGrid, type GlideParams } from './search'

const CELL = 10

function makeGrid(cols: number, rows: number, terrain: (c: number, r: number) => number): ElevationGrid {
  const elevation = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = terrain(c, r)
  return { cols, rows, elevation, cellHeight: CELL, rowCellWidth: new Float32Array(rows).fill(CELL) }
}

function params(overrides: Partial<GlideParams>): GlideParams {
  return { startCol: 0, startRow: 0, startAltitude: 0, glideRatio: 10, clearance: 0, launchZone: 0, ...overrides }
}

const idx = (grid: ElevationGrid, c: number, r: number) => r * grid.cols + c

describe('searchGlide', () => {
  it('reaches a circle of radius height × GR over flat ground', () => {
    const grid = makeGrid(201, 201, () => 0)
    // 80 m above flat ground at GR 10: 800 m range = 80 cells.
    const result = searchGlide(grid, params({ startCol: 100, startRow: 100, startAltitude: 80 }))

    // Straight-line distances are matched within the 16-neighbour error bound (~2.7 %).
    for (const [c, r] of [[170, 100], [150, 150], [160, 130], [100, 40]]) {
      const exact = Math.hypot(c - 100, r - 100) * CELL
      const d = result.distance[idx(grid, c, r)]
      expect(d).toBeGreaterThanOrEqual(exact - 1e-3)
      expect(d).toBeLessThanOrEqual(exact * 1.03)
    }
    expect(result.distance[idx(grid, 185, 100)]).toBe(Infinity)
    expect(result.distance[idx(grid, 165, 165)]).toBe(Infinity) // 919 m away
    expect(result.truncated).toBe(false)
  })

  it('computes AGL from the glide line', () => {
    const grid = makeGrid(101, 1, () => 0)
    const result = searchGlide(grid, params({ startAltitude: 50 }))
    const agl = computeAgl(grid, result, 50, 10)
    expect(agl[0]).toBeCloseTo(50)
    expect(agl[30]).toBeCloseTo(20) // 300 m flown, 30 m lost
    expect(agl[50]).toBeCloseTo(0)
    expect(agl[51]).toBeNaN()
  })

  it('glides down from a summit steeper than the glide angle', () => {
    // Cone 500 m high, slope 1:2 — much steeper than 1:10.
    const grid = makeGrid(201, 201, (c, r) => Math.max(0, 500 - Math.hypot(c - 100, r - 100) * CELL * 0.5))
    const result = searchGlide(grid, params({ startCol: 100, startRow: 100, startAltitude: 500 }))
    expect(result.distance[idx(grid, 100, 190)]).toBeCloseTo(900, -1)
  })

  it('cannot take off from flat ground at AGL 0', () => {
    const grid = makeGrid(21, 21, () => 1000)
    const result = searchGlide(grid, params({ startCol: 10, startRow: 10, startAltitude: 1000, launchZone: 500, clearance: 100 }))
    const reached = result.distance.filter((d) => d !== Infinity).length
    expect(reached).toBe(1)
  })

  it('flies around a wall through its gap', () => {
    // Wall at column 50, too high to cross, with a gap at rows 80-84.
    const grid = makeGrid(101, 101, (c, r) => (c === 50 && (r < 80 || r > 84) ? 1000 : 0))
    const result = searchGlide(grid, params({ startCol: 40, startRow: 50, startAltitude: 200 }))
    const target = idx(grid, 60, 50)
    const d = result.distance[target]
    // Straight line is 200 m; via the gap it is about 2 × hypot(10, 30) cells.
    // Bending around an obstacle corner costs a few extra percent on the grid.
    expect(d).toBeGreaterThan(2 * Math.hypot(10, 30) * CELL * 0.99)
    expect(d).toBeLessThan(2 * Math.hypot(10, 30) * CELL * 1.06)

    const route = traceRoute(result, target)
    expect(route[0]).toBe(idx(grid, 40, 50))
    expect(route.at(-1)).toBe(target)
    expect(route.some((cell) => cell % grid.cols === 50 && Math.floor(cell / grid.cols) >= 80)).toBe(true)
  })

  it('does not reach behind a closed wall', () => {
    const grid = makeGrid(101, 101, (c) => (c === 50 ? 1000 : 0))
    const result = searchGlide(grid, params({ startCol: 40, startRow: 50, startAltitude: 200 }))
    expect(result.distance[idx(grid, 60, 50)]).toBe(Infinity)
  })

  it('does not slip diagonally between two blocked cells', () => {
    // A diagonal wall of single cells: only corners touch.
    const grid = makeGrid(41, 41, (c, r) => (c + r === 40 ? 1000 : 0))
    const result = searchGlide(grid, params({ startCol: 5, startRow: 5, startAltitude: 1000, glideRatio: 100 }))
    expect(result.distance[idx(grid, 35, 35)]).toBe(Infinity)
  })

  it('reaches a cell below the clearance but does not continue from it', () => {
    // Ridge of 60 m at column 30; glider arrives there at ~70 m: AGL 10 m < clearance 50 m.
    const grid = makeGrid(101, 1, (c) => (c === 30 ? 60 : 0))
    const result = searchGlide(grid, params({ startAltitude: 100, clearance: 50 }))
    expect(result.distance[30]).toBeCloseTo(300)
    expect(result.distance[31]).toBe(Infinity)
  })

  it('ramps the clearance over the launch zone', () => {
    // Slope 1:2 from the start: AGL grows by 40 m per 100 m flown at GR 10,
    // faster than the ramped clearance (20 m per 100 m over a 500 m launch zone).
    const grid = makeGrid(101, 1, (c) => 1000 - c * CELL * 0.5)
    const run = (launchZone: number) =>
      searchGlide(grid, params({ startAltitude: 1000, clearance: 100, launchZone })).distance[100]
    expect(run(0)).toBe(Infinity) // full clearance at the start: no launch possible
    expect(run(500)).toBeCloseTo(1000)
  })

  it('reports a truncated area when reachable cells touch the border', () => {
    const grid = makeGrid(21, 21, () => 0)
    const result = searchGlide(grid, params({ startCol: 10, startRow: 10, startAltitude: 1000 }))
    expect(result.truncated).toBe(true)
  })
})
