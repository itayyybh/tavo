import { useState, type FormEvent } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { updatePassword } from '@/services/supabase/auth'

/**
 * Shown when the user arrived via a password-reset link (session status
 * 'recovery'). They set a new password, then re-enter the app normally.
 */
export function UpdatePasswordScreen() {
  const refreshMembership = useSessionStore((s) => s.refreshMembership)
  const signOut = useSessionStore((s) => s.signOut)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      // Leave recovery -> resolve membership -> land in the app.
      await refreshMembership()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <Heading className="text-lg">Set a new password</Heading>
        <Text className="mt-1 text-muted">Choose a new password for your account.</Text>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Input
            label="New password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <Input
            label="Confirm password"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {error && <Text className="text-sm text-status-occupied">{error}</Text>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-ink"
          onClick={() => signOut()}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
