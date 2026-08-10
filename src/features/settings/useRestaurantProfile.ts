import { useEffect, useState } from 'react'
import { useSessionStore } from '@/stores'
import {
  loadRestaurantProfile,
  updateRestaurantProfile,
} from '@/services/supabase/settingsRepo'

type SaveState = 'idle' | 'saving' | 'saved'

/**
 * Loads and edits the restaurant profile (name + timezone). The name/timezone
 * write is owner-only (enforced by the RPC); after a successful save we refresh
 * membership so the header's restaurant name updates immediately.
 */
export function useRestaurantProfile() {
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const refreshMembership = useSessionStore((s) => s.refreshMembership)

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState<string>('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    loadRestaurantProfile(restaurantId)
      .then((profile) => {
        if (cancelled || !profile) return
        setName(profile.name)
        setTimezone(profile.timezone ?? '')
        setLogoUrl(profile.logoUrl)
        setLoaded(true)
      })
      .catch((err) => {
        console.error('Profile load failed', err)
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId])

  const save = async () => {
    if (!restaurantId) return
    setSaveState('saving')
    try {
      await updateRestaurantProfile(restaurantId, {
        name: name.trim(),
        timezone: timezone || null,
        logoUrl,
      })
      await refreshMembership()
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      console.error('Profile save failed', err)
      setSaveState('idle')
    }
  }

  return {
    name,
    setName,
    timezone,
    setTimezone,
    logoUrl,
    setLogoUrl,
    loaded,
    saveState,
    save,
  }
}
