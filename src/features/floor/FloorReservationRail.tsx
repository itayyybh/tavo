import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useFloorStore,
  useFloorPlanStore,
  useLayoutStore,
  useReservationStore,
  useSettingsStore,
  useUIStore,
  isPlanning,
} from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { explainNoFit, suggestSeating, type Suggestion } from '@/services/seating'
import { urgencyOf, type TableUrgency } from '@/services/floor'
import { useNow } from '@/hooks/useNow'
import { FloorStorageBar } from './FloorStorageBar'
import { formatTime, isOnDay, todayKey } from '@/utils'
import type { Reservation, Zone } from '@/types'

/** Statuses that make a booking seatable from the floor (an upcoming party). */
const SEATABLE: Reservation['status'][] = ['pending', 'confirmed', 'arrived']

/**
 * Drag payload MIME for dragging a reservation card onto the floor canvas
 * (manual seat — for merges the engine's proximity-bounded search doesn't
 * find; see `FloorCanvas`'s drop handler). Shared constant so both sides agree.
 */
export const RESERVATION_DRAG_MIME = 'application/x-rfm-reservation-id'

const seatBtn =
  'rounded-lg bg-ink px-3 py-1 text-xs font-medium text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
const clearBtn =
  'rounded-lg border border-line px-3 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface'

/**
 * Right-hand rail for the Live Floor (Phase 8, Step 3): the upcoming bookings a
 * waiter seats as parties arrive, and the parties currently seated (with a clear
 * action). Respects the pinned zone — when a zone is focused, both lists narrow
 * to it. Each card carries a zone tag. Seating uses the table(s) already reserved
 * on the booking (Phase 7); ad-hoc table picking arrives with drag in Step 4.
 */
