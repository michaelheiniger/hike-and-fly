<script lang="ts">
  import {
    REPORT_CATEGORIES,
    reportDetails,
    reportPayload,
    sendReport,
    type ReportCategory,
    type ReportContext,
  } from '../lib/report'

  interface Props {
    /** What to attach, read when the dialog opens: the plan and results of that moment. */
    context: () => ReportContext
  }

  let { context }: Props = $props()

  let dialog: HTMLDialogElement
  let attached = $state<ReportContext | null>(null)
  let category = $state<ReportCategory>('results')
  let message = $state('')
  let email = $state('')
  /** Honeypot: hidden from people, ticked by naive bots; such submissions are dropped. */
  let botcheck = $state(false)
  let status = $state<{ kind: 'sending' | 'success' | 'error'; text: string } | null>(null)

  export function open() {
    attached = context()
    status = null
    dialog.showModal()
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (botcheck || !attached) return
    status = { kind: 'sending', text: 'Sending…' }
    try {
      await sendReport(reportPayload(attached, { category, message, email }))
      message = ''
      status = { kind: 'success', text: 'Thank you: the report was sent.' }
    } catch {
      status = { kind: 'error', text: 'The report could not be sent. Check the connection and try again.' }
    }
  }
</script>

<dialog bind:this={dialog} aria-labelledby="report-title">
  <form onsubmit={submit}>
    <h2 id="report-title">Report an issue</h2>
    <p class="muted">
      Describe what went wrong. The plan and what the app shows are attached, so the problem can be reproduced. No
      account needed.
    </p>

    <label for="report-category">What is it about?</label>
    <select id="report-category" bind:value={category}>
      {#each Object.entries(REPORT_CATEGORIES) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>

    <label for="report-message">What happened, and what did you expect?</label>
    <textarea id="report-message" bind:value={message} rows="5" maxlength="5000" required></textarea>

    <label for="report-email">Your email, for a reply (optional)</label>
    <input id="report-email" type="email" autocomplete="email" bind:value={email} />

    <input type="checkbox" class="botcheck" tabindex="-1" autocomplete="off" aria-hidden="true" bind:checked={botcheck} />

    {#if attached}
      <details>
        <summary>Details attached</summary>
        <pre>{reportDetails(attached)}</pre>
      </details>
    {/if}

    <p class="status {status?.kind ?? ''}" role="status">{status?.text ?? ''}</p>

    <div class="actions">
      <button type="button" onclick={() => dialog.close()}>Close</button>
      <button type="submit" class="primary" disabled={status?.kind === 'sending'}>Send</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  label {
    margin-top: 4px;
    font-weight: 500;
  }

  select,
  textarea,
  input[type='email'] {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 6px;
  }

  textarea {
    resize: vertical;
  }

  .botcheck {
    position: absolute;
    left: -9999px;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
  }

  details {
    font-size: 12px;
    color: var(--text-muted);
  }

  pre {
    margin: 4px 0 0;
    padding: 6px;
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 11px;
  }

  .status {
    margin: 0;
    min-height: 1.2em;
    font-size: 12px;
  }

  .status.success {
    color: var(--good);
  }

  .status.error {
    color: var(--critical);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }

  .primary:disabled {
    opacity: 0.6;
  }
</style>
