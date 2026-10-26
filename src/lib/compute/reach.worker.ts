/// <reference lib="webworker" />
import { aglBands, renderAgl } from '../render/agl'
import { AWS_TERRARIUM, TileLoader } from '../terrain/loader'
import { computeReach, ReachError } from './reach'
import type { WorkerRequest, WorkerResponse } from './protocol'

const source = AWS_TERRARIUM
const loader = new TileLoader(source)

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data
  try {
    const result = await computeReach(request, (z, coords) => loader.load(z, coords), { maxZoom: source.maxZoom })
    const image = renderAgl(result.agl, result.grid, aglBands(request.clearance))
    const canvas = new OffscreenCanvas(image.width, image.height)
    canvas.getContext('2d')!.putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0)
    const png = await canvas.convertToBlob({ type: 'image/png' })
    post({ id, type: 'result', result, png }, [result.agl.buffer, result.distance.buffer])
  } catch (err) {
    const message = err instanceof ReachError || err instanceof Error ? err.message : String(err)
    post({ id, type: 'error', message })
  }
}
