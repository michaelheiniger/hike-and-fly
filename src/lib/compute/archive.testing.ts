/// <reference types="node" />
/**
 * Elevation tiles from the local swissALTI3D archive (built by tools/terrain), for
 * tests in Node: the app's loader needs a browser (OffscreenCanvas, fetch).
 */
import { existsSync, openSync, readSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { PMTiles } from 'pmtiles'
import { decodeTerrarium, tileKey, type TileSet } from '../terrain/terrarium'
import type { LoadTiles } from './terrain'

export const ARCHIVE_PATH = fileURLToPath(new URL('../../../public/terrain/swissalti3d.pmtiles', import.meta.url))

export const hasArchive = existsSync(ARCHIVE_PATH)

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG (what terrarium tiles are) to RGBA. */
export function decodePng(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let width = 0
  let height = 0
  let channels = 0
  const chunks: Uint8Array[] = []
  for (let p = 8; p < png.length; ) {
    const length = view.getUint32(p)
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8))
    const data = png.subarray(p + 8, p + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(p + 8)
      height = view.getUint32(p + 12)
      const [depth, colorType, , , interlace] = data.subarray(8)
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(`Unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`)
      }
      channels = colorType === 6 ? 4 : 3
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    p += 12 + length
  }

  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  let line = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = a
      else if (filter === 2) predictor = b
      else if (filter === 3) predictor = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[i] = (src[i] + predictor) & 255
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      out[o] = line[x * channels]
      out[o + 1] = line[x * channels + 1]
      out[o + 2] = line[x * channels + 2]
      out[o + 3] = 255
    }
    ;[prev, line] = [line, prev]
  }
  return out
}

/** Tile loader over the local archive. Fails on tiles it does not have (no network fallback). */
export async function archiveTiles(): Promise<{ loadTiles: LoadTiles; maxZoom: number }> {
  const fd = openSync(ARCHIVE_PATH, 'r')
  const archive = new PMTiles({
    getKey: () => ARCHIVE_PATH,
    getBytes: async (offset: number, length: number) => {
      const buffer = Buffer.alloc(length)
      const read = readSync(fd, buffer, 0, length, offset)
      return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + read) }
    },
  })
  const { maxZoom } = await archive.getHeader()
  const cache = new Map<string, Float32Array>()

  const tile = async (z: number, x: number, y: number) => {
    const key = tileKey(z, x, y)
    let data = cache.get(key)
    if (!data) {
      const found = await archive.getZxy(z, x, y)
      if (!found) throw new Error(`Tile ${key} is not in the archive`)
      data = decodeTerrarium(decodePng(new Uint8Array(found.data)))
      cache.set(key, data)
    }
    return data
  }

  const loadTiles: LoadTiles = async (z, coords) => {
    const tiles: TileSet = new Map()
    for (const [x, y] of coords) tiles.set(tileKey(z, x, y), await tile(z, x, y))
    return tiles
  }
  return { loadTiles, maxZoom }
}
