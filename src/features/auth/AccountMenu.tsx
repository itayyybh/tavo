import { Badge, Button } from '@/components/ui'
import { useSessionStore } from '@/stores'

/**
 * Header account cluster (Phase 9) — shows who is signed in, their role, and a
 * sign-out control (the only sign-out inside the authenticated app).
 */
export function AccountMenu() {
  const userName = useSessionStore((s) => s.userName)
  const role = useSessionStore((s) => s.role)
  const signOut = useSessionStore((s) => s.signOut)

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-sm font-medium text-ink">{userName ?? 'Account'}</span>
        {role && <Badge className="capitalize">{role}</Badge>}
      </div>
      <Button variant="ghost" size="sm" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  )
}
