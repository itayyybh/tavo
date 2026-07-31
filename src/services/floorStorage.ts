import type { FloorSnapshot } from '@/types'

/**
 * Live Floor persistence (Phase 8) — localStorage for now (real DB in Phase 10).
 * Mirrors `layoutStorage` / `reservationStorage`: an independent key + versioned
 * envelope so the runtime shift survives a refresh without ever touching the base
 * layout's storage. The base design and the shift's overrides stay separate on
 * disk, exactly as they are in memory.
 */
const STORAGE_KEY = 'rfm.floor'
const VERSION = 1

interface FloorEnvelope {
  version: number
  snapshot: FloorSnapshot
}

export function saveFloor(snapshot: FloorSnapshot): void {
  try {
    const envelope: FloorEnvelope = { version: VERSION, snapshot }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Storage may be unavailable (private mode / quota) — fail silently for MVP.
  }
}

export function loadFloor(): FloorSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const envelope = JSON.parse(raw) as Partial<FloorEnvelope>
    if (envelope.version !== VERSION || !envelope.snapshot) return null
    const s = envelope.snapshot
    // Defensive: ensure the shape is whole before trusting it.
    return {
      seatings: Array.isArray(s.seatings) ? s.seatings : [],
      runtimeMerges: Array.isArray(s.runtimeMerges) ? s.runtimeMerges : [],
      statusOverrides: s.statusOverrides ?? {},
      positionOverrides: s.positionOverrides ?? {},
    }
  } catch {
    return null
  }
}

export function clearFloor(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
