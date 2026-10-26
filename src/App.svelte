<script lang="ts">
  import { onDestroy } from 'svelte'
  import MapView, { type Overlay, type RouteLine } from './components/MapView.svelte'
  import AssumptionsPanel from './components/AssumptionsPanel.svelte'
  import Legend from './components/Legend.svelte'
  import Profile from './components/Profile.svelte'
  import RouteSummary from './components/RouteSummary.svelte'
  import { PlannerClient } from './lib/compute/client'
  import type { ReachRequest, ReachResult } from './lib/compute/reach'
  import type { RouteRequest, RouteResult } from './lib/compute/route'
  import type { BasemapId } from './lib/map/style'
  import { aglBands, renderAgl } from './lib/render/agl'
  import { preferences, savePreferences, settings, writeUrl } from './lib/settings.svelte'
  import { cellAt, gridBounds, type LngLat } from './lib/terrain/geo'

  let basemap: BasemapId = $state('swisstopo')
  let clickSets: 'start' | 'landing' = $state(settings.start && !settings.landing ? 'landing' : 'start')

  let overlay = $state<Overlay | null>(null)
  let reach = $state.raw<ReachResult | null>(null)
  let reachRequest = $state.raw<ReachRequest | null>(null)
  let reachError = $state<string | null>(null)

  let route = $state.raw<RouteResult | null>(null)
  let routeRequest = $state.raw<RouteRequest | null>(null)
  let routeError = $state<string | null>(null)

  let busy = $state({ reach: false, route: false })

  // Narrow screens show the profile inside the panel rather than over the map.
  const narrowQuery = matchMedia('(max-width: 640px)')
  let narrow = $state(narrowQuery.matches)
  narrowQuery.addEventListener('change', (e) => (narrow = e.matches))
  let hover = $state<LngLat | null>(null)
  let highlight = $state<LngLat | null>(null)

  const client = new PlannerClient({
    onReach(outcome, request) {
      if ('error' in outcome) {
        reachError = outcome.error
        return
      }
      reachError = null
      reach = outcome.result
      reachRequest = request
    },
    onRoute(outcome, request) {
      if ('error' in outcome) {
        routeError = outcome.error
        route = null
        return
      }
      routeError = null
      route = outcome.result
      routeRequest = request
    },
    onBusy: (b) => (busy = b),
  })
  onDestroy(() => client.dispose())

  // Recompute (debounced) whenever an input changes, and keep the URL in sync.
  $effect(() => {
    const s = $state.snapshot(settings)
    writeUrl(s)
    const { start, landing } = s
    if (!start) return
    const reachReq: ReachRequest = {
      start,
      startHeight: s.startHeight,
      startHeightMode: s.startHeightMode,
      glideRatio: s.glideRatio,
      clearance: s.clearance,
      launchZone: s.launchZone,
    }
    const timer = setTimeout(() => {
      client.reach(reachReq)
      if (landing) client.route({ ...reachReq, landing, arrivalHeight: s.arrivalHeight })
    }, 150)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    if (!settings.landing) {
      route = null
      routeError = null
    }
  })

  const bands = $derived(aglBands(reachRequest?.clearance ?? settings.clearance, preferences.colorScheme))

  $effect(() => savePreferences($state.snapshot(preferences)))

  // Paint the AGL overlay; a color change only repaints, it does not recompute.
  $effect(() => {
    if (!reach) {
      overlay = null
      return
    }
    const r = reach
    const image = renderAgl(r.agl, r.grid, bands)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')!.putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0)
    let cancelled = false
    canvas.toBlob((png) => {
      if (cancelled || !png) return
      const previous = overlay?.url
      overlay = { url: URL.createObjectURL(png), ...gridBounds(r.grid) }
      // Give the map time to load the new image before releasing the old one.
      if (previous) setTimeout(() => URL.revokeObjectURL(previous), 5000)
    }, 'image/png')
    return () => {
      cancelled = true
    }
  })

  /** Route shown on the map and in the profile: the pilot's if it reaches, else the required one. */
  const shownRoute = $derived(route && settings.landing ? (route.withGlideRatio ?? route.required) : null)
  const routeLine: RouteLine | null = $derived(
    shownRoute ? { points: shownRoute.profile, dashed: shownRoute === route?.required && !route?.withGlideRatio } : null,
  )

  // A highlighted point belongs to the route it was hovered on.
  $effect(() => {
    void shownRoute
    highlight = null
  })

  /** Readout under the cursor: AGL, altitude and distance flown. */
  const readout = $derived.by(() => {
    if (!hover || !reach || !reachRequest) return null
    const cell = cellAt(reach.grid, hover)
    if (!cell) return null
    const i = cell.row * reach.grid.cols + cell.col
    const d = reach.distance[i]
    if (d === Infinity) return { reachable: false as const }
    return {
      reachable: true as const,
      agl: reach.agl[i],
      altitude: reach.startAltitude - d / reachRequest.glideRatio,
      distance: d,
    }
  })

  function pick(p: LngLat) {
    if (clickSets === 'landing') {
      settings.landing = p
    } else {
      settings.start = p
      if (!settings.landing) clickSets = 'landing'
    }
  }
