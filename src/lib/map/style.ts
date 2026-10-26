import type { StyleSpecification } from 'maplibre-gl'

export type BasemapId = 'swisstopo' | 'opentopomap'

export const BASEMAPS: Record<BasemapId, { label: string; tiles: string; maxzoom: number; attribution: string }> = {
  swisstopo: {
    label: 'swisstopo (Switzerland)',
    tiles: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    maxzoom: 18,
    attribution: '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
  },
  opentopomap: {
    label: 'OpenTopoMap (worldwide)',
    tiles: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxzoom: 17,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
}

export function initialStyle(): StyleSpecification {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [] }
  for (const [id, b] of Object.entries(BASEMAPS)) {
    style.sources[id] = { type: 'raster', tiles: [b.tiles], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution }
    style.layers.push({ id, type: 'raster', source: id, layout: { visibility: 'none' } })
  }
  return style
}
