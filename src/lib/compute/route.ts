import { corridorMask, requiredGlideRatioFor, shareInside, straightenRoute, type RouteContext, type RouteGeometry } from '../glide/geometry'
import { arriveWith, findRequiredGlideRatio, type ArrivalProblem } from '../glide/required'
import { traceRoute, type ElevationGrid } from '../glide/search'
import { cellAt, localDistance, metersPerDegree, type GeoGrid, type LngLat } from '../terrain/geo'
import type { ReachRequest } from './reach'
import {
  DEFAULT_MAX_RADIUS,
  groundElevation,
  loadElevationGrid,
  PlanError,
  startAltitudeFrom,
  type GridOptions,
  type LoadTiles,
  type PreparedGrid,
} from './terrain'

export interface RouteRequest extends ReachRequest {
  landing: LngLat
  /** Required height above the landing on arrival (m). */
  arrivalHeight: number
}

export interface PathPoint {
  /** Distance flown from the start (m). */
  distance: number
  /** Terrain elevation under the route (m AMSL). */
  terrain: number
  lng: number
  lat: number
}

/** One way from the start to the landing. Its altitudes follow from any glide ratio ≥ the required one. */
export interface RouteOption {
  id: number
  /** Side of the straight line the route lies on ("South-east"), null when direct. */
  side: string | null
  /** Average distance from the straight line (m). */
  offset: number
  /** Smallest glide ratio flying this route with the clearance and arrival height. */
  requiredGlideRatio: number
  /** Distance flown (m). */
  length: number
  /** Corners of the route. */
  vertices: LngLat[]
  /** Dense points along the route, for the profile. */
  path: PathPoint[]
  /** The shortest route with the pilot's glide ratio (rather than a required-ratio search). */
  shortestWithGlideRatio: boolean
}

export interface RouteResult {
  startElevation: number
  startAltitude: number
  landingElevation: number
  straightDistance: number
  /** Distinct routes, smallest required glide ratio first. Empty if none up to MAX_GLIDE_RATIO. */
  options: RouteOption[]
  /** True until the search for alternative routes has run. */
  alternativesPending: boolean
  cellSize: number
  timings: { terrain: number; search: number }
}

/** Cells the route grid may use: smaller than the reach grid, as it is searched many times. */
const ROUTE_MAX_CELLS = 1_000_000

/** Alternatives searched after the best route. */
const MAX_ALTERNATIVES = 2

interface Candidate {
  geometry: RouteGeometry
  required: number
  /** Band around the route (null for the pilot's route, which is never blocked). */
  mask: Uint8Array | null
  shortestWithGlideRatio: boolean
}

interface Plan {
  key: string
  prepared: PreparedGrid
  problem: ArrivalProblem
  ctx: RouteContext
  startElevation: number
  landingElevation: number
  straightDistance: number
  /** Corridor half-width and the distance from the ends where corridors stop (m). */
  corridor: number
  keepClear: number
  found: Candidate[]
  alternativesDone: boolean
  terrainTime: number
}

/**
 * Plans routes from the start to the landing. Terrain and required-ratio routes do
 * not depend on the pilot's glide ratio, which changes often: they are kept for the
 * last start, landing and assumptions.
 */
export class RoutePlanner {
  private last: Plan | null = null
  private loadTiles: LoadTiles
  private options: GridOptions

  constructor(loadTiles: LoadTiles, options: GridOptions) {
    this.loadTiles = loadTiles
    this.options = options
  }

  /** Best route at the required glide ratio, plus the pilot's shortest route. */
  async plan(req: RouteRequest): Promise<RouteResult> {
    const t0 = performance.now()
    const plan = await this.ensurePlan(req)
    return this.result(plan, req.glideRatio, performance.now() - t0)
  }

