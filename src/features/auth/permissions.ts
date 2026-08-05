import { useSessionStore } from '@/stores'
import type { MembershipRole } from '@/services/supabase/auth'

/**
 * Authorization layer (Phase 11) — the single source of truth for what each
 * role may do in the UI. RLS enforces ownership server-side; this governs what
 * the client shows and lets a user attempt, so gates never drift apart across
 * components (previously each did its own `role === 'owner'` check).
 *
 * Owner-only actions are the ones that reshape the restaurant itself — layout,
 * settings, and team. A manager runs the floor day to day.
 */
export type PermissionAction =
  | 'editLayout'
  | 'editSettings'
  | 'inviteManager'
  | 'deleteReservation'
  | 'manageFloor'
  | 'seedData'

/** Allowed actions per role. A role grants exactly the actions listed here. */
const PERMISSIONS: Record<MembershipRole, ReadonlySet<PermissionAction>> = {
  owner: new Set<PermissionAction>([
    'editLayout',
    'editSettings',
    'inviteManager',
    'deleteReservation',
    'manageFloor',
    'seedData',
  ]),
  manager: new Set<PermissionAction>(['deleteReservation', 'manageFloor']),
}

/** Whether a role may perform an action. A null role (signed out) may do nothing. */
export function can(role: MembershipRole | null, action: PermissionAction): boolean {
  if (!role) return false
  return PERMISSIONS[role].has(action)
}

/** Reactive `can` bound to the current session's role. Re-renders on role change. */
export function useCan(action: PermissionAction): boolean {
  const role = useSessionStore((s) => s.role)
  return can(role, action)
}
