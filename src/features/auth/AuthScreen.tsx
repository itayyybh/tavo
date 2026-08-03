import { useState, type FormEvent } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { getSession, redeemInvite, signIn, signUp } from '@/services/supabase/auth'
import { useInviteCode } from './useInviteCode'

type Mode = 'signin' | 'signup'

/**
 * Login / signup (Phase 9). One card, two modes. An `?invite=CODE` in the URL
 * flips the copy to "join" and, after signup, binds the new user to that
 * restaurant as a manager before the session resolves.
 */
export function AuthScreen() {
  const invite = useInviteCode()
  const refreshMembership = useSessionStore((s) => s.refreshMembership)
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        // onAuthChange in the session store resolves membership from here.
        return
      }

      await signUp(email, password, name || undefined)
      // Email-confirmation projects return no session until the link is clicked.
      const session = await getSession()
      if (!session) {
        setNotice('Account created. Check your email to confirm, then sign in.')
        setMode('signin')
        return
      }
      if (invite) {
        await redeemInvite(invite)
        await refreshMembership()
      }
      // No invite -> lands on "no_restaurant" -> onboarding create-restaurant.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="flex h-full items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <Heading className="text-lg">
          {invite
            ? 'Join the team'
            : isSignup
              ? 'Create your account'
              : 'Welcome back'}
        </Heading>
        <Text className="mt-1 text-muted">
          {invite
            ? 'Sign up to join this restaurant as a manager.'
            : isSignup
              ? 'Set up an account, then create your restaurant.'
              : 'Sign in to manage your restaurant.'}
        </Text>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          {isSignup && (
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Rivera"
              autoComplete="name"
            />
          )}
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />

          {error && <Text className="text-sm text-status-occupied">{error}</Text>}
          {notice && <Text className="text-sm text-muted">{notice}</Text>}

          <Button type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : isSignup
                ? invite
                  ? 'Join restaurant'
                  : 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        {!invite && (
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-ink"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup')
              setError(null)
              setNotice(null)
            }}
          >
            {isSignup
              ? 'Already have an account? Sign in'
              : "New here? Create an account"}
          </button>
        )}
      </div>
    </div>
  )
}
