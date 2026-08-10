import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Text, Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import type { Weekday } from '@/types'
import { SettingRow } from './SettingRow'
import { TimeField } from './TimeField'
import { SettingsSection, SettingsDivider } from './SettingsSection'
import { WEEKDAYS, weekdayLabel } from './weekday'

/** Native date input, styled to the design system. Empty value = "". */
function DateField({
  value,
  onChange,
  id,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  'aria-label'?: string
}) {
  return (
    <input
      type="date"
      id={id}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm tabular-nums text-ink transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
    />
  )
}

/**
 * Booking restrictions editor (Phase 11 — Settings shell): a restaurant-wide
 * temporary-closure switch and a list of one-off blackout dates/windows. Writes
 * straight to the settings store (autosaved). Enforcement in the reservation flow
 * is a later wiring step.
 */
export function BookingRestrictionsEditor() {
  const { t } = useTranslation('settings')
  const locale = useSettingsStore((s) => s.locale)
  const { blocks, recurring, closure } = useSettingsStore((s) => s.bookingRestrictions)
  const setClosure = useSettingsStore((s) => s.setClosure)
  const addDateBlock = useSettingsStore((s) => s.addDateBlock)
  const removeDateBlock = useSettingsStore((s) => s.removeDateBlock)
  const addRecurringBlock = useSettingsStore((s) => s.addRecurringBlock)
  const removeRecurringBlock = useSettingsStore((s) => s.removeRecurringBlock)

  // Add-a-block draft.
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  // Add-a-recurring-block draft.
  const [days, setDays] = useState<Set<Weekday>>(new Set())
  const [rFrom, setRFrom] = useState('')
  const [rTo, setRTo] = useState('')
  const [rReason, setRReason] = useState('')

  const dayLabels = useMemo(
    () => WEEKDAYS.map((d) => weekdayLabel(d, locale)),
    [locale],
  )

  // Recurring rows sorted by weekday, then by start time.
  const sortedRecurring = useMemo(
    () =>
      [...recurring].sort(
        (a, b) => a.day - b.day || (a.from ?? '').localeCompare(b.from ?? ''),
      ),
    [recurring],
  )

  const toggleDay = (d: Weekday) =>
    setDays((prev) => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })

  // Fan the selected weekdays out into one entry each, sharing the window.
  const addRecurring = () => {
    if (days.size === 0) return
    for (const d of WEEKDAYS) {
      if (!days.has(d)) continue
      addRecurringBlock({
        day: d,
        from: rFrom || null,
        to: rTo || null,
        reason: rReason.trim() || undefined,
      })
    }
    setDays(new Set())
    setRFrom('')
    setRTo('')
    setRReason('')
  }

  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  )

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.date.localeCompare(b.date)),
    [blocks],
  )

  const add = () => {
    if (!date) return
    addDateBlock({
      date,
      from: from || null,
      to: to || null,
      reason: reason.trim() || undefined,
    })
    setDate('')
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <>
      <SettingsSection title={t('closure.title')} description={t('closure.description')}>
        <SettingRow label={t('closure.active.label')} help={t('closure.active.help')} htmlFor="set-closure">
          <Toggle
            id="set-closure"
            checked={closure.active}
            onChange={(v) => setClosure({ active: v })}
            aria-label={t('closure.active.label')}
          />
        </SettingRow>
        {closure.active && (
          <>
            <SettingsDivider />
            <SettingRow label={t('closure.until.label')} help={t('closure.until.help')} htmlFor="set-closure-until">
              <DateField
                id="set-closure-until"
                value={closure.until ?? ''}
                onChange={(v) => setClosure({ until: v || null })}
                aria-label={t('closure.until.label')}
              />
            </SettingRow>
            <SettingsDivider />
            <SettingRow label={t('closure.reason.label')} htmlFor="set-closure-reason">
              <Input
                id="set-closure-reason"
                className="w-64"
                value={closure.reason ?? ''}
                onChange={(e) => setClosure({ reason: e.target.value || undefined })}
                placeholder={t('closure.reason.placeholder')}
              />
            </SettingRow>
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t('blocks.title')} description={t('blocks.description')}>
        {/* Add a block */}
        <div className="flex flex-wrap items-end gap-3 pb-1">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('blocks.date')}
            <DateField value={date} onChange={setDate} aria-label={t('blocks.date')} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('blocks.from')}
            <TimeField value={from} onChange={setFrom} aria-label={t('blocks.from')} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('blocks.to')}
            <TimeField value={to} onChange={setTo} aria-label={t('blocks.to')} />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[13px] text-muted">
            {t('blocks.reason')}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('blocks.reasonPlaceholder')}
            />
          </label>
          <Button variant="secondary" onClick={add} disabled={!date}>
            {t('blocks.add')}
          </Button>
        </div>

        {sortedBlocks.length > 0 && <SettingsDivider />}

        {sortedBlocks.length === 0 ? (
          <Text muted className="pt-2 text-[13px]">
            {t('blocks.empty')}
          </Text>
        ) : (
          <div className="flex flex-col">
            {sortedBlocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {fmtDate.format(new Date(`${b.date}T12:00:00`))}
                    <span className="ms-2 text-muted">
                      {b.from && b.to ? `${b.from}–${b.to}` : t('blocks.allDay')}
                    </span>
                  </p>
                  {b.reason && <p className="truncate text-[13px] text-muted">{b.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeDateBlock(b.id)}
                  className="shrink-0 text-[13px] text-muted transition-colors hover:text-status-occupied"
                >
                  {t('blocks.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('recurring.title')} description={t('recurring.description')}>
        {/* Add a recurring block */}
        <div className="flex flex-wrap items-end gap-3 pb-1">
          <div className="flex flex-col gap-1 text-[13px] text-muted">
            {t('recurring.days')}
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d, i) => {
                const on = days.has(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d)}
                    className={
                      on
                        ? 'h-9 rounded-lg border border-ink bg-ink px-3 text-sm text-surface transition-colors'
                        : 'h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-ink/30'
                    }
                  >
                    {dayLabels[i].slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('recurring.from')}
            <TimeField value={rFrom} onChange={setRFrom} aria-label={t('recurring.from')} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            {t('recurring.to')}
            <TimeField value={rTo} onChange={setRTo} aria-label={t('recurring.to')} />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[13px] text-muted">
            {t('recurring.reason')}
            <Input
              value={rReason}
              onChange={(e) => setRReason(e.target.value)}
              placeholder={t('recurring.reasonPlaceholder')}
            />
          </label>
          <Button variant="secondary" onClick={addRecurring} disabled={days.size === 0}>
            {t('recurring.add')}
          </Button>
        </div>

        {sortedRecurring.length > 0 && <SettingsDivider />}

        {sortedRecurring.length === 0 ? (
          <Text muted className="pt-2 text-[13px]">
            {t('recurring.empty')}
          </Text>
        ) : (
          <div className="flex flex-col">
            {sortedRecurring.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {dayLabels[r.day]}
                    <span className="ms-2 text-muted">
                      {r.from && r.to ? `${r.from}–${r.to}` : t('recurring.allDay')}
                    </span>
                  </p>
                  {r.reason && <p className="truncate text-[13px] text-muted">{r.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeRecurringBlock(r.id)}
                  className="shrink-0 text-[13px] text-muted transition-colors hover:text-status-occupied"
                >
                  {t('recurring.remove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </>
  )
}
