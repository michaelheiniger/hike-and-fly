<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { ReachResult } from '../lib/compute/reach'
  import { clearanceAt } from '../lib/glide/geometry'
  import { BASEMAPS, SLOPE_OVERLAY, type BasemapId } from '../lib/map/style'
  import { LANGUAGE_NAMES, t } from '../lib/i18n/index.svelte'
  import { DEFAULTS, GLIDE_STEP, LANGUAGES, LIMITS, preferences, roundGlideRatio, settings } from '../lib/settings.svelte'
  import { AWS_TERRARIUM, SWISS_ARCHIVE } from '../lib/terrain/loader'
  import InfoTip from './InfoTip.svelte'
  import LaunchDiagram from './LaunchDiagram.svelte'

  interface Props {
    result: ReachResult | null
    /** Description of the elevation data used, from the worker. */
    elevationSource: string | null
    basemap: BasemapId
    /** Rendered after the glide inputs (the landing and its routes). */
    landing?: Snippet
    /** Rendered in the settings dialog between the assumptions and the map settings (offline areas). */
    footer?: Snippet
  }

  let { result, elevationSource, basemap = $bindable(), landing, footer }: Props = $props()

  let dialog: HTMLDialogElement

  /** The elevation source in the interface language: the worker describes it in English. */
  const sourceName = (description: string | null) =>
    description === SWISS_ARCHIVE.description
      ? t.elevationSources.swiss
      : description === AWS_TERRARIUM.description || description === null
        ? t.elevationSources.aws
        : description

  /** Opens the settings: map, offline areas and assumptions. */
  export function openSettings() {
    dialog.showModal()
  }

  export function closeSettings() {
    dialog.close()
  }

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

  /** Clearance required at quarters of the launch zone, from the start to its end. */
  const ramp = $derived(
    [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const distance = f * settings.launchZone
      return { distance, clearance: clearanceAt(settings, distance) }
    }),
  )
</script>

