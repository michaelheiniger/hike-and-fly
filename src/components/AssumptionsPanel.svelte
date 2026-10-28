<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ReachResult } from '../lib/compute/reach'
  import { BASEMAPS, SLOPE_OVERLAY, type BasemapId } from '../lib/map/style'
  import { DEFAULTS, EXPLANATIONS, GLIDE_STEP, LIMITS, preferences, roundGlideRatio, settings } from '../lib/settings.svelte'
  import { AWS_TERRARIUM } from '../lib/terrain/loader'

  interface Props {
    result: ReachResult | null
    /** Description of the elevation data used, from the worker. */
    elevationSource: string | null
    computing: boolean
    error: string | null
    basemap: BasemapId
    /** Rendered between the glide inputs and the assumptions (the legend). */
    legend?: Snippet
    /** Rendered after the settings, inside the fold when collapsible. */
    footer?: Snippet
    /** Folds the settings behind a summary line (narrow screens), the legend above it. */
    collapsible?: boolean
  }

  let { result, elevationSource, computing, error, basemap = $bindable(), legend, footer, collapsible = false }: Props = $props()

  const ground = $derived(result?.startElevation ?? null)

  /** Switches between AGL and AMSL, converting the value when the ground elevation is known. */
  function setMode(mode: 'agl' | 'amsl') {
    if (mode === settings.startHeightMode) return
    if (ground !== null) {
      settings.startHeight = Math.round(mode === 'amsl' ? settings.startHeight + ground : settings.startHeight - ground)
    } else {
      settings.startHeight = mode === 'amsl' ? 0 : DEFAULTS.startHeight
    }
    settings.startHeightMode = mode
  }

  /** Number input handler that ignores incomplete values and clamps to limits. */
  function numberInput(key: keyof typeof LIMITS) {
    return (e: Event) => {
      const input = e.currentTarget as HTMLInputElement
      const v = input.valueAsNumber
      if (!Number.isFinite(v)) return
      const [lo, hi] = LIMITS[key]
      const clamped = Math.min(hi, Math.max(lo, v))
      settings[key] = key === 'glideRatio' ? roundGlideRatio(clamped) : clamped
      // Show the value used, also when it equals the previous one and nothing rerenders.
      input.value = String(settings[key])
    }
  }

  const isDefault = (key: keyof typeof DEFAULTS) => settings[key] === DEFAULTS[key]
</script>

