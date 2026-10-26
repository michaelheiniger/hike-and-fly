import { TILE_SIZE, worldPixel, type GeoGrid, cellCenter, metersPerDegree } from './geo'

/** Decodes terrarium RGBA pixels: elevation = R·256 + G + B/256 − 32768. */
export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const out = new Float32Array(rgba.length / 4)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768
  }
  return out
}

/** Decoded elevation tiles (TILE_SIZE² values, row-major), keyed by `z/x/y`. */
export type TileSet = Map<string, Float32Array>

export const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`

/** Tiles at zoom z covering a lat/lon box, with a one-pixel margin for neighbourhood sampling. */
export function tilesCovering(z: number, north: number, south: number, west: number, east: number): [number, number][] {
  const nw = worldPixel(west, north, z)
  const se = worldPixel(east, south, z)
  const n = 2 ** z
  const x0 = Math.max(0, Math.floor((nw.x - 1) / TILE_SIZE))
  const x1 = Math.min(n - 1, Math.floor((se.x + 1) / TILE_SIZE))
  const y0 = Math.max(0, Math.floor((nw.y - 1) / TILE_SIZE))
  const y1 = Math.min(n - 1, Math.floor((se.y + 1) / TILE_SIZE))
  const tiles: [number, number][] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push([x, y])
  return tiles
}

/** Elevation of a world pixel at zoom z. Throws if its tile is missing. */
function pixelValue(tiles: TileSet, z: number, px: number, py: number): number {
  const n = TILE_SIZE * 2 ** z
  px = Math.min(Math.max(px, 0), n - 1)
  py = Math.min(Math.max(py, 0), n - 1)
  const tx = Math.floor(px / TILE_SIZE)
  const ty = Math.floor(py / TILE_SIZE)
  const tile = tiles.get(tileKey(z, tx, ty))
  if (!tile) throw new Error(`Missing elevation tile ${tileKey(z, tx, ty)}`)
  return tile[(py - ty * TILE_SIZE) * TILE_SIZE + (px - tx * TILE_SIZE)]
}

/** Bilinear elevation at a point: the best estimate of the true ground height. */
export function sampleBilinear(tiles: TileSet, z: number, lng: number, lat: number): number {
  const { x, y } = worldPixel(lng, lat, z)
  const fx = x - 0.5
  const fy = y - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const v00 = pixelValue(tiles, z, x0, y0)
  const v10 = pixelValue(tiles, z, x0 + 1, y0)
  const v01 = pixelValue(tiles, z, x0, y0 + 1)
  const v11 = pixelValue(tiles, z, x0 + 1, y0 + 1)
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
}

/**
 * Elevation of every grid cell. Obstacles must never be underestimated, so a cell
 * takes the maximum of the 2×2 pixels around its center. Within `trueRadius` of
 * `center` the bilinear value is used instead: the max would make the slope
 * below a launch look flatter than it is and block ground launches.
 */
export function sampleGrid(
  tiles: TileSet,
  z: number,
  grid: GeoGrid,
  center: { lng: number; lat: number },
  trueRadius: number,
): Float32Array {
  const { cols, rows } = grid
  const out = new Float32Array(cols * rows)
  const colPx = new Float64Array(cols)
  for (let c = 0; c < cols; c++) colPx[c] = worldPixel(cellCenter(grid, c, 0).lng, 0, z).x - 0.5
  const m = metersPerDegree(center.lat)

  for (let r = 0; r < rows; r++) {
    const lat = cellCenter(grid, 0, r).lat
    const fy = worldPixel(0, lat, z).y - 0.5
    const y0 = Math.floor(fy)
    const dy = (lat - center.lat) * m.lat
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const lng = grid.west + (c + 0.5) * grid.dLng
      if (trueRadius > 0 && Math.hypot((lng - center.lng) * m.lng, dy) <= trueRadius) {
        out[i] = sampleBilinear(tiles, z, lng, lat)
        continue
      }
      const x0 = Math.floor(colPx[c])
      out[i] = Math.max(
        pixelValue(tiles, z, x0, y0),
        pixelValue(tiles, z, x0 + 1, y0),
        pixelValue(tiles, z, x0, y0 + 1),
        pixelValue(tiles, z, x0 + 1, y0 + 1),
      )
    }
  }
  return out
}
