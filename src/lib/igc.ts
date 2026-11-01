/**
 * IGC flight logs (FAI's format for GPS flight recorders): the fixes of a track and
 * where the flight itself began and ended.
 */
import { localDistance, type LngLat } from './terrain/geo'

export interface Fix extends LngLat {
  /** Seconds since midnight UTC of the flight's date, increasing past midnight. */
  time: number
  /** Barometric altitude (m, ISA), null when the recorder has none. */
  pressureAltitude: number | null
  /** GNSS altitude (m), null when not recorded. */
  gpsAltitude: number | null
  /** False for a fix the recorder marked as 2D or invalid ('V'). */
  valid: boolean
}

export interface Track {
  /** UTC date of the flight (YYYY-MM-DD), null when the header has none. */
  date: string | null
  fixes: Fix[]
}

/** Parses an IGC file. Lines other than the date header and B records are ignored. */
export function parseIgc(text: string): Track {
  let date: string | null = null
  const fixes: Fix[] = []
  let dayOffset = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('HFDTE')) {
      const m = /(\d{2})(\d{2})(\d{2})/.exec(line.slice(5).replace(/^DATE:/, ''))
      if (m) date = `20${m[3]}-${m[2]}-${m[1]}`
    } else if (line.startsWith('B') && line.length >= 35) {
      const fix = parseFix(line)
      if (!fix) continue
      const last = fixes[fixes.length - 1]
      if (last && fix.time + dayOffset < last.time - 12 * 3600) dayOffset += 86_400
      fix.time += dayOffset
      fixes.push(fix)
    }
  }
  return { date, fixes }
}

function parseFix(line: string): Fix | null {
  const m = /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])([-\d]{5})([-\d]{5})/.exec(line)
  if (!m) return null
  const time = +m[1] * 3600 + +m[2] * 60 + +m[3]
  let lat = +m[4] + +m[5] / 60_000
  let lng = +m[7] + +m[8] / 60_000
  if (m[6] === 'S') lat = -lat
  if (m[9] === 'W') lng = -lng
  const pressure = +m[11]
  const gps = +m[12]
  return {
    time,
    lat,
    lng,
    // Recorders write 00000 for an altitude they do not have.
    pressureAltitude: pressure === 0 ? null : pressure,
    gpsAltitude: gps === 0 ? null : gps,
    valid: m[10] === 'A',
  }
}

export interface FlightOptions {
  /** Ground speed above which the pilot is flying (m/s). */
  flyingSpeed?: number
  /** How long that speed must last to count (s). */
  sustain?: number
}

/** Indices of the first and last fix in flight, null when the track never flies. */
export function flightBounds(fixes: Fix[], options: FlightOptions = {}): { takeoff: number; landing: number } | null {
  const flyingSpeed = options.flyingSpeed ?? 4
  const sustain = options.sustain ?? 15
  const speed = (a: Fix, b: Fix) => localDistance(a, b) / Math.max(1, Math.abs(b.time - a.time))
  // Flying from fix i on: its own step is fast, and most steps over the next `sustain`
  // seconds too (a single GPS jump on the ground makes only two fast steps).
  const flyingFrom = (i: number, step: 1 | -1): boolean => {
    const next = fixes[i + step]
    if (!next || speed(fixes[i], next) <= flyingSpeed) return false
    let fast = 0
    let steps = 0
    for (let j = i; j + step >= 0 && j + step < fixes.length && Math.abs(fixes[j + step].time - fixes[i].time) <= sustain; j += step) {
      steps++
      if (speed(fixes[j], fixes[j + step]) > flyingSpeed) fast++
    }
    return steps >= sustain * 0.6 && fast >= 0.8 * steps
  }
  let takeoff = -1
  for (let i = 0; i < fixes.length; i++) {
    if (fixes[i].valid && flyingFrom(i, 1)) {
      takeoff = i
      break
    }
  }
  if (takeoff < 0) return null
  let landing = fixes.length - 1
  for (let i = fixes.length - 1; i > takeoff; i--) {
    if (fixes[i].valid && flyingFrom(i, -1)) {
      landing = i
      break
    }
  }
  return { takeoff, landing }
}

/** Length of the track between two fixes (m). */
export function trackLength(fixes: Fix[], from = 0, to = fixes.length - 1): number {
  let length = 0
  for (let i = from + 1; i <= to; i++) length += localDistance(fixes[i - 1], fixes[i])
  return length
}
