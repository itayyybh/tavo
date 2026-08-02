import { useMemo, useState } from 'react'
import { Button, Input, Select } from '@/components/ui'
import { useLayoutStore, useReservationStore, useSettingsStore } from '@/stores'
import {
  combineDateTime,
  findDuplicate,
  formatDate,
  formatTime,
  isValidDraft,
  isValidDateTime,
  splitDateTime,
  toDateKey,
  todayKey,
  validateReservation,
  zoneNextFreeTime,
  zoneRemainingSeats,
  zoneSeatCapacity,
  type ReservationErrors,
} from '@/utils'
import type {
  Reservation,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { zoneHasFit } from '@/services/seating'
import { cn } from '@/utils'
import {
  DEFAULT_PARTY_SIZE,
  durationOptions,
  occasionOptions,
  sourceOptions,
} from './constants'

interface FormState {
  guestName: string
  phone: string
  email: string
  partySize: number
  date: string
  time: string
  estimatedDuration: number
  preferredZoneId: string
  preferredTableId: string
  occasion: string
  source: ReservationSource
  status: ReservationStatus
  notes: string
  prefs: ReservationPreferences
}

const PREF_TOGGLES: { key: keyof ReservationPreferences; label: string }[] = [
  { key: 'vip', label: 'VIP' },
  { key: 'wheelchair', label: 'Wheelchair' },
  { key: 'highChair', label: 'High Chair' },
  { key: 'windowSeat', label: 'Window Seat' },
  { key: 'smoking', label: 'Smoking' },
]

function buildInitialState(initial: Reservation | undefined, defaultDuration: number): FormState {
  if (initial) {
    const { date, time } = splitDateTime(initial.dateTime)
    return {
      guestName: initial.guestName,
      phone: initial.phone ?? '',
      email: initial.email ?? '',
      partySize: initial.partySize,
      date,
      time,
      estimatedDuration: initial.estimatedDuration,
      preferredZoneId: initial.preferredZoneId ?? '',
      preferredTableId: initial.preferredTableId ?? '',
      occasion: initial.occasion ?? '',
      source: initial.source,
      status: initial.status,
      notes: initial.notes ?? '',
      prefs: { ...initial.preferences },
    }
  }
  return {
    guestName: '',
    phone: '',
    email: '',
    partySize: DEFAULT_PARTY_SIZE,
    date: todayKey(),
    time: '19:00',
    estimatedDuration: defaultDuration,
    preferredZoneId: '',
    preferredTableId: '',
    occasion: '',
    source: 'manual',
    status: 'confirmed',
    notes: '',
    prefs: {},
  }
}

interface ReservationFormProps {
  /** Present when editing an existing reservation. */
  initial?: Reservation
  onSubmit: (input: NewReservation) => void
  onCancel: () => void
}

/** Fast create/edit form. Required fields first; everything else is optional. */
export function ReservationForm({ initial, onSubmit, onCancel }: ReservationFormProps) {
  const zones = useLayoutStore((s) => s.zones)
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const reservations = useReservationStore((s) => s.reservations)
  const defaultStay = useSettingsStore((s) => s.defaultStayMinutes)
  const maxStay = useSettingsStore((s) => s.maxStayMinutes)
  const bufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  // Read-only floor snapshot for the physical-fit gate (can a real table/merge
  // ever seat this party in the zone, ignoring current occupancy).
  const seatingFloor = useSeatingFloor()
  const [form, setForm] = useState<FormState>(() => buildInitialState(initial, defaultStay))
  // Rule: a booking may not exceed the restaurant's max stay time.
  const durations = durationOptions.filter((o) => Number(o.value) <= maxStay)
  const [errors, setErrors] = useState<ReservationErrors>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const togglePref = (key: keyof ReservationPreferences) =>
    setForm((f) => ({ ...f, prefs: { ...f.prefs, [key]: !f.prefs[key] } }))

  // Zone options show total seating so the host sees each zone's size.
  const zoneOptions = useMemo(
    () =>
      zones.map((z) => ({
        value: z.id,
        label: `${z.name} (${zoneSeatCapacity(z.id, tables, tableTypes)} seats)`,
      })),
    [zones, tables, tableTypes],
  )

  const dateTime = combineDateTime(form.date, form.time)

  // Soft, non-blocking duplicate warning.
  const duplicate = useMemo(() => {
    if (!form.guestName.trim() || !dateTime) return undefined
    return findDuplicate(
      reservations,
      { guestName: form.guestName, partySize: form.partySize, dateTime },
      initial?.id,
    )
  }, [reservations, form.guestName, form.partySize, dateTime, initial?.id])

  const submit = () => {
    const draft = {
      guestName: form.guestName,
      phone: form.phone,
      email: form.email,
      partySize: form.partySize,
      dateTime,
      estimatedDuration: form.estimatedDuration,
      preferredZoneId: form.preferredZoneId,
      source: form.source,
      notes: form.notes,
    }
    const found = validateReservation(draft)

    // Zone capacity gate: a guest is seated only in their chosen zone, so the
    // zone must have enough seats free during the booking's window (time-aware,
    // so a zone serves different parties across the service). No overflow to
    // another zone — if it doesn't fit, the host must pick a different zone.
    if (!found.preferredZoneId && form.preferredZoneId && isValidDateTime(dateTime)) {
      const zoneName = zones.find((z) => z.id === form.preferredZoneId)?.name ?? 'Zone'
      // Physical-fit gate first: aggregate seats can say a zone "has room" while
      // no real table or merge can seat the party (e.g. 8 guests, only 2-tops).
      // A permanent constraint — no later time helps — so block outright.
      const draftForFit = {
        id: initial?.id ?? '__draft__',
        partySize: form.partySize,
        dateTime,
        estimatedDuration: form.estimatedDuration,
        preferredZoneId: form.preferredZoneId,
        preferredTableId: form.preferredTableId.trim() || undefined,
        status: 'confirmed',
      } as Reservation
      const physicallyFits = zoneHasFit(draftForFit, seatingFloor)

      const gateParams = {
        zoneId: form.preferredZoneId,
        startISO: dateTime,
        durationMin: form.estimatedDuration,
        tables,
        tableTypes,
        reservations,
        bufferMin,
        excludeId: initial?.id,
      }
      const remaining = zoneRemainingSeats(gateParams)
      if (!physicallyFits) {
        found.preferredZoneId = `No table or merge in ${zoneName} can seat a party of ${form.partySize} — choose another zone.`
      } else if (remaining < form.partySize) {
        const capacity = zoneSeatCapacity(form.preferredZoneId, tables, tableTypes)
        const shortfall =
          remaining <= 0
            ? `${zoneName} is full at that time.`
            : `${zoneName} has ${remaining} seat${remaining === 1 ? '' : 's'} free then, need ${form.partySize}.`
        if (form.partySize > capacity) {
          // No time can ever hold this party — the zone is simply too small.
          found.preferredZoneId = `${zoneName} seats at most ${capacity} — a party of ${form.partySize} won't fit here. Choose another zone.`
        } else {
          // Suggest the next start time a table frees up (a booking ends + buffer).
          const nextFree = zoneNextFreeTime(gateParams, form.partySize)
          if (nextFree) {
            const sameDay = toDateKey(new Date(nextFree)) === toDateKey(new Date(dateTime))
            const when = sameDay
              ? formatTime(nextFree)
              : `${formatDate(nextFree)}, ${formatTime(nextFree)}`
            found.preferredZoneId = `${shortfall} Next opening for ${form.partySize}: ${when}.`
          } else {
            found.preferredZoneId = `${shortfall} No later opening today — choose another zone.`
          }
        }
      }
    }

    setErrors(found)
    if (!isValidDraft(found)) return

    // Drop empty optional fields so we don't store noise.
    const prefs = Object.fromEntries(
      Object.entries(form.prefs).filter(([, v]) => v),
    ) as ReservationPreferences
    const payload: NewReservation = {
      guestName: form.guestName.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      partySize: form.partySize,
      dateTime,
      estimatedDuration: form.estimatedDuration,
      preferredZoneId: form.preferredZoneId || undefined,
      preferredTableId: form.preferredTableId.trim() || undefined,
      occasion: (form.occasion as ReservationOccasion) || undefined,
      status: form.status,
      source: form.source,
      preferences: Object.keys(prefs).length ? prefs : undefined,
      notes: form.notes.trim() || undefined,
    }
    onSubmit(payload)
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {/* Required — the fast path. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Input
            label="Guest name"
            value={form.guestName}
            onChange={(e) => set('guestName', e.target.value)}
            error={errors.guestName}
            placeholder="e.g. Dana Levi"
            autoFocus
          />
        </div>
        <Input
          label="Party size"
          type="number"
          min={1}
          value={form.partySize}
          onChange={(e) => set('partySize', Number(e.target.value))}
          error={errors.partySize}
        />
        <Select
          label="Duration"
          options={durations}
          value={String(form.estimatedDuration)}
          onChange={(e) => set('estimatedDuration', Number(e.target.value))}
          error={errors.estimatedDuration}
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
          error={errors.dateTime}
        />
        <Input
          label="Arrival time"
          type="time"
          value={form.time}
          onChange={(e) => set('time', e.target.value)}
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
        />
        <Select
          label="Zone"
          options={zoneOptions}
          placeholder="Select zone"
          value={form.preferredZoneId}
          onChange={(e) => set('preferredZoneId', e.target.value)}
          error={errors.preferredZoneId}
        />
      </div>

      {duplicate && (
        <div className="rounded-xl border border-reservation-pending/40 bg-reservation-pending/5 px-3 py-2 text-xs text-ink-soft">
          Possible duplicate — {duplicate.guestName}, party of {duplicate.partySize}{' '}
          at {formatTime(duplicate.dateTime)}. You can still save.
        </div>
      )}

      {/* Optional details. */}
      <div className="border-t border-line pt-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
            placeholder="Optional"
          />
          <Select
            label="Occasion"
            options={occasionOptions}
            placeholder="None"
            value={form.occasion}
            onChange={(e) => set('occasion', e.target.value)}
          />
          <Select
            label="Source"
            options={sourceOptions}
            value={form.source}
            onChange={(e) => set('source', e.target.value as ReservationSource)}
          />
          <Input
            label="Notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Optional"
          />
        </div>

        {/* Preferences as compact toggle chips — kept simple. */}
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">Preferences</span>
          <div className="flex flex-wrap gap-2">
            {PREF_TOGGLES.map(({ key, label }) => {
              const active = !!form.prefs[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => togglePref(key)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200',
                    active
                      ? 'border-ink bg-ink text-surface'
                      : 'border-line bg-surface text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <Input
            value={form.prefs.allergies ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prefs: { ...f.prefs, allergies: e.target.value },
              }))
            }
            placeholder="Allergies (optional)"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{initial ? 'Save changes' : 'Create reservation'}</Button>
      </div>
    </form>
  )
}
