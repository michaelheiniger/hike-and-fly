/**
 * Downloaded areas live in Cache Storage, one cache per area. Elevation tiles are
 * stored under synthetic same-origin URLs, so the computation worker can read them
 * directly (no service worker needed); map tiles are stored under their real URLs
 * and served by the service worker.
 */

export const AREA_CACHE_PREFIX = 'hf-area-'

/** Key of a downloaded elevation tile. */
export function offlineElevationUrl(z: number, x: number, y: number): string {
  return `${self.location.origin}/offline-elevation/${z}/${x}/${y}.png`
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
