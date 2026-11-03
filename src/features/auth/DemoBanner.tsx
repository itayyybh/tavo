import { useSessionStore } from '@/stores'
import { isGuest } from '@/services/supabase/auth'

/**
 * Thin strip shown only to demo guests (anonymous sessions): explains that the
 * restaurant is a private sample copy and offers a way out. Renders nothing for
 * real accounts.
 */
export function DemoBanner() {
  const user = useSessionStore((s) => s.user)
  const signOut = useSessionStore((s) => s.signOut)

  if (!isGuest(user)) return null

  return (
    <div className="flex items-center justify-center gap-3 border-b border-line bg-surface-2 px-4 py-2 text-xs text-muted">
      <span>
        Demo restaurant with sample data. Explore freely: your copy is private and
        deleted after 24 hours.
      </span>
      <button
        type="button"
        className="font-medium text-ink underline-offset-2 hover:underline"
        onClick={() => void signOut()}
      >
        Exit demo
      </button>
    </div>
  )
}
