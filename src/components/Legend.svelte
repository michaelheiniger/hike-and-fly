<script lang="ts">
  import type { AglBand } from '../lib/render/agl'

  let { bands }: { bands: AglBand[] } = $props()
</script>

<section>
  <h2>Height above ground</h2>
  <ul>
    {#each [...bands].reverse() as band (band.from)}
      <li>
        <span class="swatch" style:background={band.color}></span>
        <span>{band.label}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 0 0 6px;
  }

  ul {
    list-style: none;
    margin: 0;
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

  .swatch {
    width: 22px;
    height: 12px;
    border-radius: 3px;
    opacity: 0.8;
  }
</style>
