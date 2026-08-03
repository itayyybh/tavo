import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores'
import { useLayoutSync } from '@/hooks/useLayoutSync'
import { useReservationSync } from '@/hooks/useReservationSync'
import { useFloorPersistence } from '@/hooks/useFloorPersistence'
import { ThemeToggle } from '@/components/ThemeToggle'

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
  const theme = useUIStore((s) => s.theme)
  const navigate = useNavigate()
  const location = useLocation()

  // Phones landing on the app root go straight to the focused mobile flow.
  // Only from '/' so desktop deep-links (editor, reservations) are never hijacked.
  useEffect(() => {
    if (location.pathname === '/' && window.innerWidth <= 640) {
      navigate('/m', { replace: true })
    }
  }, [location.pathname, navigate])

  // Load + autosave the active restaurant's layout, app-wide (DB-backed).
  useLayoutSync()

  // Hydrate reservations + stream realtime changes, app-wide (DB-backed).
  useReservationSync()

  // Persist the current shift's runtime floor layer (seatings, merges, moves).
  useFloorPersistence()

  // Apply the active theme to the document root so tokens flip globally.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <span className="text-sm font-semibold tracking-tight text-ink">
          Restaurant Floor Manager
        </span>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Floor
          </NavLink>
          <NavLink to="/editor" className={navLinkClass}>
            Editor
          </NavLink>
          <NavLink to="/reservations" className={navLinkClass}>
            Reservations
          </NavLink>
          <NavLink to="/design" className={navLinkClass}>
            Design
          </NavLink>
          <span className="mx-1 h-4 w-px bg-line" />
          <ThemeToggle />
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto bg-surface-2">
        <Outlet />
      </main>
    </div>
  )
}
