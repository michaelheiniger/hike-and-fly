import { describe, expect, it, vi } from 'vitest'
import { reportDetails, reportPayload, sendReport, WEB3FORMS_ENDPOINT, type ReportContext } from './report'

const context = (overrides: Partial<ReportContext> = {}): ReportContext => ({
  settings: {
    start: { lat: 46.644121, lng: 7.648172 },
    landing: { lat: 46.585606, lng: 7.65324 },
    waypoints: [{ lat: 46.6148, lng: 7.6507 }],
    startHeight: 0,
    startHeightMode: 'agl',
    glideRatio: 5,
    clearance: 50,
    launchZone: 500,
    takeoffRun: 30,
    arrivalHeight: 100,
  },
  planUrl: 'https://example.org/hike-and-fly/#lat=46.64412&lng=7.64817',
  results: {
    startElevation: 2258.4,
    landingElevation: 779.2,
    routes: [
      { name: 'A, along the straight line', length: 6546, requiredGlideRatio: 4.728 },
      { name: 'B, east side, 0.4 km off', length: 7032, requiredGlideRatio: 5.1 },
    ],
    straightGlideRatio: 4.733,
    routeCellSize: 13.03,
    reachCellSize: 12.7,
    elevationSource: 'swissALTI3D',
  },
  version: 'abc1234',
  userAgent: 'TestBrowser/1.0',
  online: true,
  ...overrides,
})

describe('issue report', () => {
  it('attaches the plan link and every setting', () => {
    const details = reportDetails(context())
    expect(details).toContain('Plan link: https://example.org/hike-and-fly/#lat=46.64412&lng=7.64817')
    expect(details).toContain('Start: 46.64412°, 7.64817° (ground 2258 m)')
    expect(details).toContain('Landing: 46.58561°, 7.65324° (ground 779 m)')
    expect(details).toContain('Waypoints: 1: 46.61480°, 7.65070°')
    for (const line of ['Start height: 0 m AGL', 'Glide ratio: 5', 'Terrain clearance: 50 m', 'Launch zone: 500 m', 'Takeoff run: 30 m', 'Arrival height: 100 m']) {
      expect(details).toContain(line)
    }
  })

  it('attaches the results as the app shows them, rounded up', () => {
    const details = reportDetails(context())
    expect(details).toContain('Required glide ratio: 4.8')
    expect(details).toContain('Route A, along the straight line: 6.5 km, needs 4.8')
    expect(details).toContain('Route B, east side, 0.4 km off: 7.0 km, needs 5.1')
    expect(details).toContain('Straight line needs: 4.8')
    expect(details).toContain('App version abc1234 · online · TestBrowser/1.0')
  })

  it('says what is missing and what failed', () => {
    const details = reportDetails(
      context({
        settings: { ...context().settings, landing: null, waypoints: [] },
        results: { straightGlideRatio: Infinity, errors: ['Elevation tile 13/1/2: HTTP 503'] },
      }),
    )
    expect(details).toContain('Landing: —')
    expect(details).toContain('Waypoints: —')
    expect(details).toContain('Straight line needs: blocked by terrain')
    expect(details).toContain('Error: Elevation tile 13/1/2: HTTP 503')
  })

  it('sends the words and the plan, with a reply address only when given', () => {
    const payload = reportPayload(context(), { category: 'results', message: 'Needs 4.8, I flew it with 4.', email: '  ' })
    expect(payload.subject).toBe('Hike & Fly report: Results look wrong')
    expect(payload.message).toBe('Needs 4.8, I flew it with 4.')
    expect(payload.plan_link).toBe(context().planUrl)
    expect(payload.plan).toContain('Takeoff run: 30 m')
    expect(payload.results).toContain('Required glide ratio: 4.8')
    expect(payload.app_version).toBe('abc1234')
    expect(payload).not.toHaveProperty('email')
    expect(reportPayload(context(), { category: 'bug', message: 'x', email: ' pilot@example.org ' }).email).toBe('pilot@example.org')
  })

  it('posts to Web3Forms and fails on a refusal', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    await sendReport({ message: 'x' }, ok)
    expect(ok).toHaveBeenCalledWith(WEB3FORMS_ENDPOINT, expect.objectContaining({ method: 'POST', body: '{"message":"x"}' }))

    const refused = vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'Invalid access key' }), { status: 400 }))
    await expect(sendReport({ message: 'x' }, refused)).rejects.toThrow('Invalid access key')
  })
})
