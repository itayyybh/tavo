import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE } from './config'
import enCommon from './locales/en/common.json'
import enEditor from './locales/en/editor.json'
import enReservations from './locales/en/reservations.json'
import enSettings from './locales/en/settings.json'
import heCommon from './locales/he/common.json'
import heEditor from './locales/he/editor.json'
import heReservations from './locales/he/reservations.json'
import heSettings from './locales/he/settings.json'

export * from './config'

/**
 * i18next singleton. String resources are bundled per-locale, per-namespace.
 * Components read strings via `useTranslation()` / `t('namespace:key')`.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      reservations: enReservations,
      editor: enEditor,
      settings: enSettings,
    },
    he: {
      common: heCommon,
      reservations: heReservations,
      editor: heEditor,
      settings: heSettings,
    },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
})

export default i18n
