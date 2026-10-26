/** Geographic helpers: WGS84 local scale, Web Mercator tiles, lat/lon grids. */

export interface LngLat {
  lng: number
  lat: number
}

const WGS84_A = 6378137
const WGS84_E2 = 6.69437999014e-3
const DEG = Math.PI / 180

/** Meters per degree of latitude and longitude at a latitude (WGS84 ellipsoid). */
export function metersPerDegree(lat: number): { lat: number; lng: number } {
  const s = Math.sin(lat * DEG)
  const w = 1 - WGS84_E2 * s * s
  const meridian = (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w))
  const normal = WGS84_A / Math.sqrt(w)
  return { lat: meridian * DEG, lng: normal * Math.cos(lat * DEG) * DEG }
}

export const TILE_SIZE = 256

/** Web Mercator world pixel coordinates at zoom z. */
export function worldPixel(lng: number, lat: number, z: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** z
  return { x: ((lng + 180) / 360) * scale, y: mercatorY(lat) * scale }
}

/** Normalized Web Mercator y (0 at the north edge, 1 at the south edge). */
export function mercatorY(lat: number): number {
  const s = Math.sin(lat * DEG)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

/** Inverse of `mercatorY`. */
export function latFromMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

/** Ground size of a tile pixel in meters at zoom z and latitude. */
export function pixelSize(z: number, lat: number): number {
  return (2 * Math.PI * WGS84_A * Math.cos(lat * DEG)) / (TILE_SIZE * 2 ** z)
}

/** Coarsest zoom whose pixels are no larger than `cellSize`, capped at `maxZoom`. */
export function zoomForCellSize(cellSize: number, lat: number, maxZoom: number): number {
  for (let z = 0; z < maxZoom; z++) if (pixelSize(z, lat) <= cellSize) return z
  return maxZoom
}

/**
 * Axis-aligned lat/lon grid with square cells of about `cellSize` meters at its
 * center latitude. Row 0 is the northern edge.
 */
export interface GeoGrid {
  cols: number
  rows: number
  /** Latitude of the northern edge. */
  north: number
  /** Longitude of the western edge. */
  west: number
  dLat: number
  dLng: number
}

/** Square grid centered on `center` (the center cell contains it exactly at its middle). */
export function makeGeoGrid(center: LngLat, radius: number, cellSize: number): GeoGrid {
  const half = Math.ceil(radius / cellSize)
  const m = metersPerDegree(center.lat)
  const dLat = cellSize / m.lat
  const dLng = cellSize / m.lng
  const size = 2 * half + 1
  return {
    cols: size,
    rows: size,
    north: center.lat + (half + 0.5) * dLat,
    west: center.lng - (half + 0.5) * dLng,
    dLat,
    dLng,
  }
}

export function gridBounds(g: GeoGrid): { north: number; south: number; west: number; east: number } {
  return { north: g.north, south: g.north - g.rows * g.dLat, west: g.west, east: g.west + g.cols * g.dLng }
}

export function cellCenter(g: GeoGrid, col: number, row: number): LngLat {
  return { lat: g.north - (row + 0.5) * g.dLat, lng: g.west + (col + 0.5) * g.dLng }
}

/** Cell containing a point, or null when outside the grid. */
export function cellAt(g: GeoGrid, p: LngLat): { col: number; row: number } | null {
  const col = Math.floor((p.lng - g.west) / g.dLng)
  const row = Math.floor((g.north - p.lat) / g.dLat)
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return null
  return { col, row }
}

/** Metric cell sizes: north-south height and east-west width per row. */
export function cellMetrics(g: GeoGrid): { cellHeight: number; rowCellWidth: Float32Array } {
  const centerLat = g.north - (g.rows / 2) * g.dLat
  const rowCellWidth = new Float32Array(g.rows)
  for (let r = 0; r < g.rows; r++) {
    rowCellWidth[r] = g.dLng * metersPerDegree(g.north - (r + 0.5) * g.dLat).lng
  }
  return { cellHeight: g.dLat * metersPerDegree(centerLat).lat, rowCellWidth }
}

/** Great-circle-free local distance in meters between two nearby points. */
export function localDistance(a: LngLat, b: LngLat): number {
  const m = metersPerDegree((a.lat + b.lat) / 2)
  return Math.hypot((b.lng - a.lng) * m.lng, (b.lat - a.lat) * m.lat)
}
