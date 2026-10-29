import type { ElevationGrid } from '../glide/search'
import { cellMetrics, makeGeoGrid, zoomForCellSize, type GeoGrid, type LngLat } from '../terrain/geo'
import { sampleBilinear, sampleGrid, tilesCovering, type TileSet } from '../terrain/terrarium'

export type HeightMode = 'agl' | 'amsl'

export type LoadTiles = (z: number, coords: [number, number][]) => Promise<TileSet>

/** Exact ground elevation at a point from an external service, null when unavailable. */
export type PointElevation = (p: LngLat) => Promise<number | null>

/** Error with a message meant for the pilot. */
export class PlanError extends Error {}

export interface GridOptions {
  maxZoom: number
  /** Cell budget for the search grid. */
  maxCells?: number
  /** Finest cell size in meters. */
  minCellSize?: number
  /** Largest search radius in meters. */
  maxRadius?: number
  /** Exact start and landing elevations (the tiles keep the highest point per pixel). */
  pointElevation?: PointElevation
}

export const DEFAULT_MAX_RADIUS = 60_000

/** Lat/lon box of a square of `radius` around center, generously rounded. */
export function squareBox(center: LngLat, radius: number) {
  const dLat = radius / 111_000
  const dLng = radius / (111_000 * Math.cos((center.lat * Math.PI) / 180))
  return { north: center.lat + dLat, south: center.lat - dLat, west: center.lng - dLng, east: center.lng + dLng }
}

/**
 * Ground elevation at a point: exact from `pointElevation` when it answers, else
 * interpolated from tiles at the finest useful zoom.
 */
export async function groundElevation(p: LngLat, loadTiles: LoadTiles, options: GridOptions): Promise<number> {
  const exact = await options.pointElevation?.(p).catch(() => null)
  if (exact != null) return exact
  const z = Math.min(options.maxZoom, 14)
  const tiles = await loadTiles(z, tilesCovering(z, p.lat, p.lat, p.lng, p.lng))
  return sampleBilinear(tiles, z, p.lng, p.lat)
}

/** Start altitude AMSL from the start height and its reference. */
export function startAltitudeFrom(height: number, mode: HeightMode, ground: number): number {
  const altitude = mode === 'agl' ? ground + height : height
  if (altitude < ground - 0.5) {
    throw new PlanError(`Start altitude ${Math.round(altitude)} m is below the ground (${Math.round(ground)} m).`)
  }
  return altitude
}

/** True when the start is on the ground: a takeoff run is possible, not in the air. */
export const groundLaunch = (startAltitude: number, ground: number) => startAltitude - ground < 1

/** Lowest terrain within `radius` of a point, from coarse tiles. */
export async function lowestTerrain(center: LngLat, radius: number, loadTiles: LoadTiles, maxZoom: number): Promise<number> {
  const z = zoomForCellSize(radius / 64, center.lat, maxZoom)
  const box = squareBox(center, radius)
  const tiles = await loadTiles(z, tilesCovering(z, box.north, box.south, box.west, box.east))
  let lowest = Infinity
  for (const tile of tiles.values()) for (const v of tile) if (v < lowest) lowest = v
  return lowest
}

export interface PreparedGrid {
  grid: GeoGrid
  elevationGrid: ElevationGrid
  cellSize: number
  zoom: number
}

/**
 * Elevation grid of `radius` around `center`, as fine as the cell budget allows.
 * Within `trueRadius` of `start` the true elevation is used (see `sampleGrid`),
 * lowered to agree with `startGround`, the exact ground at the start.
 */
export async function loadElevationGrid(
  center: LngLat,
  radius: number,
  start: LngLat,
  trueRadius: number,
  startGround: number,
  loadTiles: LoadTiles,
  options: GridOptions,
): Promise<PreparedGrid> {
  const { maxZoom, maxCells = 2_250_000, minCellSize = 10 } = options
  const cellSize = Math.max(minCellSize, (2 * radius) / Math.sqrt(maxCells))
  const zoom = zoomForCellSize(cellSize, center.lat, maxZoom)
  const grid = makeGeoGrid(center, radius, cellSize)
  const box = squareBox(center, radius + 2 * cellSize)
  const tiles = await loadTiles(zoom, tilesCovering(zoom, box.north, box.south, box.west, box.east))
  const offset = Math.max(0, sampleBilinear(tiles, zoom, start.lng, start.lat) - startGround)
  const elevation = sampleGrid(tiles, zoom, grid, start, trueRadius, offset)
  const { cellHeight, rowCellWidth } = cellMetrics(grid)
  return { grid, elevationGrid: { cols: grid.cols, rows: grid.rows, elevation, cellHeight, rowCellWidth }, cellSize, zoom }
}
