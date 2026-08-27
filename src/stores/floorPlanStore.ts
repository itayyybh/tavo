import { create } from 'zustand'
import { todayKey } from '@/utils'

/**
 * Floor Plan Store — which day the Live Floor is showing, and whether it's in
 * planning mode.
 *
 * The Live Floor normally renders TODAY's live service. Plan mode turns it into
 * a planning canvas: the host can review another day's reservations laid out on
 * the floor and pre-assign tables to them ("how will tomorrow be organized?")
 * WITHOUT seating anyone. Nothing here mutates reservations or the runtime shift
 * — it only selects what the derivation (`deriveFloorState`) computes.
 *
 * Two knobs, one effect:
 *  - `viewDate` — the `YYYY-MM-DD` day the floor shows (default: today).
 *  - `planMode` — an explicit toggle so the host can preview TODAY without
 *    seating too.
 * Viewing any non-today date is inherently planning (you can't run live service
 * for another day), so `isPlanning(state)` is `planMode || viewDate !== today`.
 */
interface FloorPlanState {
  /** The `YYYY-MM-DD` day the floor is showing. */
  viewDate: string
  /** Explicit plan-mode toggle (meaningful when viewing today). */
  planMode: boolean
  /** Jump to a specific day key; a non-today day implicitly plans. */
  setViewDate: (day: string) => void
  /** Step the viewed day by whole days (±1 = prev/next). */
  stepDay: (delta: number) => void
  /** Snap back to today (leaves the explicit toggle untouched). */
  goToday: () => void
  /** Flip the explicit plan-mode toggle. */
  togglePlanMode: () => void
}

/** Shift a `YYYY-MM-DD` key by whole local days. */
function shiftDayKey(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  const mm = `${date.getMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

export const useFloorPlanStore = create<FloorPlanState>((set) => ({
  viewDate: todayKey(),
  planMode: false,

  setViewDate: (day) => set({ viewDate: day }),
  stepDay: (delta) => set((s) => ({ viewDate: shiftDayKey(s.viewDate, delta) })),
  goToday: () => set({ viewDate: todayKey() }),
  togglePlanMode: () => set((s) => ({ planMode: !s.planMode })),
}))

/**
 * True when the floor should render as a planning canvas rather than live
 * service: either the host toggled plan mode, or they're viewing a day that
 * isn't today. The single question every floor component asks.
 */
export function isPlanning(state: Pick<FloorPlanState, 'planMode' | 'viewDate'>): boolean {
  return state.planMode || state.viewDate !== todayKey()
}
