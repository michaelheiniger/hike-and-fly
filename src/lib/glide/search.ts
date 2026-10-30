import { clearanceAt as rampedClearance } from './geometry'
import { MinHeap } from './heap'

/**
 * Terrain on a regular metric grid. Row 0 is the northern edge.
 * Cells may be narrower towards the pole, hence a width per row.
 */
export interface ElevationGrid {
  cols: number
  rows: number
  /** Elevation AMSL in meters, row-major. */
  elevation: Float32Array
  /** North-south cell size in meters. */
  cellHeight: number
  /** East-west cell size in meters, one entry per row. */
  rowCellWidth: Float32Array
}

export interface GlideParams {
  startCol: number
  startRow: number
  /** Altitude AMSL at the start, in meters. */
  startAltitude: number
  glideRatio: number
  /** Minimum height above terrain required to fly over a cell and continue (m). */
  clearance: number
  /** Distance over which the clearance ramps from 0 to full after the start (m). */
  launchZone: number
  /**
   * Distance the pilot may run from the start before lifting off (m): any cell this
   * close and not above the start can be the liftoff, at its ground. 0 or absent
   * for a start in the air.
   */
  takeoffRun?: number
  /** Distance already flown at the start (m): a leg starting at a waypoint. */
  startDistance?: number
  /** Stop as soon as the shortest distance to this cell is known. */
  target?: number
}

export interface GlideResult {
  /**
   * Shortest flyable distance from the start in meters, Infinity if unreachable. After
   * a takeoff run it counts the height run down as the distance gliding it would take,
   * so the altitude over every cell is `startAltitude − distance / glideRatio`.
   */
  distance: Float32Array
  /**
   * `distance` at each cell's liftoff, where its glide and the clearance ramp began: 0 from
   * the start, more after a takeoff run. Null without a takeoff run (0 everywhere).
   */
  glideStart: Float32Array | null
  /** Index of the previous cell on the shortest route, -1 for the start, liftoff and unreachable cells. */
  predecessor: Int32Array
  /** True if a reachable cell touches the grid border (the area may be cut off). */
  truncated: boolean
}

/** Distance flown since the liftoff at cell `i`: the launch zone is measured from there. */
export function flownSinceLiftoff(r: Pick<GlideResult, 'distance' | 'glideStart'>, i: number): number {
  return r.distance[i] - (r.glideStart?.[i] ?? 0)
}

interface Move {
  dc: number
  dr: number
  /** Cells the straight segment crosses besides its two ends. */
  via: [number, number][]
}

/**
 * 16-neighbour moves: orthogonal, diagonal and knight moves. Knight moves bound
 * the overestimate of straight-line distances to ~2.7 % (8-neighbour: ~8 %).
 */
const MOVES: Move[] = (() => {
  const moves: Move[] = []
  for (const sc of [-1, 1]) {
    moves.push({ dc: sc, dr: 0, via: [] })
    moves.push({ dc: 0, dr: sc, via: [] })
    for (const sr of [-1, 1]) {
      // A diagonal touches the corner between the two orthogonal cells: require both
      // to be clear rather than slipping through a zero-width gap.
      moves.push({ dc: sc, dr: sr, via: [[sc, 0], [0, sr]] })
      moves.push({ dc: 2 * sc, dr: sr, via: [[sc, 0], [sc, sr]] })
      moves.push({ dc: sc, dr: 2 * sr, via: [[0, sr], [sc, sr]] })
    }
  }
  return moves
})()

/** Height above the ground at a liftoff after the takeoff run (m): float rounding must not put it below. */
export const LIFTOFF_MARGIN = 0.01

/**
 * Computes the shortest flyable distance from the start to every cell.
 *
 * Height loss is proportional to distance, so the shortest flyable path gives the
 * highest possible altitude over each cell. A cell can be *reached* when the glider
 * arrives above the terrain (AGL >= 0); the glider can only *continue* from it when
 * it is at least the clearance above the terrain. The clearance ramps up over the
 * launch zone (see `clearanceAt`) so that a ground launch (AGL 0) is possible.
 */