</script>

{#snippet profile(className: string)}
  {#if shownRoute && route && routeRequest}
    <div class={className}>
      <Profile
        route={shownRoute}
        isRequired={!route.withGlideRatio}
        landingElevation={route.landingElevation}
        arrivalHeight={routeRequest.arrivalHeight}
        clearance={routeRequest.clearance}
        launchZone={routeRequest.launchZone}
        onhover={(p) => (highlight = p)}
      />
    </div>
  {/if}
{/snippet}

<main>
  <MapView
    start={settings.start}
    landing={settings.landing}
    route={routeLine}
    {highlight}
    {overlay}
    {basemap}
    onpick={pick}
    onmovestart={(p) => (settings.start = p)}
    onmovelanding={(p) => (settings.landing = p)}
    onhover={(p) => (hover = p)}
  />

  <aside class="panel">
    <header>
      <h1>Hike &amp; Fly Planner</h1>
      {#if settings.start}
        <div class="click-mode">
          <span>Click on the map sets</span>
          <span class="segmented" role="group" aria-label="Click on the map sets">
            <button type="button" aria-pressed={clickSets === 'start'} onclick={() => (clickSets = 'start')}>Start</button>
            <button type="button" aria-pressed={clickSets === 'landing'} onclick={() => (clickSets = 'landing')}>Landing</button>
          </span>
        </div>
      {:else}
        <p class="hint">Click the map to set the start.</p>
      {/if}
    </header>

    {#if settings.landing}
      <RouteSummary
        result={route}
        computing={busy.route}
        error={routeError}
        glideRatio={routeRequest?.glideRatio ?? settings.glideRatio}
        arrivalHeight={routeRequest?.arrivalHeight ?? settings.arrivalHeight}
        onclear={() => {
          settings.landing = null
          clickSets = 'landing'
        }}
      />
      {#if narrow}
        {@render profile('profile-inline')}
      {/if}
    {:else if settings.start}
      <p class="hint">Click the map to set a landing and get the required glide ratio.</p>
    {/if}

    <AssumptionsPanel result={reach} computing={busy.reach} error={reachError} bind:basemap>
      {#snippet legend()}
        {#if reach}
          <Legend {bands} />
        {/if}
      {/snippet}
    </AssumptionsPanel>
  </aside>

  {#if !narrow}
    {@render profile('profile-card')}
  {/if}

  {#if readout && !shownRoute}
    <div class="readout" role="status">
      {#if readout.reachable}
        <strong>{Math.round(readout.agl)} m AGL</strong>
        <span>{Math.round(readout.altitude)} m AMSL</span>
        <span>{(readout.distance / 1000).toFixed(1)} km flown</span>
      {:else}
        <span>Not reachable</span>
      {/if}
    </div>
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
  }

  .panel {
    position: absolute;
    top: 12px;
    left: 12px;
    width: 320px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
    background: var(--surface);
    color: var(--text);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  header h1 {
    font-size: 17px;
    margin: 0;
  }

  .hint {
    margin: 6px 0 0;
    color: var(--text-muted);
  }

  .click-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    color: var(--text-muted);
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .segmented button {
    border: 0;
    border-radius: 0;
    padding: 4px 10px;
    background: transparent;
    color: var(--text);
  }

  .segmented button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--on-accent);
  }

  .profile-card {
    position: absolute;
    left: 344px;
    right: 60px;
    bottom: 32px;
    background: var(--surface);
    color: var(--text);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 10px 14px 6px;
  }

  .readout {
    position: absolute;
    bottom: 36px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    box-shadow: var(--shadow);
    padding: 6px 12px;
    display: flex;
    gap: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  .readout span {
    color: var(--text-muted);
  }

  @media (max-width: 640px) {
    /* Map above, panel below: map controls stay visible. */
    main :global(.map) {
      bottom: 45%;
    }

    .panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: auto;
      height: 45%;
      max-height: none;
      border-radius: 12px 12px 0 0;
      padding: 12px 16px;
    }

    .readout {
      display: none;
    }

  }
</style>
