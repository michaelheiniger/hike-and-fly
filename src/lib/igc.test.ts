import { describe, expect, it } from 'vitest'
import { flightBounds, parseIgc, trackLength, type Fix } from './igc'
import { localDistance } from './terrain/geo'

/** A B record: time in seconds, position in degrees, altitudes in meters. */
function bRecord(time: number, lat: number, lng: number, pressure: number, gps: number, valid = 'A'): string {
  const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, '0')
  const hms = `${pad(Math.floor(time / 3600) % 24, 2)}${pad(Math.floor(time / 60) % 60, 2)}${pad(time % 60, 2)}`
  const angle = (deg: number, w: number) => {
    const a = Math.abs(deg)
    const whole = Math.floor(a)
    return `${pad(whole, w)}${pad((a - whole) * 60_000, 5)}`
  }
  const alt = (m: number) => (m < 0 ? '-' + pad(-m, 4) : pad(m, 5))
  return `B${hms}${angle(lat, 2)}${lat < 0 ? 'S' : 'N'}${angle(lng, 3)}${lng < 0 ? 'W' : 'E'}${valid}${alt(pressure)}${alt(gps)}`
}

/** A track: `ground` seconds still, then flying east at `speed`, then `ground` seconds still. */
function track(ground: number, flying: number, speed: number): string {
  const lines = ['AXSE1520235887', 'HFDTEDATE:260626,00', 'I053638FXA3940SIU4144VAT4547ACZ4850VXA']
  const lat = 46.5
  const metersPerDegreeLng = localDistance({ lng: 7, lat }, { lng: 8, lat })
  let lng = 7
  for (let t = 0; t < 2 * ground + flying; t++) {
    if (t >= ground && t < ground + flying) lng += speed / metersPerDegreeLng
    lines.push(bRecord(13 * 3600 + t, lat, lng, 2000 - t, 2100 - t) + '00713-015010007')
  }
  return lines.join('\r\n')
}

describe('parseIgc', () => {
  it('reads the date and the fixes of a Syride log', () => {
    const text = [
      'AXSE1520235887',
      'HFDTEDATE:260626,00',
      'HFPLTPILOTINCHARGE:Someone',
      'I053638FXA3940SIU4144VAT4547ACZ4850VXA',
      'B1303454626502N00658556EA016270175200713-015010007',
      'B1303474626501N00658545EA016250175100813-005012012',
      'LXSE some comment',
      'G0123456789ABCDEF',
    ].join('\r\n')
    const { date, fixes } = parseIgc(text)
    expect(date).toBe('2026-06-26')
    expect(fixes).toHaveLength(2)
    const [a, b] = fixes
    expect(a.time).toBe(13 * 3600 + 3 * 60 + 45)
    expect(a.lat).toBeCloseTo(46 + 26.502 / 60, 9)
    expect(a.lng).toBeCloseTo(6 + 58.556 / 60, 9)
    expect(a.pressureAltitude).toBe(1627)
    expect(a.gpsAltitude).toBe(1752)
    expect(a.valid).toBe(true)
    expect(b.time - a.time).toBe(2)
  })

  it('reads the old date header and southern, western and negative values', () => {
    const text = ['HFDTE010325', 'B2359594500000S07330000WV-0012-0005', 'B0000014500000S07330000WA0000000000'].join('\n')
    const { date, fixes } = parseIgc(text)
    expect(date).toBe('2025-03-01')
    expect(fixes[0].lat).toBe(-45)
    expect(fixes[0].lng).toBe(-73.5)
    expect(fixes[0].pressureAltitude).toBe(-12)
    expect(fixes[0].gpsAltitude).toBe(-5)
    expect(fixes[0].valid).toBe(false)
    // Past midnight the time goes on increasing; 00000 is a missing altitude.
    expect(fixes[1].time - fixes[0].time).toBe(2)
    expect(fixes[1].pressureAltitude).toBeNull()
    expect(fixes[1].gpsAltitude).toBeNull()
  })

  it('skips malformed records', () => {
    const { date, fixes } = parseIgc('B1303454626502N00658556EA0162701752\nB13034X4626502N00658556EA0162701752\nBshort')
    expect(date).toBeNull()
    expect(fixes).toHaveLength(1)
  })
})

describe('flightBounds', () => {
  it('finds the takeoff and the landing around the flight', () => {
    const { fixes } = parseIgc(track(60, 300, 9))
    const b = flightBounds(fixes)!
    expect(Math.abs(b.takeoff - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(b.landing - 359)).toBeLessThanOrEqual(2)
  })

  it('ignores walking and short GPS jumps on the ground', () => {
    const fixes: Fix[] = parseIgc(track(0, 600, 1.2)).fixes
    // A 50 m jump, back at once.
    fixes[300] = { ...fixes[300], lng: fixes[300].lng + 0.00065 }
    expect(flightBounds(fixes)).toBeNull()
  })

  it('takes a log that starts and ends in flight as one flight', () => {
    const { fixes } = parseIgc(track(0, 200, 9))
    expect(flightBounds(fixes)).toEqual({ takeoff: 0, landing: 199 })
  })
})

describe('trackLength', () => {
  it('sums the legs', () => {
    const { fixes } = parseIgc(track(10, 100, 9))
    expect(trackLength(fixes)).toBeCloseTo(900, -1)
    expect(trackLength(fixes, 50, 60)).toBeCloseTo(90, -0.5)
  })
})
