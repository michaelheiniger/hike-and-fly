import type { WorkerRequest, WorkerResponse } from './protocol'
import type { ReachRequest, ReachResult } from './reach'
import type { RouteRequest, RouteResult } from './route'

export type ReachOutcome = { result: ReachResult } | { error: string }
export type RouteOutcome = { result: RouteResult } | { error: string }

type Kind = WorkerRequest['kind']
type Pending = { kind: 'reach'; request: ReachRequest } | { kind: 'route'; request: RouteRequest }

export interface PlannerCallbacks {
  onReach: (outcome: ReachOutcome, request: ReachRequest) => void
  onRoute: (outcome: RouteOutcome, request: RouteRequest) => void
  /** Called whenever the set of busy kinds changes. */
  onBusy?: (busy: Record<Kind, boolean>) => void
}

/**
 * Runs computations in a worker, one at a time. A search cannot be interrupted,
 * so while one runs only the latest new request of each kind is kept.
 */
export class PlannerClient {
  private worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' })
  private nextId = 1
  private current: Pending | null = null
  private queued = new Map<Kind, Pending>()
  private callbacks: PlannerCallbacks

  constructor(callbacks: PlannerCallbacks) {
    this.callbacks = callbacks
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data)
  }

  reach(request: ReachRequest): void {
    this.enqueue({ kind: 'reach', request })
  }

  route(request: RouteRequest): void {
    this.enqueue({ kind: 'route', request })
  }

  dispose(): void {
    this.worker.terminate()
  }

  private enqueue(pending: Pending): void {
    this.queued.set(pending.kind, pending)
    if (!this.current) this.sendNext()
    this.notifyBusy()
  }

  private sendNext(): void {
    const next = this.queued.values().next().value
    if (!next) return
    this.queued.delete(next.kind)
    this.current = next
    // Callers pass plain objects (e.g. `$state.snapshot`): reactive proxies cannot be cloned.
    this.worker.postMessage({ id: this.nextId++, ...next } satisfies WorkerRequest)
  }

  private receive(message: WorkerResponse): void {
    const done = this.current!
    this.current = null
    this.sendNext()
    if (done.kind === 'reach' && message.kind === 'reach') {
      this.callbacks.onReach(message.type === 'result' ? { result: message.result } : { error: message.message }, done.request)
    } else if (done.kind === 'route' && message.kind === 'route') {
      this.callbacks.onRoute(message.type === 'result' ? { result: message.result } : { error: message.message }, done.request)
    }
    this.notifyBusy()
  }

  private notifyBusy(): void {
    const busy = { reach: false, route: false }
    if (this.current) busy[this.current.kind] = true
    for (const kind of this.queued.keys()) busy[kind] = true
    this.callbacks.onBusy?.(busy)
  }
}
