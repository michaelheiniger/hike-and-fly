/**
 * Binary min-heap of (key, value) pairs backed by typed arrays.
 * Used with lazy deletion: stale entries are skipped by the caller.
 */
export class MinHeap {
  private keys: Float64Array
  private values: Int32Array
  size = 0

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity)
    this.values = new Int32Array(capacity)
  }

  push(key: number, value: number): void {
    if (this.size === this.keys.length) this.grow()
    const keys = this.keys
    const values = this.values
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent] <= key) break
      keys[i] = keys[parent]
      values[i] = values[parent]
      i = parent
    }
    keys[i] = key
    values[i] = value
  }

  /** Key of the minimum entry. Only valid when size > 0. */
  peekKey(): number {
    return this.keys[0]
  }

  /** Removes the minimum entry and returns its value. Only valid when size > 0. */
  pop(): number {
    const keys = this.keys
    const values = this.values
    const top = values[0]
    const last = --this.size
    if (last === 0) return top
    const key = keys[last]
    const value = values[last]
    let i = 0
    const half = last >> 1
    while (i < half) {
      let child = 2 * i + 1
      if (child + 1 < last && keys[child + 1] < keys[child]) child++
      if (keys[child] >= key) break
      keys[i] = keys[child]
      values[i] = values[child]
      i = child
    }
    keys[i] = key
    values[i] = value
    return top
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2)
    const values = new Int32Array(this.values.length * 2)
    keys.set(this.keys)
    values.set(this.values)
    this.keys = keys
    this.values = values
  }
}
