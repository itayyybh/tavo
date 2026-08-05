import { useState } from 'react'
import { Button, Dialog, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { createInvite } from '@/services/supabase/auth'

/**
 * Invite-manager control (Phase 9) — owner-only. Mints a reusable invite link an
 * owner shares with a new manager, who signs up through it and is auto-joined to
 * this restaurant (see `redeem_invite`). Renders nothing for non-owners.
 */
export function InviteManager() {
  const role = useSessionStore((s) => s.role)
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const restaurantName = useSessionStore((s) => s.restaurantName)

  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (role !== 'owner') return null

  const link = code ? `${window.location.origin}/?invite=${code}` : ''

  const generate = async () => {
    if (!restaurantId) return
    setLoading(true)
    setError(null)
    try {
      setCode(await createInvite(restaurantId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create an invite.')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked — the field is selectable as a fallback.
    }
  }

  const close = () => {
    setOpen(false)
    // Reset for the next open so a stale link is never shown.
    setCode(null)
    setError(null)
    setCopied(false)
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Invite
      </Button>
      <Dialog open={open} onClose={close} title="Invite a manager">
        <Text className="text-muted">
          Share this link with a new manager. They'll sign up and join{' '}
          <span className="font-medium text-ink">
            {restaurantName ?? 'your restaurant'}
          </span>{' '}
          automatically. Valid 7 days; more than one person can use it.
        </Text>

        {error && (
          <Text className="mt-3 text-sm text-status-occupied">{error}</Text>
        )}

        {!code ? (
          <Button className="mt-5 w-full" onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate invite link'}
          </Button>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink"
              />
              <Button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</Button>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="text-sm text-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              {loading ? 'Generating…' : 'Generate a new link'}
            </button>
          </div>
        )}
      </Dialog>
    </>
  )
}
