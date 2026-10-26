import { TILE_SIZE } from './geo'
import { decodeTerrarium, tileKey, type TileSet } from './terrarium'

export interface TerrainSource {
  /** URL template with {z}, {x}, {y}. */
  url: string
  maxZoom: number
  /** Human-readable description of the data and its resolution. */
  description: string
  attribution: string
}

/** Global terrarium tiles hosted on AWS (Mapzen Terrain Tiles). */
export const AWS_TERRARIUM: TerrainSource = {
  url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  maxZoom: 15,
  description: 'AWS Terrain Tiles (global, ~10–30 m in the Alps)',
  attribution: 'Terrain: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen, AWS and data sources</a>',
}

const MAX_CONCURRENT = 8

/** Fetches and decodes terrarium tiles with an in-memory LRU cache. Needs OffscreenCanvas (workers). */
export class TileLoader {
  private cache = new Map<string, Float32Array>()
  private inFlight = new Map<string, Promise<Float32Array>>()
  private source: TerrainSource
  private cacheSize: number

  constructor(source: TerrainSource, cacheSize = 600) {
    this.source = source
    this.cacheSize = cacheSize
  }

  async load(z: number, coords: [number, number][]): Promise<TileSet> {
    const tiles: TileSet = new Map()
    const queue = [...coords]
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [x, y] = next
        tiles.set(tileKey(z, x, y), await this.tile(z, x, y))
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, coords.length) }, worker))
    return tiles
  }

  private tile(z: number, x: number, y: number): Promise<Float32Array> {
    const key = tileKey(z, x, y)
    const cached = this.cache.get(key)
    if (cached) {
      // Re-insert to mark as most recently used.
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve(cached)
    }
    let pending = this.inFlight.get(key)
    if (!pending) {
      pending = this.fetchTile(z, x, y).then(
        (data) => {
          this.inFlight.delete(key)
          this.cache.set(key, data)
          while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!)
          return data
        },
        (err) => {
          this.inFlight.delete(key)
          throw err
        },
      )
      this.inFlight.set(key, pending)
    }
    return pending
  }

  private async fetchTile(z: number, x: number, y: number): Promise<Float32Array> {
    const url = this.source.url.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Elevation tile ${z}/${x}/${y}: HTTP ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    })
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return decodeTerrarium(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data)
  }
}
