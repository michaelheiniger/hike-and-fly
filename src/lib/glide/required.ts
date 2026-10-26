import { searchGlide, type ElevationGrid, type GlideParams, type GlideResult } from './search'

export interface ArrivalProblem extends Omit<GlideParams, 'glideRatio' | 'target'> {
  target: number
  /** Ground elevation at the landing (m AMSL). */
  targetElevation: number
  /** Required height above the landing on arrival (m). */
  arrivalHeight: number
}

export interface Arrival {
  glideRatio: number
  result: GlideResult
  /** Height above the landing on arrival (m), -Infinity when the landing cannot be reached at all. */
  arrivalAgl: number
  /** True when the landing is reached with at least the arrival height. */
  ok: boolean
}

/** Searches up to the landing with a given glide ratio. */
export function arriveWith(grid: ElevationGrid, problem: ArrivalProblem, glideRatio: number): Arrival {
  const result = searchGlide(grid, { ...problem, glideRatio })
  const d = result.distance[problem.target]
  const arrivalAgl = d === Infinity ? -Infinity : problem.startAltitude - d / glideRatio - problem.targetElevation
  return { glideRatio, result, arrivalAgl, ok: arrivalAgl >= problem.arrivalHeight }
}

/** Highest glide ratio considered: beyond any paraglider. */
export const MAX_GLIDE_RATIO = 25

/**
 * Smallest glide ratio reaching the landing with the arrival height, or null if
 * even MAX_GLIDE_RATIO does not. Reachability is monotonic in the glide ratio
 * (a better glider is higher everywhere), so a bisection finds it. The result is
 * rounded up to `precision`: conservative.
 */
export function findRequiredGlideRatio(
  grid: ElevationGrid,
  problem: ArrivalProblem,
  straightDistance: number,
  precision = 0.05,
): Arrival | null {
  const height = problem.startAltitude - problem.targetElevation - problem.arrivalHeight
  if (height <= 0) return null
  // No route is shorter than the straight line: a lower bound.
  let lo = straightDistance / height
  if (lo > MAX_GLIDE_RATIO) return null

  const first = arriveWith(grid, problem, Math.ceil(lo / precision) * precision)
  if (first.ok) return first
  let best = arriveWith(grid, problem, MAX_GLIDE_RATIO)
  if (!best.ok) return null
  let hi = MAX_GLIDE_RATIO
  lo = first.glideRatio

  while (hi - lo > precision) {
    const mid = Math.ceil((lo + hi) / 2 / precision) * precision
    if (mid >= hi) break
    const attempt = arriveWith(grid, problem, mid)
    if (attempt.ok) {
      hi = mid
      best = attempt
    } else {
      lo = mid
    }
  }
  return best
}
