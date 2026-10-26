import { arriveWith, findRequiredGlideRatio, type Arrival, type ArrivalProblem } from '../glide/required'
import { traceRoute } from '../glide/search'
import { cellAt, cellCenter, localDistance, type LngLat } from '../terrain/geo'
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

export interface ProfilePoint {
  /** Distance flown from the start (m). */
  distance: number
  /** Terrain elevation under the route (m AMSL). */
  terrain: number
  /** Glider altitude (m AMSL). */
  altitude: number
  lng: number
  lat: number
}

export interface Route {
  glideRatio: number
  /** Distance flown (m). */
  length: number
  /** Height above the landing on arrival (m). */
  arrivalAgl: number
  profile: ProfilePoint[]
}

export interface RouteResult {
  startElevation: number
  startAltitude: number
  landingElevation: number
  straightDistance: number
  /** Route with the smallest glide ratio reaching the landing, null if none up to MAX_GLIDE_RATIO. */
  required: Route | null
  /** Route flown with the pilot's glide ratio, null if it does not reach the landing with the arrival height. */
  withGlideRatio: Route | null
  /** Height above the landing on arrival with the pilot's glide ratio, -Infinity if not reached at all. */
  arrivalAgl: number
  cellSize: number
  timings: { terrain: number; search: number }
}

/** Cells the route grid may use: smaller than the reach grid, as it is searched ~10 times. */
const ROUTE_MAX_CELLS = 1_000_000

interface Prepared {
  key: string
  prepared: PreparedGrid
  problem: ArrivalProblem
  startElevation: number
  landingElevation: number
  straightDistance: number
  required: Route | null
}

/**
 * Plans routes from the start to the landing. Keeps the last terrain and required
 * glide ratio: they do not depend on the pilot's glide ratio, which changes often.
 */
export class RoutePlanner {
  private last: Prepared | null = null
  private loadTiles: LoadTiles
  private options: GridOptions

  constructor(loadTiles: LoadTiles, options: GridOptions) {
    this.loadTiles = loadTiles
    this.options = options
  }

  async plan(req: RouteRequest): Promise<RouteResult> {
    const t0 = performance.now()
    const { glideRatio, ...rest } = req
    const key = JSON.stringify(rest)
    let searchTime = 0
    if (this.last?.key !== key) {
      this.last = null
      const prepared = await this.prepare(req, key)
      const t1 = performance.now()
      const found = findRequiredGlideRatio(prepared.prepared.elevationGrid, prepared.problem, prepared.straightDistance)
      prepared.required = found ? toRoute(prepared.prepared, prepared.problem, found) : null
      searchTime += performance.now() - t1
      this.last = prepared
    }
    const p = this.last!
    const t2 = performance.now()
    const arrival = arriveWith(p.prepared.elevationGrid, p.problem, glideRatio)
    searchTime += performance.now() - t2

    return {
      startElevation: p.startElevation,
      startAltitude: p.problem.startAltitude,
      landingElevation: p.landingElevation,
      straightDistance: p.straightDistance,
      required: p.required,
      withGlideRatio: arrival.ok ? toRoute(p.prepared, p.problem, arrival) : null,
      arrivalAgl: arrival.arrivalAgl,
      cellSize: p.prepared.cellSize,
      timings: { terrain: performance.now() - t0 - searchTime, search: searchTime },
    }
  }

  private async prepare(req: RouteRequest, key: string): Promise<Prepared> {
    const { start, landing, clearance, launchZone, arrivalHeight } = req
    const { maxZoom, maxRadius = DEFAULT_MAX_RADIUS } = this.options

    const straightDistance = localDistance(start, landing)
    if (straightDistance < 50) throw new PlanError('The landing is too close to the start.')
    if (straightDistance > 1.5 * maxRadius) {
      throw new PlanError(`The landing is ${Math.round(straightDistance / 1000)} km away: too far to plan.`)
    }
    const [startElevation, landingElevation] = await Promise.all([
      groundElevation(start, this.loadTiles, maxZoom),
      groundElevation(landing, this.loadTiles, maxZoom),
    ])
    const startAltitude = startAltitudeFrom(req.startHeight, req.startHeightMode, startElevation)

    // Centered between start and landing, with room for detours on all sides.
    const center = { lng: (start.lng + landing.lng) / 2, lat: (start.lat + landing.lat) / 2 }
    const radius = Math.min(maxRadius, straightDistance / 2 + Math.max(3000, 0.5 * straightDistance))
    const prepared = await loadElevationGrid(center, radius, start, launchZone, this.loadTiles, {
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
      startElevation,
      landingElevation,
      straightDistance,
      required: null,
    }
  }
}

function toRoute(prepared: PreparedGrid, problem: ArrivalProblem, arrival: Arrival): Route {
  const { grid, elevationGrid } = prepared
  const cells = traceRoute(arrival.result, problem.target)
  const profile = cells.map((cell): ProfilePoint => {
    const col = cell % grid.cols
    const row = (cell - col) / grid.cols
    const distance = arrival.result.distance[cell]
    const { lng, lat } = cellCenter(grid, col, row)
    return {
      distance,
      terrain: elevationGrid.elevation[cell],
      altitude: problem.startAltitude - distance / arrival.glideRatio,
      lng,
      lat,
    }
  })
  return {
    glideRatio: arrival.glideRatio,
    length: arrival.result.distance[problem.target],
    arrivalAgl: arrival.arrivalAgl,
    profile,
  }
}
