import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { dirForLocale } from '@/i18n/config'
import { useSessionStore, useSettingsStore } from '@/stores'
import { MobileShell, MobileTabs } from './MobileShell'
import { MobileReservationForm } from './MobileReservationPage'
import { MobileTodayList } from './MobileTodayList'

type Tab = 'new' | 'today'

/**
 * The phone surface (Phase 9). A single frame with two focused views — create a
 * reservation, or scan today's list with seating assignments. Deliberately NOT
 * the desktop app (no editor / floor / management).
 */
export function MobileHome() {
  const { t } = useTranslation('reservations')
  const [tab, setTab] = useState<Tab>('new')
  const restaurantName = useSessionStore((s) => s.restaurantName)
  const signOut = useSessionStore((s) => s.signOut)
  const locale = useSettingsStore((s) => s.locale)

  // `/m` renders outside the App shell, so its language/direction effect never
  // runs here — apply locale + text direction ourselves so the toggle works.
  useEffect(() => {
    void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
    document.documentElement.dir = dirForLocale(locale)
  }, [locale])

  return (
    <MobileShell
      title={tab === 'new' ? t('mobile.newTitle') : t('mobile.todayTitle')}
      subtitle={restaurantName}
      onSignOut={signOut}
      tabs={
        <MobileTabs
          value={tab}
          options={[
            { value: 'new', label: t('mobile.tabNew') },
            { value: 'today', label: t('mobile.tabToday') },
          ]}
          onChange={setTab}
        />
      }
    >
      {tab === 'new' ? <MobileReservationForm /> : <MobileTodayList />}
    </MobileShell>
  )
}
