import type { ElevationGrid } from './search'

/** What a route must respect, independent of the glide ratio. */
export interface RouteContext {
  startAltitude: number
  clearance: number
  launchZone: number
  /** Start cell index: the pilot runs off the slope there, no clearance applies. */
  start: number
  /** Landing cell index: only the arrival height applies there. */
  target: number
  targetElevation: number
  arrivalHeight: number
}

export interface RouteSample {
  /** Distance flown from the start (m). */
  distance: number
  /** Position in grid coordinates (cell centers are integers). */
  col: number
  row: number
  /** Terrain under the sample (m AMSL): its cell's, interpolated within the launch zone. */
  elevation: number
  /** Index of the cell under the sample. */
  cell: number
}

/** A route as straight segments between cell centers, with dense samples for checks and profiles. */
export interface RouteGeometry {
  vertices: [number, number][]
  samples: RouteSample[]
  /** Distance flown (m). */
  length: number
}

/**
 * Clearance required after flying `d` meters. Over the launch zone it grows from 0 with
 * the cube of the distance: almost nothing while the pilot is still close to the slope
 * (a summit's flat top, a shoulder below the launch), the full value at its end.
 */
export function clearanceAt(ctx: Pick<RouteContext, 'clearance' | 'launchZone'>, d: number): number {
  return ctx.launchZone > 0 ? ctx.clearance * Math.min(1, d / ctx.launchZone) ** 3 : ctx.clearance
}

function segmentLength(grid: ElevationGrid, c0: number, r0: number, c1: number, r1: number): number {
  const w = grid.rowCellWidth[Math.round((r0 + r1) / 2)]
  return Math.hypot((c1 - c0) * w, (r1 - r0) * grid.cellHeight)
}

/** Terrain interpolated between the centers of the four cells around a grid position. */
function interpolatedElevation(grid: ElevationGrid, col: number, row: number): number {
  const c0 = Math.min(Math.max(Math.floor(col), 0), grid.cols - 2)
  const r0 = Math.min(Math.max(Math.floor(row), 0), grid.rows - 2)
  const tc = Math.min(Math.max(col - c0, 0), 1)
  const tr = Math.min(Math.max(row - r0, 0), 1)
  const e = grid.elevation
  const i = r0 * grid.cols + c0
  return (e[i] * (1 - tc) + e[i + 1] * tc) * (1 - tr) + (e[i + grid.cols] * (1 - tc) + e[i + grid.cols + 1] * tc) * tr
}

/**
 * Samples along a segment, about two per cell, excluding its first point. A sample
 * takes the terrain of its cell, the highest point there, except within `trueUntil`
 * meters of flight: the launch zone holds true elevations (see `sampleGrid`), which
 * are interpolated. A cell's single value would put a sample at its edge as high as
 * its center, and the steep ground just below a summit would read meters too high.
 * The interpolation never exceeds the cell, which the search flew over: higher ground
 * beside a takeoff would otherwise lift the first samples above the start.
 */
function sampleSegment(
  grid: ElevationGrid,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  d0: number,
  trueUntil: number,
  out: RouteSample[],
): void {
  const length = segmentLength(grid, c0, r0, c1, r1)
  const steps = Math.max(1, Math.ceil(2 * Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0))))
  for (let k = 1; k <= steps; k++) {
    const t = k / steps
    const col = c0 + (c1 - c0) * t
    const row = r0 + (r1 - r0) * t
    const cell = Math.round(row) * grid.cols + Math.round(col)
    const distance = d0 + length * t
    const own = grid.elevation[cell]
    const elevation = distance < trueUntil ? Math.min(own, interpolatedElevation(grid, col, row)) : own
    out.push({ distance, col, row, elevation, cell })
  }
}

/** True if every sample is high enough at the glide ratio. */
function samplesFlyable(samples: RouteSample[], ctx: RouteContext, glideRatio: number): boolean {
  for (const s of samples) {
    if (s.cell === ctx.start) continue
    const altitude = ctx.startAltitude - s.distance / glideRatio
    const floor = s.cell === ctx.target ? s.elevation : s.elevation + clearanceAt(ctx, s.distance)
    if (altitude < floor) return false
  }
  return true
}

