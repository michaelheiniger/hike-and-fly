import { TILE_SIZE, worldPixel, type GeoGrid, cellCenter, metersPerDegree } from './geo'

/**
 * The lowest dry land on Earth (Dead Sea shore, ~−430 m). The AWS tiles have sea
 * depths and rare spikes (down to −20775 m in Lombardy) below it: the surface is
 * what a glider meets.
 */
export const LOWEST_GROUND = -450

/** Decodes terrarium RGBA pixels: elevation = R·256 + G + B/256 − 32768, at least LOWEST_GROUND. */
export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const out = new Float32Array(rgba.length / 4)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = Math.max(LOWEST_GROUND, rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768)
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

/**
 * Numeric index over the tiles of a zoom level: pixel reads without building
 * string keys (sampling a large grid reads millions of pixels).
 */
class TileIndex {
  private x0: number
  private y0: number
  private nx: number
  private ny: number
  private grid: (Float32Array | undefined)[]
  private size: number

  constructor(tiles: TileSet, z: number) {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const prefix = `${z}/`
    for (const key of tiles.keys()) {
      if (!key.startsWith(prefix)) continue
      const [, x, y] = key.split('/').map(Number)
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    this.x0 = x0
    this.y0 = y0
    this.nx = x1 - x0 + 1
    this.ny = y1 - y0 + 1
    this.size = TILE_SIZE * 2 ** z
    this.grid = new Array(Math.max(0, this.nx * this.ny))
    for (let ty = 0; ty < this.ny; ty++) {
      for (let tx = 0; tx < this.nx; tx++) this.grid[ty * this.nx + tx] = tiles.get(tileKey(z, x0 + tx, y0 + ty))
    }
  }

  /** Tile containing a world pixel, if loaded. */
  tile(px: number, py: number): Float32Array | undefined {
    const ix = ((px / TILE_SIZE) | 0) - this.x0
    const iy = ((py / TILE_SIZE) | 0) - this.y0
    return px >= 0 && py >= 0 && ix >= 0 && iy >= 0 && ix < this.nx && iy < this.ny ? this.grid[iy * this.nx + ix] : undefined
  }

  /** Elevation of a world pixel. Throws if its tile is missing. */
  value(px: number, py: number): number {
    px = Math.min(Math.max(px, 0), this.size - 1)
    py = Math.min(Math.max(py, 0), this.size - 1)
    const tx = (px / TILE_SIZE) | 0
    const ty = (py / TILE_SIZE) | 0
    const ix = tx - this.x0
    const iy = ty - this.y0
    const tile = ix >= 0 && iy >= 0 && ix < this.nx && iy < this.ny ? this.grid[iy * this.nx + ix] : undefined
    if (!tile) throw new Error(`Missing elevation tile ${tx}/${ty}`)
    return tile[(py - ty * TILE_SIZE) * TILE_SIZE + (px - tx * TILE_SIZE)]
  }
}

/** Bilinear elevation at a point: the best estimate of the true ground height. */
export function sampleBilinear(tiles: TileSet, z: number, lng: number, lat: number): number {
  return bilinear(new TileIndex(tiles, z), z, lng, lat)
}

function bilinear(index: TileIndex, z: number, lng: number, lat: number): number {
  const { x, y } = worldPixel(lng, lat, z)
  const fx = x - 0.5
  const fy = y - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const v00 = index.value(x0, y0)
  const v10 = index.value(x0 + 1, y0)
  const v01 = index.value(x0, y0 + 1)
  const v11 = index.value(x0 + 1, y0 + 1)
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
}

/**
 * Elevation of every grid cell. Obstacles must never be underestimated, so a cell
 * takes the maximum of the 2×2 pixels around its center. Within `trueRadius` of
 * `center` the bilinear value is used instead: the max would make the slope
 * below a launch look flatter than it is and block ground launches. `trueOffset`
 * is subtracted there: tiles that keep their highest point read a few meters
 * above the exact ground, which would put the cells next to a launch above it.
 */
export function sampleGrid(
  tiles: TileSet,
  z: number,
  grid: GeoGrid,
  center: { lng: number; lat: number },
  trueRadius: number,
  trueOffset = 0,
): Float32Array {
  const { cols, rows } = grid
  const index = new TileIndex(tiles, z)
  const out = new Float32Array(cols * rows)
  const colPx = new Float64Array(cols)
  for (let c = 0; c < cols; c++) colPx[c] = worldPixel(cellCenter(grid, c, 0).lng, 0, z).x - 0.5
  const m = metersPerDegree(center.lat)
  const trueRadius2 = trueRadius * trueRadius

  for (let r = 0; r < rows; r++) {
    const lat = cellCenter(grid, 0, r).lat
    const y0 = Math.floor(worldPixel(0, lat, z).y - 0.5)
    const dy = (lat - center.lat) * m.lat
    const ly = y0 % TILE_SIZE
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const lng = grid.west + (c + 0.5) * grid.dLng
      const dx = (lng - center.lng) * m.lng
      if (dx * dx + dy * dy <= trueRadius2) {
        out[i] = bilinear(index, z, lng, lat) - trueOffset
        continue
      }
      const x0 = Math.floor(colPx[c])
      const lx = x0 % TILE_SIZE
      // Fast path: the 2×2 pixels lie within one tile.
      const tile = lx < TILE_SIZE - 1 && ly < TILE_SIZE - 1 ? index.tile(x0, y0) : undefined
      if (tile) {
        const p = ly * TILE_SIZE + lx
        out[i] = Math.max(tile[p], tile[p + 1], tile[p + TILE_SIZE], tile[p + TILE_SIZE + 1])
      } else {
        out[i] = Math.max(
          index.value(x0, y0),
          index.value(x0 + 1, y0),
          index.value(x0, y0 + 1),
          index.value(x0 + 1, y0 + 1),
        )
      }
    }
  }
  return out
}