  /** Same as `plan`, after also searching for alternative routes around other sides. */
  async alternatives(req: RouteRequest): Promise<RouteResult> {
    const t0 = performance.now()
    const plan = await this.ensurePlan(req)
    if (!plan.alternativesDone) {
      const { elevationGrid } = plan.prepared
      const blocked = new Uint8Array(elevationGrid.elevation.length)
      for (let k = 0; k < MAX_ALTERNATIVES; k++) {
        const last = plan.found[plan.found.length - 1]
        if (!last?.mask) break
        for (let i = 0; i < blocked.length; i++) blocked[i] |= last.mask[i]
        const candidate = this.searchRequired(plan, blockedGrid(elevationGrid, blocked))
        if (!candidate) break
        plan.found.push(candidate)
      }
      plan.alternativesDone = true
    }
    return this.result(plan, req.glideRatio, performance.now() - t0)
  }

  private async ensurePlan(req: RouteRequest): Promise<Plan> {
    const { glideRatio, ...rest } = req
    const key = JSON.stringify(rest)
    if (this.last?.key === key) return this.last
    this.last = null
    const t0 = performance.now()
    const plan = await this.prepare(req, key)
    plan.terrainTime = performance.now() - t0
    const best = this.searchRequired(plan, plan.prepared.elevationGrid)
    if (best) plan.found.push(best)
    else plan.alternativesDone = true
    this.last = plan
    return plan
  }

  /** Best route on a (possibly blocked) grid at its required glide ratio. */
  private searchRequired(plan: Plan, grid: ElevationGrid): Candidate | null {
    const found = findRequiredGlideRatio(grid, plan.problem, plan.straightDistance)
    if (!found) return null
    const geometry = straightenRoute(grid, traceRoute(found.result, plan.problem.target), plan.ctx, found.glideRatio)
    return {
      geometry,
      required: requiredGlideRatioFor(geometry, plan.ctx),
      mask: corridorMask(grid, geometry, plan.corridor, plan.keepClear),
      shortestWithGlideRatio: false,
    }
  }

  private result(plan: Plan, glideRatio: number, elapsed: number): RouteResult {
    const t0 = performance.now()
    const candidates = plan.found.map((c) => ({ ...c }))

    // The pilot's shortest route, when it is not one of the routes already found.
    const { elevationGrid } = plan.prepared
    const arrival = arriveWith(elevationGrid, plan.problem, glideRatio)
    if (arrival.ok) {
      const geometry = straightenRoute(elevationGrid, traceRoute(arrival.result, plan.problem.target), plan.ctx, glideRatio)
      const same = candidates.find((c) => c.mask && shareInside(geometry, c.mask, plan.keepClear) > 0.5)
      if (same) same.shortestWithGlideRatio = true
      else {
        candidates.push({ geometry, required: requiredGlideRatioFor(geometry, plan.ctx), mask: null, shortestWithGlideRatio: true })
      }
    }
    const search = performance.now() - t0

    const options = candidates
      .filter((c) => Number.isFinite(c.required))
      .sort((a, b) => a.required - b.required)
      .map((c, i) => toOption(plan, c, i))

    return {
      startElevation: plan.startElevation,
      startAltitude: plan.problem.startAltitude,
      landingElevation: plan.landingElevation,
      straightDistance: plan.straightDistance,
      options,
      alternativesPending: !plan.alternativesDone,
      cellSize: plan.prepared.cellSize,
      timings: { terrain: plan.terrainTime, search: elapsed - plan.terrainTime + search },
    }
  }

