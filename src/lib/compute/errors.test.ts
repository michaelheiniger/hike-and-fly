import { describe, expect, it } from 'vitest'
import { de } from '../i18n/de'
import { fr } from '../i18n/fr'
import { PlanError, problemText } from './errors'

describe('PlanError', () => {
  it('keeps the problem, with an English message for reports', () => {
    const err = new PlanError({ code: 'routeTooLong', km: 85 })
    expect(err.message).toBe('The route is 85 km long: too far to plan.')
    expect(err.problem).toEqual({ code: 'routeTooLong', km: 85 })
  })

  it('words the problem in the interface language', () => {
    const problem = { code: 'belowGround', altitude: 1200, ground: 1250 } as const
    expect(problemText(fr, problem)).toBe('L’altitude de départ (1200 m) est sous le sol (1250 m).')
    expect(problemText(de, { code: 'landingTooClose' })).toBe('Der Landeplatz liegt zu nahe am Start.')
  })
})
