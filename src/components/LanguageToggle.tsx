import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores'
import { Button } from '@/components/ui'

/**
 * Toggles app language (en ⇄ he). The store holds + persists the locale;
 * App applies `lang`/`dir` and i18next language. This is the seed of the
 * future Settings language control.
 */
export function LanguageToggle() {
  const { t } = useTranslation('common')
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === 'en' ? 'he' : 'en')}
      aria-label={t('languageToggleAria')}
    >
      {locale === 'en' ? 'עברית' : 'English'}
    </Button>
  )
}
