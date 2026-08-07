import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Text, Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { SettingRow } from './SettingRow'
import { TimeField } from './TimeField'
import { SettingsSection, SettingsDivider } from './SettingsSection'

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
  const { blocks, closure } = useSettingsStore((s) => s.bookingRestrictions)
  const setClosure = useSettingsStore((s) => s.setClosure)
  const addDateBlock = useSettingsStore((s) => s.addDateBlock)
  const removeDateBlock = useSettingsStore((s) => s.removeDateBlock)

  // Add-a-block draft.
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

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
    </>
  )
}
