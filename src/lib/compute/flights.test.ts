/**
 * The model against flown tracks (igc-samples, see its README) on the swissALTI3D archive:
 * - the terrain under the tracks: GPS altitudes on the ground and in the air against it,
 * - the planner against descents actually flown: the best route never needs a higher glide
 *   ratio than the track the pilot flew, over the same terrain.
 * Skipped without the archive (public/terrain/swissalti3d.pmtiles, see tools/terrain).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { flightBounds, parseIgc, trackLength, type Fix } from '../igc'
import { localDistance, type LngLat } from '../terrain/geo'
import { sampleBilinear, tilesCovering } from '../terrain/terrarium'
import { archiveTiles, hasArchive } from './archive.testing'
import { RoutePlanner, type RouteRequest } from './route'
import { BELOW_GROUND_TOLERANCE, groundLaunch, startAltitudeFrom, type LoadTiles } from './terrain'

const SAMPLES = fileURLToPath(new URL('../../../igc-samples/', import.meta.url))
const NAMES = readdirSync(SAMPLES).filter((n) => !n.endsWith('.md'))

interface Flight {
  name: string
  fixes: Fix[]
  /** The fixes in flight. */
  flown: Fix[]
  /** Fixes on the ground after the landing. */
  after: Fix[]
}

const flights: Flight[] = NAMES.map((name) => {
  const { fixes } = parseIgc(readFileSync(SAMPLES + name, 'latin1'))
  const b = flightBounds(fixes)
  return {
    name,
    fixes,
    flown: b ? fixes.slice(b.takeoff, b.landing + 1) : [],
    after: b ? fixes.slice(b.landing + 5, b.landing + 60) : [],
  }
})

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.floor(q * (values.length - 1))]

describe('flown tracks', () => {
  it('finds one flight in every log', () => {
    expect(flights).toHaveLength(221)
    for (const f of flights) {
      expect(f.flown.length, f.name).toBeGreaterThan(120)
      // A few 2D fixes ('V', without altitude) at most.
      const usable = f.flown.filter((x) => x.valid && x.gpsAltitude !== null)
      expect(usable.length, f.name).toBeGreaterThan(0.99 * f.flown.length)
    }
  })
})

