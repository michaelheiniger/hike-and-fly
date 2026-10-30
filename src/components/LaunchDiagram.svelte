<script lang="ts">
  import { clearanceAt } from '../lib/glide/geometry'
  import { t } from '../lib/i18n/index.svelte'

  interface Props {
    clearance: number
    launchZone: number
    takeoffRun: number
  }

  let { clearance, launchZone, takeoffRun }: Props = $props()

  // A schematic side view on a straight slope: distances to scale, heights not. The slope
  // drops four clearances over the drawing, the glide path half as much, so the clearance
  // and the glide stay legible whatever the values.
  /** Drawn at its width in pixels, so the text keeps its size. */
  let W = $state(320)
  const H = 136
  /** Room on the right for the clearance's label. */
  const margin = { top: 8, right: 44, bottom: 34, left: 6 }
  const plotW = $derived(Math.max(10, W - margin.left - margin.right))
  const plotH = H - margin.top - margin.bottom

  /** Meters drawn: the run and the launch zone (at least 100 m of glide), and a little beyond. */
  const length = $derived((takeoffRun + Math.max(launchZone, 100)) * 1.15)
  const drop = $derived(4 * Math.max(clearance, 10))
  const ground = (d: number) => drop * (1 - d / length)
  const glide = (d: number) => (d <= takeoffRun ? ground(d) : ground(takeoffRun) - ((d - takeoffRun) * drop) / length / 2)
  /** Clearance above the ground: none on the run, then ramped from the liftoff. */
  const floor = (d: number) => ground(d) + (d <= takeoffRun ? 0 : clearanceAt({ clearance, launchZone }, d - takeoffRun))

  const x = (d: number) => margin.left + (d / length) * plotW
  const y = (a: number) => margin.top + (1 - a / drop) * plotH

  const line = (f: (d: number) => number, from = 0) =>
    Array.from({ length: 81 }, (_, i) => from + ((length - from) * i) / 80)
      .map((d, i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(f(d)).toFixed(1)}`)
      .join('')

  const zoneEnd = $derived(takeoffRun + launchZone)
  /** The full clearance is marked at the right end, beyond the launch zone, its label in the margin. */
  const full = $derived(length)
  const groundArea = $derived(`${line(ground)}L${x(length)},${margin.top + plotH}L${x(0)},${margin.top + plotH}Z`)
  /** Distances along the axis; of two that would overlap, the farther one (the liftoff over the start). */
  const ticks = $derived.by(() => {
    const kept: number[] = []
    for (const d of [zoneEnd, takeoffRun, 0]) if (!kept.length || x(kept[0]) - x(d) > 34) kept.unshift(d)
    return kept
  })
  /** A narrow run is labelled from the start rather than centered on it. */
  const runWide = $derived(x(takeoffRun) - x(0) > t.diagram.run.length * 6 + 6)
</script>

<div bind:clientWidth={W}>
  <svg
    width={W}
    height={H}
    role="img"
    aria-label={t.diagram.label(takeoffRun, clearance, launchZone)}
  >
    {#if takeoffRun > 0}
      <rect class="zone run" x={x(0)} y={margin.top} width={x(takeoffRun) - x(0)} height={plotH} />
    {/if}
    {#if launchZone > 0}
      <rect class="zone launch" x={x(takeoffRun)} y={margin.top} width={x(zoneEnd) - x(takeoffRun)} height={plotH} />
    {/if}

    <path class="ground-area" d={groundArea} />
    <path class="ground" d={line(ground)} />
    <!-- Ends of the run and the launch zone, over the ground, all the way down. -->
    {#if takeoffRun > 0}
      <line class="zone-end" x1={x(takeoffRun)} x2={x(takeoffRun)} y1={margin.top} y2={margin.top + plotH} />
    {/if}
    {#if launchZone > 0}
      <line class="zone-end" x1={x(zoneEnd)} x2={x(zoneEnd)} y1={margin.top} y2={margin.top + plotH} />
    {/if}
    <path class="clearance" d={line(floor)} />
    <path class="glide" d={line(glide)} />

    <!-- Full clearance, beyond the launch zone. -->
    <line class="bracket" x1={x(full) + 4} x2={x(full) + 4} y1={y(ground(full))} y2={y(floor(full))} />
    <text class="label" x={x(full) + 8} y={(y(ground(full)) + y(floor(full))) / 2} dominant-baseline="middle">
      {clearance} m
    </text>

    <circle class="start" cx={x(0)} cy={y(ground(0))} r="3.5" />
    {#if takeoffRun > 0}
      <circle class="liftoff" cx={x(takeoffRun)} cy={y(ground(takeoffRun))} r="3.5" />
    {/if}

    <!-- Axis: band names, then distances from the start. -->
    {#if takeoffRun > 0}
      <text class="label" x={runWide ? (x(0) + x(takeoffRun)) / 2 : x(0)} y={H - 18} text-anchor={runWide ? 'middle' : 'start'}>
        {t.diagram.run}
      </text>
    {/if}
    {#if launchZone > 0}
      <text class="label" x={(x(takeoffRun) + x(zoneEnd)) / 2} y={H - 18} text-anchor="middle">{t.diagram.launchZone}</text>
    {/if}
    {#each ticks as d (d)}
      <text class="tick" x={x(d)} y={H - 4} text-anchor={d === 0 ? 'start' : 'middle'}>{d} m</text>
    {/each}
  </svg>
</div>
<p class="note">{t.diagram.note}</p>

<style>
  svg {
    display: block;
  }

  .zone {
    fill: var(--text-muted);
  }

  .zone.run {
    opacity: 0.16;
  }

  .zone.launch {
    opacity: 0.07;
  }

  .zone-end {
    stroke: var(--text-muted);
    stroke-dasharray: 2 3;
    opacity: 0.7;
  }

  .ground-area {
    fill: var(--terrain);
  }

  .ground {
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
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .bracket {
    stroke: var(--text);
    stroke-width: 1;
  }

  .start {
    fill: var(--text);
    stroke: var(--surface);
    stroke-width: 1.5;
  }

  /* As in the altitude profile. */
  .liftoff {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 2;
  }

  .label,
  .tick {
    fill: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .label {
    fill: var(--text);
  }

  .note {
    margin: 0;
    font-size: 11px;
    color: var(--text-muted);
  }
</style>
