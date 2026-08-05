import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Heading, Input, Text } from '@/components/ui'
import {
  useLayoutStore,
  useReservationStore,
  useSessionStore,
  useSettingsStore,
} from '@/stores'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { checkAvailabilitySmart } from '@/services/availabilityClient'
import { insertReservation } from '@/services/supabase/reservationsRepo'
import { createId } from '@/utils'
import type { Reservation, ReservationPreferences } from '@/types'
import {
  durationLabel,
  durationOptions,
  nextHourTime,
  todayLocalDate,
  toISODateTime,
} from './mobileHelpers'

type Phase = 'form' | 'created'
type Availability = 'idle' | 'checking' | 'available' | 'unavailable'

/**
 * Mobile reservation creation (Phase 9) — the phone's single purpose. One fast,
 * one-handed screen: guest, party, time, area, then check availability and
 * create. Deliberately NOT the desktop app (no editor / floor / management).
 */
export function MobileReservationPage() {
  const { t } = useTranslation('reservations')
  const zones = useLayoutStore((s) => s.zones)
  const defaultStay = useSettingsStore((s) => s.defaultStayMinutes)
  const floor = useSeatingFloor()
  const others = useReservationStore((s) => s.reservations)
  const upsertLocal = useReservationStore((s) => s.upsertLocal)
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const restaurantName = useSessionStore((s) => s.restaurantName)
  const signOut = useSessionStore((s) => s.signOut)

  const durations = useMemo(() => durationOptions(defaultStay), [defaultStay])
  const zoneRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState(2)
  const [date, setDate] = useState(todayLocalDate())
  const [time, setTime] = useState(nextHourTime())
  const [duration, setDuration] = useState(defaultStay)
  const [zoneId, setZoneId] = useState('')
  const [prefs, setPrefs] = useState<ReservationPreferences>({})
  const [notes, setNotes] = useState('')

  const [availability, setAvailability] = useState<Availability>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Reservation | null>(null)

  // Any field edit invalidates a prior availability result — re-check required.
  const invalidate = () => {
    if (availability !== 'idle') {
      setAvailability('idle')
      setMessage(null)
    }
  }

  const togglePref = (key: 'vip' | 'highChair' | 'wheelchair' | 'smoking') => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
    invalidate()
  }
  const hasPrefs = Object.values(prefs).some(Boolean)

  const canCheck =
    guestName.trim() !== '' && partySize >= 1 && !!zoneId && !!date && !!time

  const runCheck = async () => {
    if (!canCheck) return
    setError(null)
    setAvailability('checking')
    try {
      const result = await checkAvailabilitySmart(
        {
          partySize,
          dateTime: toISODateTime(date, time),
          estimatedDuration: duration,
          zoneId,
          preferences: hasPrefs ? prefs : undefined,
        },
        floor,
        others,
      )
      if (result.available) {
        setAvailability('available')
        setMessage(null)
      } else {
        setAvailability('unavailable')
        setMessage(result.reason ? t(result.reason.key, result.reason.params) : null)
      }
    } catch {
      setAvailability('idle')
      setError('Could not check availability. Try again.')
    }
  }

  const create = async () => {
    if (!restaurantId || availability !== 'available') return
    setCreating(true)
    setError(null)
    const stamp = new Date().toISOString()
    const reservation: Reservation = {
      id: createId(),
      guestName: guestName.trim(),
      phone: phone.trim() || undefined,
      partySize,
      dateTime: toISODateTime(date, time),
      estimatedDuration: duration,
      preferredZoneId: zoneId,
      status: 'confirmed',
      source: 'phone',
      preferences: hasPrefs ? prefs : undefined,
      notes: notes.trim() || undefined,
      createdAt: stamp,
      updatedAt: stamp,
    }
    try {
      const saved = await insertReservation(restaurantId, reservation)
      upsertLocal(saved) // reflect immediately; realtime will also echo it
      setCreated(saved)
      setPhase('created')
    } catch {
      setError('Could not create the reservation. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const reset = () => {
    setPhase('form')
    setCreated(null)
    setGuestName('')
    setPhone('')
    setPartySize(2)
    setDate(todayLocalDate())
    setTime(nextHourTime())
    setDuration(defaultStay)
    setZoneId('')
    setPrefs({})
    setNotes('')
    setAvailability('idle')
    setMessage(null)
    setError(null)
  }

  const zoneName = zones.find((z) => z.id === zoneId)?.name ?? ''

  if (phase === 'created' && created) {
    return (
      <MobileShell subtitle={restaurantName} onSignOut={signOut}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-available/15 text-3xl">
            ✓
          </div>
          <div>
            <Heading className="text-xl">Reservation created</Heading>
            <Text className="mt-2 text-base font-medium text-ink">
              {created.guestName}
            </Text>
            <Text className="mt-0.5 text-muted">
              {created.partySize} guests · {zoneName}
            </Text>
            <Text className="mt-0.5 text-muted">
              {new Date(created.dateTime).toLocaleString([], {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {durationLabel(created.estimatedDuration)}
            </Text>
            {created.phone && <Text className="mt-0.5 text-muted">{created.phone}</Text>}
            {created.preferences && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {created.preferences.vip && <PrefBadge>VIP</PrefBadge>}
                {created.preferences.highChair && <PrefBadge>High chair</PrefBadge>}
                {created.preferences.wheelchair && <PrefBadge>Wheelchair</PrefBadge>}
                {created.preferences.smoking && <PrefBadge>Smoking</PrefBadge>}
              </div>
            )}
          </div>
          <Button className="w-full max-w-xs" onClick={reset}>
            New reservation
          </Button>
        </div>
      </MobileShell>
    )
  }

  return (
    <MobileShell subtitle={restaurantName} onSignOut={signOut}>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* Guest */}
        <section className="space-y-3">
          <Input
            label="Guest name"
            value={guestName}
            onChange={(e) => {
              setGuestName(e.target.value)
              invalidate()
            }}
            placeholder="John Smith"
            className="h-12"
          />
          <Input
            label="Phone (optional)"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="h-12"
          />
        </section>

        {/* Party size */}
        <section>
          <FieldLabel>Party size</FieldLabel>
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-2">
            <StepBtn
              label="−"
              onClick={() => {
                setPartySize((n) => Math.max(1, n - 1))
                invalidate()
              }}
            />
            <span className="text-2xl font-semibold text-ink tabular-nums">
              {partySize}
            </span>
            <StepBtn
              label="+"
              onClick={() => {
                setPartySize((n) => Math.min(50, n + 1))
                invalidate()
              }}
            />
          </div>
        </section>

        {/* Date + time — stacked full-width; native iOS pickers overflow when paired. */}
        <section ref={timeRef} className="space-y-3">
          <div>
            <FieldLabel>Date</FieldLabel>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                invalidate()
              }}
              className="h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink"
            />
          </div>
          <div>
            <FieldLabel>Time</FieldLabel>
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                invalidate()
              }}
              className="h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink"
            />
          </div>
        </section>

        {/* Duration */}
        <section>
          <FieldLabel>Duration</FieldLabel>
          <ChipRow>
            {durations.map((d) => (
              <Chip
                key={d}
                active={duration === d}
                onClick={() => {
                  setDuration(d)
                  invalidate()
                }}
              >
                {durationLabel(d)}
              </Chip>
            ))}
          </ChipRow>
        </section>

        {/* Zone */}
        <section ref={zoneRef}>
          <FieldLabel>Area</FieldLabel>
          {zones.length === 0 ? (
            <Text className="text-sm text-muted">
              No areas defined yet. Add zones in the desktop editor first.
            </Text>
          ) : (
            <ChipRow>
              {zones.map((z) => (
                <Chip
                  key={z.id}
                  active={zoneId === z.id}
                  onClick={() => {
                    setZoneId(z.id)
                    invalidate()
                  }}
                >
                  {z.name}
                </Chip>
              ))}
            </ChipRow>
          )}
        </section>

        {/* Preferences */}
        <section>
          <FieldLabel>Preferences (optional)</FieldLabel>
          <ChipRow>
            <Chip active={!!prefs.vip} onClick={() => togglePref('vip')}>
              VIP
            </Chip>
            <Chip active={!!prefs.highChair} onClick={() => togglePref('highChair')}>
              High chair
            </Chip>
            <Chip active={!!prefs.wheelchair} onClick={() => togglePref('wheelchair')}>
              Wheelchair
            </Chip>
            <Chip active={!!prefs.smoking} onClick={() => togglePref('smoking')}>
              Smoking
            </Chip>
          </ChipRow>
        </section>

        {/* Notes */}
        <section>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Allergies, occasion, seating requests…"
            rows={2}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted"
          />
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="space-y-3 border-t border-line bg-surface px-5 py-4">
        {availability === 'available' && (
          <div className="rounded-xl bg-status-available/15 px-4 py-2.5 text-sm font-medium text-ink">
            Table available in {zoneName} ✓
          </div>
        )}
        {availability === 'unavailable' && (
          <div className="space-y-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <Text className="text-sm font-medium text-ink">
              No availability in {zoneName} for this time.
            </Text>
            {message && <Text className="text-xs text-muted">{message}</Text>}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setAvailability('idle')
                  zoneRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Try another area
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setAvailability('idle')
                  timeRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Try another time
              </Button>
            </div>
          </div>
        )}
        {error && <Text className="text-sm text-status-occupied">{error}</Text>}

        {availability === 'available' ? (
          <Button className="h-12 w-full text-base" disabled={creating} onClick={create}>
            {creating ? 'Creating…' : 'Create reservation'}
          </Button>
        ) : (
          <Button
            className="h-12 w-full text-base"
            disabled={!canCheck || availability === 'checking'}
            onClick={runCheck}
          >
            {availability === 'checking' ? 'Checking…' : 'Check availability'}
          </Button>
        )}
      </div>
    </MobileShell>
  )
}

// --- Local presentational helpers (mobile-only, kept beside their one use) ---

function MobileShell({
  children,
  subtitle,
  onSignOut,
}: {
  children: React.ReactNode
  subtitle?: string | null
  onSignOut: () => void
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-x-hidden bg-surface-2">
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="min-w-0">
          {subtitle && (
            <div className="truncate text-xs font-medium text-muted">{subtitle}</div>
          )}
          <Heading className="text-base">New reservation</Heading>
        </div>
        <button
          onClick={onSignOut}
          className="shrink-0 text-sm text-muted transition-colors hover:text-ink"
        >
          Sign out
        </button>
      </header>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-sm font-medium text-ink">{children}</div>
}

function PrefBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink">
      {children}
    </span>
  )
}

function StepBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-xl text-ink transition-colors hover:bg-surface-2 active:bg-surface-2"
    >
      {label}
    </button>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-10 rounded-full px-4 text-sm font-medium transition-colors',
        active
          ? 'bg-ink text-surface'
          : 'border border-line bg-surface text-ink hover:bg-surface-2',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
