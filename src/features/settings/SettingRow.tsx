import type { ReactNode } from 'react'

interface SettingRowProps {
  label: string
  help?: string
  /** The control (toggle, number input, select…), aligned to the row's end. */
  children: ReactNode
  /** Associates the label with the control for a11y when the control has an id. */
  htmlFor?: string
}

/**
 * One labelled setting: name + helper text on the start side, control on the end.
 * Rows stack inside a section Panel with dividers between them.
 */
export function SettingRow({ label, help, children, htmlFor }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {help && <p className="mt-0.5 text-[13px] leading-snug text-muted">{help}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}
