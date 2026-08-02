import type { Session, User } from '@supabase/supabase-js'
import type { ID } from '@/types'
import { supabase } from './client'

/**
 * Auth + membership service (Phase 9). Thin wrapper over Supabase Auth plus the
 * SECURITY DEFINER RPCs that own restaurant/membership creation. The UI and
 * session store call these — never the raw client — so the auth surface is one
 * file.
 */

export type MembershipRole = 'owner' | 'manager'

export interface Membership {
  restaurantId: ID
  role: MembershipRole
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<User | null> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: name ? { name } : undefined },
  })
  if (error) throw error
  return data.user
}

export async function signIn(
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data.session
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * The caller's first membership. Phase 9 assumes one restaurant per user; the
 * shape stays a single row so multi-restaurant switching can extend it later.
 */
export async function getMembership(): Promise<Membership | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('restaurant_id, role')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { restaurantId: data.restaurant_id, role: data.role as MembershipRole }
}

/** Create the caller's restaurant + owner membership. Returns the restaurant id. */
export async function bootstrapRestaurant(name: string): Promise<ID> {
  const { data, error } = await supabase.rpc('bootstrap_restaurant', {
    p_name: name,
  })
  if (error) throw error
  return data as ID
}

/** Owner-only: add an existing (signed-up) user to a restaurant by email. */
export async function addMember(
  restaurantId: ID,
  email: string,
  role: MembershipRole = 'manager',
): Promise<void> {
  const { error } = await supabase.rpc('add_member', {
    p_restaurant_id: restaurantId,
    p_email: email,
    p_role: role,
  })
  if (error) throw error
}

/** Owner-only: mint a reusable invite code (valid 7 days). Returns the code. */
export async function createInvite(
  restaurantId: ID,
  role: MembershipRole = 'manager',
): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_restaurant_id: restaurantId,
    p_role: role,
  })
  if (error) throw error
  return data as string
}

/** Redeem an invite for the current user. Returns the restaurant id joined. */
export async function redeemInvite(code: string): Promise<ID> {
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code })
  if (error) throw error
  return data as ID
}

/** Subscribe to auth changes (login/logout/refresh). Returns an unsubscribe fn. */
export function onAuthChange(
  cb: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session)
  })
  return () => data.subscription.unsubscribe()
}