<section class="start">
  {#if settings.start}
    <div class="row">
      <span class="label">Start</span>
      <span class="value">
        {settings.start.lat.toFixed(4)}°, {settings.start.lng.toFixed(4)}°
      </span>
    </div>
    {#if result}
      <div class="row">
        <span class="label">Ground</span>
        <span class="value">{Math.round(result.startElevation)} m AMSL</span>
      </div>
      <div class="row">
        <span class="label">Start altitude</span>
        <span class="value">
          {Math.round(result.startAltitude)} m AMSL · {Math.round(result.startAltitude - result.startElevation)} m AGL
        </span>
      </div>
    {/if}
  {/if}

  <div class="status" aria-live="polite">
    {#if computing}
      <span class="muted">Computing…</span>
    {:else if error}
      <span class="error">⚠ {error}</span>
    {:else if result && result.reachableCells <= 1}
      <span class="warning">
        ⚠ No glide possible from here: the ground around the start is not steeper than the glide path. Pick a steeper
        slope or add start height.
      </span>
    {:else if result && result.beyondLaunchZone === 0}
      <span class="warning">
        ⚠ Nothing is reachable beyond the launch zone (first {settings.launchZone} m, left uncolored): the ground below
        the start is barely steeper than the glide path. Pick a steeper slope or add start height.
      </span>
    {:else if result?.truncated}
      <span class="warning">⚠ The reachable area reaches the edge of the search area and may be cut off.</span>
    {:else if result}
      <span class="muted small">
        Computed in {((result.timings.terrain + result.timings.search) / 1000).toFixed(1)} s (terrain {(
          result.timings.terrain / 1000
        ).toFixed(1)} s, search {(result.timings.search / 1000).toFixed(1)} s)
      </span>
    {/if}
  </div>
</section>

{#snippet settingsBody()}
  <section>
    <h2>Glide</h2>

    <label class="field">
      <span class="label">Start height</span>
      <span class="inputs">
        <input
          type="number"
          step="50"
          min={LIMITS.startHeight[0]}
          max={LIMITS.startHeight[1]}
          value={settings.startHeight}
          onchange={numberInput('startHeight')}
        />
        <span class="segmented" role="group" aria-label="Height reference">
          <button type="button" aria-pressed={settings.startHeightMode === 'agl'} onclick={() => setMode('agl')}>AGL</button>
          <button type="button" aria-pressed={settings.startHeightMode === 'amsl'} onclick={() => setMode('amsl')}>AMSL</button>
        </span>
      </span>
    </label>
    <p class="explain">{EXPLANATIONS.startHeight}</p>

    <label class="field">
      <span class="label">Glide ratio {#if isDefault('glideRatio')}<em>default</em>{/if}</span>
      <span class="inputs">
        <input type="range" min="3" max="12" step={GLIDE_STEP} bind:value={settings.glideRatio} />
        <input
          type="number"
          class="narrow"
          step={GLIDE_STEP}
          min={LIMITS.glideRatio[0]}
          max={LIMITS.glideRatio[1]}
          value={settings.glideRatio}
          onchange={numberInput('glideRatio')}
        />
      </span>
    </label>
    <p class="explain">{EXPLANATIONS.glideRatio}</p>
  </section>

  {#if !collapsible}{@render legend?.()}{/if}

  <section>
    <h2>Assumptions</h2>

    <label class="field">
      <span class="label">Terrain clearance {#if isDefault('clearance')}<em>default</em>{/if}</span>
      <span class="inputs">
        <input
          type="number"
          step="10"
          min={LIMITS.clearance[0]}
          max={LIMITS.clearance[1]}
          value={settings.clearance}
          onchange={numberInput('clearance')}
        />
        <span class="unit">m</span>
      </span>
    </label>
    <p class="explain">{EXPLANATIONS.clearance}</p>

    <label class="field">
      <span class="label">Launch zone {#if isDefault('launchZone')}<em>default</em>{/if}</span>
      <span class="inputs">
        <input
          type="number"
          step="50"
          min={LIMITS.launchZone[0]}
          max={LIMITS.launchZone[1]}
          value={settings.launchZone}
          onchange={numberInput('launchZone')}
        />
        <span class="unit">m</span>
      </span>
    </label>
    <p class="explain">{EXPLANATIONS.launchZone}</p>

    <label class="field">
      <span class="label">Arrival height {#if isDefault('arrivalHeight')}<em>default</em>{/if}</span>
      <span class="inputs">
        <input
          type="number"
          step="10"
          min={LIMITS.arrivalHeight[0]}
          max={LIMITS.arrivalHeight[1]}
          value={settings.arrivalHeight}
          onchange={numberInput('arrivalHeight')}
        />
        <span class="unit">m</span>
      </span>
    </label>
    <p class="explain">{EXPLANATIONS.arrivalHeight}</p>

    <div class="field">
      <span class="label">Wind</span>
      <span class="value warning">Still air</span>
    </div>
    <p class="explain">{EXPLANATIONS.wind}</p>

    <div class="field">
      <span class="label">Elevation data</span>
      <span class="value">{result ? `${Math.round(result.cellSize)} m grid` : '—'}</span>
    </div>
    <p class="explain">
      {elevationSource ?? AWS_TERRARIUM.description}. Ridges are kept at their highest point in each grid cell so obstacles
      are never underestimated. Start and landing heights are exact where swisstopo's height service answers.
    </p>

    <button
      type="button"
      class="link"
      onclick={() => {
        settings.glideRatio = DEFAULTS.glideRatio
        settings.clearance = DEFAULTS.clearance
        settings.launchZone = DEFAULTS.launchZone
        settings.arrivalHeight = DEFAULTS.arrivalHeight
      }}>Reset to defaults</button
    >
  </section>

  <section>
    <label class="field">
      <span class="label">Map</span>
      <select bind:value={basemap}>
        {#each Object.entries(BASEMAPS) as [id, b] (id)}
          <option value={id}>{b.label}</option>
        {/each}
      </select>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={preferences.showSlope} />
      <span class="label">Slope classes over 30°</span>
    </label>
    {#if preferences.showSlope}
      <ul class="slope-legend">
        {#each SLOPE_OVERLAY.classes as c (c.label)}
          <li><span class="swatch" style:background={c.color}></span>{c.label}</li>
        {/each}
      </ul>
      <p class="explain">swisstopo, after the SLF avalanche recommendation. Switzerland and border areas only.</p>
    {/if}
    <label class="field">
      <span class="label">Colors</span>
      <select bind:value={preferences.colorScheme}>
        <option value="standard">Red to green</option>
        <option value="colorblind">Color-blind friendly</option>
      </select>
    </label>
  </section>

  {@render footer?.()}
{/snippet}

{#if collapsible}
  {@render legend?.()}
  <details class="settings">
    <summary>
      <span class="label">Settings</span>
      <span class="muted small">
        Glide {settings.glideRatio} · {settings.startHeight} m {settings.startHeightMode.toUpperCase()}
      </span>
    </summary>
    <div class="settings-body">{@render settingsBody()}</div>
  </details>
{:else}
  {@render settingsBody()}
{/if}

<style>
  .settings summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    list-style: none;
  }

  .settings summary::-webkit-details-marker {
    display: none;
  }

  .settings summary::after {
    content: '▾';
    color: var(--text-muted);
  }

  .settings[open] summary::after {
    content: '▴';
  }

  .settings summary .muted {
    margin-left: auto;
  }

  .settings-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 12px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0;
  }

  .row,
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .label {
    font-weight: 500;
  }

  .label em {
    font-style: normal;
    font-weight: 400;
    font-size: 11px;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
  }

  .value {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .inputs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  input[type='number'] {
    width: 76px;
  }

  input.narrow {
    width: 60px;
  }

  input[type='range'] {
    width: 120px;
    accent-color: var(--accent);
  }

  .unit {
    color: var(--text-muted);
  }

  .explain {
    margin: 0 0 6px;
    font-size: 12px;
    line-height: 1.4;
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
    padding: 4px 8px;
    background: transparent;
    color: var(--text);
  }

  .segmented button[aria-pressed='true'] {
    background: var(--accent);
    color: var(--on-accent);
  }

  .status {
    min-height: 1.4em;
  }

  .muted {
    color: var(--text-muted);
  }

  .small {
    font-size: 12px;
  }

  .error {
    color: var(--critical);
  }

  .warning {
    color: var(--warning-text);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .toggle input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    margin: 0;
  }

  .slope-legend {
    list-style: none;
    margin: 0;
    padding: 0 0 0 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .slope-legend li {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .slope-legend .swatch {
    width: 14px;
    height: 10px;
    border-radius: 2px;
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
</style>
