<script lang="ts">
  import { t } from '../lib/i18n/index.svelte'
  import type { LngLat } from '../lib/terrain/geo'

  interface Props {
    waypoints: LngLat[]
    onremove: (index: number) => void
    onclear: () => void
  }

  let { waypoints, onremove, onclear }: Props = $props()
</script>

<section>
  <div class="head">
    <h2>{t.waypoints.title}</h2>
    <button type="button" class="link" onclick={onclear}>{t.waypoints.removeAll}</button>
  </div>
  <p class="muted">{t.waypoints.explain}</p>
  <ol>
    {#each waypoints as w, i (i)}
      <li>
        <span class="number" aria-hidden="true">{i + 1}</span>
        <span class="value">{w.lat.toFixed(4)}°, {w.lng.toFixed(4)}°</span>
        <button type="button" class="link" aria-label={t.waypoints.removeOne(i + 1)} onclick={() => onremove(i)}>
          {t.waypoints.remove}
        </button>
      </li>
    {/each}
  </ol>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0;
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .number {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #2a78d6;
    color: #ffffff;
    font: 600 11px/18px system-ui, sans-serif;
    text-align: center;
    flex: none;
  }

  .value {
    flex: 1;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
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
