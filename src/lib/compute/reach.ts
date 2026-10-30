import { computeAgl, flownSinceLiftoff, searchGlide } from '../glide/search'
import type { GeoGrid, LngLat } from '../terrain/geo'
import {
  DEFAULT_MAX_RADIUS,
  groundElevation,
  loadElevationGrid,
  lowestTerrain,
  groundLaunch,
  startAltitudeFrom,
  type GridOptions,
  type HeightMode,
  type LoadTiles,
} from './terrain'

export interface ReachRequest {
  start: LngLat
  /** Start height, interpreted according to `startHeightMode`. */
  startHeight: number
  startHeightMode: HeightMode
  glideRatio: number
  clearance: number
  launchZone: number
  /** Distance the pilot may run before lifting off, on a ground launch (m). */
  takeoffRun: number
}

export interface ReachResult {
  grid: GeoGrid
  /** Ground elevation at the start (true value, interpolated). */
  startElevation: number
  startAltitude: number
  cellSize: number
  zoom: number
  /** Meters AGL per cell, NaN where unreachable. */
  agl: Float32Array
  /** Meters flown per cell, Infinity where unreachable. */
  distance: Float32Array
  truncated: boolean
  /** Number of reachable cells; 1 means no glide is possible from the start. */
  reachableCells: number
  /** Distance flown at each cell's liftoff, null without a takeoff run (see GlideResult). */
  glideStart: Float32Array | null
  /** Ground elevation per cell (m AMSL): its highest point, as the search uses it. */
  elevation: Float32Array
  /** Reachable cells beyond the launch zone, which is left uncolored on the map. */
  beyondLaunchZone: number
  timings: { terrain: number; search: number }
}

/** Computes the area reachable from the start, with AGL over every cell. */
export async function computeReach(req: ReachRequest, loadTiles: LoadTiles, options: GridOptions): Promise<ReachResult> {
  const { start, glideRatio, clearance, launchZone, takeoffRun } = req
  const { maxZoom, maxRadius = DEFAULT_MAX_RADIUS } = options
  const t0 = performance.now()

  const startElevation = await groundElevation(start, loadTiles, options)
  const startAltitude = startAltitudeFrom(req.startHeight, req.startHeightMode, startElevation)

  // Size the search area from the lowest terrain within the largest possible range.
  const upperRadius = Math.min(maxRadius, Math.max(startAltitude, 1000) * glideRatio)
  const lowest = await lowestTerrain(start, upperRadius, loadTiles, maxZoom)
  const radius = Math.min(maxRadius, Math.max(0, startAltitude - lowest) * glideRatio * 1.05 + 500)

  const { grid, elevationGrid, cellSize, zoom } = await loadElevationGrid(start, radius, start, launchZone, startElevation, loadTiles, options)
  const t1 = performance.now()

  const center = (grid.cols - 1) / 2
  const { elevation } = elevationGrid
  // The start cell holds the true elevation, which a ground launch is exactly at.
  elevation[center * grid.cols + center] = Math.min(elevation[center * grid.cols + center], startAltitude)
  const result = searchGlide(elevationGrid, {
    startCol: center,
    startRow: center,
    startAltitude,
    glideRatio,
    clearance,
    launchZone,
    takeoffRun: groundLaunch(startAltitude, startElevation) ? takeoffRun : 0,
  })
  const agl = computeAgl(elevationGrid, result, startAltitude, glideRatio)
  let reachableCells = 0
  let beyondLaunchZone = 0
  for (let i = 0; i < result.distance.length; i++) {
    if (result.distance[i] === Infinity) continue
    reachableCells++
    if (flownSinceLiftoff(result, i) >= launchZone) beyondLaunchZone++
  }
  const t2 = performance.now()

  return {
    grid,
    startElevation,
    startAltitude,
    cellSize,
    zoom,
    agl,
    distance: result.distance,
    glideStart: result.glideStart,
    elevation,
    truncated: result.truncated,
    reachableCells,
    beyondLaunchZone,
    timings: { terrain: t1 - t0, search: t2 - t1 },
  }
}
