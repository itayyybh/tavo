import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { LOCALES, type Locale } from '@/i18n/config'
import { SettingRow } from '../SettingRow'
import { SettingsSection } from '../SettingsSection'

/** Human label per locale code, in its own language. */
const LOCALE_LABELS: Record<Locale, string> = { en: 'English', he: 'עברית' }

/**
 * System settings group — appearance and per-user preferences. Language is kept
 * per person (localStorage), not shared across the restaurant.
 */
export function SystemSettings() {
  const { t } = useTranslation('settings')
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)

  return (
    <SettingsSection title={t('language.title')} description={t('language.description')}>
      <SettingRow label={t('language.label')} htmlFor="set-locale">
        <Select
          id="set-locale"
          className="w-44"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
        />
      </SettingRow>
    </SettingsSection>
  )
}
