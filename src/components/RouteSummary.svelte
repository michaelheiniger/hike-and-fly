<script lang="ts">
  import { MAX_GLIDE_RATIO } from '../lib/glide/required'
  import type { RouteResult } from '../lib/compute/route'

  interface Props {
    result: RouteResult | null
    computing: boolean
    error: string | null
    glideRatio: number
    arrivalHeight: number
    onclear: () => void
  }

  let { result, computing, error, glideRatio, arrivalHeight, onclear }: Props = $props()

  /** Glide ratio for the straight line, ignoring terrain. */
  const straightRatio = $derived.by(() => {
    if (!result) return null
    const height = result.startAltitude - result.landingElevation - arrivalHeight
    return height > 0 ? result.straightDistance / height : null
  })

  /** Rounded up: the conservative side. */
  const up = (gr: number) => (Math.ceil(gr * 10 - 1e-9) / 10).toFixed(1)

  const detour = $derived(
    result?.required && straightRatio ? result.required.length / result.straightDistance - 1 : 0,
  )
</script>

<section>
  <div class="head">
    <h2>Landing</h2>
    <button type="button" class="link" onclick={onclear}>Remove</button>
  </div>

  {#if result}
    <div class="row">
      <span class="label">Ground</span>
      <span class="value">{Math.round(result.landingElevation)} m AMSL</span>
    </div>
    <div class="row">
      <span class="label">Straight distance</span>
      <span class="value">{(result.straightDistance / 1000).toFixed(1)} km</span>
    </div>

    <div class="hero" aria-live="polite">
      <span class="label">Required glide ratio</span>
      {#if result.required}
        <span class="number">{up(result.required.glideRatio)}</span>
        <span class="muted">
          {#if detour > 0.03}
            Route flies around terrain: {(result.required.length / 1000).toFixed(1)} km (+{Math.round(detour * 100)} %).
            The straight line would need {straightRatio ? up(straightRatio) : '—'}.
          {:else}
            Straight line, clear of terrain.
          {/if}
          Includes {arrivalHeight} m above the landing.
        </span>
      {:else}
        <span class="number">—</span>
        <span class="muted">
          {#if straightRatio === null}
            The landing is not below the start (with {arrivalHeight} m arrival height).
          {:else}
            Not reachable even with glide ratio {MAX_GLIDE_RATIO}: terrain blocks every route.
          {/if}
        </span>
      {/if}
    </div>

    {#if result.required}
      {#if result.withGlideRatio}
        <p class="verdict good">
          <span aria-hidden="true">✓</span>
          Reachable with {glideRatio}: arrive {Math.round(result.withGlideRatio.arrivalAgl)} m above the landing.
        </p>
      {:else}
        <p class="verdict critical">
          <span aria-hidden="true">✕</span>
          Not reachable with {glideRatio}: you need {up(result.required.glideRatio)}.
        </p>
      {/if}
    {/if}
  {/if}

  <div class="status" aria-live="polite">
    {#if computing}
      <span class="muted">Computing route…</span>
    {:else if error}
      <span class="error">⚠ {error}</span>
    {/if}
  </div>
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

  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .label {
    font-weight: 500;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .number {
    font-size: 28px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--text-muted);
    font-size: 12px;
  }

  .verdict {
    margin: 0;
    display: flex;
    gap: 6px;
    font-weight: 500;
  }

  .verdict.good span {
    color: var(--good);
  }

  .verdict.critical span {
    color: var(--critical);
  }

  .status {
    min-height: 1em;
  }

  .error {
    color: var(--critical);
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
