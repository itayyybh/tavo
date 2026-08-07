import { useTranslation } from 'react-i18next'
import { Heading } from '@/components/ui'
import { LanguageToggle } from '@/components/LanguageToggle'

/**
 * Phone frame shared by the mobile surfaces (create + today). Owns the header,
 * sign-out, and an optional segmented tab strip; each view renders as children.
 */
export function MobileShell({
  title,
  subtitle,
  onSignOut,
  tabs,
  children,
}: {
  title: string
  subtitle?: string | null
  onSignOut: () => void
  tabs?: React.ReactNode
  children: React.ReactNode
}) {
  const { t } = useTranslation('reservations')
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-x-hidden bg-surface-2">
      <header className="border-b border-line bg-surface">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="min-w-0">
            {subtitle && (
              <div className="truncate text-xs font-medium text-muted">{subtitle}</div>
            )}
            <Heading className="text-base">{title}</Heading>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageToggle />
            <button
              onClick={onSignOut}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              {t('mobile.signOut')}
            </button>
          </div>
        </div>
        {tabs}
      </header>
      {children}
    </div>
  )
}

/** Two-way segmented control for the mobile header (New | Today). */
export function MobileTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1 px-5 pb-3">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={[
              'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-ink text-surface'
                : 'border border-line bg-surface text-muted hover:text-ink',
            ].join(' ')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
