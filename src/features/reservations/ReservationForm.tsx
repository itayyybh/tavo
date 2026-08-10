import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  ParsedRequest,
  Reservation,
  ReservationOccasion,
  ReservationPreferences,
  ReservationSource,
  ReservationStatus,
} from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { useSeatingFloor } from '@/hooks/useSeatingFloor'
import { zoneHasFit } from '@/services/seating'
import { parseNotes } from '@/services/requests/parseNotes'
import { evaluateBookingRules } from '@/services/settings/bookingRules'
import { cn } from '@/utils'
import { DEFAULT_PARTY_SIZE } from './constants'
import { useReservationLabels } from './hooks/useReservationLabels'

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
  /** Soft requests parsed from `notes` (AI) — previewed as chips, saved on submit. */
  parsedRequest?: ParsedRequest
}

/** Preference toggles shown as chips; labels resolve from `pref.<key>`. */
const PREF_KEYS: (keyof ReservationPreferences)[] = [
  'vip',
  'wheelchair',
  'highChair',
  'windowSeat',
  'smoking',
]

function buildInitialState(
  initial: Reservation | undefined,
  defaultDuration: number,
): FormState {
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
      parsedRequest: initial.parsedRequest,
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
  const { t } = useTranslation('reservations')
  const { durationOptions, occasionOptions, sourceOptions } = useReservationLabels()
  const zones = useLayoutStore((s) => s.zones)
  const allTables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  // Stored (inventory) tables don't count toward zone capacity — off the floor.
  const tables = useMemo(() => allTables.filter((t) => !t.stored), [allTables])
  const reservations = useReservationStore((s) => s.reservations)
  const defaultStay = useSettingsStore((s) => s.defaultStayMinutes)
  const maxStay = useSettingsStore((s) => s.maxStayMinutes)
  const bufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  // Configured booking rules (opening hours, reservation/party window, blackout
  // dates, closure) — enforced at save time below.
  const openingHours = useSettingsStore((s) => s.openingHours)
  const reservationRules = useSettingsStore((s) => s.reservationRules)
  const bookingRestrictions = useSettingsStore((s) => s.bookingRestrictions)
  // Read-only floor snapshot for the physical-fit gate (can a real table/merge
  // ever seat this party in the zone, ignoring current occupancy).
  const seatingFloor = useSeatingFloor()
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(initial, defaultStay),
  )
  // Rule: a booking may not exceed the restaurant's max stay time.
  const durations = durationOptions.filter((o) => Number(o.value) <= maxStay)
  const [errors, setErrors] = useState<ReservationErrors>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const togglePref = (key: keyof ReservationPreferences) =>
    setForm((f) => ({ ...f, prefs: { ...f.prefs, [key]: !f.prefs[key] } }))

  // AI notes parser: detect SOFT seating requests (specific tables, shape) from
  // the free-text notes. Runs on blur so the host sees what was detected before
  // saving; the result rides along on submit and feeds the seating scorer (a
  // ranking boost, never a gate).
  const [parsing, setParsing] = useState(false)
  // Notes already parsed — skip a redundant call when blur fires without an edit.
  const lastParsed = useRef(initial?.notes?.trim() ?? '')
  const runParse = async () => {
    const text = form.notes.trim()
    if (!text) {
      set('parsedRequest', undefined)
      lastParsed.current = ''
      return
    }
    if (text === lastParsed.current) return
    lastParsed.current = text
    setParsing(true)
    try {
      const result = await parseNotes(text)
      setForm((f) => ({ ...f, parsedRequest: result ?? undefined }))
    } finally {
      setParsing(false)
    }
  }

  // Zone options show total seating so the host sees each zone's size.
  const zoneOptions = useMemo(
    () =>
      zones.map((z) => ({
        value: z.id,
        label: t('form.zoneOption', {
          name: z.name,
          count: zoneSeatCapacity(z.id, tables, tableTypes),
        }),
      })),
    [zones, tables, tableTypes, t],
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

  const submit = async () => {
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

    // Configured booking-rule gate (Phase 11): closure, blackout dates, opening
    // hours, reservation/party window, zone availability. First violation per
    // field wins so the base field checks above take precedence.
    if (isValidDateTime(dateTime)) {
      const violations = evaluateBookingRules({
        partySize: form.partySize,
        dateTime,
        preferredZoneId: form.preferredZoneId || undefined,
        openingHours,
        rules: reservationRules,
        restrictions: bookingRestrictions,
        zones,
        now: new Date(),
        isNew: !initial,
        vip: !!form.prefs.vip,
      })
      for (const v of violations) {
        if (!found[v.field]) found[v.field] = t(`rules.${v.code}`, v.params)
      }
    }

    // Zone capacity gate: a guest is seated only in their chosen zone, so the
    // zone must have enough seats free during the booking's window (time-aware,
    // so a zone serves different parties across the service). No overflow to
    // another zone — if it doesn't fit, the host must pick a different zone.
    if (!found.preferredZoneId && form.preferredZoneId && isValidDateTime(dateTime)) {
      const zoneName =
        zones.find((z) => z.id === form.preferredZoneId)?.name ?? t('form.zone')
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
        found.preferredZoneId = t('form.zoneNoFit', {
          zone: zoneName,
          party: form.partySize,
        })
      } else if (remaining < form.partySize) {
        const capacity = zoneSeatCapacity(form.preferredZoneId, tables, tableTypes)
        const shortfall =
          remaining <= 0
            ? t('form.zoneFullAtTime', { zone: zoneName })
            : t('form.zoneShortfall', {
                zone: zoneName,
                count: remaining,
                party: form.partySize,
              })
        if (form.partySize > capacity) {
          // No time can ever hold this party — the zone is simply too small.
          found.preferredZoneId = t('form.zoneTooSmall', {
            zone: zoneName,
            capacity,
            party: form.partySize,
          })
        } else {
          // Suggest the next start time a table frees up (a booking ends + buffer).
          const nextFree = zoneNextFreeTime(gateParams, form.partySize)
          if (nextFree) {
            const sameDay =
              toDateKey(new Date(nextFree)) === toDateKey(new Date(dateTime))
            const when = sameDay
              ? formatTime(nextFree)
              : `${formatDate(nextFree)}, ${formatTime(nextFree)}`
            found.preferredZoneId = t('form.zoneNextOpening', {
              shortfall,
              party: form.partySize,
              when,
            })
          } else {
            found.preferredZoneId = t('form.zoneNoLaterOpening', { shortfall })
          }
        }
      }
    }

    setErrors(found)
    if (!isValidDraft(found)) return

    // Ensure the notes are parsed before saving — covers a fast save where the
    // on-blur parse hasn't returned yet (or never fired). Only re-parses when the
    // notes changed since the last parse, so a normal save adds no latency.
    const notesText = form.notes.trim()
    let parsedRequest = form.parsedRequest
    if (notesText) {
      // Re-parse when the notes changed, or when they've never been parsed
      // (legacy rows saved before parsing existed / before it was working).
      if (notesText !== lastParsed.current || !parsedRequest) {
        lastParsed.current = notesText
        parsedRequest = (await parseNotes(notesText)) ?? undefined
        setForm((f) => ({ ...f, parsedRequest }))
      }
    } else {
      parsedRequest = undefined
    }

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
      notes: notesText || undefined,
      // Only keep parsed requests while there are notes to have parsed them from.
      parsedRequest: notesText ? parsedRequest : undefined,
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
            label={t('form.guestName')}
            value={form.guestName}
            onChange={(e) => set('guestName', e.target.value)}
            error={errors.guestName}
            placeholder={t('form.guestNamePlaceholder')}
            autoFocus
          />
        </div>
        <Input
          label={t('form.partySize')}
          type="number"
          min={1}
          value={form.partySize}
          onChange={(e) => set('partySize', Number(e.target.value))}
          error={errors.partySize}
        />
        <Select
          label={t('form.duration')}
          options={durations}
          value={String(form.estimatedDuration)}
          onChange={(e) => set('estimatedDuration', Number(e.target.value))}
          error={errors.estimatedDuration}
        />
        <Input
          label={t('form.date')}
          type="date"
          // Date/time/phone/email are LTR data; keep them LTR so digits and
          // segments don't reverse when the form mirrors to RTL.
          dir="ltr"
          className="text-end"
          value={form.date}
          onChange={(e) => set('date', e.target.value)}
          error={errors.dateTime}
        />
        <Input
          label={t('form.arrivalTime')}
          type="time"
          dir="ltr"
          className="text-end"
          value={form.time}
          onChange={(e) => set('time', e.target.value)}
        />
        <Input
          label={t('form.phone')}
          dir="ltr"
          className="text-end"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          error={errors.phone}
        />
        <Select
          label={t('form.zone')}
          options={zoneOptions}
          placeholder={t('form.selectZone')}
          value={form.preferredZoneId}
          onChange={(e) => set('preferredZoneId', e.target.value)}
          error={errors.preferredZoneId}
        />
      </div>

      {duplicate && (
        <div className="rounded-xl border border-reservation-pending/40 bg-reservation-pending/5 px-3 py-2 text-xs text-ink-soft">
          {t('form.duplicate', {
            name: duplicate.guestName,
            size: duplicate.partySize,
            time: formatTime(duplicate.dateTime),
          })}
        </div>
      )}

      {/* Optional details. */}
      <div className="border-t border-line pt-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('form.email')}
            type="email"
            dir="ltr"
            className="text-end"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
            placeholder={t('form.optional')}
          />
          <Select
            label={t('form.occasion')}
            options={occasionOptions}
            placeholder={t('form.none')}
            value={form.occasion}
            onChange={(e) => set('occasion', e.target.value)}
          />
          <Select
            label={t('form.source')}
            options={sourceOptions}
            value={form.source}
            onChange={(e) => set('source', e.target.value as ReservationSource)}
          />
          <Input
            label={t('form.notes')}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            onBlur={runParse}
            placeholder={t('form.notesRequestPlaceholder')}
          />
        </div>

        {/* Preferences as compact toggle chips — kept simple. */}
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">{t('form.preferences')}</span>
          <div className="flex flex-wrap gap-2">
            {PREF_KEYS.map((key) => {
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
                  {t(`pref.${key}`)}
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
            placeholder={t('form.allergiesPlaceholder')}
          />
        </div>

        {/* Detected soft requests, parsed from the notes by AI. Advisory: the
            seating engine offers a matching table first but never forces it. */}
        {(parsing || form.parsedRequest) && (
          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              {t('form.detectedRequests')}
            </span>
            <span className="text-xs text-muted">{t('form.detectedHint')}</span>
            {parsing ? (
              <span className="mt-1 text-xs text-muted">{t('form.detecting')}</span>
            ) : (
              form.parsedRequest && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {form.parsedRequest.tableLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-ink bg-ink/5 px-3 py-1 text-xs font-medium text-ink"
                    >
                      {t('form.reqTable', { label })}
                    </span>
                  ))}
                  {form.parsedRequest.shape && (
                    <span className="rounded-full border border-ink bg-ink/5 px-3 py-1 text-xs font-medium text-ink">
                      {t('form.reqShape', {
                        shape: t(`shape.${form.parsedRequest.shape}`),
                      })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => set('parsedRequest', undefined)}
                    className="text-xs text-muted transition-colors hover:text-ink"
                  >
                    {t('form.clearRequests')}
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('form.cancel')}
        </Button>
        <Button type="submit">
          {initial ? t('form.saveChanges') : t('form.create')}
        </Button>
      </div>
    </form>
  )
}
