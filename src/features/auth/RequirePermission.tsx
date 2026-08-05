import { Navigate } from 'react-router-dom'
import { useCan, type PermissionAction } from './permissions'

/**
 * Route guard (Phase 11) — renders its children only if the current role holds
 * `action`, otherwise redirects. Hiding a nav link stops discovery; this stops
 * a non-owner from reaching an owner-only surface by deep link or back button.
 */
export function RequirePermission({
  action,
  redirectTo = '/',
  children,
}: {
  action: PermissionAction
  redirectTo?: string
  children: React.ReactNode
}) {
  const allowed = useCan(action)
  if (!allowed) return <Navigate to={redirectTo} replace />
  return <>{children}</>
}
