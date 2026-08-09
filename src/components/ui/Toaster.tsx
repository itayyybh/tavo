import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore } from '@/stores'

/**
 * Renders the live toast queue — a bottom-centered stack of self-dismissing
 * status messages. Mounted once at the app root. Subtle motion per the
 * `animation` skill (200ms, ease-out); click a toast to dismiss it early. The
 * container is `aria-live` so screen readers announce new messages.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            role="status"
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-auto max-w-sm cursor-pointer rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink shadow-[var(--shadow-soft)]"
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
