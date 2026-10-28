<script lang="ts">
  import { onDestroy } from 'svelte'
  import MapView, { type Overlay, type RouteLine } from './components/MapView.svelte'
  import AssumptionsPanel from './components/AssumptionsPanel.svelte'
  import Legend from './components/Legend.svelte'
  import Profile from './components/Profile.svelte'
  import RouteSummary from './components/RouteSummary.svelte'
  import OfflinePanel from './components/OfflinePanel.svelte'
  import type { Bounds } from './lib/offline/areas'
  import { PlannerClient, type Busy } from './lib/compute/client'
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
  let elevationSource = $state<string | null>(null)

  let route = $state.raw<RouteResult | null>(null)
  let routeRequest = $state.raw<RouteRequest | null>(null)
  let routeError = $state<string | null>(null)

  let busy = $state<Busy>({ reach: false, route: false, alternatives: false, loading: false })
  /** Route picked by the pilot; null picks automatically. */
  let selectedRoute = $state<number | null>(null)

  // Narrow screens show the profile inside the panel rather than over the map.
  const narrowQuery = matchMedia('(max-width: 640px)')
  let narrow = $state(narrowQuery.matches)
  narrowQuery.addEventListener('change', (e) => (narrow = e.matches))
  /** Height of the panel, which sits below the map on narrow screens. */
  let panelHeight = $state(0)
  /** Panel height set by dragging its handle; null fits the content. */
  let panelSize = $state<number | null>(null)
  let hover = $state<LngLat | null>(null)
  let view = $state<Bounds | null>(null)
  let fitTo = $state<Bounds | null>(null)
  let online = $state(navigator.onLine)
  addEventListener('online', () => (online = true))
  addEventListener('offline', () => (online = false))
  let highlight = $state<LngLat | null>(null)

  const client = new PlannerClient({
    onReach(outcome, request) {
      if ('error' in outcome) {
        reachError = outcome.error
        return
      }
      reachError = null
      elevationSource = outcome.elevationSource
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
      // A different start, landing or assumption: back to automatic selection.
      if (!routeRequest || routeKey(routeRequest) !== routeKey(request)) selectedRoute = null
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
    const image = renderAgl(r.agl, r.distance, reachRequest?.launchZone ?? 0, r.grid, bands)
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

  /** Glide ratio the routes are judged with: the one of the latest request. */
  const judgedRatio = $derived(routeRequest?.glideRatio ?? settings.glideRatio)

  /**
   * Route shown in the profile: the pilot's pick, else the reachable route with the
   * highest arrival, else the one needing the smallest glide ratio.
   */
  const shownRoute = $derived.by(() => {
    if (!route || !settings.landing || !route.options.length) return null
    const picked = route.options.find((o) => o.id === selectedRoute)
    if (picked) return picked
    const reachable = route.options.filter((o) => judgedRatio >= o.requiredGlideRatio)
    if (reachable.length) return reachable.reduce((a, b) => (b.length < a.length ? b : a))
    return route.options[0]
  })
  const shownRatio = $derived(shownRoute ? Math.max(judgedRatio, shownRoute.requiredGlideRatio) : judgedRatio)

  const routeLines: RouteLine[] = $derived(
    route && settings.landing
      ? route.options.map((o) => ({
          id: o.id,
          points: o.vertices,
          selected: o.id === shownRoute?.id,
          dashed: judgedRatio < o.requiredGlideRatio,
        }))
      : [],
  )

  // A highlighted point belongs to the route it was hovered on.
  $effect(() => {
    void shownRoute
    highlight = null
  })

  /** What the worker is doing, for the loading indicator; null when idle. */
  const activity = $derived(
    !busy.reach && !busy.route && !busy.alternatives
      ? null
      : busy.loading
        ? 'Loading elevation data…'
        : busy.reach
          ? 'Computing reachable area…'
          : busy.route
            ? 'Computing routes…'
            : 'Looking for alternative routes…',
  )

  /** Readout under the cursor: AGL, altitude and distance flown. */
  const readout = $derived.by(() => {
    if (!hover || !reach || !reachRequest) return null
    const cell = cellAt(reach.grid, hover)
    if (!cell) return null
    const i = cell.row * reach.grid.cols + cell.col
    const d = reach.distance[i]
    if (d === Infinity) return { reachable: false as const }
    if (d < reachRequest.launchZone) return { reachable: true as const, launchZone: true as const }
    return {
      reachable: true as const,
      launchZone: false as const,
      agl: reach.agl[i],
      altitude: reach.startAltitude - d / reachRequest.glideRatio,
      distance: d,
    }
  })

  function routeKey(r: RouteRequest): string {
    const { glideRatio, ...rest } = r
    return JSON.stringify(rest)
  }

  /** Keeps a dragged panel between its handle and most of the screen. */
  const clampPanel = (h: number) => Math.round(Math.min(innerHeight * 0.85, Math.max(48, h)))

  function dragPanel(e: PointerEvent) {
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startHeight = panelHeight
    const move = (m: PointerEvent) => (panelSize = clampPanel(startHeight + startY - m.clientY))
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  function resizePanelKey(e: KeyboardEvent) {
    const step = e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0
    if (!step) return
    e.preventDefault()
    panelSize = clampPanel(panelHeight + step)
  }

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
        glideRatio={shownRatio}
        isRequired={shownRatio > judgedRatio}
        startAltitude={route.startAltitude}
        landingElevation={route.landingElevation}
        arrivalHeight={routeRequest.arrivalHeight}
        clearance={routeRequest.clearance}
        launchZone={routeRequest.launchZone}
        {bands}
        onhover={(p) => (highlight = p)}
      />
    </div>
  {/if}
{/snippet}

<main style:--panel-height="{panelHeight}px">
  <MapView
    start={settings.start}
    landing={settings.landing}
    routes={routeLines}
    onselectroute={(id) => (selectedRoute = id)}
    {highlight}
    {overlay}
    {basemap}
    showSlope={preferences.showSlope}
    ontoggleslope={() => (preferences.showSlope = !preferences.showSlope)}
    {fitTo}
    onviewchange={(b) => (view = b)}
    onpick={pick}
    onmovestart={(p) => (settings.start = p)}
    onmovelanding={(p) => (settings.landing = p)}
    onhover={(p) => (hover = p)}
  />

  <aside
    class="panel"
    bind:offsetHeight={panelHeight}
    style:height={narrow && panelSize !== null ? `${panelSize}px` : null}
    style:max-height={narrow && panelSize !== null ? 'none' : null}
  >
    {#if narrow}
      <!-- A focusable separator is a widget, which the a11y lint does not know. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel (double-click to fit the content)"
        tabindex="0"
        onpointerdown={dragPanel}
        ondblclick={() => (panelSize = null)}
        onkeydown={resizePanelKey}
      ></div>
    {/if}
    <header>
      <h1 class="visually-hidden">Hike &amp; Fly Planner</h1>
      {#if !online}<span class="offline-badge">Offline</span>{/if}
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

    <AssumptionsPanel
      result={reach}
      {elevationSource}
      computing={busy.reach}
      error={reachError}
      collapsible={narrow}
      bind:basemap
    >
      {#snippet landing()}
        {#if settings.landing}
          <RouteSummary
            result={route}
            computing={busy.route}
            searchingAlternatives={busy.alternatives}
            error={routeError}
            glideRatio={judgedRatio}
            arrivalHeight={routeRequest?.arrivalHeight ?? settings.arrivalHeight}
            selected={shownRoute?.id ?? null}
            onselect={(id) => (selectedRoute = id)}
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
      {/snippet}
      {#snippet legend()}
        {#if reach}
          <Legend {bands} launchZone={reachRequest?.launchZone ?? settings.launchZone} />
        {/if}
      {/snippet}
      {#snippet footer()}
        <OfflinePanel
          {view}
          {online}
          onshow={(b) => {
            fitTo = { ...b }
            basemap = 'swisstopo'
          }}
        />
      {/snippet}
    </AssumptionsPanel>
  </aside>

  {#if !narrow}
    {@render profile('profile-card')}
  {/if}

  {#if activity}
    <div class="activity" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {activity}
    </div>
  {/if}

  {#if readout && !shownRoute}
    <div class="readout" role="status">
      {#if readout.reachable && readout.launchZone}
        <span>Launch zone</span>
      {:else if readout.reachable}
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .offline-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--critical);
    color: #ffffff;
  }

  .hint {
    margin: 0;
    color: var(--text-muted);
  }

  .click-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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

  /* Shown only when work takes a moment, so quick updates do not flicker. */
  .activity {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    color: var(--text);
    border-radius: 16px;
    box-shadow: var(--shadow);
    padding: 6px 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    animation: appear 0.15s 0.3s forwards;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes appear {
    to {
      opacity: 1;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    /* Map above, panel below: map controls stay visible. The panel is as tall as its content. */
    main :global(.map) {
      bottom: var(--panel-height);
    }

    .panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: auto;
      max-height: 45%;
      border-radius: 12px 12px 0 0;
      padding: 12px 16px;
    }

    .readout {
      display: none;
    }

    /* Drag handle: stays at the top while the panel scrolls. */
    .handle {
      position: sticky;
      top: -12px;
      z-index: 1;
      flex-shrink: 0;
      margin: -12px -16px -8px;
      padding: 8px 0 10px;
      background: var(--surface);
      cursor: ns-resize;
      touch-action: none;
    }

    .handle::before {
      content: '';
      display: block;
      width: 36px;
      height: 4px;
      margin: 0 auto;
      border-radius: 2px;
      background: var(--border);
    }

  }
</style>
