import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { dirForLocale } from '@/i18n/config'
import { useSessionStore, useSettingsStore, useUIStore } from '@/stores'
import { AccountMenu, useCan } from '@/features/auth'
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
  const canEditLayout = useCan('editLayout')
  const canEditSettings = useCan('editSettings')

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
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-6 py-3">
        {/* Left — identity. */}
        <div className="min-w-0 justify-self-start">
          <span className="block truncate text-sm font-semibold tracking-tight text-ink">
            {restaurantName ?? t('appName')}
          </span>
        </div>

        {/* Center — primary navigation, the visual anchor. */}
        <nav className="flex items-center gap-1 justify-self-center rounded-xl bg-surface-2 p-1">
          <NavLink to="/" end className={navLinkClass}>
            {t('nav.floor')}
          </NavLink>
          {canEditLayout && (
            <NavLink to="/editor" className={navLinkClass}>
              {t('nav.editor')}
            </NavLink>
          )}
          <NavLink to="/reservations" className={navLinkClass}>
            {t('nav.reservations')}
          </NavLink>
        </nav>

        {/* Right — utilities, muted. */}
        <div className="flex items-center gap-1 justify-self-end">
          <LanguageToggle />
          {canEditSettings && (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                [
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200',
                  isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink',
                ].join(' ')
              }
              aria-label={t('nav.settings')}
            >
              <SettingsIcon />
            </NavLink>
          )}
          <AccountMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-surface-2">
        <Outlet />
      </main>
    </div>
  )
}

/** Cog glyph for the settings nav entry. */
function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
