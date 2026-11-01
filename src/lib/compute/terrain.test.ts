import { describe, expect, it } from 'vitest'
import { PlanError } from './errors'
import { BELOW_GROUND_TOLERANCE, groundLaunch, startAltitudeFrom } from './terrain'

describe('startAltitudeFrom', () => {
  it('adds an AGL height to the ground', () => {
    expect(startAltitudeFrom(0, 'agl', 1500)).toBe(1500)
    expect(startAltitudeFrom(300, 'agl', 1500)).toBe(1800)
  })

  it('takes an AMSL altitude as it is above the ground', () => {
    expect(startAltitudeFrom(1800, 'amsl', 1500)).toBe(1800)
  })

  it('takes an AMSL altitude a little below the ground as a ground launch', () => {
    // A GPS reading at the launch, some meters below the ground used.
    for (const below of [0.4, 6, BELOW_GROUND_TOLERANCE]) {
      const altitude = startAltitudeFrom(1500 - below, 'amsl', 1500)
      expect(altitude).toBe(1500)
      expect(groundLaunch(altitude, 1500)).toBe(true)
    }
  })

  it('refuses an AMSL altitude far below the ground', () => {
    const below = () => startAltitudeFrom(1500 - BELOW_GROUND_TOLERANCE - 1, 'amsl', 1500)
    expect(below).toThrow(PlanError)
    try {
      below()
    } catch (e) {
      expect((e as PlanError).problem).toEqual({ code: 'belowGround', altitude: 1500 - BELOW_GROUND_TOLERANCE - 1, ground: 1500 })
    }
  })
})
