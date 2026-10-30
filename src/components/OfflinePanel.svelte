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
  import { preferences } from '../lib/settings.svelte'
  import { count, date, num, t } from '../lib/i18n/index.svelte'
  import InfoTip from './InfoTip.svelte'

  interface Props {
    /** Area currently shown on the map. */
    view: Bounds | null
    /** Saved areas, shared with the map. */
    areas: OfflineArea[]
    online: boolean
    onshow: (bounds: Bounds) => void
  }

  let { view, areas = $bindable(), online, onshow }: Props = $props()

  /** Above this, the download is refused: zoom in or lower the detail. */
  const MAX_TILES = 30_000

  let progress = $state<DownloadProgress | null>(null)
  let message = $state<string | null>(null)
  let storage = $state<{ usage: number; quota: number } | null>(null)
  let controller: AbortController | null = null
  let loader: TileLoader | null = null

  const plan = $derived(view ? planArea(view, preferences.offlineMapZoom) : null)
  const tileCount = $derived(plan ? plan.mapTiles.length + plan.elevationTiles.length : 0)

  const mb = (bytes: number) => num(bytes / 1e6, bytes < 10e6 ? 1 : 0)
  /** An area's name, by its center: 46.67° N, 8.07° E. */
  function areaName(b: Bounds): string {
    const lat = (b.north + b.south) / 2
    const lng = (b.east + b.west) / 2
    const o = t.offline
    return `${num(Math.abs(lat), 2)}° ${lat >= 0 ? o.north : o.south}, ${num(Math.abs(lng), 2)}° ${lng >= 0 ? o.east : o.west}`
  }

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
        ? t.offline.saved(count(area.tiles), mb(area.bytes), reused)
        : t.offline.savedWithGaps(progress?.failed ?? 0)
    } catch (err) {
      message = err instanceof DOMException && err.name === 'AbortError' ? t.offline.cancelled : t.offline.failed(String(err))
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

</script>

<section>
  <div class="head">
    <h2>
      {t.offline.title}
      <InfoTip topic={t.topics.offline}>{t.offline.tip}</InfoTip>
    </h2>
    <span class="status" class:offline={!online}><i aria-hidden="true"></i>{online ? t.offline.online : t.offline.offline}</span>
  </div>
  <label class="field">
    <span class="label">{t.offline.mapDetail}</span>
    <select bind:value={preferences.offlineMapZoom} disabled={!!progress}>
      {#each [13, 14, 15, 16] as zoom (zoom)}
        <option value={zoom}>{t.offline.detailOption(t.offline.detail[zoom], zoom)}</option>
      {/each}
    </select>
  </label>

  {#if progress}
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.done}>
      <div class="bar" style:width="{(100 * progress.done) / Math.max(1, progress.total)}%"></div>
    </div>
    <div class="row">
      <span class="muted">{t.offline.progress(count(progress.done), count(progress.total), mb(progress.bytes))}</span>
      <button type="button" onclick={() => controller?.abort()}>{t.offline.cancel}</button>
    </div>
  {:else if plan}
    <div class="row">
      <span class="muted">{t.offline.estimate(count(tileCount), mb(estimateBytes(plan)))}</span>
      <button type="button" class="primary" onclick={download} disabled={!online || tileCount > MAX_TILES}>
        {t.offline.download}
      </button>
    </div>
    {#if tileCount > MAX_TILES}
      <p class="explain warning">{t.offline.tooLarge}</p>
    {:else if !online}
      <p class="explain">{t.offline.connect}</p>
    {/if}
  {/if}

  {#if message}
    <p class="explain" aria-live="polite">{message}</p>
  {/if}

  {#if areas.length}
    <h3>{t.offline.savedAreas}</h3>
    <ul class="areas">
      {#each areas as area (area.id)}
        <li>
          <div>
            <strong>{areaName(area.bounds)}</strong>
            <span class="muted">
              {t.offline.areaFacts(date(area.created), mb(area.bytes), area.mapMaxZoom, !area.complete)}
            </span>
          </div>
          <div class="actions">
            <button type="button" class="link" onclick={() => onshow(area.bounds)}>{t.offline.show}</button>
            <!-- A download may be reusing this area's tiles. -->
            <button type="button" class="link" onclick={() => remove(area)} disabled={!!progress}>{t.offline.delete}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if storage}
    <p class="explain">{t.offline.storage(mb(storage.usage), mb(storage.quota))}</p>
  {/if}
</section>

<style>
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
