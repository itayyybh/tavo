import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { InviteDialog } from './InviteDialog'

/**
 * Header account cluster (Phase 9) — an avatar-triggered dropdown that holds who
 * is signed in, their role, the owner-only invite action, and sign-out (the only
 * sign-out inside the authenticated app). Folding invite in here keeps the top
 * bar to three clean zones: brand · nav · account.
 */
export function AccountMenu() {
  const { t } = useTranslation('common')
  const userName = useSessionStore((s) => s.userName)
  const role = useSessionStore((s) => s.role)
  const signOut = useSessionStore((s) => s.signOut)

  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  // Close on outside click / Escape while the menu is open.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const initials = (userName ?? 'A')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-lg py-1 pe-1.5 ps-1 text-sm transition-colors duration-200 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-surface">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium text-ink sm:block">
          {userName ?? 'Account'}
        </span>
        <Caret open={menuOpen} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="menu"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute end-0 top-full z-50 mt-2 w-60 rounded-xl border border-line bg-surface p-1 shadow-md"
          >
            <div className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {userName ?? 'Account'}
                </span>
                {role && <Badge className="capitalize">{role}</Badge>}
              </div>
              <span className="text-[11px] text-muted">{t('appName')}</span>
            </div>

            <div className="my-1 h-px bg-line" />

            {role === 'owner' && (
              <MenuItem
                onClick={() => {
                  setMenuOpen(false)
                  setInviteOpen(true)
                }}
              >
                Invite a manager
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setMenuOpen(false)
                void signOut()
              }}
            >
              Sign out
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  )
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-2 text-start text-sm text-ink-soft transition-colors duration-200 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
