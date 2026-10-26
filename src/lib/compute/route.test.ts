import { describe, expect, it } from 'vitest'
import { routeSide, type PathPoint } from './route'

const path = (points: [number, number][]): PathPoint[] => points.map(([lng, lat], i) => ({ distance: i, terrain: 0, lng, lat }))

describe('routeSide', () => {
  // Start south-west, landing north-east (about 10 km).
  const a: [number, number] = [8.08, 46.676]
  const b: [number, number] = [8.187, 46.727]

  it('calls a route wiggling across the straight line direct', () => {
    expect(routeSide(path([a, [8.1, 46.70], [8.15, 46.70], b]), 10_000).side).toBeNull()
  })

  it('calls a straight route direct', () => {
    expect(routeSide(path([a, b]), 10_000).side).toBeNull()
  })

  it('names the north-west side', () => {
    expect(routeSide(path([a, [8.1, 46.72], b]), 10_000).side).toBe('North-west')
  })

  it('names the south-east side', () => {
    expect(routeSide(path([a, [8.17, 46.68], b]), 10_000).side).toBe('South-east')
  })
})
