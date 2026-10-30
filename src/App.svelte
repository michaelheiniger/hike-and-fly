<script lang="ts">
  import { onDestroy } from 'svelte'
  import MapView, { type Overlay, type RouteLine } from './components/MapView.svelte'
  import AssumptionsPanel from './components/AssumptionsPanel.svelte'
  import Legend from './components/Legend.svelte'
  import Profile from './components/Profile.svelte'
  import RouteSummary from './components/RouteSummary.svelte'
  import OfflinePanel from './components/OfflinePanel.svelte'
  import Places from './components/Places.svelte'
  import Waypoints from './components/Waypoints.svelte'
  import { listAreas, type Bounds, type OfflineArea } from './lib/offline/areas'
  import { PlannerClient, type Busy } from './lib/compute/client'
  import type { ReachRequest, ReachResult } from './lib/compute/reach'
  import { flownSinceLiftoff } from './lib/glide/search'
  import { km, t } from './lib/i18n/index.svelte'
  import { problemText, type Failure } from './lib/compute/errors'
  import { groundLaunch } from './lib/compute/terrain'
  import type { RouteRequest, RouteResult } from './lib/compute/route'
  import { aglBands, renderAgl } from './lib/render/agl'
  import ReportDialog from './components/ReportDialog.svelte'
  import type { ReportContext } from './lib/report'
  import { preferences, saveAssumptions, savePreferences, settings, writeUrl } from './lib/settings.svelte'
  import { cellAt, gridBounds, type LngLat } from './lib/terrain/geo'

  let clickSets: 'start' | 'waypoint' | 'landing' = $state(settings.start && !settings.landing ? 'landing' : 'start')

  let overlay = $state<Overlay | null>(null)
  let reach = $state.raw<ReachResult | null>(null)
  let reachRequest = $state.raw<ReachRequest | null>(null)
  let reachError = $state<Failure | null>(null)
  let elevationSource = $state<string | null>(null)

  let route = $state.raw<RouteResult | null>(null)
  let routeRequest = $state.raw<RouteRequest | null>(null)
  let routeError = $state<Failure | null>(null)

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
  let offlineAreas = $state<OfflineArea[]>(listAreas())
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
    saveAssumptions(s)
    const { start, landing } = s
    if (!start) return
    const reachReq: ReachRequest = {
      start,
      startHeight: s.startHeight,
      startHeightMode: s.startHeightMode,
      glideRatio: s.glideRatio,
      clearance: s.clearance,
      launchZone: s.launchZone,
      takeoffRun: s.takeoffRun,
    }
    const timer = setTimeout(() => {
      client.reach(reachReq)
      if (landing) client.route({ ...reachReq, landing, waypoints: s.waypoints, arrivalHeight: s.arrivalHeight })
    }, 150)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    if (!settings.landing) {
      route = null
      routeError = null
    }
  })

  /** Where a ground launch may run before lifting off, drawn around the start. */
  const takeoffRun = $derived(
    reach && reachRequest && reachRequest.takeoffRun > 0 && groundLaunch(reach.startAltitude, reach.startElevation)
      ? { center: reachRequest.start, radius: reachRequest.takeoffRun }
      : null,
  )

  const bands = $derived(aglBands(reachRequest?.clearance ?? settings.clearance, preferences.colorScheme))

  $effect(() => savePreferences($state.snapshot(preferences)))
  $effect(() => {
    document.documentElement.lang = preferences.language
  })

  // Paint the AGL overlay; a color change only repaints, it does not recompute.
  $effect(() => {
    if (!reach) {
      overlay = null
      return
    }
    const r = reach
    const image = renderAgl(r.agl, r.distance, r.glideStart, reachRequest?.launchZone ?? 0, r.grid, bands)
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

  /** A failed computation in the interface language; other errors keep the worker's message. */
  const failureText = (f: Failure | null) => f && (f.problem ? problemText(t, f.problem) : f.message)

  /** What the worker is doing, for the loading indicator; null when idle. */
  const activity = $derived(
    !busy.reach && !busy.route && !busy.alternatives
      ? null
      : busy.loading
        ? t.app.loadingElevation
        : busy.reach
          ? t.app.computingReach
          : busy.route
            ? t.app.computingRoutes
            : t.app.searchingAlternatives,
  )

  /** Readout under the cursor: AGL, altitude and distance flown. */
  const readout = $derived.by(() => {
    if (!hover || !reach || !reachRequest) return null
    const cell = cellAt(reach.grid, hover)
    if (!cell) return null
    const i = cell.row * reach.grid.cols + cell.col
    const d = reach.distance[i]
    if (d === Infinity) return { reachable: false as const }
    if (flownSinceLiftoff(reach, i) < reachRequest.launchZone) return { reachable: true as const, launchZone: true as const }
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

  let reportDialog: ReportDialog
  let planPanel: AssumptionsPanel

  /** What an issue report attaches: this plan and what the app shows. */
  function reportContext(): ReportContext {
    return {
      settings: $state.snapshot(settings),
      // The link holds the start, landing, waypoints and every setting (see writeUrl).
      planUrl: location.href,
      results: {
        startElevation: reach?.startElevation ?? route?.startElevation,
        landingElevation: route?.landingElevation,
        routes: route?.options.map((o) => ({
          name: `${String.fromCharCode(65 + o.id)}, ${o.side ? `${o.side.toLowerCase()} side, ${(o.offset / 1000).toFixed(1)} km off` : 'along the straight line'}`,
          length: o.length,
          requiredGlideRatio: o.requiredGlideRatio,
        })),
        straightGlideRatio: route?.straightLine.glideRatio,
        reachCellSize: reach?.cellSize,
        routeCellSize: route?.cellSize,
        elevationSource: elevationSource ?? undefined,
        errors: [reachError, routeError].filter((e) => !!e).map((e) => e.message),
      },
      version: __APP_VERSION__,
      userAgent: navigator.userAgent,
      online,
    }
  }

  function pick(p: LngLat) {
    if (clickSets === 'waypoint') {
      settings.waypoints = [...settings.waypoints, p]
    } else if (clickSets === 'landing') {
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
    waypoints={settings.waypoints}
    routes={routeLines}
    onselectroute={(id) => (selectedRoute = id)}
    {highlight}
    {overlay}
    basemap={preferences.basemap}
    showSlope={preferences.showSlope}
    ontoggleslope={() => (preferences.showSlope = !preferences.showSlope)}
    {takeoffRun}
    offlineAreas={preferences.showOfflineAreas ? offlineAreas : []}
    hasOfflineAreas={offlineAreas.length > 0}
    showOfflineAreas={preferences.showOfflineAreas}
    ontoggleofflineareas={() => (preferences.showOfflineAreas = !preferences.showOfflineAreas)}
    {fitTo}
    onviewchange={(b) => (view = b)}
    onpick={pick}
    onmovestart={(p) => (settings.start = p)}
    onmovelanding={(p) => (settings.landing = p)}
    onmovewaypoint={(i, p) => (settings.waypoints = settings.waypoints.map((w, j) => (j === i ? p : w)))}
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
        aria-label={t.app.resizePanel}
        tabindex="0"
        onpointerdown={dragPanel}
        ondblclick={() => (panelSize = null)}
        onkeydown={resizePanelKey}
      ></div>
    {/if}
    <header>
      <h1 class="visually-hidden">Hike &amp; Fly Planner</h1>
      <div class="header-row">
        {#if !online}<span class="offline-badge">{t.app.offline}</span>{/if}
        <span class="hint">{settings.start ? t.app.clickSets : t.app.clickToStart}</span>
        <button
          type="button"
          class="settings-button"
          aria-label={t.app.settings}
          title={t.app.settingsTitle}
          onclick={() => planPanel.openSettings()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </button>
      </div>
      {#if settings.start}
        <span class="segmented" role="group" aria-label={t.app.clickSets}>
          <button type="button" aria-pressed={clickSets === 'start'} onclick={() => (clickSets = 'start')}>{t.app.start}</button>
          <button type="button" aria-pressed={clickSets === 'waypoint'} onclick={() => (clickSets = 'waypoint')}>{t.app.waypoint}</button>
          <button type="button" aria-pressed={clickSets === 'landing'} onclick={() => (clickSets = 'landing')}>{t.app.landing}</button>
        </span>
      {/if}
    </header>

    <Places
      {reach}
      reachComputing={busy.reach}
      reachError={failureText(reachError)}
      {route}
      arrivalHeight={routeRequest?.arrivalHeight ?? settings.arrivalHeight}
      onclearlanding={() => {
        settings.landing = null
        clickSets = 'landing'
      }}
    />

    <AssumptionsPanel
      bind:this={planPanel}
      result={reach}
      {elevationSource}
      bind:basemap={preferences.basemap}
    >
      {#snippet landing()}
        {#if settings.waypoints.length}
          <Waypoints
            waypoints={settings.waypoints}
            onremove={(i) => (settings.waypoints = settings.waypoints.filter((_, j) => j !== i))}
            onclear={() => (settings.waypoints = [])}
          />
        {/if}
        {#if settings.landing}
          <RouteSummary
            result={route}
            computing={busy.route}
            searchingAlternatives={busy.alternatives}
            error={failureText(routeError)}
            glideRatio={judgedRatio}
            arrivalHeight={routeRequest?.arrivalHeight ?? settings.arrivalHeight}
            waypointCount={routeRequest?.waypoints?.length ?? 0}
            selected={shownRoute?.id ?? null}
            onselect={(id) => (selectedRoute = id)}
          />
          {#if narrow}
            {@render profile('profile-inline')}
          {/if}
        {:else if settings.start}
          <p class="hint">{t.app.clickToLand}</p>
        {/if}
      {/snippet}
      {#snippet footer()}
        <OfflinePanel
          {view}
          bind:areas={offlineAreas}
          {online}
          onshow={(b) => {
            planPanel.closeSettings()
            preferences.showOfflineAreas = true
            fitTo = { ...b }
            preferences.basemap = 'swisstopo'
          }}
        />
      {/snippet}
    </AssumptionsPanel>

    <section class="report">
      <button type="button" class="link" onclick={() => reportDialog.open()}>{t.app.reportIssue}</button>
      <span class="hint">{t.app.reportHint}</span>
    </section>
  </aside>

  <ReportDialog bind:this={reportDialog} context={reportContext} />

  {#if !narrow}
    {@render profile('profile-card')}
  {/if}

  {#if reach}
    <div class="legend">
      <!-- Folded at first on narrow screens, where it would cover much of the map. -->
      <Legend {bands} launchZone={reachRequest?.launchZone ?? settings.launchZone} open={!narrow} />
    </div>
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
        <span>{t.app.launchZone}</span>
      {:else if readout.reachable}
        <strong>{Math.round(readout.agl)} m {t.agl}</strong>
        <span>{Math.round(readout.altitude)} m {t.amsl}</span>
        <span>{t.app.kmFlown(km(readout.distance))}</span>
      {:else}
        <span>{t.app.notReachable}</span>
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

  header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-row .hint {
    flex: 1;
  }

  .settings-button {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    padding: 0;
    color: var(--text-muted);
  }

  .settings-button:hover {
    color: var(--text);
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

  .report {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }

  .link {
    align-self: flex-start;
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  /* Equal widths across the panel. */
  .segmented button {
    flex: 1;
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

  /* The map scale, right of the panel (which can reach the bottom). */
  main :global(.maplibregl-ctrl-bottom-left) {
    left: 332px;
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
  /* Right of the panel; on narrow screens in the map's top-left corner. */
  .legend {
    position: absolute;
    top: 12px;
    left: 344px;
  }

  .activity {
    position: absolute;
    top: 12px;
    /* Centered in the map area right of the panel. */
    left: calc(50% + 166px);
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

    main :global(.maplibregl-ctrl-bottom-left) {
      left: 0;
    }

    .legend {
      top: 10px;
      left: 10px;
    }

    /* Above the panel, clear of the legend. */
    .activity {
      top: auto;
      bottom: calc(var(--panel-height) + 12px);
      left: 50%;
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
