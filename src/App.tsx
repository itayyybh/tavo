import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { dirForLocale } from '@/i18n/config'
import { useSettingsStore, useUIStore } from '@/stores'
import { useLayoutHydration } from '@/hooks/useLayoutHydration'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-1.5 text-sm transition-colors duration-200',
    isActive ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
  ].join(' ')

/**
 * App shell — top-level layout with navigation between the product surfaces.
 * Individual surfaces render into <Outlet /> via the router.
 */
export default function App() {
  const { t } = useTranslation('common')
  const theme = useUIStore((s) => s.theme)
  const locale = useSettingsStore((s) => s.locale)

  // Load the saved layout once, app-wide, so every surface sees real zones/tables.
  useLayoutHydration()

  // Apply the active theme to the document root so tokens flip globally.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Apply the active language + text direction globally. `dir="rtl"` mirrors the
  // whole shell for Hebrew; the canvas opts back out in a later phase.
  useEffect(() => {
    void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
    document.documentElement.dir = dirForLocale(locale)
  }, [locale])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <span className="text-sm font-semibold tracking-tight text-ink">{t('appName')}</span>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            {t('nav.floor')}
          </NavLink>
          <NavLink to="/editor" className={navLinkClass}>
            {t('nav.editor')}
          </NavLink>
          <NavLink to="/reservations" className={navLinkClass}>
            {t('nav.reservations')}
          </NavLink>
          <NavLink to="/design" className={navLinkClass}>
            {t('nav.design')}
          </NavLink>
          <span className="mx-1 h-4 w-px bg-line" />
          <LanguageToggle />
          <ThemeToggle />
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-surface-2">
        <Outlet />
      </main>
    </div>
  )
}