export function searchGlide(grid: ElevationGrid, params: GlideParams): GlideResult {
  const { cols, rows, elevation, cellHeight, rowCellWidth } = grid
  const { startCol, startRow, glideRatio, clearance, launchZone, takeoffRun = 0, startDistance = 0, target = -1 } = params
  const cellCount = cols * rows

  const distance = new Float32Array(cellCount).fill(Infinity)
  const predecessor = new Int32Array(cellCount).fill(-1)
  const result: GlideResult = { distance, glideStart: null, predecessor, truncated: false }

  if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return result
  const start = startRow * cols + startCol
  // Float32 like the stored elevation: a start clamped to the ground rounds up.
  if (Math.fround(params.startAltitude) < elevation[start]) return result
  const startAltitude = Math.max(params.startAltitude, elevation[start])

  const ramp = { clearance, launchZone }
  const clearanceAt = (d: number) => rampedClearance(ramp, d)

  // Step lengths per row, since the cell width varies with latitude.
  const moveCount = MOVES.length
  const stepLength = new Float64Array(rows * moveCount)
  for (let r = 0; r < rows; r++) {
    const w = rowCellWidth[r]
    for (let k = 0; k < moveCount; k++) {
      const m = MOVES[k]
      stepLength[r * moveCount + k] = Math.hypot(m.dc * w, m.dr * cellHeight)
    }
  }

  const heap = new MinHeap(Math.max(1024, cellCount >> 2))
  distance[start] = Math.fround(startDistance)
  heap.push(distance[start], start)

  // Liftoffs after running down: at the ground, a hair above so the glide can go on.
  // The clearance ramps from each liftoff, so `offset` keeps where its glide began.
  const offset = takeoffRun > 0 ? new Float32Array(cellCount) : null
  result.glideStart = offset
  if (offset) {
    const dr = Math.floor(takeoffRun / cellHeight)
    for (let r = Math.max(0, startRow - dr); r <= Math.min(rows - 1, startRow + dr); r++) {
      const y = (r - startRow) * cellHeight
      const dc = Math.floor(Math.sqrt(Math.max(0, takeoffRun * takeoffRun - y * y)) / rowCellWidth[r])
      for (let c = Math.max(0, startCol - dc); c <= Math.min(cols - 1, startCol + dc); c++) {
        const cell = r * cols + c
        const drop = startAltitude - elevation[cell] - LIFTOFF_MARGIN
        if (cell === start || drop <= 0) continue
        const d = Math.fround(drop * glideRatio)
        if (d < distance[cell]) {
          distance[cell] = d
          offset[cell] = d
          heap.push(d, cell)
        }
      }
    }
  }

  while (heap.size > 0) {
    const d = heap.peekKey()
    const cell = heap.pop()
    if (d > distance[cell]) continue // stale entry
    if (cell === target) break

    const r = (cell / cols) | 0
    const c = cell - r * cols
    if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) result.truncated = true

    const altitude = startAltitude - d / glideRatio
    const glideStart = offset ? offset[cell] : 0
    // Reached but too low to continue: a final glide only.
    if (altitude < elevation[cell] + clearanceAt(d - glideStart)) continue

    for (let k = 0; k < moveCount; k++) {
      const m = MOVES[k]
      const nc = c + m.dc
      const nr = r + m.dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const next = nr * cols + nc
      // Rounded like the stored distances, or stale-entry detection would misfire.
      const nd = Math.fround(d + stepLength[r * moveCount + k])
      if (nd >= distance[next]) continue

      const arrival = startAltitude - nd / glideRatio
      if (arrival < elevation[next]) continue

      // Cells crossed on the way are flown over, so they need the clearance.
      // The arrival altitude is used: conservative, the glider is higher there.
      let blocked = false
      const required = arrival - clearanceAt(nd - glideStart)
      for (const [vc, vr] of m.via) {
        if (elevation[(r + vr) * cols + (c + vc)] > required) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      distance[next] = nd
      predecessor[next] = cell
      if (offset) offset[next] = glideStart
      heap.push(nd, next)
    }
  }

  return result
}

/** Height above ground over each cell (m), NaN where unreachable. */
export function computeAgl(grid: ElevationGrid, result: GlideResult, startAltitude: number, glideRatio: number): Float32Array {
  const { elevation } = grid
  const { distance } = result
  const agl = new Float32Array(distance.length)
  for (let i = 0; i < agl.length; i++) {
    const d = distance[i]
    agl[i] = d === Infinity ? NaN : startAltitude - d / glideRatio - elevation[i]
  }
  return agl
}

/** Cell indices of the shortest route from the start to `target`, start first. Empty if unreachable. */
export function traceRoute(result: GlideResult, target: number): number[] {
  if (result.distance[target] === Infinity) return []
  const route: number[] = []
  for (let cell = target; cell !== -1; cell = result.predecessor[cell]) route.push(cell)
  return route.reverse()
}
