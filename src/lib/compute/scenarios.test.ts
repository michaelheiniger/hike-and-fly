/**
 * Real hike & fly scenarios (takeoffs and landings from OpenStreetMap) on the
 * swissALTI3D archive, against independent references:
 * - start and landing ground from the swisstopo height service,
 * - straight distance as the WGS84 geodesic (Vincenty),
 * - `demGlideRatio`: the best route's required glide ratio recomputed on the
 *   swisstopo 2 m profile service along the route's vertices.
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
  /** AGL over the landing in the reach overlay, null where unreachable. */
  reachAgl: number | null
  /** Why the result differs from what a pilot would expect. */
  note?: string
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
    routes: [[null, 4.733, 6528], ['East', 5.114, 7053], ['West', 5.935, 6998]],
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
    routes: [['South-west', 4.042, 4926], ['South-west', 5.719, 5486], ['North-east', 7.55, 5057]],
    reachAgl: 393.7,
  },
  {
    name: 'First to Grindelwald Grund: straight line',
    start: { lng: 8.055179, lat: 46.657433 },
    landing: { lng: 8.02971, lat: 46.620061 },
    startElevation: 2118.2,
    landingElevation: 950.2,
    geodesic: 4589.3,
    demGlideRatio: 4.294,
    routes: [[null, 4.294, 4586], ['South-east', 4.607, 4920], ['South-east', 5.528, 5904]],
    reachAgl: 245.8,
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
    reachAgl: 651.2,
  },
  {
    name: 'Brunnihütte to Engelberg: around the slope on the west side',
    start: { lng: 8.410156, lat: 46.842634 },
    landing: { lng: 8.409131, lat: 46.817197 },
    startElevation: 1869.9,
    landingElevation: 1008.2,
    geodesic: 2828.8,
    demGlideRatio: 4.096,
    routes: [['West', 4.15, 3120], ['West', 4.757, 3624], ['West', 9.403, 4567]],
    reachAgl: 260,
  },
  {
    name: 'Amisbühl to Interlaken: limited by the gentle takeoff',
    note: 'The ground is 1.5 m below the takeoff 11 m out: the first meters need glide ratio 6.7, nothing is reachable at 5.',
    start: { lng: 7.822284, lat: 46.702416 },
    landing: { lng: 7.858263, lat: 46.68624 },
    startElevation: 1324.5,
    landingElevation: 567.2,
    geodesic: 3287.4,
    demGlideRatio: 6.69,
    routes: [['South-west', 6.682, 3543], ['South-west', 9.868, 4245], [null, 10.649, 3297]],
    reachAgl: null,
  },
  {
    name: 'Männlichen summit to Wilderswil: rounded summit',
    note: 'Samples take the terrain of their cell: 24 m out the grid reads 2337 m, the 2 m terrain ~2326 m, so 4.9 instead of 4.6.',
    start: { lng: 7.938058, lat: 46.618168 },
    landing: { lng: 7.864124, lat: 46.664043 },
    startElevation: 2342.1,
    landingElevation: 587.6,
    geodesic: 7619,
    demGlideRatio: 4.609,
    routes: [[null, 4.907, 7625], ['South-west', 4.966, 8217], ['South-west', 6.63, 9882]],
    reachAgl: 218.3,
  },
]

const ASSUMPTIONS = { clearance: 50, launchZone: 500, arrivalHeight: 100 }

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
