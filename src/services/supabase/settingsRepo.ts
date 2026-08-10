import type { ID, RestaurantSettingsConfig } from '@/types'
import { supabase } from './client'
import {
  settingsFromRow,
  settingsToRow,
  type RestaurantSettingsRow,
} from './mappers'

/**
 * Settings repository (Phase 11) — reads and writes the per-restaurant
 * `restaurant_settings` row (scaffolded in Phase 9, wired to the app here) plus
 * the restaurant profile (name/timezone on `restaurants`). RLS scopes the
 * settings row to members; the profile write goes through an owner-checked RPC
 * because `restaurants` is read-only to the client.
 */

/** The restaurant's settings, or null if no row exists yet (defaults apply). */
export async function loadSettings(
  restaurantId: ID,
): Promise<RestaurantSettingsConfig | null> {
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (error) throw error
  return data ? settingsFromRow(data as RestaurantSettingsRow) : null
}

/** Upsert the whole settings config. The bootstrap seeds a row; this overwrites it. */
export async function saveSettings(
  restaurantId: ID,
  config: RestaurantSettingsConfig,
): Promise<void> {
  const { error } = await supabase
    .from('restaurant_settings')
    .upsert(settingsToRow(restaurantId, config))
  if (error) throw error
}

/** The editable restaurant profile fields. */
export interface RestaurantProfile {
  name: string
  timezone: string | null
  /** Small square logo as a data URL, or null to fall back to the Tavo mark. */
  logoUrl: string | null
}

/** Read the restaurant's profile (name + timezone). */
export async function loadRestaurantProfile(
  restaurantId: ID,
): Promise<RestaurantProfile | null> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('name, timezone, logo_url')
    .eq('id', restaurantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    name: data.name as string,
    timezone: (data.timezone as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
  }
}

/** Owner-only profile edit via the security-definer RPC. */
export async function updateRestaurantProfile(
  restaurantId: ID,
  profile: RestaurantProfile,
): Promise<void> {
  const { error } = await supabase.rpc('update_restaurant_profile', {
    p_restaurant_id: restaurantId,
    p_name: profile.name,
    p_timezone: profile.timezone,
    p_logo_url: profile.logoUrl,
  })
  if (error) throw error
}
