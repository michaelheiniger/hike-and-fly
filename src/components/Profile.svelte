<script lang="ts">
  import type { Route } from '../lib/compute/route'
  import type { LngLat } from '../lib/terrain/geo'

  interface Props {
    route: Route
    /** True when this is the route at the required glide ratio, not the pilot's. */
    isRequired: boolean
    landingElevation: number
    arrivalHeight: number
    clearance: number
    launchZone: number
    onhover: (p: LngLat | null) => void
  }

  let { route, isRequired, landingElevation, arrivalHeight, clearance, launchZone, onhover }: Props = $props()

  let width = $state(600)
  const height = 150
  const margin = { top: 8, right: 12, bottom: 22, left: 46 }

  const points = $derived(route.profile)
  const length = $derived(points.at(-1)?.distance ?? 1)
  const clearanceAt = (d: number) => (launchZone > 0 ? clearance * Math.min(1, d / launchZone) : clearance)

  const yDomain = $derived.by(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      lo = Math.min(lo, p.terrain)
      hi = Math.max(hi, p.altitude, p.terrain + clearanceAt(p.distance))
    }
    const pad = (hi - lo) * 0.08 + 20
    return [Math.floor((lo - pad) / 100) * 100, Math.ceil((hi + pad) / 100) * 100]
  })

  const plotW = $derived(Math.max(10, width - margin.left - margin.right))
  const plotH = height - margin.top - margin.bottom
  const x = (d: number) => margin.left + (d / length) * plotW
  const y = (alt: number) => margin.top + (1 - (alt - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH

  const path = (values: [number, number][]) => values.map(([d, a], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(a).toFixed(1)}`).join('')

  const terrainLine = $derived(path(points.map((p) => [p.distance, p.terrain])))
  const terrainArea = $derived(`${terrainLine}L${x(length)},${y(yDomain[0])}L${x(0)},${y(yDomain[0])}Z`)
  const glideLine = $derived(path(points.map((p) => [p.distance, p.altitude])))
  const clearanceLine = $derived(path(points.map((p) => [p.distance, p.terrain + clearanceAt(p.distance)])))

  /** Round axis steps: 1, 2 or 5 × 10^n. */
  function ticks(lo: number, hi: number, count: number): number[] {
    const raw = (hi - lo) / count
    const mag = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
    const out: number[] = []
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
    return out
  }

  const yTicks = $derived(ticks(yDomain[0], yDomain[1], 4))
  const xTicks = $derived(ticks(0, length / 1000, Math.max(2, Math.floor(plotW / 80))))

  let hoverIndex: number | null = $state(null)
  const hovered = $derived(hoverIndex === null ? null : points[hoverIndex])

  function move(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const d = ((e.clientX - rect.left - margin.left) / plotW) * length
    if (d < 0 || d > length) return leave()
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].distance - d) < Math.abs(points[best].distance - d)) best = i
    }
    hoverIndex = best
    onhover({ lng: points[best].lng, lat: points[best].lat })
  }

  function leave() {
    hoverIndex = null
    onhover(null)
  }
</script>

<figure class="profile">
  <figcaption>
    <strong>Profile · glide ratio {route.glideRatio.toFixed(1)}{isRequired ? ' (required)' : ''}</strong>
    <span>{(route.length / 1000).toFixed(1)} km flown · arrive {Math.round(route.arrivalAgl)} m above the landing</span>
    <span class="legend">
      <span class="key"><i class="swatch glide"></i>Glide path</span>
      <span class="key"><i class="swatch clearance"></i>Clearance</span>
      <span class="key"><i class="swatch terrain"></i>Terrain</span>
    </span>
  </figcaption>

  <div class="plot" bind:clientWidth={width}>
    <svg {width} {height} role="img" aria-label="Altitude profile along the route" onpointermove={move} onpointerleave={leave}>
      {#each yTicks as t (t)}
        <line class="grid" x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={margin.left - 6} y={y(t)} text-anchor="end" dominant-baseline="middle">{t}</text>
      {/each}
      {#each xTicks as t (t)}
        <text class="tick" x={x(t * 1000)} y={height - 6} text-anchor="middle">{t} km</text>
      {/each}

      <path class="terrain-area" d={terrainArea} />
      <path class="terrain" d={terrainLine} />
      <path class="clearance" d={clearanceLine} />
      <path class="glide" d={glideLine} />

      <!-- Arrival height at the landing. -->
      <line class="reserve" x1={x(length) - 8} x2={x(length)} y1={y(landingElevation + arrivalHeight)} y2={y(landingElevation + arrivalHeight)} />

      {#if hovered}
        <line class="crosshair" x1={x(hovered.distance)} x2={x(hovered.distance)} y1={margin.top} y2={margin.top + plotH} />
        <circle class="dot" cx={x(hovered.distance)} cy={y(hovered.altitude)} r="4" />
      {/if}
    </svg>

    {#if hovered}
      <div class="tooltip" style:left="{Math.min(x(hovered.distance) + 10, width - 210)}px">
        <strong>{Math.round(hovered.altitude - hovered.terrain)} m AGL</strong>
        <span>{Math.round(hovered.altitude)} m AMSL · terrain {Math.round(hovered.terrain)} m</span>
        <span>{(hovered.distance / 1000).toFixed(1)} km flown</span>
      </div>
    {/if}
  </div>
</figure>

<style>
  .profile {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 12px;
    row-gap: 2px;
    font-size: 13px;
  }

  figcaption span {
    color: var(--text-muted);
  }

  .legend {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }

  .swatch {
    display: inline-block;
    width: 16px;
    height: 0;
    border-top: 2px solid;
  }

  .swatch.glide {
    border-color: var(--accent);
  }

  .swatch.clearance {
    border-top: 1.5px dashed var(--text-muted);
  }

  .swatch.terrain {
    height: 8px;
    border: 0;
    background: var(--terrain);
    border-radius: 2px;
  }

  .plot {
    position: relative;
  }

  svg {
    display: block;
    touch-action: none;
  }

  .grid {
    stroke: var(--border);
    stroke-width: 1;
    opacity: 0.6;
  }

  .tick {
    fill: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .terrain-area {
    fill: var(--terrain);
  }

  .terrain {
    fill: none;
    stroke: var(--terrain-line);
    stroke-width: 1.5;
  }

  .clearance {
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  .glide {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
  }

  .reserve {
    stroke: var(--text);
    stroke-width: 2;
  }

  .crosshair {
    stroke: var(--text-muted);
    stroke-width: 1;
  }

  .dot {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .tooltip {
    position: absolute;
    top: 4px;
    width: 200px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    box-shadow: var(--shadow);
  }

  .tooltip span {
    color: var(--text-muted);
  }
</style>
