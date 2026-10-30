/**
 * Downloaded tiles live in one Cache Storage cache shared by all areas, so a tile
 * in several areas is stored once. Elevation tiles are stored under synthetic
 * same-origin URLs, so the computation worker can read them directly (no service
 * worker needed); map tiles are stored under their real URLs and served by the
 * service worker.
 */

export const TILE_CACHE = 'hf-tiles'
/** Caches of areas downloaded before tiles were shared: one per area, still read and deleted. */
export const AREA_CACHE_PREFIX = 'hf-area-'

/** Key of the list of tiles an area uses, stored in TILE_CACHE next to the tiles. */
export function areaManifestUrl(id: string): string {
  return `${self.location.origin}${import.meta.env.BASE_URL}offline-areas/${id}.json`
}

/** Key of a downloaded elevation tile. */
export function offlineElevationUrl(z: number, x: number, y: number): string {
  return `${self.location.origin}${import.meta.env.BASE_URL}offline-elevation/${z}/${x}/${y}.png`
}

/** A downloaded elevation tile from any area, or undefined. Never throws. */
export async function offlineElevationTile(z: number, x: number, y: number): Promise<Blob | undefined> {
  try {
    if (typeof caches === 'undefined') return undefined
    const response = await caches.match(offlineElevationUrl(z, x, y))
    return response ? await response.blob() : undefined
  } catch {
    return undefined
  }
}
