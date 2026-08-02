import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { ID } from '@/types'
import {
  getMembership,
  getSession,
  onAuthChange,
  signOut as authSignOut,
  type MembershipRole,
} from '@/services/supabase/auth'

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
  | 'ready' // authenticated + has a restaurant

interface SessionState {
  status: SessionStatus
  user: User | null
  restaurantId: ID | null
  role: MembershipRole | null
  /** Boot the store: resolve the persisted session and subscribe to changes. */
  init: () => void
  /** Re-read membership (e.g. after bootstrapping a restaurant). */
  refreshMembership: () => Promise<void>
  signOut: () => Promise<void>
}

let unsubscribe: (() => void) | null = null

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  restaurantId: null,
  role: null,

  init: () => {
    // Resolve the current session once, then react to every future change.
    const resolve = async (userPresent: boolean) => {
      if (!userPresent) {
        set({ status: 'signed_out', user: null, restaurantId: null, role: null })
        return
      }
      const membership = await getMembership()
      if (membership) {
        set({
          status: 'ready',
          restaurantId: membership.restaurantId,
          role: membership.role,
        })
      } else {
        set({ status: 'no_restaurant', restaurantId: null, role: null })
      }
    }

    getSession().then((session) => {
      set({ user: session?.user ?? null })
      resolve(!!session).catch(() => set({ status: 'signed_out' }))
    })

    unsubscribe?.()
    unsubscribe = onAuthChange((session) => {
      set({ user: session?.user ?? null })
      resolve(!!session).catch(() => set({ status: 'signed_out' }))
    })
  },

  refreshMembership: async () => {
    if (!get().user) return
    const membership = await getMembership()
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
    set({ status: 'signed_out', user: null, restaurantId: null, role: null })
  },
}))
