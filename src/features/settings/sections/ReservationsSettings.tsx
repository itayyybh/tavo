import { useTranslation } from 'react-i18next'
import { Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { SettingRow } from '../SettingRow'
import { NumberField } from '../NumberField'
import { TimeField } from '../TimeField'
import { SettingsSection, SettingsDivider } from '../SettingsSection'
import { BookingRestrictionsEditor } from '../BookingRestrictionsEditor'

/**
 * Reservations settings group — the booking window, accepted party sizes, and the
 * default stay times a new booking gets. "Max combined tables" mirrors the single
 * source `seating.merge.maxMergeSize` (shared with the Floor/seating engine).
 */
export function ReservationsSettings() {
  const { t } = useTranslation('settings')

  const rules = useSettingsStore((s) => s.reservationRules)
  const update = useSettingsStore((s) => s.updateReservationRules)

  const maxMergeSize = useSettingsStore((s) => s.seating.merge.maxMergeSize)
  const updateMergeConfig = useSettingsStore((s) => s.updateMergeConfig)

  const defaultStayMinutes = useSettingsStore((s) => s.defaultStayMinutes)
  const maxStayMinutes = useSettingsStore((s) => s.maxStayMinutes)
  const setStayMinutes = useSettingsStore((s) => s.setStayMinutes)

  return (
    <>
      <SettingsSection title={t('rules.title')} description={t('rules.description')}>
        <SettingRow label={t('rules.latestBooking.label')} help={t('rules.latestBooking.help')} htmlFor="set-latest">
          <TimeField
            id="set-latest"
            value={rules.latestBookingTime ?? ''}
            onChange={(v) => update({ latestBookingTime: v || null })}
            aria-label={t('rules.latestBooking.label')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('rules.minAdvance.label')} help={t('rules.minAdvance.help')} htmlFor="set-minadv">
          <NumberField
            id="set-minadv"
            value={rules.minAdvanceMinutes}
            onCommit={(n) => update({ minAdvanceMinutes: n })}
            min={0}
            max={1440}
            suffix={t('minutes')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('rules.allowSameDay.label')} help={t('rules.allowSameDay.help')} htmlFor="set-sameday">
          <Toggle
            id="set-sameday"
            checked={rules.allowSameDay}
            onChange={(v) => update({ allowSameDay: v })}
            aria-label={t('rules.allowSameDay.label')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('rules.allowAfterClosing.label')} help={t('rules.allowAfterClosing.help')} htmlFor="set-afterclose">
          <Toggle
            id="set-afterclose"
            checked={rules.allowAfterClosing}
            onChange={(v) => update({ allowAfterClosing: v })}
            aria-label={t('rules.allowAfterClosing.label')}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('party.title')} description={t('party.description')}>
        <SettingRow label={t('party.minSize.label')} help={t('party.minSize.help')} htmlFor="set-minparty">
          <NumberField
            id="set-minparty"
            value={rules.minPartySize}
            onCommit={(n) => update({ minPartySize: n })}
            min={1}
            max={rules.maxPartySize}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('party.maxSize.label')} help={t('party.maxSize.help')} htmlFor="set-maxparty">
          <NumberField
            id="set-maxparty"
            value={rules.maxPartySize}
            onCommit={(n) => update({ maxPartySize: n })}
            min={rules.minPartySize}
            max={200}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('party.maxCombined.label')} help={t('party.maxCombined.help')} htmlFor="set-maxcombined">
          <NumberField
            id="set-maxcombined"
            value={maxMergeSize ?? 5}
            onCommit={(n) => updateMergeConfig({ maxMergeSize: n })}
            min={1}
            max={12}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('party.allowSplit.label')} help={t('party.allowSplit.help')} htmlFor="set-split">
          <Toggle
            id="set-split"
            checked={rules.allowSplitParty}
            onChange={(v) => update({ allowSplitParty: v })}
            aria-label={t('party.allowSplit.label')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('party.allowAltZone.label')} help={t('party.allowAltZone.help')} htmlFor="set-altzone">
          <Toggle
            id="set-altzone"
            checked={rules.allowAltZoneSuggestions}
            onChange={(v) => update({ allowAltZoneSuggestions: v })}
            aria-label={t('party.allowAltZone.label')}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('defaults.title')} description={t('defaults.description')}>
        <SettingRow label={t('seating.defaultStay.label')} help={t('seating.defaultStay.help')} htmlFor="set-defstay">
          <NumberField
            id="set-defstay"
            value={defaultStayMinutes}
            onCommit={(n) => setStayMinutes({ default: n })}
            min={15}
            max={maxStayMinutes}
            suffix={t('minutes')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('seating.maxStay.label')} help={t('seating.maxStay.help')} htmlFor="set-maxstay">
          <NumberField
            id="set-maxstay"
            value={maxStayMinutes}
            onCommit={(n) => setStayMinutes({ max: n })}
            min={defaultStayMinutes}
            max={600}
            suffix={t('minutes')}
          />
        </SettingRow>
      </SettingsSection>

      <BookingRestrictionsEditor />
    </>
  )
}
