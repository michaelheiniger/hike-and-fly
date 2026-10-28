<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    /** What the tip explains, for the button's accessible name. */
    topic: string
    children: Snippet
  }

  let { topic, children }: Props = $props()

  const id = $props.id()
  let button: HTMLButtonElement

  /** Width of the tip, as in its CSS. */
  const WIDTH = 280

  /** Places the tip below its button before it opens, kept on screen. */
  function place(e: ToggleEvent) {
    if (e.newState !== 'open') return
    const tip = e.currentTarget as HTMLElement
    const anchor = button.getBoundingClientRect()
    const width = Math.min(WIDTH, innerWidth - 16)
    tip.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`
    tip.style.top = `${anchor.bottom + 6}px`
  }
</script>

<button bind:this={button} type="button" class="info" popovertarget={id} aria-label="About {topic}">i</button>
<span {id} class="tip" popover onbeforetoggle={place}>{@render children()}</span>

<style>
  .info {
    width: 18px;
    height: 18px;
    padding: 0;
    margin-left: 4px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 600;
    font-style: italic;
    line-height: 1;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text-muted);
    vertical-align: middle;
  }

  .tip {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(280px, calc(100vw - 16px));
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: var(--shadow);
  }
</style>