  private async prepare(req: RouteRequest, key: string): Promise<Plan> {
    const { start, landing, clearance, launchZone, arrivalHeight } = req
    const { maxRadius = DEFAULT_MAX_RADIUS } = this.options

    const straightDistance = localDistance(start, landing)
    if (straightDistance < 50) throw new PlanError('The landing is too close to the start.')
    if (straightDistance > 1.5 * maxRadius) {
      throw new PlanError(`The landing is ${Math.round(straightDistance / 1000)} km away: too far to plan.`)
    }
    const [startElevation, landingElevation] = await Promise.all([
      groundElevation(start, this.loadTiles, this.options),
      groundElevation(landing, this.loadTiles, this.options),
    ])
    const startAltitude = startAltitudeFrom(req.startHeight, req.startHeightMode, startElevation)

    // Centered between start and landing, with room for detours on all sides.
    const center = { lng: (start.lng + landing.lng) / 2, lat: (start.lat + landing.lat) / 2 }
    const radius = Math.min(maxRadius, straightDistance / 2 + Math.max(3000, 0.5 * straightDistance))
    const prepared = await loadElevationGrid(center, radius, start, launchZone, startElevation, this.loadTiles, {
      ...this.options,
      maxCells: ROUTE_MAX_CELLS,
    })
    const { grid, elevationGrid } = prepared
    const s = cellAt(grid, start)!
    const l = cellAt(grid, landing)!
    const startCell = s.row * grid.cols + s.col
    const target = l.row * grid.cols + l.col
    // Start and landing cells hold their true elevation (the grid keeps the max).
    const { elevation } = elevationGrid
    elevation[startCell] = Math.min(elevation[startCell], startAltitude)
    elevation[target] = Math.min(elevation[target], landingElevation)

    const corridor = Math.min(1500, Math.max(300, 0.1 * straightDistance))
    return {
      key,
      prepared,
      problem: {
        startCol: s.col,
        startRow: s.row,
        startAltitude,
        clearance,
        launchZone,
        target,
        targetElevation: landingElevation,
        arrivalHeight,
      },
      ctx: { startAltitude, clearance, launchZone, start: startCell, target, targetElevation: landingElevation, arrivalHeight },
      startElevation,
      landingElevation,
      straightDistance,
      corridor,
      keepClear: 1.5 * corridor,
      found: [],
      alternativesDone: false,
      terrainTime: 0,
    }
  }
}

/** Grid where the masked cells are impassable. */
function blockedGrid(grid: ElevationGrid, mask: Uint8Array): ElevationGrid {
  const elevation = Float32Array.from(grid.elevation)
  for (let i = 0; i < mask.length; i++) if (mask[i]) elevation[i] = 1e6
  return { ...grid, elevation }
}

const toLngLat = (grid: GeoGrid, col: number, row: number): LngLat => ({
  lng: grid.west + (col + 0.5) * grid.dLng,
  lat: grid.north - (row + 0.5) * grid.dLat,
})

const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west']

/**
 * Side of the straight line the route lies on, from the average signed offset along
 * the route (a short wiggle does not decide it); null when the route is direct.
 */
export function routeSide(path: PathPoint[], straightDistance: number): { side: string | null; offset: number } {
  const a = path[0]
  const b = path[path.length - 1]
  const m = metersPerDegree((a.lat + b.lat) / 2)
  const bx = (b.lng - a.lng) * m.lng
  const by = (b.lat - a.lat) * m.lat
  const len = Math.hypot(bx, by)
  let sum = 0
  for (const p of path) {
    const px = (p.lng - a.lng) * m.lng
    const py = (p.lat - a.lat) * m.lat
    sum += (bx * py - by * px) / len // > 0: left of the straight line
  }
  const mean = sum / path.length
  if (Math.abs(mean) < Math.max(150, 0.03 * straightDistance)) return { side: null, offset: Math.abs(mean) }
  // Unit normal pointing to the side the route lies on, as a compass bearing.
  const sign = Math.sign(mean) || 1
  const east = (-by / len) * sign
  const north = (bx / len) * sign
  const bearing = (Math.atan2(east, north) * 180) / Math.PI
  return { side: COMPASS[Math.round(((bearing + 360) % 360) / 45) % 8], offset: Math.abs(mean) }
}

function toOption(plan: Plan, c: Candidate, id: number): RouteOption {
  const { grid } = plan.prepared
  const vertices = c.geometry.vertices.map(([col, row]) => toLngLat(grid, col, row))
  const path = c.geometry.samples.map((s) => ({ distance: s.distance, terrain: s.elevation, ...toLngLat(grid, s.col, s.row) }))
  return {
    id,
    ...routeSide(path, plan.straightDistance),
    requiredGlideRatio: c.required,
    length: c.geometry.length,
    vertices,
    path,
    shortestWithGlideRatio: c.shortestWithGlideRatio,
  }
}
