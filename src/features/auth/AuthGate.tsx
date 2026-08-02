import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from '@/stores'
import { AuthScreen } from './AuthScreen'
import { OnboardingScreen } from './OnboardingScreen'

/**
 * The single access gate (Phase 9). Wraps the whole app: nothing renders until
 * the persisted session resolves, and the domain surfaces render only once the
 * user is authenticated AND belongs to a restaurant. This is the frontend
 * companion to database RLS — convenience, not the security boundary.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const init = useSessionStore((s) => s.init)

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

  if (status === 'signed_out') return <AuthScreen />
  if (status === 'no_restaurant') return <OnboardingScreen />

  return <>{children}</>
}
