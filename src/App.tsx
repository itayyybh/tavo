import { NavLink, Outlet } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-1.5 text-sm transition-colors duration-200',
    isActive
      ? 'bg-[var(--color-ink)] text-white'
      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
  ].join(' ')

/**
 * App shell — top-level layout with navigation between the product surfaces.
 * Individual surfaces render into <Outlet /> via the router.
 */
export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">
          Restaurant Floor Manager
        </span>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Floor
          </NavLink>
          <NavLink to="/editor" className={navLinkClass}>
            Editor
          </NavLink>
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
