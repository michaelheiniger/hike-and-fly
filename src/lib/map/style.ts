import type { StyleSpecification } from 'maplibre-gl'

export type BasemapId = 'swisstopo' | 'opentopomap'

export const BASEMAPS: Record<BasemapId, { tiles: string; maxzoom: number; attribution: string }> = {
  swisstopo: {
    tiles: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    maxzoom: 18,
    attribution: '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
  },
  opentopomap: {
    tiles: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxzoom: 17,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
}

/**
 * swisstopo slope classes over 30°, after the SLF avalanche recommendation
 * (Switzerland and border areas, from a 10 m terrain model).
 */
export const SLOPE_OVERLAY = {
  tiles: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.hangneigung-ueber_30/default/current/3857/{z}/{x}/{y}.png',
  maxzoom: 17,
  attribution: '© <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
  classes: [
    { label: '30–35°', color: '#f2e50a' },
    { label: '35–40°', color: '#f46f24' },
    { label: '40–45°', color: '#de055b' },
    { label: '45–50°', color: '#c889bb' },
    { label: '> 50°', color: '#4b4b4b' },
  ],
}

export function initialStyle(): StyleSpecification {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [] }
  for (const [id, b] of Object.entries(BASEMAPS)) {
    style.sources[id] = { type: 'raster', tiles: [b.tiles], tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution }
    style.layers.push({ id, type: 'raster', source: id, layout: { visibility: 'none' } })
  }
  style.sources.slope = {
    type: 'raster',
    tiles: [SLOPE_OVERLAY.tiles],
    tileSize: 256,
    maxzoom: SLOPE_OVERLAY.maxzoom,
    attribution: SLOPE_OVERLAY.attribution,
  }
  style.layers.push({ id: 'slope', type: 'raster', source: 'slope', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.65 } })
  return style
}
