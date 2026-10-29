import type { HeightMode } from './compute/terrain'
import type { ColorScheme } from './render/agl'
import type { LngLat } from './terrain/geo'

export interface Settings {
  start: LngLat | null
  landing: LngLat | null
  startHeight: number
  startHeightMode: HeightMode
  glideRatio: number
  clearance: number
  launchZone: number
  arrivalHeight: number
}

export const DEFAULTS: Omit<Settings, 'start' | 'landing'> = {
  startHeight: 0,
  startHeightMode: 'agl',
  glideRatio: 5,
  clearance: 50,
  launchZone: 500,
  arrivalHeight: 100,
}

/** What each assumption means, shown next to it in the panel. */
export const EXPLANATIONS = {
  startHeight:
    'Height at the start. 0 m AGL is a ground launch. Use a higher value to plan a final glide after climbing in a thermal.',
  glideRatio:
    'Still-air glide ratio. The default of 5 is pessimistic on purpose: a light hike & fly wing does about 7 at trim, and the margin covers sinking air and headwind.',
  clearance:
    'Minimum height above terrain to fly over it and continue. Margin for sink, turbulence near slopes and elevation data errors. Areas below it (lowest legend band) are reachable as a final glide only.',
  launchZone:
    'After the start, the clearance grows from 0 to its full value over this distance — otherwise no ground launch would be possible. The ramp is cubic: required clearance = clearance × (distance flown ÷ launch zone)³. It grows slowly at first (1/64 at a quarter, 1/8 at mid-distance, about 2/5 at three quarters), then quickly towards the end.',
  arrivalHeight:
    'Height above the landing when arriving, for the landing pattern. The required glide ratio includes it.',
  wind: 'Not modelled yet: computations assume still air. Headwind and sink shrink the reachable area.',
} as const

/** Limits for inputs and URL values. */
export const LIMITS = {
  startHeight: [-500, 9000],
  glideRatio: [1, 20],
  clearance: [0, 1000],
  launchZone: [0, 5000],
  arrivalHeight: [0, 1000],
} as const

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

/** The glide ratio is set in half steps. */
export const GLIDE_STEP = 0.5
export const roundGlideRatio = (v: number) => Math.round(v / GLIDE_STEP) * GLIDE_STEP

function readUrl(): Settings {
  const p = new URLSearchParams(location.hash.slice(1))
  const num = (key: string, fallback: number, limits: readonly [number, number]) => {
    const v = Number(p.get(key))
    return p.has(key) && Number.isFinite(v) ? clamp(v, limits) : fallback
  }
  const point = (latKey: string, lngKey: string): LngLat | null => {
    const lat = Number(p.get(latKey))
    const lng = Number(p.get(lngKey))
    const valid = p.has(latKey) && p.has(lngKey) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180
    return valid ? { lat, lng } : null
  }
  return {
    start: point('lat', 'lng'),
    landing: point('llat', 'llng'),
    startHeight: num('h', DEFAULTS.startHeight, LIMITS.startHeight),
    startHeightMode: p.get('hm') === 'amsl' ? 'amsl' : 'agl',
    glideRatio: roundGlideRatio(num('gr', DEFAULTS.glideRatio, LIMITS.glideRatio)),
    clearance: num('cl', DEFAULTS.clearance, LIMITS.clearance),
    launchZone: num('lz', DEFAULTS.launchZone, LIMITS.launchZone),
    arrivalHeight: num('ar', DEFAULTS.arrivalHeight, LIMITS.arrivalHeight),
  }
}

export function writeUrl(s: Settings): void {
  const p = new URLSearchParams()
  if (s.start) {
    p.set('lat', s.start.lat.toFixed(5))
    p.set('lng', s.start.lng.toFixed(5))
  }
  if (s.landing) {
    p.set('llat', s.landing.lat.toFixed(5))
    p.set('llng', s.landing.lng.toFixed(5))
  }
  // Every setting is written, so a link keeps its values when the defaults change.
  p.set('h', `${s.startHeight}`)
  p.set('hm', s.startHeightMode)
  p.set('gr', `${s.glideRatio}`)
  p.set('cl', `${s.clearance}`)
  p.set('lz', `${s.launchZone}`)
  p.set('ar', `${s.arrivalHeight}`)
  history.replaceState(null, '', `#${p}`)
}

export const settings: Settings = $state(readUrl())

/** Per-viewer display preferences: kept in this browser, not in shared links. */
export interface Preferences {
  colorScheme: ColorScheme
  /** swisstopo slope classes over 30°. */
  showSlope: boolean
}

const PREFERENCES_KEY = 'hike-and-fly:preferences'

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')
    return { colorScheme: stored.colorScheme === 'colorblind' ? 'colorblind' : 'standard', showSlope: stored.showSlope === true }
  } catch {
    return { colorScheme: 'standard', showSlope: false }
  }
}

export function savePreferences(p: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(p))
  } catch {
    // Storage unavailable (private mode, blocked): the preference lasts for this visit.
  }
}

export const preferences: Preferences = $state(readPreferences())
