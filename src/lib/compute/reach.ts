import { computeAgl, searchGlide } from '../glide/search'
import { cellMetrics, makeGeoGrid, zoomForCellSize, type GeoGrid, type LngLat } from '../terrain/geo'
import { sampleBilinear, sampleGrid, tilesCovering, type TileSet } from '../terrain/terrarium'

export type HeightMode = 'agl' | 'amsl'

export interface ReachRequest {
  start: LngLat
  /** Start height, interpreted according to `startHeightMode`. */
  startHeight: number
  startHeightMode: HeightMode
  glideRatio: number
  clearance: number
  launchZone: number
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
  timings: { terrain: number; search: number }
}

export type LoadTiles = (z: number, coords: [number, number][]) => Promise<TileSet>

export interface ReachOptions {
  maxZoom: number
  /** Cell budget for the search grid. */
  maxCells?: number
  /** Finest cell size in meters. */
  minCellSize?: number
  /** Largest search radius in meters. */
  maxRadius?: number
}

export class ReachError extends Error {}

const SQUARE_DEGREES = (radius: number, center: LngLat) => {
  // Bounding box of a square grid of `radius` around center, generously rounded.
  const dLat = radius / 111_000
  const dLng = radius / (111_000 * Math.cos((center.lat * Math.PI) / 180))
  return { north: center.lat + dLat, south: center.lat - dLat, west: center.lng - dLng, east: center.lng + dLng }
}

/** Computes the area reachable from the start, with AGL over every cell. */
export async function computeReach(req: ReachRequest, loadTiles: LoadTiles, options: ReachOptions): Promise<ReachResult> {
  const { start, glideRatio, clearance, launchZone } = req
  const { maxZoom, maxCells = 2_250_000, minCellSize = 10, maxRadius = 60_000 } = options
  const t0 = performance.now()

  // True ground elevation at the start.
  const fineZoom = Math.min(maxZoom, 14)
  const startTiles = await loadTiles(fineZoom, tilesCovering(fineZoom, start.lat, start.lat, start.lng, start.lng))
  const startElevation = sampleBilinear(startTiles, fineZoom, start.lng, start.lat)
  const startAltitude = req.startHeightMode === 'agl' ? startElevation + req.startHeight : req.startHeight
  if (startAltitude < startElevation - 0.5) {
    throw new ReachError(`Start altitude ${Math.round(startAltitude)} m is below the ground (${Math.round(startElevation)} m).`)
  }

  // Size the search area from the lowest terrain within the largest possible range.
  const upperRadius = Math.min(maxRadius, Math.max(startAltitude, 1000) * glideRatio)
  const coarseZoom = zoomForCellSize(upperRadius / 64, start.lat, maxZoom)
  const box = SQUARE_DEGREES(upperRadius, start)
  const coarse = await loadTiles(coarseZoom, tilesCovering(coarseZoom, box.north, box.south, box.west, box.east))
  let lowest = Infinity
  for (const tile of coarse.values()) for (const v of tile) if (v < lowest) lowest = v
  const radius = Math.min(maxRadius, Math.max(0, startAltitude - lowest) * glideRatio * 1.05 + 500)

  const cellSize = Math.max(minCellSize, (2 * radius) / Math.sqrt(maxCells))
  const zoom = zoomForCellSize(cellSize, start.lat, maxZoom)
  const grid = makeGeoGrid(start, radius, cellSize)
  const bounds = SQUARE_DEGREES(radius + 2 * cellSize, start)
  const tiles = await loadTiles(zoom, tilesCovering(zoom, bounds.north, bounds.south, bounds.west, bounds.east))
  const elevation = sampleGrid(tiles, zoom, grid, start, launchZone)
  const { cellHeight, rowCellWidth } = cellMetrics(grid)
  const t1 = performance.now()

  const center = (grid.cols - 1) / 2
  const elevationGrid = { cols: grid.cols, rows: grid.rows, elevation, cellHeight, rowCellWidth }
  // The start cell holds the true elevation, which a ground launch is exactly at.
  elevation[center * grid.cols + center] = Math.min(elevation[center * grid.cols + center], startAltitude)
  const result = searchGlide(elevationGrid, {
    startCol: center,
    startRow: center,
    startAltitude,
    glideRatio,
    clearance,
    launchZone,
  })
  const agl = computeAgl(elevationGrid, result, startAltitude, glideRatio)
  let reachableCells = 0
  for (const d of result.distance) if (d !== Infinity) reachableCells++
  const t2 = performance.now()

  return {
    grid,
    startElevation,
    startAltitude,
    cellSize,
    zoom,
    agl,
    distance: result.distance,
    truncated: result.truncated,
    reachableCells,
    timings: { terrain: t1 - t0, search: t2 - t1 },
  }
}
