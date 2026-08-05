import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { ID } from '@/types'
import {
  getMembership,
  getSession,
  onAuthChange,
  redeemInvite,
  signOut as authSignOut,
  type Membership,
  type MembershipRole,
} from '@/services/supabase/auth'
import { clearPendingInvite, getPendingInvite } from '@/features/auth/pendingInvite'

/**
 * Session Store (Phase 9) — the single source of truth for who is logged in and
 * which restaurant's data they may touch. Every data store/repo reads
 * `restaurantId` from here; the router reads `status` to gate access.
 *
 * Deliberately separate from the domain stores: auth/tenant identity is
 * cross-cutting, not restaurant data.
 */

export type SessionStatus =
  | 'loading' // resolving the persisted session on boot
  | 'signed_out' // no session
  | 'no_restaurant' // authenticated but not yet a member of any restaurant
  | 'recovery' // arrived via a password-reset link — must set a new password
  | 'ready' // authenticated + has a restaurant

/** The signed-in user's display name, from auth metadata. */
function nameFromUser(user: User | null): string | null {
  const name = user?.user_metadata?.name
  return typeof name === 'string' && name ? name : null
}

interface SessionState {
  status: SessionStatus
  user: User | null
  userName: string | null
  restaurantId: ID | null
  restaurantName: string | null
  role: MembershipRole | null
  /** Boot the store: resolve the persisted session and subscribe to changes. */
  init: () => void
  /** Re-read membership (e.g. after bootstrapping a restaurant). */
  refreshMembership: () => Promise<void>
  signOut: () => Promise<void>
}

let unsubscribe: (() => void) | null = null

/**
 * The caller's membership, redeeming a pending invite first if they have none.
 * Centralizing redemption here (rather than in the signup screen) removes the
 * race where the auth listener resolves "no restaurant" before the invite is
 * redeemed — which dropped invited users onto the create-a-restaurant path.
 */
async function resolveMembershipWithInvite(): Promise<Membership | null> {
  let membership = await getMembership()
  if (membership) return membership

  const pending = getPendingInvite()
  if (!pending) return null
  try {
    await redeemInvite(pending)
    clearPendingInvite()
    membership = await getMembership()
  } catch {
    // Invalid / expired code — drop it and fall through to no_restaurant.
    clearPendingInvite()
  }
  return membership
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  userName: null,
  restaurantId: null,
  restaurantName: null,
  role: null,

  init: () => {
    // Resolve the current session once, then react to every future change.
    const resolve = async (userPresent: boolean) => {
      if (!userPresent) {
        set({
          status: 'signed_out',
          user: null,
          userName: null,
          restaurantId: null,
          restaurantName: null,
          role: null,
        })
        return
      }
      const membership = await resolveMembershipWithInvite()
      if (membership) {
        set({
          status: 'ready',
          restaurantId: membership.restaurantId,
          restaurantName: membership.restaurantName,
          role: membership.role,
        })
      } else {
        set({
          status: 'no_restaurant',
          restaurantId: null,
          restaurantName: null,
          role: null,
        })
      }
    }

    getSession().then((session) => {
      set({ user: session?.user ?? null, userName: nameFromUser(session?.user ?? null) })
      resolve(!!session).catch(() => set({ status: 'signed_out' }))
    })

    unsubscribe?.()
    unsubscribe = onAuthChange((event, session) => {
      set({ user: session?.user ?? null, userName: nameFromUser(session?.user ?? null) })
      // A reset-link session must set a new password before entering the app.
      if (event === 'PASSWORD_RECOVERY') {
        set({ status: 'recovery' })
        return
      }
      resolve(!!session).catch(() => set({ status: 'signed_out' }))
    })
  },

  refreshMembership: async () => {
    if (!get().user) return
    const membership = await resolveMembershipWithInvite()
    if (membership) {
      set({
        status: 'ready',
        restaurantId: membership.restaurantId,
        role: membership.role,
      })
    } else {
      set({ status: 'no_restaurant', restaurantId: null, role: null })
    }
  },

  signOut: async () => {
    await authSignOut()
    set({
      status: 'signed_out',
      user: null,
      userName: null,
      restaurantId: null,
      restaurantName: null,
      role: null,
    })
  },
}))
