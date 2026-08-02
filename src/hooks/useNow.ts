import { useSyncExternalStore } from 'react'

/**
 * Shared wall-clock — a single interval drives every subscriber, so N live
 * countdowns cost one timer, not N. Ticks at a coarse cadence (30s) since
 * countdowns render at minute granularity. Only components that call `useNow`
 * re-render on a tick; everything else is untouched.
 */
const TICK_MS = 30_000

let current = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function start() {
  if (timer) return
  timer = setInterval(() => {
    current = Date.now()
    listeners.forEach((l) => l())
  }, TICK_MS)
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  start()
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => current

/** Current epoch-ms, updated every 30s across all subscribers. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
