import { useMemo } from 'react'
import {
  useFloorStore,
  useLayoutStore,
  useReservationStore,
  useSettingsStore,
  useUIStore,
} from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { explainNoFit, suggestSeating, type Suggestion } from '@/services/seating'
import { formatTime, isOnDay, todayKey } from '@/utils'
import type { Reservation, Zone } from '@/types'

/** Statuses that make a booking seatable from the floor (an upcoming party). */
const SEATABLE: Reservation['status'][] = ['pending', 'confirmed', 'arrived']

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
  const reservations = useReservationStore((s) => s.reservations)
  const tables = useLayoutStore((s) => s.tables)
  const zones = useLayoutStore((s) => s.zones)
  const seatings = useFloorStore((s) => s.seatings)
  const runtimeMerges = useFloorStore((s) => s.runtimeMerges)
  const seat = useFloorStore((s) => s.seat)
  const clear = useFloorStore((s) => s.clear)
  const focusedZoneId = useUIStore((s) => s.focusedZoneId)
  const waitlistEnabled = useSettingsStore((s) => s.waitlistEnabled)
  const seatingFloor = useSeatingFloor()

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones])
  const tableZone = useMemo(
    () => new Map(tables.map((t) => [t.id, t.zoneId])),
    [tables],
  )
  const labelOf = useMemo(() => {
    const map = new Map(tables.map((t) => [t.id, t.label]))
    return (ids: string[] = []) => ids.map((id) => map.get(id) ?? '?').join(' + ')
  }, [tables])

  const resById = useMemo(
    () => new Map(reservations.map((r) => [r.id, r])),
    [reservations],
  )

  const day = todayKey()
  const seatedIds = useMemo(
    () => new Set(seatings.map((s) => s.reservationId)),
    [seatings],
  )
  // Owned merges the host still needs to arrange by hand (no clear auto-placement).
  const arrangeBySeating = useMemo(
    () =>
      new Set(
        runtimeMerges.filter((m) => m.needsArrange && m.seatingId).map((m) => m.seatingId as string),
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

  const seated = useMemo(
    () =>
      focusedZoneId
        ? seatings.filter((s) => s.tableIds.some((id) => tableZone.get(id) === focusedZoneId))
        : seatings,
    [seatings, focusedZoneId, tableZone],
  )

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
            <li key={r.id} className="rounded-xl border border-line bg-surface p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {r.guestName}
                </span>
                <span className="shrink-0 text-xs text-muted">
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
                    'no table'
                  )}
                </span>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  className={seatBtn}
                  disabled={!canSeat}
                  title={canSeat ? undefined : 'Assign a table on the Reservations page first'}
                  onClick={() => seat(r.id, assigned)}
                >
                  Seat
                </button>
              </div>
            </li>
          )
        })}
      </Section>

      {waitlistEnabled && (
        <Section title="Waitlist" count={waitlist.length}>
          {waitlist.length === 0 && <Empty>Nobody waiting.</Empty>}
          {waitlist.map((r) => {
            const suggestion = waitlistSuggestion.get(r.id)
            return (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-2.5">
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
                      <span className="text-ink">{labelOf(suggestion.candidate.tableIds)}</span>
                    ) : (
                      'no table'
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
                        : explainNoFit(r, seatingFloor, reservations.filter((o) => o.id !== r.id))
                    }
                    onClick={() => suggestion && seat(r.id, suggestion.candidate.tableIds)}
                  >
                    Seat
                  </button>
                </div>
              </li>
            )
          })}
        </Section>
      )}

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
    </aside>
  )
}

function ZoneTag({ zone }: { zone: Zone | undefined }) {
  if (!zone) return null
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: zone.color }} />
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
