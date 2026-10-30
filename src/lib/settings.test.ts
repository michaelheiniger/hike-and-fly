import { afterEach, describe, expect, it, vi } from 'vitest'

const ASSUMPTIONS_KEY = 'hike-and-fly:assumptions'

/** Loads the settings module fresh, as the app would with this URL hash and stored data. */
async function load(hash: string, stored: Record<string, string> = {}) {
  const storage = new Map(Object.entries(stored))
  vi.stubGlobal('location', { hash })
  vi.stubGlobal('history', { replaceState: () => {} })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  })
  vi.resetModules()
  const module = await import('./settings.svelte')
  const saved = () => (storage.has(ASSUMPTIONS_KEY) ? JSON.parse(storage.get(ASSUMPTIONS_KEY)!) : null)
  return { ...module, saved }
}

afterEach(() => vi.unstubAllGlobals())

describe('stored assumptions', () => {
  it('apply when the URL has none', async () => {
    const { settings } = await load('', { [ASSUMPTIONS_KEY]: JSON.stringify({ glideRatio: 7, startHeightMode: 'amsl' }) })
    expect(settings.glideRatio).toBe(7)
    expect(settings.startHeightMode).toBe('amsl')
    expect(settings.clearance).toBe(50)
  })

  it('give way to a link', async () => {
    const { settings } = await load('#gr=6', { [ASSUMPTIONS_KEY]: JSON.stringify({ glideRatio: 7, clearance: 80 }) })
    expect(settings.glideRatio).toBe(6)
    expect(settings.clearance).toBe(80)
  })

  it('ignore invalid values', async () => {
    const { settings } = await load('', { [ASSUMPTIONS_KEY]: JSON.stringify({ glideRatio: 'x', clearance: 99999 }) })
    expect(settings.glideRatio).toBe(5)
    expect(settings.clearance).toBe(1000)
  })
})

describe('saveAssumptions', () => {
  it('stores only the values that differ from the defaults', async () => {
    const { settings, saveAssumptions, saved } = await load('')
    settings.glideRatio = 7
    saveAssumptions(settings)
    expect(saved()).toEqual({ glideRatio: 7 })
    settings.glideRatio = 5
    saveAssumptions(settings)
    expect(saved()).toBeNull()
  })

  it('stores nothing for an opened link until an assumption changes', async () => {
    const { settings, saveAssumptions, saved } = await load('#gr=8&cl=100&lat=46.6&lng=8')
    settings.start = { lat: 46.7, lng: 8.1 }
    saveAssumptions(settings)
    expect(saved()).toBeNull()
    settings.takeoffRun = 40
    saveAssumptions(settings)
    expect(saved()).toEqual({ glideRatio: 8, clearance: 100, takeoffRun: 40 })
  })
})
