import { describe, expect, it } from 'vitest'
import { formatWaypoints, parseWaypoints } from './waypoints'

describe('waypoints in links', () => {
  it('round-trip in order', () => {
    const waypoints = [
      { lat: 46.632521, lng: 7.902909 },
      { lat: 46.7, lng: 7.8 },
    ]
    expect(formatWaypoints(waypoints)).toBe('46.63252,7.90291;46.70000,7.80000')
    expect(parseWaypoints(formatWaypoints(waypoints))).toEqual([
      { lat: 46.63252, lng: 7.90291 },
      { lat: 46.7, lng: 7.8 },
    ])
  })

  it('are none without the parameter', () => {
    expect(parseWaypoints(null)).toEqual([])
    expect(parseWaypoints('')).toEqual([])
  })

  it('skip malformed and impossible points', () => {
    expect(parseWaypoints('46.6,7.9;abc;46.7;95,7;46.7,7.8,1;,7;46.8,8.0')).toEqual([
      { lat: 46.6, lng: 7.9 },
      { lat: 46.8, lng: 8.0 },
    ])
  })
})
