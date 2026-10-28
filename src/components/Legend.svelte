<script lang="ts">
  import type { AglBand } from '../lib/render/agl'

  /** `open`: unfolded at first. */
  let { bands, launchZone, open = true }: { bands: AglBand[]; launchZone: number; open?: boolean } = $props()
</script>

<details {open}>
  <summary>Height above ground</summary>
  <ul>
    {#each [...bands].reverse() as band (band.from)}
      <li>
        <span class="swatch" style:background={band.color}></span>
        <span>{band.label}</span>
      </li>
    {/each}
    {#if launchZone > 0}
      <li>
        <span class="swatch launch"></span>
        <span>Launch zone (first {launchZone} m): not colored</span>
      </li>
    {/if}
  </ul>
</details>

<style>
  details {
    background: var(--surface);
    color: var(--text);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 8px 12px;
  }

  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::after {
    content: '▾';
    margin-left: auto;
  }

  details[open] summary::after {
    content: '▴';
  }

  ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .swatch.launch {
    background: transparent;
    border: 1px dashed var(--text-muted);
    opacity: 1;
  }

  .swatch {
    width: 22px;
    height: 12px;
    border-radius: 3px;
    opacity: 0.8;
  }
</style>
