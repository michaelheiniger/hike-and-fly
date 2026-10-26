import { BASEMAPS, SLOPE_OVERLAY } from '../map/style'
import { tilesCovering } from '../terrain/terrarium'
import type { TileLoader } from '../terrain/loader'
import { AREA_CACHE_PREFIX, offlineElevationUrl } from './store'

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/** A downloaded area: its tiles live in the cache named AREA_CACHE_PREFIX + id. */
export interface OfflineArea {
  id: string
  name: string
  bounds: Bounds
  /** Finest map zoom stored. */
  mapMaxZoom: number
  tiles: number
  bytes: number
  /** ISO date. */
  created: string
  /** False when some tiles failed: the area may have gaps. */
  complete: boolean
}

export interface AreaPlan {
  bounds: Bounds
  mapMaxZoom: number
  /** URLs of map tiles (swisstopo map and slope classes). */
  mapTiles: string[]
  /** Elevation tiles [z, x, y]. */
  elevationTiles: [number, number, number][]
}

/** Map zooms stored, from an overview down to `mapMaxZoom`. */
export const MAP_MIN_ZOOM = 8

/** Elevation zooms used by the computations for the area itself (cells of ~10–60 m). */
const ELEVATION_FINE = [10, 13] as const
/** Coarse elevation around the area: the reach search looks for the lowest terrain far out. */
const ELEVATION_COARSE = [6, 9] as const
const COARSE_MARGIN = 60_000
const FINE_MARGIN = 5_000

/** Typical sizes per tile (measured around Grindelwald), for the estimate shown before downloading. */
const TYPICAL_BYTES = { map: 31_000, slope: 18_000, elevation: 127_000 }

function expand(b: Bounds, meters: number): Bounds {
  const dLat = meters / 111_000
  const dLng = meters / (111_000 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180))
  return {
    west: Math.max(-180, b.west - dLng),
    south: Math.max(-85, b.south - dLat),
    east: Math.min(180, b.east + dLng),
    north: Math.min(85, b.north + dLat),
  }
}

function tiles(b: Bounds, zooms: readonly [number, number]): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let z = zooms[0]; z <= zooms[1]; z++) {
    for (const [x, y] of tilesCovering(z, b.north, b.south, b.west, b.east)) out.push([z, x, y])
  }
  return out
}

const fill = (template: string, [z, x, y]: [number, number, number]) =>
  template.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`)

/** Everything to store for an area: map and slope tiles over it, elevation over it and around it. */
export function planArea(bounds: Bounds, mapMaxZoom: number): AreaPlan {
  const map = tiles(bounds, [MAP_MIN_ZOOM, mapMaxZoom])
  const elevation = [...tiles(expand(bounds, COARSE_MARGIN), ELEVATION_COARSE), ...tiles(expand(bounds, FINE_MARGIN), ELEVATION_FINE)]
  return {
    bounds,
    mapMaxZoom,
    mapTiles: [...map.map((t) => fill(BASEMAPS.swisstopo.tiles, t)), ...map.map((t) => fill(SLOPE_OVERLAY.tiles, t))],
    elevationTiles: elevation,
  }
}

export function estimateBytes(plan: AreaPlan): number {
  const maps = plan.mapTiles.length / 2
  return maps * (TYPICAL_BYTES.map + TYPICAL_BYTES.slope) + plan.elevationTiles.length * TYPICAL_BYTES.elevation
}

// --- Saved areas ---------------------------------------------------------------

const AREAS_KEY = 'hike-and-fly:areas'

export function listAreas(): OfflineArea[] {
  try {
    const stored = JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function saveAreas(areas: OfflineArea[]): void {
  try {
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas))
  } catch {
    // The tiles are stored regardless; only the list would be lost.
  }
}

export async function deleteArea(id: string): Promise<void> {
  await caches.delete(AREA_CACHE_PREFIX + id)
  saveAreas(listAreas().filter((a) => a.id !== id))
}

export function areaName(b: Bounds): string {
  const lat = (b.north + b.south) / 2
  const lng = (b.east + b.west) / 2
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`
}

// --- Download --------------------------------------------------------------------

export interface DownloadProgress {
  done: number
  total: number
  bytes: number
  failed: number
}

const CONCURRENCY = 6

async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await task()
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
    }
  }
}

/**
 * Downloads an area into its own cache and records it. Stops early when `signal`
 * aborts (the partial cache is deleted).
 */
export async function downloadArea(
  plan: AreaPlan,
  loader: TileLoader,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<OfflineArea> {
  const id = `${Date.now().toString(36)}`
  const cache = await caches.open(AREA_CACHE_PREFIX + id)
  // Ask the browser not to evict downloaded areas under storage pressure.
  await navigator.storage?.persist?.().catch(() => false)

  type Job = () => Promise<number>
  const jobs: Job[] = [
    ...plan.mapTiles.map((url): Job => async () => {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }))
      return blob.size
    }),
    ...plan.elevationTiles.map(([z, x, y]): Job => async () => {
      const blob = await loader.tileBytes(z, x, y, { offline: false })
      await cache.put(offlineElevationUrl(z, x, y), new Response(blob, { headers: { 'Content-Type': 'image/png' } }))
      return blob.size
    }),
  ]

  const progress: DownloadProgress = { done: 0, total: jobs.length, bytes: 0, failed: 0 }
  let next = 0
  const run = async () => {
    while (next < jobs.length && !signal.aborted) {
      const job = jobs[next++]
      try {
        // Await first: `progress.bytes += await …` would read the total before awaiting
        // and lose the other downloads' bytes.
        const size = await withRetry(job)
        progress.bytes += size
      } catch {
        if (signal.aborted) return
        progress.failed++
      }
      progress.done++
      onProgress({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run))

  if (signal.aborted) {
    await caches.delete(AREA_CACHE_PREFIX + id)
    throw new DOMException('Download cancelled', 'AbortError')
  }
  const area: OfflineArea = {
    id,
    name: areaName(plan.bounds),
    bounds: plan.bounds,
    mapMaxZoom: plan.mapMaxZoom,
    tiles: progress.done - progress.failed,
    bytes: progress.bytes,
    created: new Date().toISOString(),
    complete: progress.failed === 0,
  }
  saveAreas([...listAreas(), area])
  return area
}
