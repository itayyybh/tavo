import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import App from '@/App'
import { RequirePermission } from '@/features/auth'

// Pages are lazy-loaded per the `performance` skill.
const FloorPage = lazy(() => import('@/pages/FloorPage'))
const EditorPage = lazy(() => import('@/pages/EditorPage'))
const ReservationsPage = lazy(() => import('@/pages/ReservationsPage'))
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
      {
        path: 'settings',
        element: (
          <RequirePermission action="editSettings">
            {withSuspense(<SettingsPage />)}
          </RequirePermission>
        ),
      },
    ],
  },
  // Mobile lives outside the desktop shell — an intentionally separate, focused
  // reservation-creation surface (not a responsive squeeze of the full app).
  { path: '/m', element: withSuspense(<MobilePage />) },
])
