/// <reference lib="webworker" />
import { aglBands, renderAgl } from '../render/agl'
import { AWS_TERRARIUM, TileLoader } from '../terrain/loader'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { computeReach } from './reach'
import { RoutePlanner } from './route'
import type { LoadTiles } from './terrain'

const source = AWS_TERRARIUM
const loader = new TileLoader(source)
const loadTiles: LoadTiles = (z, coords) => loader.load(z, coords)
const options = { maxZoom: source.maxZoom }
const planner = new RoutePlanner(loadTiles, options)

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  const { id, kind } = message
  try {
    if (message.kind === 'reach') {
      const result = await computeReach(message.request, loadTiles, options)
      const image = renderAgl(result.agl, result.grid, aglBands(message.request.clearance))
      const canvas = new OffscreenCanvas(image.width, image.height)
      canvas.getContext('2d')!.putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0)
      const png = await canvas.convertToBlob({ type: 'image/png' })
      post({ id, kind: 'reach', type: 'result', result, png }, [result.agl.buffer, result.distance.buffer])
    } else {
      post({ id, kind: 'route', type: 'result', result: await planner.plan(message.request) })
    }
  } catch (err) {
    post({ id, kind, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
