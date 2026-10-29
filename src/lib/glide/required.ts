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

/** Grid routes run up to ~3 % longer than straight lines (16-neighbour moves). */
const GRID_SLACK = 1.03

/** Growth of the guesses while none reaches the landing. */
const GUESS_GROWTH = 1.25

export interface RatioHints {
  /** Likely answer, e.g. the straight line over the terrain: the first guess. */
  estimate?: number
  /** A ratio known to be needed at least (a less blocked grid needed it): smaller ones are not tried. */
  atLeast?: number
}

/**
 * Smallest glide ratio reaching the landing with the arrival height, or null if
 * even MAX_GLIDE_RATIO does not. Reachability is monotonic in the glide ratio
 * (a better glider is higher everywhere), so ratios are tried on a grid of
 * `precision` and the smallest reaching one is bracketed: guesses from the hints,
 * growing until one reaches, then a bisection down to the last failure. After two
 * misses MAX_GLIDE_RATIO is tried, so an unreachable landing is known quickly. The
 * result is the same whatever the guesses; good ones only save searches. It is
 * rounded up to `precision`: conservative.
 */
export function findRequiredGlideRatio(
  grid: ElevationGrid,
  problem: ArrivalProblem,
  straightDistance: number,
  precision = 0.05,
  hints: RatioHints = {},
): Arrival | null {
  const height = problem.startAltitude - problem.targetElevation - problem.arrivalHeight
  if (height <= 0) return null
  // No route is shorter than the straight line: a lower bound.
  const bound = straightDistance / height
  if (bound > MAX_GLIDE_RATIO) return null

  // Ratios are k × precision. `fail` is the largest k known to fail, `best` the smallest reaching one.
  const last = Math.floor(MAX_GLIDE_RATIO / precision + 1e-9)
  const step = (ratio: number) => Math.ceil(ratio / precision - 1e-9)
  let fail = Math.max(step(bound), hints.atLeast ? step(hints.atLeast) : 0) - 1
  const attempt = (k: number) => arriveWith(grid, problem, k * precision)

  let best: Arrival | null = null
  let bestK = 0
  /** The search at MAX_GLIDE_RATIO, once tried. */
  let ceiling: Arrival | null = null
  let misses = 0
  let k = Math.max(fail + 1, step(Math.max(bound, hints.estimate ?? 0, hints.atLeast ?? 0) * GRID_SLACK))
  while (!best) {
    k = Math.min(k, last)
    const arrival = k === last && ceiling ? ceiling : attempt(k)
    if (arrival.ok) {
      best = arrival
      bestK = k
    } else {
      if (k >= last) return null
      fail = k
      // Far off the guess: first make sure the landing can be reached at all.
      if (++misses === 2) {
        ceiling = attempt(last)
        if (!ceiling.ok) return null
      }
      k = Math.max(k + 1, Math.ceil(k * GUESS_GROWTH))
    }
  }

  while (bestK - fail > 1) {
    const mid = (fail + bestK) >> 1
    const arrival = attempt(mid)
    if (arrival.ok) {
      best = arrival
      bestK = mid
    } else {
      fail = mid
    }
  }
  return best
}
