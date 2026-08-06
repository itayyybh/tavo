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
  restaurantName: string
}

/** One member of a restaurant's team (from `list_members`). */
export interface Member {
  userId: ID
  role: MembershipRole
  name: string | null
  email: string | null
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

export async function signIn(email: string, password: string): Promise<Session> {
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

/** Email a password-reset link that returns to the app in recovery mode. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  })
  if (error) throw error
}

/** Set a new password for the current (recovery or signed-in) session. */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
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
    .select('restaurant_id, role, restaurants(name)')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  // PostgREST types an embedded to-one as an array; normalize it.
  const restaurant = data.restaurants as unknown as
    { name: string } | { name: string }[] | null
  const name = Array.isArray(restaurant) ? restaurant[0]?.name : restaurant?.name
  return {
    restaurantId: data.restaurant_id,
    role: data.role as MembershipRole,
    restaurantName: name ?? 'Restaurant',
  }
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

/** List the restaurant's team (owner + managers). Any member may call it. */
export async function listMembers(restaurantId: ID): Promise<Member[]> {
  const { data, error } = await supabase.rpc('list_members', {
    p_restaurant_id: restaurantId,
  })
  if (error) throw error
  return (data as {
    user_id: string
    role: MembershipRole
    name: string | null
    email: string | null
  }[]).map((r) => ({
    userId: r.user_id,
    role: r.role,
    name: r.name,
    email: r.email,
  }))
}

/** Owner-only: remove a member (not yourself, not an owner). */
export async function removeMember(restaurantId: ID, userId: ID): Promise<void> {
  const { error } = await supabase.rpc('remove_member', {
    p_restaurant_id: restaurantId,
    p_user_id: userId,
  })
  if (error) throw error
}

/** Redeem an invite for the current user. Returns the restaurant id joined. */
export async function redeemInvite(code: string): Promise<ID> {
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code })
  if (error) throw error
  return data as ID
}

export type AuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'PASSWORD_RECOVERY'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'

/** Subscribe to auth changes (login/logout/refresh/recovery). Returns an unsubscribe fn. */
export function onAuthChange(
  cb: (event: AuthEvent, session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(event as AuthEvent, session)
  })
  return () => data.subscription.unsubscribe()
}
