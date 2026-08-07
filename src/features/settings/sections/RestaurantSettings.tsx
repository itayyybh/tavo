import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '@/components/ui'
import { SettingRow } from '../SettingRow'
import { SettingsSection, SettingsDivider } from '../SettingsSection'
import { OpeningHoursEditor } from '../OpeningHoursEditor'
import { useRestaurantProfile } from '../useRestaurantProfile'

/** IANA time zones for the profile select, or a short fallback if unavailable. */
function timezoneOptions(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf
  if (supported) {
    try {
      return supported('timeZone')
    } catch {
      /* fall through */
    }
  }
  return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Jerusalem']
}

/**
 * Restaurant settings group — the restaurant's identity (name, time zone; saved
 * via the owner-only profile RPC) and its weekly opening hours (autosaved to the
 * settings row).
 */
export function RestaurantSettings() {
  const { t } = useTranslation('settings')
  const profile = useRestaurantProfile()
  const tzOptions = useMemo(
    () => timezoneOptions().map((tz) => ({ value: tz, label: tz })),
    [],
  )

  return (
    <>
      <SettingsSection title={t('profile.title')} description={t('profile.description')}>
        <SettingRow label={t('profile.name.label')} help={t('profile.name.help')} htmlFor="set-rname">
          <Input
            id="set-rname"
            className="w-64"
            value={profile.name}
            onChange={(e) => profile.setName(e.target.value)}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('profile.timezone.label')} help={t('profile.timezone.help')} htmlFor="set-tz">
          <Select
            id="set-tz"
            className="w-64"
            value={profile.timezone}
            onChange={(e) => profile.setTimezone(e.target.value)}
            placeholder={t('profile.timezoneAuto')}
            options={tzOptions}
          />
        </SettingRow>
        <div className="mt-4 flex items-center justify-end gap-3">
          {profile.saveState === 'saved' && (
            <span className="text-[13px] text-muted">{t('profile.saved')}</span>
          )}
          <Button
            onClick={profile.save}
            disabled={!profile.loaded || profile.saveState === 'saving'}
          >
            {profile.saveState === 'saving' ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('openingHours.title')}
        description={t('openingHours.description')}
      >
        <OpeningHoursEditor />
      </SettingsSection>
    </>
  )
}
