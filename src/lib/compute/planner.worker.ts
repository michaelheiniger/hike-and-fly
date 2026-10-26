/// <reference lib="webworker" />
import { wgs84ToLv95, type LngLat } from '../terrain/geo'
import { AWS_TERRARIUM, SWISS_ARCHIVE, TileLoader } from '../terrain/loader'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { computeReach } from './reach'
import { RoutePlanner } from './route'
import type { GridOptions, LoadTiles } from './terrain'

const loader = new TileLoader(AWS_TERRARIUM, SWISS_ARCHIVE.url)
const loadTiles: LoadTiles = (z, coords) => loader.load(z, coords)

/** Exact elevation from the swisstopo height service (Switzerland, online only). */
async function swissPointElevation(p: LngLat): Promise<number | null> {
  if (p.lng < 5.9 || p.lng > 10.6 || p.lat < 45.8 || p.lat > 47.9) return null
  const { east, north } = wgs84ToLv95(p)
  const url = `https://api3.geo.admin.ch/rest/services/height?easting=${east.toFixed(1)}&northing=${north.toFixed(1)}&sr=2056`
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) return null
  const height = Number((await response.json()).height)
  // Outside its coverage the service answers 0 or nothing useful.
  return Number.isFinite(height) && height > 0 ? height : null
}

// The maximum zoom is set once the archive header is known (see TileLoader.info).
const options: GridOptions = { maxZoom: AWS_TERRARIUM.maxZoom, pointElevation: swissPointElevation }
const planner = new RoutePlanner(loadTiles, options)
const ready = loader.info.then((info) => {
  options.maxZoom = info.maxZoom
  return info
})

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  const { id, kind } = message
  try {
    const info = await ready
    if (message.kind === 'reach') {
      const result = await computeReach(message.request, loadTiles, options)
      post({ id, kind: 'reach', type: 'result', result, elevationSource: info.description }, [result.agl.buffer, result.distance.buffer])
    } else if (message.kind === 'route') {
      post({ id, kind: 'route', type: 'result', result: await planner.plan(message.request) })
    } else {
      post({ id, kind: 'alternatives', type: 'result', result: await planner.alternatives(message.request) })
    }
  } catch (err) {
    post({ id, kind, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
