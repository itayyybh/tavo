import type { LayoutSnapshot } from '@/types'

/**
 * Layout persistence — localStorage for now (real DB arrives in Phase 10).
 * A versioned envelope keeps us forward-compatible when the schema changes.
 */
const STORAGE_KEY = 'rfm.layout'
const VERSION = 1

interface LayoutEnvelope {
  version: number
  snapshot: LayoutSnapshot
}

export function saveLayout(snapshot: LayoutSnapshot): void {
  try {
    const envelope: LayoutEnvelope = { version: VERSION, snapshot }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Storage may be unavailable (private mode / quota) — fail silently for MVP.
  }
}

export function loadLayout(): LayoutSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const envelope = JSON.parse(raw) as LayoutEnvelope
    if (envelope.version !== VERSION) return null
    // Tolerate older documents that predate obstacles.
    return { ...envelope.snapshot, obstacles: envelope.snapshot.obstacles ?? [] }
  } catch {
    return null
  }
}

export function clearLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Serialize a layout to a pretty JSON string (versioned envelope) for file export. */
export function serializeLayout(snapshot: LayoutSnapshot): string {
  const envelope: LayoutEnvelope = { version: VERSION, snapshot }
  return JSON.stringify(envelope, null, 2)
}

/** Parse an imported layout file, tolerating missing arrays. Returns null if invalid. */
export function parseLayoutFile(text: string): LayoutSnapshot | null {
  try {
    const envelope = JSON.parse(text) as Partial<LayoutEnvelope>
    const s = envelope?.snapshot
    if (!s || !Array.isArray(s.tables)) return null
    return {
      tables: s.tables,
      zones: s.zones ?? [],
      mergedGroups: s.mergedGroups ?? [],
      obstacles: s.obstacles ?? [],
      tableTypes: s.tableTypes,
    }
  } catch {
    return null
  }
}
