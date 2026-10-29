<script lang="ts">
  import { MAX_GLIDE_RATIO } from '../lib/glide/required'
  import type { RouteOption, RouteResult } from '../lib/compute/route'
  import { altitudeAt } from '../lib/glide/geometry'

  interface Props {
    result: RouteResult | null
    computing: boolean
    searchingAlternatives: boolean
    error: string | null
    glideRatio: number
    arrivalHeight: number
    /** Waypoints the routes fly over. */
    waypointCount: number
    selected: number | null
    onselect: (id: number) => void
    onclear: () => void
  }

  let { result, computing, searchingAlternatives, error, glideRatio, arrivalHeight, waypointCount, selected, onselect, onclear }: Props =
    $props()

  const via = $derived(waypointCount ? ` via ${waypointCount === 1 ? 'the waypoint' : `the ${waypointCount} waypoints`}` : '')

  /** Rounded up: the conservative side. */
  const up = (gr: number) => (Math.ceil(gr * 10 - 1e-9) / 10).toFixed(1)

  /** Glide ratio for the straight line, ignoring terrain: distance over height. */
  const straightRatio = $derived.by(() => {
    if (!result) return null
    const height = result.startAltitude - result.landingElevation - arrivalHeight
    return height > 0 ? result.straightDistance / height : null
  })

  const best = $derived(result?.options[0] ?? null)

  /** Distance along the straight line, in m close to the start. */
  const along = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`)

  /** What the terrain does to the straight line: blocks it, raises its ratio, or nothing. */
  const terrainNote = $derived.by(() => {
    if (!result || straightRatio === null) return null
    const { glideRatio, limit } = result.straightLine
    const where = limit ? `${along(limit.distance)} out (${Math.round(limit.elevation)} m)` : ''
    if (glideRatio === Infinity) return `Blocked by terrain ${where}.`
    if (limit && Number(up(glideRatio)) > Number(up(straightRatio))) return `The terrain raises it to ${up(glideRatio)}: ground ${where}.`
    return 'Clear of the terrain.'
  })

  /** Height above the landing when flying a route with the pilot's glide ratio. */
  const arrival = (o: RouteOption) =>
    altitudeAt(o.liftoff, result!.startAltitude, glideRatio, o.length) - result!.landingElevation

  const letter = (id: number) => String.fromCharCode(65 + id)

  const describe = (o: RouteOption) =>
    o.side ? `${o.side} side, ${(o.offset / 1000).toFixed(1)} km off` : 'Along the straight line'
</script>

<section>
  <div class="head">
    <h2>Landing</h2>
    <button type="button" class="link" onclick={onclear}>Remove</button>
  </div>

  {#if result}
    <div class="row">
      <span class="label">Ground</span>
      <span class="value">{Math.round(result.landingElevation)} m AMSL</span>
    </div>
    <div class="row">
      <span class="label">Vertical distance</span>
      <span class="value">{Math.round(result.startAltitude - result.landingElevation)} m</span>
    </div>
    <div class="row">
      <span class="label">Straight distance{via}</span>
      <span class="value">{(result.straightDistance / 1000).toFixed(1)} km</span>
    </div>
    {#if straightRatio !== null}
      <div class="row">
        <span class="label">Straight line{via}</span>
        <span class="value">needs {up(straightRatio)}</span>
      </div>
      <span class="muted">Distance over height, with {arrivalHeight} m above the landing. {terrainNote}</span>
    {/if}

    <div class="hero" aria-live="polite">
      <span class="label">Required glide ratio</span>
      {#if best}
        <span class="number">{up(best.requiredGlideRatio)}</span>
        <span class="muted">
          {#if waypointCount}
            Through {waypointCount === 1 ? 'the waypoint' : `the ${waypointCount} waypoints`}, in order; the straight line{via}
            {result.straightLine.glideRatio === Infinity
              ? 'is blocked by terrain'
              : `would need ${up(result.straightLine.glideRatio)}`}.
          {:else if !best.side}
            Along the straight line.
          {:else}
            Around terrain on the {best.side.toLowerCase()} side; the straight line
            {result.straightLine.glideRatio === Infinity
              ? 'is blocked by terrain'
              : `would need ${up(result.straightLine.glideRatio)}`}.
          {/if}
          Includes {arrivalHeight} m above the landing.
        </span>
      {:else}
        <span class="number">—</span>
        <span class="muted">
          {#if straightRatio === null}
            The landing is not below the start (with {arrivalHeight} m arrival height).
          {:else}
            Not reachable even with glide ratio {MAX_GLIDE_RATIO}: terrain blocks every route{via}.
          {/if}
        </span>
      {/if}
    </div>

    {#if result.options.length}
      <h3>Routes with your glide ratio {glideRatio}</h3>
      <ul class="routes">
        {#each result.options as o (o.id)}
          {@const reachable = glideRatio >= o.requiredGlideRatio}
          <li>
            <button type="button" class="route" aria-pressed={selected === o.id} onclick={() => onselect(o.id)}>
              <span class="name">
                <strong>{letter(o.id)}</strong>
                {describe(o)}
                {#if o.shortestWithGlideRatio}<em>shortest</em>{/if}
              </span>
              <span class="facts">
                {(o.length / 1000).toFixed(1)} km · needs {up(o.requiredGlideRatio)}
              </span>
              {#if reachable}
                <span class="verdict"><span class="good" aria-hidden="true">✓</span> arrive {Math.round(arrival(o))} m above</span>
              {:else}
                <span class="verdict"><span class="critical" aria-hidden="true">✕</span> not reachable</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <div class="status" aria-live="polite">
    {#if computing}
      <span class="muted">Computing route…</span>
    {:else if searchingAlternatives}
      <span class="muted">Looking for other routes…</span>
    {:else if error}
      <span class="error">⚠ {error}</span>
    {/if}
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h2,
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0;
  }

  h3 {
    margin-top: 4px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .label {
    font-weight: 500;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .number {
    font-size: 28px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--text-muted);
    font-size: 12px;
  }

  .routes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .route {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 8px;
    row-gap: 2px;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
  }

  .route[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .name em {
    font-style: normal;
    font-size: 11px;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
  }

  .name {
    grid-column: 1 / -1;
  }

  .facts {
    color: var(--text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .verdict {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .good {
    color: var(--good);
  }

  .critical {
    color: var(--critical);
  }

  .status {
    min-height: 1em;
  }

  .error {
    color: var(--critical);
  }

  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
