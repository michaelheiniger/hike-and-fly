<script lang="ts">
  import type { ReachResult } from '../lib/compute/reach'
  import type { RouteResult } from '../lib/compute/route'
  import { formatRatio } from '../lib/glide/required'
  import { km, num, ratio, t } from '../lib/i18n/index.svelte'
  import { settings } from '../lib/settings.svelte'

  interface Props {
    reach: ReachResult | null
    reachComputing: boolean
    reachError: string | null
    /** Route to the landing, for its ground height and the straight line. */
    route: RouteResult | null
    arrivalHeight: number
    onclearlanding: () => void
  }

  let { reach, reachComputing, reachError, route, arrivalHeight, onclearlanding }: Props = $props()

  /** Icons, 24 × 24, drawn with lines. */
  const ICONS = {
    ground: 'M3 20h18M4 20l6-10 3 4 2-3 5 9',
    altitude: 'M12 20V5M7 10l5-5 5 5',
    height: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
    distance: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    straight: 'M4 6l16 12',
    to: 'M4 12h16M14 6l6 6-6 6',
  }

  const coords = (p: { lat: number; lng: number }) => `${p.lat.toFixed(4)}°, ${p.lng.toFixed(4)}°`
  const along = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${km(d)} km`)
  const seconds = (ms: number) => num(ms / 1000, 1)

  /** Height of the start above its ground, when not a ground launch. */
  const aboveGround = $derived(reach ? Math.round(reach.startAltitude - reach.startElevation) : 0)

  /** Glide ratio for the straight line, ignoring terrain: distance over height. */
  const straightRatio = $derived.by(() => {
    if (!route) return null
    const height = route.startAltitude - route.landingElevation - arrivalHeight
    return height > 0 ? route.straightDistance / height : null
  })

  /** What the terrain does to the straight line, when it does something. */
  const terrainNote = $derived.by(() => {
    if (!route || straightRatio === null) return null
    const { glideRatio, limit } = route.straightLine
    const where = limit ? t.places.where(along(limit.distance), Math.round(limit.elevation)) : ''
    if (glideRatio === Infinity) return t.places.terrainBlocks(where)
    if (limit && Number(formatRatio(glideRatio)) > Number(formatRatio(straightRatio)))
      return t.places.terrainRaises(ratio(glideRatio), where)
    return null
  })
</script>

{#snippet icon(name: keyof typeof ICONS, label: string)}
  <svg viewBox="0 0 24 24" width="14" height="14" role="img" aria-label={label}>
    <title>{label}</title>
    <path d={ICONS[name]} />
  </svg>
{/snippet}

{#snippet pin(color: string)}
  <svg class="pin" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 22s7-7.2 7-12.5a7 7 0 0 0-14 0C5 14.8 12 22 12 22z" fill={color} />
    <circle cx="12" cy="9.5" r="2.6" fill="#ffffff" />
  </svg>
{/snippet}

{#if settings.start}
  <section>
    <div class="places">
      <span class="place" title="{t.places.start}: {coords(settings.start)}">
        {@render pin('#1a1a19')}
        <span class="visually-hidden">{t.places.start}</span>
        {#if reach && aboveGround}
          <span title={t.places.startAltitudeTitle(aboveGround, Math.round(reach.startElevation))}>
            {@render icon('altitude', t.places.startAltitude)}{Math.round(reach.startAltitude)} m
          </span>
        {:else if reach}
          <span title={t.places.groundAtStart}>{@render icon('ground', t.places.ground)}{Math.round(reach.startElevation)} m</span>
        {/if}
      </span>

      {#if settings.landing}
        {@render icon('to', t.places.to)}
        <span class="place" title="{t.places.landing}: {coords(settings.landing)}">
          {@render pin('#2a78d6')}
          <span class="visually-hidden">{t.places.landing}</span>
          {#if route}
            <span title={t.places.groundAtLanding}>{@render icon('ground', t.places.ground)}{Math.round(route.landingElevation)} m</span>
          {/if}
        </span>
        <button type="button" class="remove" aria-label={t.places.removeLanding} title={t.places.removeLanding} onclick={onclearlanding}>
          ✕
        </button>
      {/if}
    </div>

    {#if settings.landing}
      {#if route}
        <div class="facts">
          <span title={t.places.heightDifferenceTitle}>
            {@render icon('height', t.places.heightDifference)}{Math.round(route.startAltitude - route.landingElevation)} m
          </span>
          <span title={t.places.straightDistance}>{@render icon('distance', t.places.distance)}{km(route.straightDistance)} km</span>
          {#if straightRatio !== null}
            <span title={t.places.straightRatioTitle(arrivalHeight)}>
              {@render icon('straight', t.places.straightRatio)}{ratio(straightRatio)}
            </span>
          {/if}
        </div>
        {#if terrainNote}<span class="muted">{terrainNote}</span>{/if}
      {/if}
    {/if}

    <div class="status" aria-live="polite">
      {#if reachComputing}
        <span class="muted">{t.places.computing}</span>
      {:else if reachError}
        <span class="error">⚠ {reachError}</span>
      {:else if reach && reach.reachableCells <= 1}
        <span class="warning">⚠ {t.places.noGlide(settings.takeoffRun)}</span>
      {:else if reach && reach.beyondLaunchZone === 0}
        <span class="warning">⚠ {t.places.onlyLaunchZone(settings.launchZone)}</span>
      {:else if reach?.truncated}
        <span class="warning">⚠ {t.places.truncated}</span>
      {:else if reach}
        <span class="muted">
          {t.places.computedIn(
            seconds(reach.timings.terrain + reach.timings.search),
            seconds(reach.timings.terrain),
            seconds(reach.timings.search),
          )}
        </span>
      {/if}
    </div>
  </section>
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Start → landing on one line; the coordinates are in each place's tooltip. */
  .places,
  .place,
  .facts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .place {
    gap: 6px;
  }

  .place > span,
  .facts > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  svg:not(.pin) {
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }

  .pin path {
    stroke: #ffffff;
    stroke-width: 1.5;
  }

  .remove {
    margin-left: auto;
    border: 0;
    background: none;
    padding: 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  .remove:hover {
    color: var(--text);
  }

  .status {
    min-height: 1.4em;
  }

  .muted {
    color: var(--text-muted);
    font-size: 12px;
  }

  .error {
    color: var(--critical);
  }

  .warning {
    color: var(--warning-text);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
