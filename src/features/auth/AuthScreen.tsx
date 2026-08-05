import { useState, type FormEvent } from 'react'
import { Button, Heading, Input, Text } from '@/components/ui'
import {
  getSession,
  sendPasswordReset,
  signIn,
  signUp,
} from '@/services/supabase/auth'
import { useInviteCode } from './useInviteCode'
import { getPendingInvite } from './pendingInvite'

type Mode = 'signin' | 'signup' | 'reset'

/**
 * Login / signup / password-reset (Phase 9). An invite (from the URL or the
 * stashed pending code) flips the copy to "join". Redemption itself happens
 * centrally in the session store once authenticated — this screen only
 * authenticates.
 */
export function AuthScreen() {
  const invite = useInviteCode() ?? getPendingInvite()
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const isReset = mode === 'reset'

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (isSignup && password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'reset') {
        await sendPasswordReset(email)
        setNotice('Password reset link sent. Check your email.')
        return
      }

      if (mode === 'signin') {
        await signIn(email, password)
        // onAuthChange in the session store resolves membership from here.
        return
      }

      // signup
      await signUp(email, password, name.trim() || undefined)
      const session = await getSession()
      if (!session) {
        setNotice('Account created. Check your email to confirm, then sign in.')
        setMode('signin')
        return
      }
      // Session live -> the session store's resolve redeems any pending invite.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const title = invite
    ? 'Join the team'
    : isReset
      ? 'Reset your password'
      : isSignup
        ? 'Create your account'
        : 'Welcome back'

  const subtitle = invite
    ? 'Sign up to join this restaurant as a manager.'
    : isReset
      ? "Enter your email and we'll send a reset link."
      : isSignup
        ? 'Set up an account, then create your restaurant.'
        : 'Sign in to manage your restaurant.'

  return (
    <div className="flex h-full items-center justify-center bg-surface-2 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <Heading className="text-lg">{title}</Heading>
        <Text className="mt-1 text-muted">{subtitle}</Text>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          {isSignup && (
            <Input
              label="Full name"
              required
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
          {!isReset && (
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
          )}
          {isSignup && (
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
          )}

          {mode === 'signin' && (
            <button
              type="button"
              className="-mt-1 self-end text-xs text-muted transition-colors hover:text-ink"
              onClick={() => switchMode('reset')}
            >
              Forgot password?
            </button>
          )}

          {error && <Text className="text-sm text-status-occupied">{error}</Text>}
          {notice && <Text className="text-sm text-muted">{notice}</Text>}

          <Button type="submit" disabled={busy}>
            {busy
              ? 'Please wait…'
              : isReset
                ? 'Send reset link'
                : isSignup
                  ? invite
                    ? 'Join restaurant'
                    : 'Create account'
                  : 'Sign in'}
          </Button>
        </form>

        {isReset ? (
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-ink"
            onClick={() => switchMode('signin')}
          >
            Back to sign in
          </button>
        ) : (
          !invite && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-ink"
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
            >
              {isSignup
                ? 'Already have an account? Sign in'
                : 'New here? Create an account'}
            </button>
          )
        )}
      </div>
    </div>
  )
}
