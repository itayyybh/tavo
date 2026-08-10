import { cn } from '@/utils/cn'

/**
 * The Tavo mark — two rounded tiles with a gap, the split/merge table motif
 * at the heart of the floor manager. Monochrome; inherits `currentColor`, so
 * it flips with the theme wherever it sits (ink on light, near-white on dark).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('h-5 w-5', className)}
    >
      {/* Left table. */}
      <rect x="3" y="6.5" width="7.5" height="11" rx="2.4" />
      {/* Right table — a hair narrower gap reads as "about to merge". */}
      <rect x="13.5" y="6.5" width="7.5" height="11" rx="2.4" />
    </svg>
  )
}

/**
 * Full lockup: mark + wordmark. `label` overrides the wordmark so a restaurant
 * name can ride the same lockup; defaults to the brand name. When `src` is set
 * (a restaurant's uploaded logo) it replaces the Tavo mark.
 */
export function Logo({
  label = 'Tavo',
  src,
  className,
  markClassName,
}: {
  label?: string
  src?: string | null
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {src ? (
        <img
          src={src}
          alt=""
          className={cn('h-6 w-6 shrink-0 rounded-md object-cover', markClassName)}
        />
      ) : (
        <LogoMark className={cn('shrink-0 text-ink', markClassName)} />
      )}
      <span className="truncate text-sm font-semibold tracking-tight text-ink">
        {label}
      </span>
    </span>
  )
}
