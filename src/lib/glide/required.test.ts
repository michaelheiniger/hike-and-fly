import { describe, expect, it } from 'vitest'
import { arriveWith, findRequiredGlideRatio, type ArrivalProblem } from './required'
import { searchGlide, type ElevationGrid } from './search'

const CELL = 10

function makeGrid(cols: number, rows: number, terrain: (c: number, r: number) => number): ElevationGrid {
  const elevation = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) elevation[r * cols + c] = terrain(c, r)
  return { cols, rows, elevation, cellHeight: CELL, rowCellWidth: new Float32Array(rows).fill(CELL) }
}

describe('searchGlide target', () => {
  it('stops early with the same distance to the target', () => {
    const grid = makeGrid(101, 101, () => 0)
    const params = { startCol: 10, startRow: 50, startAltitude: 500, glideRatio: 10, clearance: 0, launchZone: 0 }
    const full = searchGlide(grid, params)
    const target = 50 * 101 + 40
    const early = searchGlide(grid, { ...params, target })
    expect(early.distance[target]).toBe(full.distance[target])
    expect(early.distance[50 * 101 + 100]).toBe(Infinity) // never explored
  })
})

describe('findRequiredGlideRatio', () => {
  // Start 1000 m high, landing 1000 m east at 0 m, 100 m arrival height.
  const problem = (grid: ElevationGrid): ArrivalProblem => ({
    startCol: 0,
    startRow: 50,
    startAltitude: 1000,
    clearance: 0,
    launchZone: 0,
    target: 50 * grid.cols + 100,
    targetElevation: 0,
    arrivalHeight: 100,
  })

  it('equals the straight-line glide ratio over flat ground', () => {
    const grid = makeGrid(101, 101, () => 0)
    const found = findRequiredGlideRatio(grid, problem(grid), 1000)!
    expect(found.glideRatio).toBeCloseTo(1000 / 900, 1)
    expect(found.ok).toBe(true)
  })

  it('needs a better glide ratio to fly around a wall', () => {
    // Wall at column 50 too high to cross, with a gap at rows 90-94: a detour.
    const grid = makeGrid(101, 101, (c, r) => (c === 50 && (r < 90 || r > 94) ? 5000 : 0))
    const found = findRequiredGlideRatio(grid, problem(grid), 1000)!
    const detour = 2 * Math.hypot(50, 40) * CELL
    expect(found.glideRatio).toBeGreaterThan((detour / 900) * 0.99)
    expect(found.glideRatio).toBeLessThan((detour / 900) * 1.07)
    // Just below the required ratio, the landing is out of reach.
    expect(arriveWith(grid, problem(grid), found.glideRatio - 0.1).ok).toBe(false)
  })

  it('picks the detour only when it is needed', () => {
    // A 400 m ridge across the line: a good glider clears it, a poor one goes around.
    const grid = makeGrid(101, 101, (c, r) => (c === 50 && (r < 90 || r > 94) ? 400 : 0))
    const p = { ...problem(grid), startAltitude: 600, arrivalHeight: 0 }
    const found = findRequiredGlideRatio(grid, p, 1000)!
    // Over the ridge: at 500 m you must be above 400 m → GR ≥ 500/200 = 2.5.
    // Around via the gap is ~1281 m → GR ≥ 2.14. Around wins.
    expect(found.glideRatio).toBeCloseTo((2 * Math.hypot(50, 40) * CELL) / 600, 0)
    expect(found.glideRatio).toBeLessThan(2.5)
  })

  it('returns null when the landing is above the start', () => {
    const grid = makeGrid(101, 101, () => 0)
    expect(findRequiredGlideRatio(grid, { ...problem(grid), targetElevation: 950 }, 1000)).toBeNull()
  })

  it('returns null when the landing is enclosed', () => {
    const grid = makeGrid(101, 101, (c) => (c === 50 ? 5000 : 0))
    expect(findRequiredGlideRatio(grid, problem(grid), 1000)).toBeNull()
  })
})