<section>
  <h2>{t.glide.title}</h2>

  <div class="field stacked">
    <span class="label">
      <label for="glide-ratio">{t.glide.glideRatio}</label>
      {#if isDefault('glideRatio')}<em>{t.glide.default}</em>{/if}
      <InfoTip topic={t.topics.glideRatio}>{t.explanations.glideRatio}</InfoTip>
    </span>
    <span class="inputs">
      <input id="glide-ratio" type="range" min="3" max="12" step={GLIDE_STEP} bind:value={settings.glideRatio} />
      <input
        type="number"
        class="narrow"
        aria-label={t.glide.glideRatio}
        step={GLIDE_STEP}
        min={LIMITS.glideRatio[0]}
        max={LIMITS.glideRatio[1]}
        value={settings.glideRatio}
        onchange={numberInput('glideRatio')}
      />
    </span>
  </div>

  <div class="field">
    <span class="label">
      <label for="start-height">{t.glide.startHeight}</label>
      <InfoTip topic={t.topics.startHeight}>{t.explanations.startHeight}</InfoTip>
    </span>
    <span class="inputs">
      <input
        id="start-height"
        type="number"
        step="50"
        min={LIMITS.startHeight[0]}
        max={LIMITS.startHeight[1]}
        value={settings.startHeight}
        onchange={numberInput('startHeight')}
      />
      <span class="segmented" role="group" aria-label={t.glide.heightReference}>
        <button type="button" aria-pressed={settings.startHeightMode === 'agl'} onclick={() => setMode('agl')}>{t.glide.agl}</button>
        <button type="button" aria-pressed={settings.startHeightMode === 'amsl'} onclick={() => setMode('amsl')}>{t.glide.amsl}</button>
      </span>
    </span>
  </div>
</section>

{@render landing?.()}

{#snippet assumptionFields()}
  <div class="field">
    <span class="label">
      <label for="clearance">{t.assumptions.clearance}</label>
      {#if isDefault('clearance')}<em>{t.glide.default}</em>{/if}
      <InfoTip topic={t.topics.clearance}>{t.explanations.clearance}</InfoTip>
    </span>
    <span class="inputs">
      <input
        id="clearance"
        type="number"
        step="10"
        min={LIMITS.clearance[0]}
        max={LIMITS.clearance[1]}
        value={settings.clearance}
        onchange={numberInput('clearance')}
      />
      <span class="unit">m</span>
    </span>
  </div>

  <div class="field">
    <span class="label">
      <label for="launch-zone">{t.assumptions.launchZone}</label>
      {#if isDefault('launchZone')}<em>{t.glide.default}</em>{/if}
      <InfoTip topic={t.topics.launchZone}>{t.explanations.launchZone}</InfoTip>
    </span>
    <span class="inputs">
      <input
        id="launch-zone"
        type="number"
        step="50"
        min={LIMITS.launchZone[0]}
        max={LIMITS.launchZone[1]}
        value={settings.launchZone}
        onchange={numberInput('launchZone')}
      />
      <span class="unit">m</span>
    </span>
  </div>

  <div class="field">
    <span class="label">
      <label for="takeoff-run">{t.assumptions.takeoffRun}</label>
      {#if isDefault('takeoffRun')}<em>{t.glide.default}</em>{/if}
      <InfoTip topic={t.topics.takeoffRun}>{t.explanations.takeoffRun}</InfoTip>
    </span>
    <span class="inputs">
      <input
        id="takeoff-run"
        type="number"
        step="10"
        min={LIMITS.takeoffRun[0]}
        max={LIMITS.takeoffRun[1]}
        value={settings.takeoffRun}
        onchange={numberInput('takeoffRun')}
      />
      <span class="unit">m</span>
    </span>
  </div>

  <LaunchDiagram clearance={settings.clearance} launchZone={settings.launchZone} takeoffRun={settings.takeoffRun} />

  {#if settings.launchZone > 0}
    <table class="ramp small">
      <tbody>
        <tr>
          <th scope="row">{t.assumptions.afterLiftoff}</th>
          {#each ramp as r (r.distance)}<td>{Math.round(r.distance)}</td>{/each}
        </tr>
        <tr>
          <th scope="row">{t.assumptions.clearanceRow}</th>
          {#each ramp as r (r.distance)}<td>{Math.round(r.clearance)}</td>{/each}
        </tr>
      </tbody>
    </table>
  {/if}

  <div class="field">
    <span class="label">
      <label for="arrival-height">{t.assumptions.arrivalHeight}</label>
      {#if isDefault('arrivalHeight')}<em>{t.glide.default}</em>{/if}
      <InfoTip topic={t.topics.arrivalHeight}>{t.explanations.arrivalHeight}</InfoTip>
    </span>
    <span class="inputs">
      <input
        id="arrival-height"
        type="number"
        step="10"
        min={LIMITS.arrivalHeight[0]}
        max={LIMITS.arrivalHeight[1]}
        value={settings.arrivalHeight}
        onchange={numberInput('arrivalHeight')}
      />
      <span class="unit">m</span>
    </span>
  </div>

  <div class="field">
    <span class="label">{t.assumptions.wind} <InfoTip topic={t.topics.wind}>{t.explanations.wind}</InfoTip></span>
    <span class="value warning">{t.assumptions.stillAir}</span>
  </div>

  <div class="field">
    <span class="label">
      {t.assumptions.elevationData}
      <InfoTip topic={t.topics.elevation}>{t.assumptions.elevationTip(sourceName(elevationSource))}</InfoTip>
    </span>
    <span class="value">{result ? t.assumptions.grid(Math.round(result.cellSize)) : '—'}</span>
  </div>

  <button
    type="button"
    class="link"
    onclick={() => {
      settings.glideRatio = DEFAULTS.glideRatio
      settings.clearance = DEFAULTS.clearance
      settings.launchZone = DEFAULTS.launchZone
      settings.takeoffRun = DEFAULTS.takeoffRun
      settings.arrivalHeight = DEFAULTS.arrivalHeight
    }}>{t.assumptions.reset}</button
  >
{/snippet}

<!-- A click on the backdrop (the dialog element itself, outside its content) closes it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} aria-labelledby="settings-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <div class="dialog-head">
    <h2 id="settings-title" class="title">{t.settings.title}</h2>
    <button type="button" class="close" aria-label={t.settings.close} onclick={() => dialog.close()}>✕</button>
  </div>

  <section>
    <h2>{t.assumptions.title}</h2>
    {@render assumptionFields()}
  </section>

  {@render footer?.()}

  <section>
    <h2>{t.settings.map}</h2>
    <label class="field">
      <span class="label">{t.settings.map}</span>
      <select bind:value={basemap}>
        {#each Object.keys(BASEMAPS) as BasemapId[] as id (id)}
          <option value={id}>{t.settings.basemaps[id]}</option>
        {/each}
      </select>
    </label>
    {#if preferences.showSlope}
      <span class="label">
        {t.settings.slopeClasses}
        <InfoTip topic={t.topics.slopeClasses}>{t.settings.slopeTip}</InfoTip>
      </span>
      <ul class="slope-legend">
        {#each SLOPE_OVERLAY.classes as c (c.label)}
          <li><span class="swatch" style:background={c.color}></span>{c.label}</li>
        {/each}
      </ul>
    {/if}
    <label class="field">
      <span class="label">{t.settings.colors}</span>
      <select bind:value={preferences.colorScheme}>
        <option value="standard">{t.settings.colorsStandard}</option>
        <option value="colorblind">{t.settings.colorsColorblind}</option>
      </select>
    </label>
    <label class="field">
      <span class="label">{t.language}</span>
      <select bind:value={preferences.language}>
        {#each LANGUAGES as language (language)}
          <option value={language} lang={language}>{LANGUAGE_NAMES[language]}</option>
        {/each}
      </select>
    </label>
  </section>
</dialog>

<style>
  dialog {
    width: min(400px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0 16px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  /* Stays at the top while the settings scroll. */
  .dialog-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0 4px;
    background: var(--surface);
  }

  h2.title {
    font-size: 16px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
  }

  .close {
    border: 0;
    background: none;
    padding: 2px 6px;
    color: var(--text-muted);
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

  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
  }

  /* Label above, inputs across the full width below. */
  .field.stacked {
    flex-direction: column;
    align-items: stretch;
  }

  .stacked .inputs input[type='range'] {
    flex: 1;
  }

  .label {
    font-weight: 500;
    white-space: nowrap;
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
    width: 68px;
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

  .small {
    font-size: 12px;
  }

  .warning {
    color: var(--warning-text);
  }

  .ramp {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .ramp th {
    font-weight: 400;
    text-align: left;
    padding-right: 6px;
  }

  .ramp td {
    text-align: right;
    padding-left: 6px;
    white-space: nowrap;
  }

  .slope-legend {
    list-style: none;
    margin: 0;
    padding: 0;
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
