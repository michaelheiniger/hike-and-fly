import type { WorkerRequest, WorkerResponse } from './protocol'
import type { ReachRequest, ReachResult } from './reach'

export type ReachOutcome = { result: ReachResult; png: Blob } | { error: string }

/**
 * Runs reach computations in a worker, one at a time. A search cannot be
 * interrupted, so while one runs only the latest new request is kept.
 */
export class ReachClient {
  private worker = new Worker(new URL('./reach.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 1
  private running = false
  private queued: ReachRequest | null = null
  private onOutcome: (outcome: ReachOutcome, request: ReachRequest) => void
  private current: ReachRequest | null = null

  constructor(onOutcome: (outcome: ReachOutcome, request: ReachRequest) => void) {
    this.onOutcome = onOutcome
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      const request = this.current!
      this.running = false
      if (this.queued) {
        const next = this.queued
        this.queued = null
        this.send(next)
      }
      this.onOutcome(message.type === 'result' ? { result: message.result, png: message.png } : { error: message.message }, request)
    }
  }

  get busy(): boolean {
    return this.running
  }

  request(request: ReachRequest): void {
    if (this.running) this.queued = request
    else this.send(request)
  }

  private send(request: ReachRequest): void {
    this.running = true
    this.current = request
    // Callers pass plain objects (e.g. `$state.snapshot`): reactive proxies cannot be cloned.
    const message: WorkerRequest = { id: this.nextId++, request }
    this.worker.postMessage(message)
  }

  dispose(): void {
    this.worker.terminate()
  }
}
