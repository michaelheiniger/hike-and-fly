import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileLoader } from '../terrain/loader'
import { deleteArea, downloadArea, listAreas, planArea, type AreaPlan } from './areas'
import { TILE_CACHE, offlineElevationUrl } from './store'

/** In-memory Cache Storage, enough for the offline areas. */
class FakeCache {
  entries = new Map<string, Blob>()
  async match(key: string) {
    const blob = this.entries.get(key)
    return blob ? new Response(blob) : undefined
  }
  async put(key: string, response: Response) {
    this.entries.set(key, await response.blob())
  }
  async delete(key: string) {
    return this.entries.delete(key)
  }
}

let cacheStorage: Map<string, FakeCache>
let fetched: number

const loader = { tileBytes: async () => (fetched++, new Blob(['elevation'])) } as unknown as TileLoader
const download = (plan: AreaPlan) => downloadArea(plan, loader, () => {}, new AbortController().signal)
const planKeys = (plan: AreaPlan) => [...plan.mapTiles, ...plan.elevationTiles.map(([z, x, y]) => offlineElevationUrl(z, x, y))]
const tileKeys = () => [...cacheStorage.get(TILE_CACHE)!.entries.keys()].filter((k) => !k.includes('/offline-areas/'))

// About 20 × 15 km around Grindelwald, and an area overlapping its east half.
const grindelwald = { west: 7.95, south: 46.6, east: 8.2, north: 46.74 }
const east = { west: 8.08, south: 46.6, east: 8.33, north: 46.74 }

beforeEach(() => {
  cacheStorage = new Map()
  fetched = 0
  const storage = new Map<string, string>()
  vi.stubGlobal('self', { location: { origin: 'http://test' } })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  })
  vi.stubGlobal('caches', {
    open: async (name: string) => cacheStorage.get(name) ?? cacheStorage.set(name, new FakeCache()).get(name),
    delete: async (name: string) => cacheStorage.delete(name),
  })
  vi.stubGlobal('fetch', async () => (fetched++, new Response('map')))
})

afterEach(() => vi.unstubAllGlobals())

describe('downloadArea', () => {
  it('stores tiles shared by overlapping areas once', async () => {
    const a = planArea(grindelwald, 13)
    const b = planArea(east, 13)
    await download(a)
    const second = await download(b)
    const union = new Set([...planKeys(a), ...planKeys(b)])
    expect(union.size).toBeLessThan(planKeys(a).length + planKeys(b).length)
    expect(tileKeys()).toHaveLength(union.size)
    expect(fetched).toBe(union.size)
    expect(second.tiles).toBe(planKeys(b).length)
  })

  it('replaces an identical area without downloading again', async () => {
    const plan = planArea(grindelwald, 13)
    await download(plan)
    const stored = tileKeys().length
    fetched = 0
    await download(plan)
    expect(fetched).toBe(0)
    expect(tileKeys().length).toBe(stored)
    expect(listAreas()).toHaveLength(1)
  })
})

describe('deleteArea', () => {
  it('keeps the tiles another area still uses', async () => {
    const first = await download(planArea(grindelwald, 13))
    const second = await download(planArea(east, 13))
    await deleteArea(first.id)
    expect(tileKeys().sort()).toEqual([...new Set(planKeys(planArea(east, 13)))].sort())
    await deleteArea(second.id)
    expect(tileKeys()).toHaveLength(0)
    expect(listAreas()).toHaveLength(0)
  })
})
