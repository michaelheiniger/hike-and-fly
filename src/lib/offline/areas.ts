import { BASEMAPS, SLOPE_OVERLAY } from '../map/style'
import { tilesCovering } from '../terrain/terrarium'
import type { TileLoader } from '../terrain/loader'
import { AREA_CACHE_PREFIX, TILE_CACHE, areaManifestUrl, offlineElevationUrl } from './store'

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * A downloaded area: its tiles live in TILE_CACHE, shared with other areas, and are
 * listed in its manifest (areaManifestUrl). Areas downloaded before tiles were
 * shared have no manifest and their own cache, AREA_CACHE_PREFIX + id.
 */
export interface OfflineArea {
  id: string
  name: string
  bounds: Bounds
  /** Finest map zoom stored. */
  mapMaxZoom: number
  tiles: number
  /** Size of the area's tiles, including those shared with other areas. */
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

/** Keys of the tiles an area uses; empty for areas without a manifest. */
async function manifest(cache: Cache, id: string): Promise<string[]> {
  const response = await cache.match(areaManifestUrl(id))
  return response ? await response.json() : []
}

/** Deletes those of `keys` that no saved area uses any more. */
async function releaseTiles(cache: Cache, keys: Iterable<string>): Promise<void> {
  const used = new Set<string>()
  for (const area of listAreas()) for (const key of await manifest(cache, area.id)) used.add(key)
  for (const key of keys) if (!used.has(key)) await cache.delete(key)
}

/** Deletes an area and the tiles that only it uses. */
export async function deleteArea(id: string): Promise<void> {
  const cache = await caches.open(TILE_CACHE)
  const keys = await manifest(cache, id)
  saveAreas(listAreas().filter((a) => a.id !== id))
  await releaseTiles(cache, keys)
  await cache.delete(areaManifestUrl(id))
  await caches.delete(AREA_CACHE_PREFIX + id)
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
  /** Tiles already stored for another area, not downloaded again. */
  reused: number
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
 * Downloads the tiles of an area that are not stored yet and records the area.
 * An area with the same bounds and detail is replaced. Stops early when `signal`
 * aborts (the tiles downloaded so far are deleted).
 */
export async function downloadArea(
  plan: AreaPlan,
  loader: TileLoader,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<OfflineArea> {
  const id = `${Date.now().toString(36)}`
  const cache = await caches.open(TILE_CACHE)
  // Ask the browser not to evict downloaded areas under storage pressure.
  await navigator.storage?.persist?.().catch(() => false)

  type Tile = { key: string; get: () => Promise<Blob> }
  const tiles: Tile[] = [
    ...plan.mapTiles.map((url) => ({
      key: url,
      get: async () => {
        const response = await fetch(url, { signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.blob()
      },
    })),
    ...plan.elevationTiles.map(([z, x, y]) => ({
      key: offlineElevationUrl(z, x, y),
      get: () => loader.tileBytes(z, x, y, { offline: false }),
    })),
  ]

  const progress: DownloadProgress = { done: 0, total: tiles.length, bytes: 0, failed: 0, reused: 0 }
  const stored: string[] = []
  const added: string[] = []
  let next = 0
  const run = async () => {
    while (next < tiles.length && !signal.aborted) {
      const tile = tiles[next++]
      try {
        const hit = await cache.match(tile.key)
        // Await first: `progress.bytes += await …` would read the total before awaiting
        // and lose the other downloads' bytes.
        const blob = hit ? await hit.blob() : await withRetry(tile.get)
        if (!hit) {
          await cache.put(tile.key, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/png' } }))
          added.push(tile.key)
        } else progress.reused++
        stored.push(tile.key)
        progress.bytes += blob.size
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
    await releaseTiles(cache, added)
    throw new DOMException('Download cancelled', 'AbortError')
  }
  await cache.put(areaManifestUrl(id), Response.json(stored))
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
  // Record the new area before deleting the one it replaces, so their shared tiles stay.
  const replaced = listAreas().filter(
    (a) => a.mapMaxZoom === area.mapMaxZoom && (Object.keys(area.bounds) as (keyof Bounds)[]).every((k) => a.bounds[k] === area.bounds[k]),
  )
  saveAreas([...listAreas(), area])
  for (const old of replaced) await deleteArea(old.id)
  return area
}
