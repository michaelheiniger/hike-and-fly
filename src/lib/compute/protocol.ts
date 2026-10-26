import type { ReachRequest, ReachResult } from './reach'

export interface WorkerRequest {
  id: number
  request: ReachRequest
}

export type WorkerResponse =
  | { id: number; type: 'result'; result: ReachResult; png: Blob }
  | { id: number; type: 'error'; message: string }
