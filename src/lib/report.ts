import type { Settings } from './settings.svelte'
import type { LngLat } from './terrain/geo'

/**
 * Reports go through Web3Forms (https://web3forms.com), which emails them to the
 * maintainer without the address appearing in the app or the repository. The access
 * key only says where to deliver: it is meant to be public and cannot read submissions.
 */
export const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'
const WEB3FORMS_ACCESS_KEY = 'f414638d-75d2-4f03-895c-20b82ab280a1'

export const REPORT_CATEGORIES = {
  results: 'Results look wrong',
  terrain: 'Map or elevation data',
  bug: 'Something does not work',
  other: 'Other',
} as const

export type ReportCategory = keyof typeof REPORT_CATEGORIES

/** What the app showed when the issue was reported. */
export interface ReportedResults {
  startElevation?: number
  landingElevation?: number
  /** Routes as shown: letter and description, length (m) and required glide ratio. */
  routes?: { name: string; length: number; requiredGlideRatio: number }[]
  /** Required glide ratio of the straight line (Infinity: blocked by terrain). */
  straightGlideRatio?: number
  reachCellSize?: number
  routeCellSize?: number
  elevationSource?: string
  /** Errors shown, if any. */
  errors?: string[]
}

export interface ReportContext {
  settings: Settings
  /** Link to the plan: it reopens the same start, landing, waypoints and settings. */
  planUrl: string
  results: ReportedResults
  version: string
  userAgent: string
  online: boolean
}

const point = (p: LngLat | null, elevation?: number) =>
  p ? `${p.lat.toFixed(5)}°, ${p.lng.toFixed(5)}°${elevation === undefined ? '' : ` (ground ${Math.round(elevation)} m)`}` : '—'

/** Glide ratios as the app shows them: rounded up to 0.1. */
const ratio = (gr: number) => (Number.isFinite(gr) ? (Math.ceil(gr * 10 - 1e-9) / 10).toFixed(1) : 'blocked by terrain')

const lines = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}: ${v}`).join('\n')

/** The plan: start, landing, waypoints and every setting, as text. */
export function reportPlan({ settings: s, results: r }: ReportContext): string {
  return lines([
    ['Start', point(s.start, r.startElevation)],
    ['Landing', point(s.landing, r.landingElevation)],
    ['Waypoints', s.waypoints.length ? s.waypoints.map((w, i) => `${i + 1}: ${point(w)}`).join('; ') : '—'],
    ['Start height', `${s.startHeight} m ${s.startHeightMode.toUpperCase()}`],
    ['Glide ratio', `${s.glideRatio}`],
    ['Terrain clearance', `${s.clearance} m`],
    ['Launch zone', `${s.launchZone} m`],
    ['Takeoff run', `${s.takeoffRun} m`],
    ['Arrival height', `${s.arrivalHeight} m`],
  ])
}

/** What the app showed, as text. */
export function reportResults({ results: r }: ReportContext): string {
  const shown: [string, string][] = []
  if (r.routes?.length) {
    shown.push(['Required glide ratio', ratio(r.routes[0].requiredGlideRatio)])
    for (const o of r.routes) shown.push([`Route ${o.name}`, `${(o.length / 1000).toFixed(1)} km, needs ${ratio(o.requiredGlideRatio)}`])
  }
  if (r.straightGlideRatio !== undefined) shown.push(['Straight line needs', ratio(r.straightGlideRatio)])
  if (r.routeCellSize !== undefined) shown.push(['Route grid', `${r.routeCellSize.toFixed(1)} m`])
  if (r.reachCellSize !== undefined) shown.push(['Reach grid', `${r.reachCellSize.toFixed(1)} m`])
  if (r.elevationSource) shown.push(['Elevation data', r.elevationSource])
  for (const e of r.errors ?? []) shown.push(['Error', e])
  return shown.length ? lines(shown) : 'No results yet.'
}

/** Everything attached to a report, as the reporter can read it before sending. */
export function reportDetails(context: ReportContext): string {
  return [
    `Plan link: ${context.planUrl}`,
    '',
    reportPlan(context),
    '',
    reportResults(context),
    '',
    `App version ${context.version} · ${context.online ? 'online' : 'offline'} · ${context.userAgent}`,
  ].join('\n')
}

/** The Web3Forms submission: the reporter's words, then what reproduces the plan. */
export function reportPayload(
  context: ReportContext,
  report: { category: ReportCategory; message: string; email: string },
): Record<string, string> {
  const payload: Record<string, string> = {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject: `Hike & Fly report: ${REPORT_CATEGORIES[report.category]}`,
    from_name: 'Hike & Fly Planner',
    category: REPORT_CATEGORIES[report.category],
    message: report.message,
    plan_link: context.planUrl,
    plan: reportPlan(context),
    results: reportResults(context),
    app_version: context.version,
    online: context.online ? 'yes' : 'no',
    user_agent: context.userAgent,
  }
  // Web3Forms replies to "email": left out rather than empty.
  const email = report.email.trim()
  if (email) payload.email = email
  return payload
}

/** Sends a report. Throws with the service's message when it is not accepted. */
export async function sendReport(payload: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.success) throw new Error(body.message || `HTTP ${response.status}`)
}
