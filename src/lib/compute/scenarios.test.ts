/**
 * Real hike & fly scenarios (takeoffs and landings from OpenStreetMap) on the
 * swissALTI3D archive, against independent references:
 * - start and landing ground from the swisstopo height service,
 * - straight distance as the WGS84 geodesic (Vincenty),
 * - `straightDem`: the same for the straight line, lifting off at the best point
 *   within the takeoff run along it,
 * - `demGlideRatio`: the best route's required glide ratio recomputed on the
 *   swisstopo 2 m profile service along the route's vertices, from its liftoff
 *   (at the service's height there) after the takeoff run.
 * The other values pin the current results, so changes in them are noticed.
 * Skipped without the archive (public/terrain/swissalti3d.pmtiles, see tools/terrain).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { cellAt, type LngLat } from '../terrain/geo'
import { archiveTiles, hasArchive } from './archive.testing'
import { computeReach } from './reach'
import { RoutePlanner, type RouteRequest } from './route'
import type { GridOptions, HeightMode } from './terrain'

interface Scenario {
  name: string
  start: LngLat
  landing: LngLat
  startHeight?: number
  startHeightMode?: HeightMode
  glideRatio?: number
  /** swisstopo height service (m AMSL). */
  startElevation: number
  landingElevation: number
  /** Geodesic distance (m). */
  geodesic: number
  /** Required glide ratio of the best route on the 2 m terrain. */
  demGlideRatio: number
  /** Side, required glide ratio and length (m) of each route, best first. */
  routes: [string | null, number, number][]
  /** Required glide ratio of the straight line over the terrain (Infinity: blocked), and on the 2 m terrain. */
  straight: number
  straightDem: number
  /** AGL over the landing in the reach overlay, null where unreachable. */
  reachAgl: number | null
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Niesen SO-SW to Frutigen: straight line, limited by the arrival height',
    start: { lng: 7.648172, lat: 46.644121 },
    landing: { lng: 7.65324, lat: 46.585606 },
    startElevation: 2258.4,
    landingElevation: 779.2,
    geodesic: 6516.3,
    demGlideRatio: 4.733,
    routes: [[null, 4.728, 6546], ['East', 5.1, 7032], ['West', 5.981, 7020]],
    straight: 4.733,
    straightDem: 4.725,
    reachAgl: 158.6,
  },
  {
    name: 'Niederhorn to Lehn: around the spur below the takeoff',
    start: { lng: 7.778751, lat: 46.711499 },
    landing: { lng: 7.823612, lat: 46.680661 },
    startElevation: 1928.7,
    landingElevation: 564.9,
    geodesic: 4850.3,
    demGlideRatio: 3.959,
    routes: [['South-west', 4.042, 4926], ['South-west', 5.446, 5494], ['North-east', 7.55, 5057]],
    straight: 4.776,
    straightDem: 4.515,
    reachAgl: 393.7,
  },
  {
    name: 'First to Grindelwald Grund: straight line',
    start: { lng: 8.055179, lat: 46.657433 },
    landing: { lng: 8.02971, lat: 46.620061 },
    startElevation: 2118.2,
    landingElevation: 950.2,
    geodesic: 4589.3,
    demGlideRatio: 4.285,
    routes: [[null, 4.286, 4598], ['South-east', 4.6, 4913], ['South-east', 5.507, 5901]],
    straight: 4.294,
    straightDem: 4.296,
    reachAgl: 246.3,
  },
  {
    name: 'First to Interlaken: the Faulhorn chain blocks the straight line',
    start: { lng: 8.055179, lat: 46.657433 },
    landing: { lng: 7.858263, lat: 46.68624 },
    glideRatio: 7,
    startElevation: 2118.2,
    landingElevation: 567.2,
    geodesic: 15404.6,
    demGlideRatio: 12.744,
    routes: [['South', 12.899, 18491]],
    straight: Infinity,
    straightDem: Infinity,
    reachAgl: null,
  },
  {
    name: 'Thermal at 3200 m AMSL over First to Interlaken: over the chain',
    start: { lng: 8.055179, lat: 46.657433 },
    landing: { lng: 7.858263, lat: 46.68624 },
    startHeight: 3200,
    startHeightMode: 'amsl',
    glideRatio: 8,
    startElevation: 2118.2,
    landingElevation: 567.2,
    geodesic: 15404.6,
    demGlideRatio: 6.478,
    routes: [['North', 6.599, 16035], ['North', 7.096, 17974], ['South', 7.18, 17791]],
    straight: 9.467,
    straightDem: 9.258,
    reachAgl: 651.2,
  },
  {
    name: 'Brunnihütte to Engelberg: around the slope on the west side',
    start: { lng: 8.410156, lat: 46.842634 },
    landing: { lng: 8.409131, lat: 46.817197 },
    startElevation: 1869.9,
    landingElevation: 1008.2,
    geodesic: 2828.8,
    demGlideRatio: 4.07,
    routes: [['West', 4.133, 3124], ['West', 4.748, 3635], ['West', 9.35, 4560]],
    straight: 7.8,
    straightDem: 7.193,
    reachAgl: 264.8,
  },
  {
    name: 'Amisbühl to Interlaken: gentle takeoff, the run reaches steeper ground',
    start: { lng: 7.822284, lat: 46.702416 },
    landing: { lng: 7.858263, lat: 46.68624 },
    startElevation: 1324.5,
    landingElevation: 567.2,
    geodesic: 3287.4,
    demGlideRatio: 5.016,
    routes: [[null, 5.012, 3311], ['South-west', 5.41, 3573], ['South-west', 7.05, 4306]],
    straight: 6.45,
    straightDem: 5.718,
    reachAgl: 91.3,
  },
  {
    name: 'Männlichen summit to Wilderswil: steep ground just below a rounded summit',
    start: { lng: 7.938058, lat: 46.618168 },
    landing: { lng: 7.864124, lat: 46.664043 },
    startElevation: 2342.1,
    landingElevation: 587.6,
    geodesic: 7619,
    demGlideRatio: 4.606,
    routes: [[null, 4.642, 7621], ['South-west', 4.964, 8213], ['South-west', 6.611, 9859]],
    straight: 5.093,
    straightDem: 5.015,
    reachAgl: 218.8,
  },
  {
    name: 'Brienzer Rothorn Süd to Hofstetten: flat takeoff edge, then steep',
    start: { lng: 8.046892, lat: 46.786583 },
    landing: { lng: 8.062464, lat: 46.753368 },
    startElevation: 2319.4,
    landingElevation: 663.2,
    geodesic: 3879.2,
    demGlideRatio: 2.483,
    routes: [[null, 2.485, 3887], ['East', 2.703, 4224], ['West', 2.704, 4166]],
    straight: 2.491,
    straightDem: 2.493,
    reachAgl: 859.6,
  },
]

