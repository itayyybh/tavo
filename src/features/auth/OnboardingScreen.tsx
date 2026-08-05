import { useState, type FormEvent } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { bootstrapRestaurant } from '@/services/supabase/auth'

/**
 * Shown when a user is authenticated but not a member of any restaurant AND has
 * no (valid) pending invite — i.e. a genuine new owner. Invite redemption is
 * handled centrally in the session store before this screen is ever reached, so
 * an invited user never lands here.
 */
export function OnboardingScreen() {
  const refreshMembership = useSessionStore((s) => s.refreshMembership)
  const signOut = useSessionStore((s) => s.signOut)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
          {error && <Text className="text-sm text-status-occupied">{error}</Text>}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create restaurant'}
          </Button>
        </form>

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
