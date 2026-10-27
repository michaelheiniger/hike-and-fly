import { describe, expect, it } from 'vitest'
import { cellAt, cellCenter, cellMetrics, latFromMercatorY, makeGeoGrid, mercatorY, metersPerDegree, pixelSize, worldPixel, zoomForCellSize } from './geo'
import { decodeTerrarium, sampleBilinear, sampleGrid, tileKey, tilesCovering, type TileSet } from './terrarium'

describe('geo', () => {
  it('has realistic scales in Switzerland', () => {
    const m = metersPerDegree(46.8)
    expect(m.lat).toBeCloseTo(111_180, -2)
    expect(m.lng).toBeCloseTo(76_300, -2)
  })

  it('inverts the Mercator projection', () => {
    for (const lat of [-60, 0, 46.8, 70]) expect(latFromMercatorY(mercatorY(lat))).toBeCloseTo(lat, 9)
  })

  it('picks a zoom with pixels no larger than the cell', () => {
    const z = zoomForCellSize(20, 46.8, 15)
    expect(pixelSize(z, 46.8)).toBeLessThanOrEqual(20)
    expect(pixelSize(z - 1, 46.8)).toBeGreaterThan(20)
    expect(zoomForCellSize(1, 46.8, 15)).toBe(15)
  })

  it('builds a grid centered on the start with square metric cells', () => {
    const center = { lng: 7.9, lat: 46.6 }
    const g = makeGeoGrid(center, 1000, 20)
    expect(g.cols).toBe(101)
    const mid = cellCenter(g, 50, 50)
    expect(mid.lat).toBeCloseTo(center.lat, 10)
    expect(mid.lng).toBeCloseTo(center.lng, 10)
    expect(cellAt(g, center)).toEqual({ col: 50, row: 50 })
    const { cellHeight, rowCellWidth } = cellMetrics(g)
    expect(cellHeight).toBeCloseTo(20, 1)
    expect(rowCellWidth[50]).toBeCloseTo(20, 2)
    expect(rowCellWidth[0]).toBeLessThan(rowCellWidth[100]) // narrower to the north
  })
})

describe('terrarium', () => {
  it('decodes elevations', () => {
    // 1000 m: 33768 = 131·256 + 232
    const rgba = new Uint8ClampedArray([131, 232, 0, 255, 128, 0, 128, 255])
    const out = decodeTerrarium(rgba)
    expect(out[0]).toBe(1000)
    expect(out[1]).toBe(0.5)
  })

  it('clamps sea depths and spikes to the lowest dry land', () => {
    // −20775 m: 11993 = 46·256 + 217
    expect(decodeTerrarium(new Uint8ClampedArray([46, 217, 0, 255]))[0]).toBe(-450)
  })

  /** Tiles whose elevation equals the world pixel x coordinate: a ramp rising eastwards. */
  function rampTiles(z: number, north: number, south: number, west: number, east: number): TileSet {
    const tiles: TileSet = new Map()
    for (const [x, y] of tilesCovering(z, north, south, west, east)) {
      const data = new Float32Array(256 * 256)
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) data[j * 256 + i] = x * 256 + i
      tiles.set(tileKey(z, x, y), data)
    }
    return tiles
  }

  it('samples bilinearly between pixel centers', () => {
    const z = 12
    const p = { lng: 7.9, lat: 46.6 }
    const tiles = rampTiles(z, 46.7, 46.5, 7.8, 8.0)
    // Pixel i covers [i, i+1) with its center at i + 0.5 holding value i.
    expect(sampleBilinear(tiles, z, p.lng, p.lat)).toBeCloseTo(worldPixel(p.lng, p.lat, z).x - 0.5, 6)
  })

  it('takes the max away from the start and the true value near it', () => {
    const z = 12
    const center = { lng: 7.9, lat: 46.6 }
    const grid = makeGeoGrid(center, 2000, 50)
    const tiles = rampTiles(z, 46.7, 46.5, 7.8, 8.0)
    const elevation = sampleGrid(tiles, z, grid, center, 500)

    const startIdx = 40 * grid.cols + 40
    expect(elevation[startIdx]).toBeCloseTo(worldPixel(center.lng, center.lat, z).x - 0.5, 1) // float32 storage

    const c = 5
    const far = cellCenter(grid, c, 40)
    const exact = worldPixel(far.lng, far.lat, z).x - 0.5
    const v = elevation[40 * grid.cols + c]
    expect(v).toBeGreaterThanOrEqual(exact)
    expect(v).toBeLessThan(exact + 1)
  })
})