export function FloorReservationRail() {
  const { t } = useTranslation('reservations')
  const reservations = useReservationStore((s) => s.reservations)
  const assignTable = useReservationStore((s) => s.assignTable)
  const clearAssignment = useReservationStore((s) => s.clearAssignment)
  const tables = useLayoutStore((s) => s.tables)
  const zones = useLayoutStore((s) => s.zones)
  const seatings = useFloorStore((s) => s.seatings)
  const runtimeMerges = useFloorStore((s) => s.runtimeMerges)
  const seat = useFloorStore((s) => s.seat)
  const clear = useFloorStore((s) => s.clear)
  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const waitlistEnabled = useSettingsStore((s) => s.waitlistEnabled)
  const seatingFloor = useSeatingFloor()
  const now = useNow()
  // Plan mode: the rail follows the floor's viewed day and plans (assigns) rather
  // than seats. Live-only sections (Seated, Waitlist) are hidden while planning.
  const viewDate = useFloorPlanStore((s) => s.viewDate)
  const planning = useFloorPlanStore(isPlanning)

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones])
  const tableZone = useMemo(() => new Map(tables.map((t) => [t.id, t.zoneId])), [tables])
  const labelOf = useMemo(() => {
    const map = new Map(tables.map((t) => [t.id, t.label]))
    return (ids: string[] = []) => ids.map((id) => map.get(id) ?? '?').join(' + ')
  }, [tables])

  const resById = useMemo(
    () => new Map(reservations.map((r) => [r.id, r])),
    [reservations],
  )

  const day = planning ? viewDate : todayKey()
  const seatedIds = useMemo(
    () => new Set(seatings.map((s) => s.reservationId)),
    [seatings],
  )
  // Owned merges the host still needs to arrange by hand (no clear auto-placement).
  const arrangeBySeating = useMemo(
    () =>
      new Set(
        runtimeMerges
          .filter((m) => m.needsArrange && m.seatingId)
          .map((m) => m.seatingId as string),
      ),
    [runtimeMerges],
  )

  const upcoming = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            SEATABLE.includes(r.status) &&
            !seatedIds.has(r.id) &&
            isOnDay(r.dateTime, day) &&
            (!focusedZoneId || r.preferredZoneId === focusedZoneId),
        )
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    [reservations, seatedIds, day, focusedZoneId],
  )

  // Plan mode: the engine's best-fit table(s) for each still-unplanned booking, so
  // a one-click "Plan" can assign it (mirrors the waitlist's suggestion flow).
  const planSuggestion = useMemo(() => {
    const map = new Map<string, Suggestion | undefined>()
    if (!planning) return map
    for (const r of upcoming) {
      if ((r.assignedTableIds ?? []).length > 0) continue
      const others = reservations.filter((o) => o.id !== r.id)
      map.set(r.id, suggestSeating(r, seatingFloor, others)[0])
    }
    return map
  }, [planning, upcoming, reservations, seatingFloor])

  const seated = useMemo(
    () =>
      focusedZoneId
        ? seatings.filter((s) =>
            s.tableIds.some((id) => tableZone.get(id) === focusedZoneId),
          )
        : seatings,
    [seatings, focusedZoneId, tableZone],
  )

  // The second seating for each occupied table set: the soonest upcoming booking
  // assigned to any of the seating's tables. Combined-table aware — a next party
  // reusing some or all of the merged tables is matched by intersection.
  const nextBySeating = useMemo(() => {
    const map = new Map<string, Reservation | undefined>()
    for (const s of seated) {
      const set = new Set(s.tableIds)
      const next = reservations
        .filter(
          (r) =>
            SEATABLE.includes(r.status) &&
            !seatedIds.has(r.id) &&
            (r.assignedTableIds ?? []).some((id) => set.has(id)),
        )
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))[0]
      map.set(s.id, next)
    }
    return map
  }, [seated, reservations, seatedIds])

  // Walk-ins with no table yet — no `assignedTableIds`, so each row asks the
  // engine for its own best-fit suggestion (no reservation form step for these).
  const waitlist = useMemo(
    () =>
      waitlistEnabled
        ? reservations
            .filter(
              (r) =>
                r.status === 'waitlist' &&
                isOnDay(r.dateTime, day) &&
                (!focusedZoneId || r.preferredZoneId === focusedZoneId),
            )
            .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        : [],
    [waitlistEnabled, reservations, day, focusedZoneId],
  )
  const waitlistSuggestion = useMemo(() => {
    const map = new Map<string, Suggestion | undefined>()
    for (const r of waitlist) {
      const others = reservations.filter((o) => o.id !== r.id)
      map.set(r.id, suggestSeating(r, seatingFloor, others)[0])
    }
    return map
  }, [waitlist, reservations, seatingFloor])

  return (
    <aside className="flex w-72 flex-col border-l border-line bg-surface-2">
      <Section title="Upcoming" count={upcoming.length}>
        {upcoming.length === 0 && <Empty>No upcoming bookings.</Empty>}
        {upcoming.map((r) => {
          const assigned = r.assignedTableIds ?? []
          const canSeat = assigned.length > 0
          return (
            <li
              key={r.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(RESERVATION_DRAG_MIME, r.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="cursor-grab rounded-xl border border-line bg-surface p-2.5 active:cursor-grabbing"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {r.guestName}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <UrgencyChip minutes={Math.round((Date.parse(r.dateTime) - now) / 60_000)} />
                  {formatTime(r.dateTime)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <ZoneTag zone={zoneById.get(r.preferredZoneId ?? '')} />
                <span className="text-xs text-muted">
                  {r.partySize}p ·{' '}
                  {canSeat ? (
                    <span className="text-ink">{labelOf(assigned)}</span>
                  ) : (
                    'no table — drag onto the floor'
                  )}
                </span>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                {planning ? (
                  canSeat ? (
                    <button className={clearBtn} onClick={() => clearAssignment(r.id)}>
                      Unplan
                    </button>
                  ) : (
                    (() => {
                      const suggestion = planSuggestion.get(r.id)
                      return (
                        <button
                          className={seatBtn}
                          disabled={!suggestion}
                          title={
                            suggestion
                              ? `Plan onto ${labelOf(suggestion.candidate.tableIds)}`
                              : 'No table fits — drag onto the floor to plan'
                          }
                          onClick={() =>
                            suggestion &&
                            assignTable(r.id, suggestion.candidate.tableIds, 'manual')
                          }
                        >
                          Plan
                        </button>
                      )
                    })()
                  )
                ) : (
                  <button
                    className={seatBtn}
                    disabled={!canSeat}
                    title={
                      canSeat
                        ? undefined
                        : 'Drag onto a table (or a selection) on the floor'
                    }
                    onClick={() => seat(r.id, assigned)}
                  >
                    Seat
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </Section>

      {!planning && waitlistEnabled && (
        <Section title="Waitlist" count={waitlist.length}>
          {waitlist.length === 0 && <Empty>Nobody waiting.</Empty>}
          {waitlist.map((r) => {
            const suggestion = waitlistSuggestion.get(r.id)
            return (
              <li
                key={r.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(RESERVATION_DRAG_MIME, r.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="cursor-grab rounded-xl border border-line bg-surface p-2.5 active:cursor-grabbing"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {r.guestName}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    Since {formatTime(r.dateTime)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ZoneTag zone={zoneById.get(r.preferredZoneId ?? '')} />
                  <span className="text-xs text-muted">
                    {r.partySize}p ·{' '}
                    {suggestion ? (
                      <span className="text-ink">
                        {labelOf(suggestion.candidate.tableIds)}
                      </span>
                    ) : (
                      'no table — drag onto the floor'
                    )}
                  </span>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    className={seatBtn}
                    disabled={!suggestion}
                    title={
                      suggestion
                        ? undefined
                        : (() => {
                            const reason = explainNoFit(
                              r,
                              seatingFloor,
                              reservations.filter((o) => o.id !== r.id),
                            )
                            return t(reason.key, reason.params)
                          })()
                    }
                    onClick={() =>
                      suggestion && seat(r.id, suggestion.candidate.tableIds)
                    }
                  >
                    Seat
                  </button>
                </div>
              </li>
            )
          })}
        </Section>
      )}

      {!planning && (
      <Section title="Seated" count={seated.length} accentVar="--color-status-occupied">
        {seated.length === 0 && <Empty>Nobody seated yet.</Empty>}
        {seated.map((s) => {
          const r = resById.get(s.reservationId)
          const zone = zoneById.get(tableZone.get(s.tableIds[0]) ?? '')
          return (
            <li
              key={s.id}
              className="overflow-hidden rounded-xl border border-line bg-surface"
              style={{ borderLeft: '3px solid var(--color-status-occupied)' }}
            >
              <div className="p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {r?.guestName ?? 'Guest'}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatTime(s.seatedAt)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ZoneTag zone={zone} />
                  <span className="text-xs text-muted">
                    {r ? `${r.partySize}p · ` : ''}
                    <span className="text-ink">{labelOf(s.tableIds)}</span>
                  </span>
                </div>
                {(() => {
                  const next = nextBySeating.get(s.id)
                  if (!next) return null
                  const nextTables = next.assignedTableIds ?? []
                  const sameTables =
                    nextTables.length === s.tableIds.length &&
                    nextTables.every((id) => s.tableIds.includes(id))
                  return (
                    <div
                      className="mt-1.5 rounded-md bg-surface-2 px-2 py-1"
                      style={{ borderLeft: '2px solid var(--color-status-reserved)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Next · 2nd seating
                        </span>
                        <UrgencyChip
                          minutes={Math.round((Date.parse(next.dateTime) - now) / 60_000)}
                        />
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate text-ink">{next.guestName}</span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {next.partySize}p · {formatTime(next.dateTime)}
                        </span>
                      </div>
                      {!sameTables && nextTables.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-muted">
                          Tables {labelOf(nextTables)}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {arrangeBySeating.has(s.id) && (
                  <div className="mt-1.5 flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[10px] font-medium text-muted">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--color-status-cleaning)' }}
                    />
                    Merged — arrange the tables by hand
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <button className={clearBtn} onClick={() => clear(s.id)}>
                    Clear
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </Section>
      )}

      <FloorStorageBar />
    </aside>
  )
}

/** Color per urgency bucket — calm blue → amber → red as the arrival nears. */
const URGENCY_COLOR: Record<TableUrgency, string> = {
  soon: 'var(--color-status-reserved)',
  due: 'var(--color-status-cleaning)',
  imminent: 'var(--color-status-cleaning)',
  overdue: 'var(--color-status-occupied)',
}

/**
 * Time-to-arrival pill — hidden until a booking is ~30m out, then ramps in color
 * and weight (`soon`→`due`→`imminent`→`overdue`) so a busy rail still reads at a
 * glance which parties need attention. `overdue` means the slot passed unseated.
 */
function UrgencyChip({ minutes }: { minutes: number }) {
  const urgency = urgencyOf(minutes)
  if (!urgency) return null
  const color = URGENCY_COLOR[urgency]
  const label =
    minutes < 0 ? (minutes <= -1 ? `${-minutes}m late` : 'due') : minutes <= 0 ? 'now' : `${minutes}m`
  const strong = urgency === 'imminent' || urgency === 'overdue'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
      style={{
        color,
        backgroundColor: strong ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
        fontWeight: strong ? 600 : 500,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function ZoneTag({ zone }: { zone: Zone | undefined }) {
  if (!zone) return null
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: zone.color }}
      />
      {zone.name}
    </span>
  )
}

function Section({
  title,
  count,
  accentVar,
  children,
}: {
  title: string
  count: number
  /** CSS var for the header dot + count pill (marks the Seated section). */
  accentVar?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink">
          {accentVar && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(${accentVar})` }}
            />
          )}
          {title}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={
            accentVar
              ? { backgroundColor: `var(${accentVar})`, color: 'var(--color-surface)' }
              : { backgroundColor: 'var(--color-surface)', color: 'var(--color-muted)' }
          }
        >
          {count}
        </span>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-2">{children}</ul>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-1 py-6 text-center text-xs text-muted">{children}</li>
}
