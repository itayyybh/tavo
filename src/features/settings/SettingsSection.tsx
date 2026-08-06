import type { ReactNode } from 'react'
import { Panel } from '@/components/ui'

/**
 * A titled block of settings inside a group page: heading + description on top, a
 * Panel of `SettingRow`s below. The shared unit every settings section is built
 * from — one group page stacks several of these.
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      <Panel>{children}</Panel>
    </section>
  )
}

/** Hairline divider between rows inside a Panel. */
export function SettingsDivider() {
  return <div className="h-px bg-line" />
}
