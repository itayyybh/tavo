import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { dirForLocale } from '@/i18n/config'
import { useSessionStore, useSettingsStore, useUIStore } from '@/stores'
import { AccountMenu, InviteManager } from '@/features/auth'
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
  const restaurantName = useSessionStore((s) => s.restaurantName)
  const navigate = useNavigate()
  const location = useLocation()
  const locale = useSettingsStore((s) => s.locale)

  // Phones landing on the app root go straight to the focused mobile flow.
  // Only from '/' so desktop deep-links (editor, reservations) are never hijacked.
  useEffect(() => {
    if (location.pathname === '/' && window.innerWidth <= 640) {
      navigate('/m', { replace: true })
    }
  }, [location.pathname, navigate])

  // Layout, reservation, and floor sync all live in AuthGate (above the router).

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
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight text-ink">
            {restaurantName ?? t('appName')}
          </span>
          {restaurantName && (
            <span className="text-[11px] text-muted">{t('appName')}</span>
          )}
        </div>
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
          <span className="mx-1 h-4 w-px bg-line" />
          <InviteManager />
          <LanguageToggle />
          <span className="mx-1 h-4 w-px bg-line" />
          <AccountMenu />
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-surface-2">
        <Outlet />
      </main>
    </div>
  )
}