/**
 * Straightens a grid route: from each vertex, jumps to the farthest following
 * cell reachable in a straight flyable line. The result is never longer than the
 * grid route, so it stays flyable at `glideRatio`.
 */
export function straightenRoute(grid: ElevationGrid, cells: number[], ctx: RouteContext, glideRatio: number): RouteGeometry {
  const pos = cells.map((cell): [number, number] => [cell % grid.cols, Math.floor(cell / grid.cols)])
  const vertices: [number, number][] = [pos[0]]
  const samples: RouteSample[] = []
  const scratch: RouteSample[] = []
  let i = 0
  let distance = 0

  while (i < pos.length - 1) {
    // The next grid step was flown by the search: always accepted.
    let j = i + 1
    while (j + 1 < pos.length) {
      scratch.length = 0
      sampleSegment(grid, pos[i][0], pos[i][1], pos[j + 1][0], pos[j + 1][1], distance, ctx.launchZone, scratch)
      if (!samplesFlyable(scratch, ctx, glideRatio)) break
      j++
    }
    sampleSegment(grid, pos[i][0], pos[i][1], pos[j][0], pos[j][1], distance, ctx.launchZone, samples)
    distance = samples[samples.length - 1].distance
    vertices.push(pos[j])
    i = j
  }

  const first = pos[0]
  const startSample: RouteSample = { distance: 0, col: first[0], row: first[1], elevation: grid.elevation[cells[0]], cell: cells[0] }
  return { vertices, samples: [startSample, ...samples], length: distance }
}

/**
 * Smallest glide ratio flying this exact route: every sample above terrain plus
 * clearance, and the arrival height over the landing. Infinity if impossible.
 */
export function requiredGlideRatioFor(route: RouteGeometry, ctx: RouteContext): number {
  let required = 0
  for (const s of route.samples) {
    if (s.cell === ctx.start || s.cell === ctx.target || s.distance === 0) continue
    const height = ctx.startAltitude - s.elevation - clearanceAt(ctx, s.distance)
    if (height <= 0) return Infinity
    required = Math.max(required, s.distance / height)
  }
  const height = ctx.startAltitude - ctx.targetElevation - ctx.arrivalHeight
  if (height <= 0) return Infinity
  return Math.max(required, route.length / height)
}

/**
 * Marks cells within `radius` (m) of the route, except within `keepClear` (m)
 * of its two ends: a corridor to block when looking for another way around.
 */
export function corridorMask(grid: ElevationGrid, route: RouteGeometry, radius: number, keepClear: number): Uint8Array {
  const mask = new Uint8Array(grid.cols * grid.rows)
  const rCells = Math.ceil(radius / grid.cellHeight)
  for (const s of route.samples) {
    if (s.distance < keepClear || route.length - s.distance < keepClear) continue
    const c0 = Math.round(s.col)
    const r0 = Math.round(s.row)
    for (let dr = -rCells; dr <= rCells; dr++) {
      const r = r0 + dr
      if (r < 0 || r >= grid.rows) continue
      const w = grid.rowCellWidth[r]
      const dy = dr * grid.cellHeight
      const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)) / w)
      for (let dc = -half; dc <= half; dc++) {
        const c = c0 + dc
        if (c >= 0 && c < grid.cols) mask[r * grid.cols + c] = 1
      }
    }
  }
  return mask
}

/** Share of the route's samples (away from its ends) inside a mask. */
export function shareInside(route: RouteGeometry, mask: Uint8Array, keepClear: number): number {
  let inside = 0
  let total = 0
  for (const s of route.samples) {
    if (s.distance < keepClear || route.length - s.distance < keepClear) continue
    total++
    inside += mask[s.cell]
  }
  return total === 0 ? 1 : inside / total
}
