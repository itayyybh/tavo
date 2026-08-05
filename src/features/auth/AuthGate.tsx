import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from '@/stores'
import { useLayoutSync } from '@/hooks/useLayoutSync'
import { useReservationSync } from '@/hooks/useReservationSync'
import { useFloorSync } from '@/hooks/useFloorSync'
import { AuthScreen } from './AuthScreen'
import { OnboardingScreen } from './OnboardingScreen'
import { UpdatePasswordScreen } from './UpdatePasswordScreen'

/**
 * The single access gate (Phase 9). Wraps the whole app: nothing renders until
 * the persisted session resolves, and the domain surfaces render only once the
 * user is authenticated AND belongs to a restaurant. This is the frontend
 * companion to database RLS — convenience, not the security boundary.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const init = useSessionStore((s) => s.init)

  // Tenant data sync lives here, ABOVE the router, so both the desktop shell and
  // the standalone mobile route (/m, outside <App>) hydrate the restaurant's
  // layout + reservations from the database. Both hooks no-op until ready.
  useLayoutSync()
  useReservationSync()
  useFloorSync()

  useEffect(() => {
    init()
  }, [init])

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-surface-2 text-sm text-muted">
        Loading…
      </div>
    )
  }

  if (status === 'recovery') return <UpdatePasswordScreen />
  if (status === 'signed_out') return <AuthScreen />
  if (status === 'no_restaurant') return <OnboardingScreen />

  return <>{children}</>
}
