import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { ID } from '@/types'
import {
  getMembership,
  getSession,
  isGuest,
  onAuthChange,
  redeemInvite,
  signOut as authSignOut,
  startDemo,
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
  restaurantLogoUrl: string | null
  role: MembershipRole | null
  /** Why the last demo start failed, shown on the sign-in screen. */
  demoError: string | null
  /** Boot the store: resolve the persisted session and subscribe to changes. */
  init: () => void
  /** Re-read membership (e.g. after bootstrapping a restaurant). */
  refreshMembership: () => Promise<void>
  signOut: () => Promise<void>
}

let unsubscribe: (() => void) | null = null

/** Thrown when a guest session can't get its demo restaurant. */
class DemoUnavailableError extends Error {
  constructor() {
    super("The demo isn't available right now. Please try again later.")
  }
}

/**
 * The caller's membership, redeeming a pending invite first if they have none.
 * Centralizing redemption here (rather than in the signup screen) removes the
 * race where the auth listener resolves "no restaurant" before the invite is
 * redeemed — which dropped invited users onto the create-a-restaurant path.
 * Demo guests get their private demo restaurant here for the same reason.
 */
async function resolveMembershipWithInvite(user: User | null): Promise<Membership | null> {
  let membership = await getMembership()
  if (membership) return membership

  if (isGuest(user)) {
    try {
      await startDemo()
      return await getMembership()
    } catch {
      // Demo not configured / failed: drop the guest session rather than leave
      // an anonymous user on the create-a-restaurant screen.
      await authSignOut().catch(() => {})
      throw new DemoUnavailableError()
    }
  }

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
  restaurantLogoUrl: null,
  role: null,
  demoError: null,

  init: () => {
    const onResolveError = (err: unknown) =>
      set({
        status: 'signed_out',
        user: null,
        userName: null,
        demoError: err instanceof DemoUnavailableError ? err.message : null,
      })

    // Resolve the current session once, then react to every future change.
    const resolve = async (user: User | null) => {
      if (!user) {
        set({
          status: 'signed_out',
          user: null,
          userName: null,
          restaurantId: null,
          restaurantName: null,
          restaurantLogoUrl: null,
          role: null,
        })
        return
      }
      const membership = await resolveMembershipWithInvite(user)
      if (membership) {
        set({
          status: 'ready',
          demoError: null,
          restaurantId: membership.restaurantId,
          restaurantName: membership.restaurantName,
          restaurantLogoUrl: membership.restaurantLogoUrl,
          role: membership.role,
        })
      } else {
        set({
          status: 'no_restaurant',
          restaurantId: null,
          restaurantName: null,
          restaurantLogoUrl: null,
          role: null,
        })
      }
    }

    getSession().then((session) => {
      set({ user: session?.user ?? null, userName: nameFromUser(session?.user ?? null) })
      resolve(session?.user ?? null).catch(onResolveError)
    })

    unsubscribe?.()
    unsubscribe = onAuthChange((event, session) => {
      set({ user: session?.user ?? null, userName: nameFromUser(session?.user ?? null) })
      // A reset-link session must set a new password before entering the app.
      if (event === 'PASSWORD_RECOVERY') {
        set({ status: 'recovery' })
        return
      }
      resolve(session?.user ?? null).catch(onResolveError)
    })
  },

  refreshMembership: async () => {
    const user = get().user
    if (!user) return
    const membership = await resolveMembershipWithInvite(user)
    if (membership) {
      set({
        status: 'ready',
        restaurantId: membership.restaurantId,
        restaurantName: membership.restaurantName,
        restaurantLogoUrl: membership.restaurantLogoUrl,
        role: membership.role,
      })
    } else {
      set({
        status: 'no_restaurant',
        restaurantId: null,
        restaurantName: null,
        restaurantLogoUrl: null,
        role: null,
      })
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
      restaurantLogoUrl: null,
      role: null,
    })
  },
}))