const ASSUMPTIONS = { clearance: 50, launchZone: 500, takeoffRun: 30, arrivalHeight: 100 }

describe.skipIf(!hasArchive)('real scenarios', () => {
  let options: GridOptions
  let loadTiles: Awaited<ReturnType<typeof archiveTiles>>['loadTiles']

  beforeAll(async () => {
    const tiles = await archiveTiles()
    loadTiles = tiles.loadTiles
    options = { maxZoom: tiles.maxZoom }
  })

  describe.each(SCENARIOS)('$name', (s) => {
    const glideRatio = s.glideRatio ?? 5
    const request = (): RouteRequest => ({
      start: s.start,
      landing: s.landing,
      startHeight: s.startHeight ?? 0,
      startHeightMode: s.startHeightMode ?? 'agl',
      glideRatio,
      ...ASSUMPTIONS,
    })
    // The service's exact elevations, recorded: no network in tests.
    const exact = (p: LngLat) => Promise.resolve(p === s.start ? s.startElevation : s.landingElevation)
    const startAltitude = s.startHeightMode === 'amsl' ? s.startHeight! : s.startElevation + (s.startHeight ?? 0)

    it('plans the routes', { timeout: 60_000 }, async () => {
      const result = await new RoutePlanner(loadTiles, { ...options, pointElevation: exact }).alternatives(request())

      expect(result.startElevation).toBe(s.startElevation)
      expect(result.landingElevation).toBe(s.landingElevation)
      expect(result.startAltitude).toBe(startAltitude)
      expect(Math.abs(result.straightDistance - s.geodesic)).toBeLessThan(1)

      // The straight line, also when terrain blocks it: never easier than the 2 m terrain.
      if (s.straight === Infinity) {
        expect(result.straightLine.glideRatio).toBe(Infinity)
        expect(s.straightDem).toBe(Infinity)
      } else {
        expect(result.straightLine.glideRatio).toBeCloseTo(s.straight, 2)
        expect(result.straightLine.glideRatio).toBeGreaterThanOrEqual(0.99 * s.straightDem)
      }

      const [best] = result.options
      // Conservative against the 2 m terrain (the grid keeps the highest point per
      // pixel), within 1 % below where the launch zone interpolates, and not far off.
      expect(best.requiredGlideRatio).toBeGreaterThanOrEqual(0.99 * s.demGlideRatio)
      expect(best.requiredGlideRatio).toBeLessThanOrEqual(1.07 * s.demGlideRatio)

      expect(result.options.map((o) => o.side)).toEqual(s.routes.map(([side]) => side))
      result.options.forEach((o, i) => {
        const [, required, length] = s.routes[i]
        expect(o.requiredGlideRatio).toBeCloseTo(required, 2)
        expect(Math.abs(o.length - length)).toBeLessThan(5)
        // Never shorter than the straight line, but for routes joining cell centers.
        expect(o.length).toBeGreaterThanOrEqual(result.straightDistance - result.cellSize)
        // A run on a ground launch only, within its distance and not uphill.
        const run = s.startHeightMode === 'amsl' ? 0 : ASSUMPTIONS.takeoffRun
        expect(o.liftoff.distance).toBeLessThanOrEqual(run)
        expect(o.liftoff.altitude).toBeLessThanOrEqual(startAltitude)
      })
    })

    it('computes the reachable area', { timeout: 60_000 }, async () => {
      const reach = await computeReach(request(), loadTiles, { ...options, pointElevation: exact })
      expect(reach.startAltitude).toBe(startAltitude)

      // The grid only covers what may be reachable: the landing can lie outside.
      const cell = cellAt(reach.grid, s.landing)
      const i = cell ? cell.row * reach.grid.cols + cell.col : -1
      if (s.reachAgl === null) {
        if (cell) expect(reach.agl[i]).toBeNaN()
        return
      }
      expect(reach.agl[i]).toBeCloseTo(s.reachAgl, 0)
      // Never higher than a straight glide over the true landing ground.
      expect(reach.agl[i]).toBeLessThanOrEqual(startAltitude - s.geodesic / glideRatio - s.landingElevation + 0.5)
    })
  })
})
