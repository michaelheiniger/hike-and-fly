import type { HeightMode } from './compute/terrain'
import { BASEMAPS, type BasemapId } from './map/style'
import type { ColorScheme } from './render/agl'
import type { LngLat } from './terrain/geo'
import { formatWaypoints, parseWaypoints } from './waypoints'

export interface Settings {
  start: LngLat | null
  landing: LngLat | null
  /** Points to fly over on the way to the landing, in order. */
  waypoints: LngLat[]
  startHeight: number
  startHeightMode: HeightMode
  glideRatio: number
  clearance: number
  launchZone: number
  takeoffRun: number
  arrivalHeight: number
}

/** The settings that are not specific to a plan's places. */
export type Assumptions = Omit<Settings, 'start' | 'landing' | 'waypoints'>

export const DEFAULTS: Assumptions = {
  startHeight: 0,
  startHeightMode: 'agl',
  glideRatio: 5,
  clearance: 50,
  launchZone: 500,
  takeoffRun: 30,
  arrivalHeight: 100,
}

/** Limits for inputs and URL values. */
export const LIMITS = {
  startHeight: [-500, 9000],
  glideRatio: [1, 20],
  clearance: [0, 1000],
  launchZone: [0, 5000],
  takeoffRun: [0, 200],
  arrivalHeight: [0, 1000],
} as const

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

/** The glide ratio is set in half steps. */
export const GLIDE_STEP = 0.5
export const roundGlideRatio = (v: number) => Math.round(v / GLIDE_STEP) * GLIDE_STEP

/**
 * Assumptions that differ from their defaults are kept in this browser, so they last
 * beyond a session (the installed app opens without them in its URL). A link's values
 * take precedence; places (start, landing, waypoints) belong to a plan and are not kept.
 */
const ASSUMPTIONS_KEY = 'hike-and-fly:assumptions'

function readStoredAssumptions(): Partial<Record<keyof Assumptions, unknown>> {
  try {
    const stored = JSON.parse(localStorage.getItem(ASSUMPTIONS_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? stored : {}
  } catch {
    return {}
  }
}

const assumptionsOf = (s: Settings): Assumptions =>
  Object.fromEntries((Object.keys(DEFAULTS) as (keyof Assumptions)[]).map((k) => [k, s[k]])) as unknown as Assumptions

function readUrl(): Settings {
  const p = new URLSearchParams(location.hash.slice(1))
  const stored = readStoredAssumptions()
  /** The link's value, else the stored one. */
  const raw = (urlKey: string, key: keyof Assumptions): string | null =>
    p.get(urlKey) ?? (stored[key] == null ? null : String(stored[key]))
  const num = (urlKey: string, key: keyof typeof LIMITS) => {
    const r = raw(urlKey, key)
    const v = Number(r)
    return r !== null && Number.isFinite(v) ? clamp(v, LIMITS[key]) : DEFAULTS[key]
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
    waypoints: parseWaypoints(p.get('wp')),
    startHeight: num('h', 'startHeight'),
    startHeightMode: raw('hm', 'startHeightMode') === 'amsl' ? 'amsl' : 'agl',
    glideRatio: roundGlideRatio(num('gr', 'glideRatio')),
    clearance: num('cl', 'clearance'),
    launchZone: num('lz', 'launchZone'),
    takeoffRun: num('tr', 'takeoffRun'),
    arrivalHeight: num('ar', 'arrivalHeight'),
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
  if (s.waypoints.length) p.set('wp', formatWaypoints(s.waypoints))
  // Every setting is written, so a link keeps its values when the defaults change.
  p.set('h', `${s.startHeight}`)
  p.set('hm', s.startHeightMode)
  p.set('gr', `${s.glideRatio}`)
  p.set('cl', `${s.clearance}`)
  p.set('lz', `${s.launchZone}`)
  p.set('tr', `${s.takeoffRun}`)
  p.set('ar', `${s.arrivalHeight}`)
  history.replaceState(null, '', `#${p}`)
}

export const settings: Settings = $state(readUrl())

/** The assumptions as loaded: opening a link stores nothing until one of them is changed. */
const loadedAssumptions = JSON.stringify(assumptionsOf(settings))
let assumptionsChanged = false

/** Stores the assumptions that differ from their defaults, once any has been changed. */
export function saveAssumptions(s: Settings): void {
  const current = assumptionsOf(s)
  if (!assumptionsChanged && JSON.stringify(current) === loadedAssumptions) return
  assumptionsChanged = true
  const changed = Object.fromEntries(Object.entries(current).filter(([k, v]) => v !== DEFAULTS[k as keyof Assumptions]))
  try {
    if (Object.keys(changed).length) localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify(changed))
    else localStorage.removeItem(ASSUMPTIONS_KEY)
  } catch {
    // Storage unavailable (private mode, blocked): the values last for this visit.
  }
}

/** Per-viewer display preferences: kept in this browser, not in shared links. */
export interface Preferences {
  colorScheme: ColorScheme
  /** swisstopo slope classes over 30°. */
  showSlope: boolean
  /** Outlines of the areas downloaded for offline use. */
  showOfflineAreas: boolean
  basemap: BasemapId
  /** Finest map zoom for offline downloads. */
  offlineMapZoom: number
  /** Language of the interface. */
  language: Language
}

const OFFLINE_MAP_ZOOMS = [13, 14, 15, 16]

export type Language = 'en' | 'fr' | 'de'
export const LANGUAGES: Language[] = ['en', 'fr', 'de']

/** The browser's first supported language, else English. */
function browserLanguage(): Language {
  const tags = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  for (const tag of tags) {
    const code = tag?.slice(0, 2).toLowerCase()
    if (LANGUAGES.includes(code as Language)) return code as Language
  }
  return 'en'
}

const PREFERENCES_KEY = 'hike-and-fly:preferences'

function readPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')
    return {
      colorScheme: stored.colorScheme === 'colorblind' ? 'colorblind' : 'standard',
      showSlope: stored.showSlope === true,
      showOfflineAreas: stored.showOfflineAreas !== false,
      basemap: Object.hasOwn(BASEMAPS, stored.basemap) ? stored.basemap : 'swisstopo',
      offlineMapZoom: OFFLINE_MAP_ZOOMS.includes(stored.offlineMapZoom) ? stored.offlineMapZoom : 14,
      language: LANGUAGES.includes(stored.language) ? stored.language : browserLanguage(),
    }
  } catch {
    return {
      colorScheme: 'standard',
      showSlope: false,
      showOfflineAreas: true,
      basemap: 'swisstopo',
      offlineMapZoom: 14,
      language: browserLanguage(),
    }
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
