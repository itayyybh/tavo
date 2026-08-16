import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import App from '@/App'
import { RequirePermission } from '@/features/auth'
import { DEFAULT_SECTION } from '@/features/settings/settingsNav'

// Pages are lazy-loaded per the `performance` skill.
const FloorPage = lazy(() => import('@/pages/FloorPage'))
const EditorPage = lazy(() => import('@/pages/EditorPage'))
const ReservationsPage = lazy(() => import('@/pages/ReservationsPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const MobilePage = lazy(() => import('@/pages/MobilePage'))

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<div className="p-6 text-sm text-muted">Loading…</div>}>
    {node}
  </Suspense>
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: withSuspense(<FloorPage />) },
      {
        path: 'editor',
        element: (
          <RequirePermission action="editLayout">
            {withSuspense(<EditorPage />)}
          </RequirePermission>
        ),
      },
      { path: 'reservations', element: withSuspense(<ReservationsPage />) },
      { path: 'history', element: withSuspense(<HistoryPage />) },
      {
        path: 'settings',
        element: (
          <RequirePermission action="editSettings">
            <Outlet />
          </RequirePermission>
        ),
        children: [
          { index: true, element: <Navigate to={DEFAULT_SECTION} replace /> },
          { path: ':section', element: withSuspense(<SettingsPage />) },
        ],
      },
    ],
  },
  // Mobile lives outside the desktop shell — an intentionally separate, focused
  // reservation-creation surface (not a responsive squeeze of the full app).
  { path: '/m', element: withSuspense(<MobilePage />) },
])
