<script lang="ts">
  import { MAX_GLIDE_RATIO } from '../lib/glide/required'
  import { km, num, ratio, t } from '../lib/i18n/index.svelte'
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
  }

  let { result, computing, searchingAlternatives, error, glideRatio, arrivalHeight, waypointCount, selected, onselect }: Props =
    $props()

  /** Glide ratio for the straight line, ignoring terrain: distance over height. */
  const straightRatio = $derived.by(() => {
    if (!result) return null
    const height = result.startAltitude - result.landingElevation - arrivalHeight
    return height > 0 ? result.straightDistance / height : null
  })

  const best = $derived(result?.options[0] ?? null)

  /** Height above the landing when flying a route with the pilot's glide ratio. */
  const arrival = (o: RouteOption) =>
    altitudeAt(o.liftoff, result!.startAltitude, glideRatio, o.length) - result!.landingElevation

  const letter = (id: number) => String.fromCharCode(65 + id)

  const side = (s: string) => t.compass[s] ?? s
  const describe = (o: RouteOption) => (o.side ? t.route.sideOffset(side(o.side), km(o.offset)) : t.route.alongStraightName)
  /** The straight line's glide ratio, null when terrain blocks it. */
  const straight = (gr: number) => (gr === Infinity ? null : ratio(gr))
</script>

<section>
  {#if result}
    <div class="hero" aria-live="polite">
      <span class="label">{t.route.requiredGlideRatio}</span>
      {#if best}
        <span class="number">{ratio(best.requiredGlideRatio)}</span>
        <span class="muted">
          {#if waypointCount}
            {t.route.viaWaypoints(waypointCount, straight(result.straightLine.glideRatio))}
          {:else if !best.side}
            {t.route.alongStraight}
          {:else}
            {t.route.aroundSide(side(best.side), straight(result.straightLine.glideRatio))}
          {/if}
          {t.route.includesArrival(arrivalHeight)}
        </span>
      {:else}
        <span class="number">—</span>
        <span class="muted">
          {#if straightRatio === null}
            {t.route.landingNotBelow(arrivalHeight)}
          {:else}
            {t.route.blockedEverywhere(MAX_GLIDE_RATIO, waypointCount)}
          {/if}
        </span>
      {/if}
    </div>

    {#if result.options.length}
      <h3>{t.route.routesWith(num(glideRatio, Number.isInteger(glideRatio) ? 0 : 1))}</h3>
      <ul class="routes">
        {#each result.options as o (o.id)}
          {@const reachable = glideRatio >= o.requiredGlideRatio}
          <li>
            <button type="button" class="route" aria-pressed={selected === o.id} onclick={() => onselect(o.id)}>
              <span class="name">
                <strong>{letter(o.id)}</strong>
                {describe(o)}
                {#if o.shortestWithGlideRatio}<em>{t.route.shortest}</em>{/if}
              </span>
              <span class="facts">{t.route.facts(km(o.length), ratio(o.requiredGlideRatio))}</span>
              {#if reachable}
                <span class="verdict"><span class="good" aria-hidden="true">✓</span> {t.route.arrive(Math.round(arrival(o)))}</span>
              {:else}
                <span class="verdict"><span class="critical" aria-hidden="true">✕</span> {t.route.notReachable}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <div class="status" aria-live="polite">
    {#if computing}
      <span class="muted">{t.route.computing}</span>
    {:else if searchingAlternatives}
      <span class="muted">{t.route.searching}</span>
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

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 4px 0 0;
  }

  .label {
    font-weight: 500;
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
</style>
