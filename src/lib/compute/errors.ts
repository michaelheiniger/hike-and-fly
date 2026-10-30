import { en, type Messages } from '../i18n/en'

/**
 * Problems the pilot can act on, reported by the computations as codes with values so the
 * interface words them in its language (the worker has no language).
 */
export type PlanProblem =
  | { code: 'belowGround'; altitude: number; ground: number }
  | { code: 'landingTooClose' }
  | { code: 'routeTooLong'; km: number }
  | { code: 'waypointTooFar' }
  | { code: 'elevationUnavailable'; tile: string }
  | { code: 'noOfflineElevation' }

/** A problem in the words of `messages`. */
export function problemText(messages: Messages, p: PlanProblem): string {
  const e = messages.errors
  switch (p.code) {
    case 'belowGround':
      return e.belowGround(p.altitude, p.ground)
    case 'routeTooLong':
      return e.routeTooLong(p.km)
    case 'elevationUnavailable':
      return e.elevationUnavailable(p.tile)
    default:
      return e[p.code]
  }
}

/** Error with a problem meant for the pilot; its message is in English, for logs and reports. */
export class PlanError extends Error {
  constructor(readonly problem: PlanProblem) {
    super(problemText(en, problem))
  }
}

/** A failed computation as the interface receives it: the problem when known, else the message. */
export interface Failure {
  message: string
  problem?: PlanProblem
}
