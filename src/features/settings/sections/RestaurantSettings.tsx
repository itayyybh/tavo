import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '@/components/ui'
import { SettingRow } from '../SettingRow'
import { SettingsSection, SettingsDivider } from '../SettingsSection'
import { OpeningHoursEditor } from '../OpeningHoursEditor'
import { useRestaurantProfile } from '../useRestaurantProfile'
import { LogoMark } from '@/components/Logo'
import { fileToSquareDataUrl } from '@/utils/image'

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
  const fileInput = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState(false)
  const tzOptions = useMemo(
    () => timezoneOptions().map((tz) => ({ value: tz, label: tz })),
    [],
  )

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setLogoError(false)
    try {
      profile.setLogoUrl(await fileToSquareDataUrl(file))
    } catch {
      setLogoError(true)
    }
  }

  return (
    <>
      <SettingsSection title={t('profile.title')} description={t('profile.description')}>
        <SettingRow label={t('profile.logo.label')} help={t('profile.logo.help')}>
          <div className="flex items-center gap-4">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt=""
                className="h-12 w-12 rounded-lg border border-line object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                <LogoMark className="h-6 w-6" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickLogo}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  {profile.logoUrl ? t('profile.logo.change') : t('profile.logo.upload')}
                </Button>
                {profile.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => profile.setLogoUrl(null)}
                  >
                    {t('profile.logo.remove')}
                  </Button>
                )}
              </div>
              <span className="text-[12px] text-muted">
                {logoError ? t('profile.logo.error') : t('profile.logo.hint')}
              </span>
            </div>
          </div>
        </SettingRow>
        <SettingsDivider />
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