describe.skipIf(!hasArchive)('flown tracks over the terrain', () => {
  let loadTiles: LoadTiles
  let maxZoom: number
  /** Archive ground under each point, null when the archive does not cover them all. */
  let ground: (points: LngLat[]) => Promise<number[] | null>
  /** Flights over the archive with the ground under each flown fix. */
  let covered: { flight: Flight; terrain: number[] }[]

  beforeAll(async () => {
    ;({ loadTiles, maxZoom } = await archiveTiles())
    const z = maxZoom
    ground = async (points) => {
      const lats = points.map((p) => p.lat)
      const lngs = points.map((p) => p.lng)
      const coords = tilesCovering(z, Math.max(...lats), Math.min(...lats), Math.min(...lngs), Math.max(...lngs))
      const tiles = await loadTiles(z, coords).catch(() => null)
      return tiles && points.map((p) => sampleBilinear(tiles, z, p.lng, p.lat))
    }
    covered = []
    for (const flight of flights) {
      const terrain = await ground(flight.flown)
      if (terrain) covered.push({ flight, terrain })
    }
  }, 120_000)

  it('covers all flights but those in France', () => {
    // 7 start in France, 1 more crosses the border.
    expect(covered).toHaveLength(213)
  })

  it('matches the GPS on the ground after the landing', async () => {
    // GNSS altitude is good to some meters; the tiles keep the highest point per 13 m pixel.
    const gaps: number[] = []
    for (const { flight } of covered) {
      if (flight.after.length < 20) continue
      const [g] = (await ground([flight.after[flight.after.length >> 1]]))!
      const altitudes = flight.after.filter((x) => x.valid && x.gpsAltitude !== null).map((x) => x.gpsAltitude!)
      gaps.push(median(altitudes) - g)
    }
    expect(gaps.length).toBeGreaterThan(120)
    expect(Math.abs(median(gaps))).toBeLessThan(3)
    expect(quantile(gaps, 0.05)).toBeGreaterThan(-15)
    // A start read this low is still taken as a ground launch.
    expect(Math.min(...gaps)).toBeGreaterThan(-BELOW_GROUND_TOLERANCE)
    expect(quantile(gaps, 0.95)).toBeLessThan(20)
  })

  it('keeps the tracks above the ground', () => {
    // Before the last minute (the final approach and landing): a fix below the ground
    // would mean the terrain or its placement is wrong. A few GPS spikes are allowed.
    let fixes = 0
    let below = 0
    for (const { flight, terrain } of covered) {
      const end = flight.flown.length - 60
      for (let i = 0; i < end; i++) {
        const { valid, gpsAltitude } = flight.flown[i]
        if (!valid || gpsAltitude === null) continue
        fixes++
        if (gpsAltitude - terrain[i] < -10) below++
      }
    }
    expect(fixes).toBeGreaterThan(200_000)
    expect(below / fixes).toBeLessThan(1e-4)
  })

  it('takes the GPS altitude at every first fix as a start', () => {
    // The recorder starts in flight or at the launch. Not in the first 5 s: right after
    // power-on the GPS may not have settled (one log reads 180 m low, then right a
    // second later).
    for (const { flight, terrain } of covered) {
      const t0 = flight.fixes[0].time + 5
      const first = flight.flown.findIndex((x) => x.valid && x.gpsAltitude !== null && x.time >= t0)
      const gps = flight.flown[first].gpsAltitude!
      expect(startAltitudeFrom(gps, 'amsl', terrain[first]), flight.name).toBe(Math.max(gps, terrain[first]))
    }
  })

  it('plans a start read below the ground as a ground launch', { timeout: 60_000 }, async () => {
    // As low as the GPS read on the ground after the landings (see above).
    const { flight, terrain } = covered.find((c) => c.flight.name.startsWith('3b30d585'))!
    const result = await new RoutePlanner(loadTiles, { maxZoom }).plan({
      start: flight.flown[0],
      landing: flight.flown[flight.flown.length - 1],
      startHeight: terrain[0] - 14,
      startHeightMode: 'amsl',
      glideRatio: 5,
      clearance: 50,
      launchZone: 500,
      takeoffRun: 30,
      arrivalHeight: 50,
    })
    expect(result.startAltitude).toBe(result.startElevation)
    expect(groundLaunch(result.startAltitude, result.startElevation)).toBe(true)
    expect(result.options[0].requiredGlideRatio).toBeLessThan(10)
  })

  /**
   * The track's own requirement over the archive terrain: the glide ratio that keeps the
   * line from `startAltitude` above the ground under every fix, and reaches the landing
   * ground (no clearance, no arrival height).
   */
  const trackRequirement = (flown: Fix[], terrain: number[], startAltitude: number) => {
    let s = 0
    let required = 0
    for (let i = 1; i < flown.length; i++) {
      s += localDistance(flown[i - 1], flown[i])
      required = Math.max(required, s / (startAltitude - terrain[i]))
    }
    return Math.max(required, s / (startAltitude - terrain[terrain.length - 1]))
  }

  /**
   * Descents (never more than 30 m above the first fix), one per site: the first fix
   * and the last one in flight as start and landing. `none`: the best route's ratio
   * without clearance nor arrival height; `defaults`: with the app's defaults (GR 5 is
   * the pilot's own setting and changes neither); `track`: the flown track's requirement.
   */
  const DESCENTS: { name: string; none: number; defaults: number; track: number; what: string }[] = [
    { name: '367005b4', none: 3.954, defaults: 4.156, track: 5.069, what: 'the most flown site, 47 descents' },
    { name: '98a2c505', none: 3.548, defaults: 4.192, track: 5.777, what: 'around a spur, 22 % longer than the straight line' },
    { name: '3b30d585', none: 5.579, defaults: 5.84, track: 6.412, what: 'from the ground, 7.3 km' },
    { name: 'a48a3671', none: 4.465, defaults: 4.664, track: 5.589, what: 'from the ground' },
    { name: '3d4166d0', none: 3.45, defaults: 4.092, track: 4.709, what: 'from the ground' },
    { name: '1815a983', none: 4.049, defaults: 4.2, track: 5.304, what: 'around a ridge, 22 % longer' },
    { name: '216059e7', none: 3.191, defaults: 3.53, track: 13.137, what: 'short and bent, 34 % longer' },
    { name: '0ec8b4a6', none: 3.08, defaults: 3.243, track: 3.494, what: 'from 430 m above the ground, flown within 13 % of the best ratio' },
    { name: '7b212658', none: 3.314, defaults: 3.645, track: 5.687, what: 'from 290 m above the ground' },
    { name: '46ad2d82', none: 5.769, defaults: 6.273, track: 6.282, what: 'flown within 9 % of the best ratio' },
    { name: 'c0a6f19a', none: 6.587, defaults: 7.573, track: 6.683, what: 'flown within 2 % of the best ratio' },
    { name: '5aff6c0f', none: 8.04, defaults: 10.287, track: 8.463, what: 'a flat glide of 1.8 km from 210 m: the clearance decides' },
    { name: '4e7bc6e1', none: 4.821, defaults: 7.278, track: 8.77, what: 'the clearance raises the ratio by half' },
    { name: '58fa8965', none: 4.048, defaults: 4.146, track: 5.366, what: 'the longest, 8.6 km' },
  ]

  describe.each(DESCENTS)('descent $name: $what', (d) => {
    it('needs no more than the flown track', { timeout: 60_000 }, async () => {
      const { flight, terrain } = covered.find((c) => c.flight.name.startsWith(d.name))!
      const usable = flight.flown.map((x, i) => i).filter((i) => flight.flown[i].valid && flight.flown[i].gpsAltitude !== null)
      const flown = usable.map((i) => flight.flown[i])
      const ground = usable.map((i) => terrain[i])
      const first = flown[0]
      const last = flown[flown.length - 1]
      expect(Math.max(...flown.map((x) => x.gpsAltitude!)) - first.gpsAltitude!).toBeLessThan(30)

      // In the air at the first fix, at least 1 m above the ground (GPS may read lower).
      const startAltitude = Math.max(first.gpsAltitude!, ground[0] + 1)
      const flownRequirement = trackRequirement(flown, ground, startAltitude)
      const request = (o: Partial<RouteRequest>): RouteRequest => ({
        start: first,
        landing: last,
        startHeight: startAltitude,
        startHeightMode: 'amsl',
        glideRatio: 5,
        clearance: 50,
        launchZone: 500,
        takeoffRun: 30,
        arrivalHeight: 50,
        ...o,
      })
      const planner = new RoutePlanner(loadTiles, { maxZoom })
      const none = (await planner.plan(request({ clearance: 0, arrivalHeight: 0 }))).options[0]
      const defaults = (await planner.plan(request({}))).options[0]

      // The pilot flew it: the best route over the same terrain needs no more, and is
      // no longer, than the track.
      expect(none.requiredGlideRatio).toBeLessThanOrEqual(flownRequirement)
      expect(none.length).toBeLessThanOrEqual(trackLength(flown))
      // Clearance and arrival height never make it easier (but for the grid search
      // finding a slightly different route).
      expect(defaults.requiredGlideRatio).toBeGreaterThanOrEqual(0.98 * none.requiredGlideRatio)

      expect(none.requiredGlideRatio).toBeCloseTo(d.none, 2)
      expect(defaults.requiredGlideRatio).toBeCloseTo(d.defaults, 2)
      expect(flownRequirement).toBeCloseTo(d.track, 2)
    })
  })
})
