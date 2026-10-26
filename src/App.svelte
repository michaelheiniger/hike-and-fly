<script lang="ts">
  import { onDestroy } from 'svelte'
  import MapView, { type Overlay } from './components/MapView.svelte'
  import AssumptionsPanel from './components/AssumptionsPanel.svelte'
  import Legend from './components/Legend.svelte'
  import { ReachClient } from './lib/compute/client'
  import type { ReachRequest, ReachResult } from './lib/compute/reach'
  import type { BasemapId } from './lib/map/style'
  import { aglBands } from './lib/render/agl'
  import { settings, writeUrl } from './lib/settings.svelte'
  import { cellAt, gridBounds, type LngLat } from './lib/terrain/geo'

  let basemap: BasemapId = $state('swisstopo')
  let overlay = $state<Overlay | null>(null)
  let result = $state.raw<ReachResult | null>(null)
  let resultRequest = $state.raw<ReachRequest | null>(null)
  let error = $state<string | null>(null)
  let computing = $state(false)
  let hover = $state<LngLat | null>(null)

  const client = new ReachClient((outcome, request) => {
    computing = client.busy
    if ('error' in outcome) {
      error = outcome.error
      return
    }
    error = null
    result = outcome.result
    resultRequest = request
    const previous = overlay?.url
    overlay = { url: URL.createObjectURL(outcome.png), ...gridBounds(outcome.result.grid) }
    // Give the map time to load the new image before releasing the old one.
    if (previous) setTimeout(() => URL.revokeObjectURL(previous), 5000)
  })
  onDestroy(() => client.dispose())

  // Recompute (debounced) whenever an input changes, and keep the URL in sync.
  $effect(() => {
    const snapshot = $state.snapshot(settings)
    writeUrl(snapshot)
    const { start, ...rest } = snapshot
    if (!start) return
    const timer = setTimeout(() => {
      client.request({ start, ...rest })
      computing = true
    }, 150)
    return () => clearTimeout(timer)
  })

  const bands = $derived(aglBands(resultRequest?.clearance ?? settings.clearance))

  /** Readout under the cursor: AGL, altitude and distance flown. */
  const readout = $derived.by(() => {
    if (!hover || !result || !resultRequest) return null
    const cell = cellAt(result.grid, hover)
    if (!cell) return null
    const i = cell.row * result.grid.cols + cell.col
    const d = result.distance[i]
    if (d === Infinity) return { reachable: false as const }
    return {
      reachable: true as const,
      agl: result.agl[i],
      altitude: result.startAltitude - d / resultRequest.glideRatio,
      distance: d,
    }
  })

  function pick(p: LngLat) {
    settings.start = p
  }
</script>

<main>
  <MapView start={settings.start} {overlay} {basemap} onpick={pick} onhover={(p) => (hover = p)} />

  <aside class="panel">
    <header>
      <h1>Hike &amp; Fly Planner</h1>
      {#if !settings.start}
        <p class="hint">Click the map to set the start.</p>
      {/if}
    </header>

    <AssumptionsPanel {result} {computing} {error} bind:basemap>
      {#snippet legend()}
        {#if result}
          <Legend {bands} />
        {/if}
      {/snippet}
    </AssumptionsPanel>
  </aside>

  {#if readout}
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
  }
</style>
