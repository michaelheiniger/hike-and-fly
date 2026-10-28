import type { ReachRequest, ReachResult } from './reach'
import type { RouteRequest, RouteResult } from './route'

export type WorkerRequest =
  | { id: number; kind: 'reach'; request: ReachRequest }
  | { id: number; kind: 'route'; request: RouteRequest }
  | { id: number; kind: 'alternatives'; request: RouteRequest }

export type WorkerResponse =
  | { id: number; kind: 'reach'; type: 'result'; result: ReachResult; elevationSource: string }
  | { id: number; kind: 'route' | 'alternatives'; type: 'result'; result: RouteResult }
  | { id: number; kind: WorkerRequest['kind']; type: 'error'; message: string }
  /** Elevation tiles started (active) or finished loading, during any request. */
  | { type: 'loading'; active: boolean }
