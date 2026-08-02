import { useEffect, useState, type FormEvent } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { bootstrapRestaurant, redeemInvite } from '@/services/supabase/auth'
import { useInviteCode } from './useInviteCode'

/**
 * Shown when a user is authenticated but not yet a member of any restaurant.
 * With an invite code we redeem it automatically; otherwise the user is an
 * owner and names their new restaurant (open signup path).
 */
export function OnboardingScreen() {
  const invite = useInviteCode()
  const refreshMembership = useSessionStore((s) => s.refreshMembership)
  const signOut = useSessionStore((s) => s.signOut)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Start busy when an invite is present — redemption kicks off immediately.
  const [busy, setBusy] = useState(() => Boolean(invite))

  // Auto-redeem when arriving via an invite link (e.g. an existing account).
  useEffect(() => {
    if (!invite) return
    let cancelled = false
    redeemInvite(invite)
      .then(() => refreshMembership())
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not join.')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [invite, refreshMembership])

  const createRestaurant = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await bootstrapRestaurant(name.trim())
      await refreshMembership()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create restaurant.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        {invite ? (
          <>
            <Heading className="text-lg">Joining…</Heading>
            <Text className="mt-1 text-muted">
              {error ?? 'Adding you to the restaurant.'}
            </Text>
          </>
        ) : (
          <>
            <Heading className="text-lg">Create your restaurant</Heading>
            <Text className="mt-1 text-muted">
              Name your restaurant to get started. You'll be the owner.
            </Text>
            <form onSubmit={createRestaurant} className="mt-6 flex flex-col gap-4">
              <Input
                label="Restaurant name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Corner Table"
                autoFocus
              />
              {error && (
                <Text className="text-sm text-status-occupied">{error}</Text>
              )}
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create restaurant'}
              </Button>
            </form>
          </>
        )}

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-ink"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
