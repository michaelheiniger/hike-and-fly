import { latFromMercatorY, mercatorY, type GeoGrid } from '../terrain/geo'

export interface AglBand {
  /** Lower bound (inclusive) in meters AGL. */
  from: number
  /** Upper bound (exclusive), Infinity for the last band. */
  to: number
  color: string
  label: string
}

export type ColorScheme = 'standard' | 'colorblind'

interface Palette {
  /** Below the clearance: reachable as a final glide only. */
  belowClearance: string
  /** Bands above the clearance, low to high AGL. */
  ramp: string[]
}

const PALETTES: Record<ColorScheme, Palette> = {
  /** Red to green (ColorBrewer RdYlGn): reads as danger to safe. */
  standard: {
    belowClearance: '#d73027',
    ramp: ['#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'],
  },
  /**
   * Viridis, dark purple to yellow: lightness rises steadily with AGL, so the
   * order reads without telling hues apart (all common colour blindness types).
   */
  colorblind: {
    belowClearance: '#440154',
    ramp: ['#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'],
  },
}

const LEVELS = [250, 500, 750, 1000, 1500, 2000]

/** Color bands for AGL; the first band (0 – clearance) is "final glide only". */
export function aglBands(clearance: number, scheme: ColorScheme = 'standard'): AglBand[] {
  const { belowClearance, ramp } = PALETTES[scheme]
  const bands: AglBand[] = []
  if (clearance > 0) {
    bands.push({ from: 0, to: clearance, color: belowClearance, label: `0–${clearance} m · final glide only` })
  }
  const bounds = [clearance, ...LEVELS.filter((l) => l > clearance), Infinity]
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]
    const to = bounds[i + 1]
    bands.push({
      from,
      to,
      color: ramp[Math.min(i, ramp.length - 1)],
      label: to === Infinity ? `> ${from} m` : `${from}–${to} m`,
    })
  }
  return bands
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * RGBA image of the AGL bands, unreachable cells transparent. The grid has rows of
 * constant latitude step, while a map image overlay is stretched linearly in Web
 * Mercator: output rows are resampled at Mercator-linear latitudes to line up.
 */
export function renderAgl(agl: Float32Array, grid: GeoGrid, bands: AglBand[]): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
  const width = grid.cols
  const height = grid.rows
  const rgba = new Uint8ClampedArray(width * height * 4)
  const colors = bands.map((b) => hexToRgb(b.color))
  const yNorth = mercatorY(grid.north)
  const ySouth = mercatorY(grid.north - grid.rows * grid.dLat)

  for (let j = 0; j < height; j++) {
    const lat = latFromMercatorY(yNorth + ((j + 0.5) / height) * (ySouth - yNorth))
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((grid.north - lat) / grid.dLat)))
    for (let c = 0; c < width; c++) {
      const v = agl[row * grid.cols + c]
      if (Number.isNaN(v)) continue
      let b = bands.length - 1
      while (b > 0 && v < bands[b].from) b--
      const [r, g, bl] = colors[b]
      const p = (j * width + c) * 4
      rgba[p] = r
      rgba[p + 1] = g
      rgba[p + 2] = bl
      rgba[p + 3] = 255
    }
  }
  return { width, height, rgba }
}
