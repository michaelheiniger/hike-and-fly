import type { LngLat } from './terrain/geo'

/** Waypoints in a link: `lat,lng` pairs separated by semicolons, in order. */
export function formatWaypoints(waypoints: LngLat[]): string {
  return waypoints.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`).join(';')
}

/** Reads `formatWaypoints`, skipping malformed or impossible points. */
export function parseWaypoints(value: string | null): LngLat[] {
  if (!value) return []
  return value
    .split(';')
    .map((pair) => pair.split(',').map((v) => (v.trim() === '' ? NaN : Number(v))))
    .filter((v) => v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) <= 85 && Math.abs(v[1]) <= 180)
    .map(([lat, lng]) => ({ lat, lng }))
}
