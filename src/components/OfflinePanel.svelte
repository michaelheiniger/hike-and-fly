<script lang="ts">
  import { onMount } from 'svelte'
  import {
    deleteArea,
    downloadArea,
    estimateBytes,
    listAreas,
    planArea,
    type Bounds,
    type DownloadProgress,
    type OfflineArea,
  } from '../lib/offline/areas'
  import { AWS_TERRARIUM, SWISS_ARCHIVE, TileLoader } from '../lib/terrain/loader'
  import InfoTip from './InfoTip.svelte'

  interface Props {
    /** Area currently shown on the map. */
    view: Bounds | null
    online: boolean
    onshow: (bounds: Bounds) => void
    /** Folds the section behind its heading, closed at first. */
    folded?: boolean
  }

  let { view, online, onshow, folded = false }: Props = $props()

  /** Above this, the download is refused: zoom in or lower the detail. */
  const MAX_TILES = 30_000

  let mapMaxZoom = $state(14)
  let areas = $state<OfflineArea[]>(listAreas())
  let progress = $state<DownloadProgress | null>(null)
  let message = $state<string | null>(null)
  let storage = $state<{ usage: number; quota: number } | null>(null)
  let controller: AbortController | null = null
  let loader: TileLoader | null = null

  const plan = $derived(view ? planArea(view, mapMaxZoom) : null)
  const tileCount = $derived(plan ? plan.mapTiles.length + plan.elevationTiles.length : 0)

  const mb = (bytes: number) => (bytes < 10e6 ? (bytes / 1e6).toFixed(1) : Math.round(bytes / 1e6).toString())

  async function refreshStorage() {
    const estimate = await navigator.storage?.estimate?.().catch(() => null)
    storage = estimate?.usage != null && estimate.quota ? { usage: estimate.usage, quota: estimate.quota } : null
  }
  onMount(() => void refreshStorage())

  async function download() {
    if (!plan) return
    message = null
    controller = new AbortController()
    loader ??= new TileLoader(AWS_TERRARIUM, SWISS_ARCHIVE.url)
    progress = { done: 0, total: tileCount, bytes: 0, failed: 0, reused: 0 }
    try {
      const area = await downloadArea($state.snapshot(plan), loader, (p) => (progress = p), controller.signal)
      const reused = progress?.reused ?? 0
      areas = listAreas()
      message = area.complete
        ? `Saved: ${area.tiles} tiles, ${mb(area.bytes)} MB${reused ? ` (${reused} already stored for other areas)` : ''}.`
        : `Saved with gaps: ${progress?.failed} tiles could not be downloaded.`
    } catch (err) {
      message = err instanceof DOMException && err.name === 'AbortError' ? 'Download cancelled.' : `Download failed: ${err}`
    } finally {
      progress = null
      controller = null
      void refreshStorage()
    }
  }

  async function remove(area: OfflineArea) {
    await deleteArea(area.id)
    areas = listAreas()
    void refreshStorage()
  }

  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

{#snippet heading()}
  <h2>
    Offline
    <InfoTip topic="offline maps">
      Download the area shown on the map: swisstopo map, slope classes and elevation, so planning works without network
      in the mountains. OpenTopoMap cannot be downloaded (its usage policy forbids bulk downloads): offline, use the
      swisstopo map.
    </InfoTip>
  </h2>
  <span class="status" class:offline={!online}><i aria-hidden="true"></i>{online ? 'Online' : 'Offline'}</span>
{/snippet}

{#snippet content()}
  <label class="field">
    <span class="label">Map detail</span>
    <select bind:value={mapMaxZoom} disabled={!!progress}>
      <option value={13}>Overview (zoom 13)</option>
      <option value={14}>Standard (zoom 14)</option>
      <option value={15}>Detailed (zoom 15)</option>
      <option value={16}>Most detail (zoom 16)</option>
    </select>
  </label>

  {#if progress}
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
      <div class="bar" style:width="{(100 * progress.done) / Math.max(1, progress.total)}%"></div>
    </div>
    <div class="row">
      <span class="muted">{progress.done} / {progress.total} tiles · {mb(progress.bytes)} MB</span>
      <button type="button" onclick={() => controller?.abort()}>Cancel</button>
    </div>
  {:else if plan}
    <div class="row">
      <span class="muted">{tileCount.toLocaleString()} tiles · about {mb(estimateBytes(plan))} MB</span>
      <button type="button" class="primary" onclick={download} disabled={!online || tileCount > MAX_TILES}>
        Download this area
      </button>
    </div>
    {#if tileCount > MAX_TILES}
      <p class="explain warning">Too large: zoom the map in or choose less map detail.</p>
    {:else if !online}
      <p class="explain">Connect to download.</p>
    {/if}
  {/if}

  {#if message}
    <p class="explain" aria-live="polite">{message}</p>
  {/if}

  {#if areas.length}
    <h3>Saved areas</h3>
    <ul class="areas">
      {#each areas as area (area.id)}
        <li>
          <div>
            <strong>{area.name}</strong>
            <span class="muted">
              {date(area.created)} · {mb(area.bytes)} MB · map to zoom {area.mapMaxZoom}{area.complete ? '' : ' · has gaps'}
            </span>
          </div>
          <div class="actions">
            <button type="button" class="link" onclick={() => onshow(area.bounds)}>Show</button>
            <!-- A download may be reusing this area's tiles. -->
            <button type="button" class="link" onclick={() => remove(area)} disabled={!!progress}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if storage}
    <p class="explain">Storage used: {mb(storage.usage)} MB of {mb(storage.quota)} MB available to this app.</p>
  {/if}
{/snippet}

{#if folded}
  <details class="fold">
    <summary class="head">{@render heading()}</summary>
    <section class="fold-body">{@render content()}</section>
  </details>
{:else}
  <section>
    <div class="head">{@render heading()}</div>
    {@render content()}
  </section>
{/if}

<style>
  .fold summary {
    cursor: pointer;
    list-style: none;
  }

  .fold summary::-webkit-details-marker {
    display: none;
  }

  .fold summary::after {
    content: '▾';
    color: var(--text-muted);
  }

  .fold[open] summary::after {
    content: '▴';
  }

  .fold-body {
    margin-top: 6px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .head,
  .row,
  .field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
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

  .label {
    font-weight: 500;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }

  .status i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--good);
  }

  .status.offline i {
    background: var(--critical);
  }

  .explain {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .warning {
    color: var(--warning-text);
  }

  .muted {
    color: var(--text-muted);
    font-size: 12px;
  }

  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .progress {
    height: 6px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }

  .areas {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .areas li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .areas li div:first-child {
    display: flex;
    flex-direction: column;
  }

  .actions {
    display: flex;
    gap: 10px;
    align-items: flex-start;
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
