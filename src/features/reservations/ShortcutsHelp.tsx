import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui'
import type { ReactNode } from 'react'

interface ShortcutsHelpProps {
  open: boolean
  onClose: () => void
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
      {children}
    </kbd>
  )
}

interface Row {
  keys: ReactNode
  labelKey: string
}

interface Group {
  titleKey: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    titleKey: 'shortcuts.nav',
    rows: [
      {
        keys: (
          <>
            <Key>↑</Key>
            <Key>↓</Key>
          </>
        ),
        labelKey: 'shortcuts.navigate',
      },
      { keys: <Key>Enter</Key>, labelKey: 'shortcuts.openSelected' },
    ],
  },
  {
    titleKey: 'shortcuts.search',
    rows: [
      { keys: <Key>/</Key>, labelKey: 'shortcuts.focusSearch' },
      {
        keys: (
          <>
            <Key>⌘</Key>
            <Key>F</Key>
          </>
        ),
        labelKey: 'shortcuts.focusSearch',
      },
    ],
  },
  {
    titleKey: 'shortcuts.actions',
    rows: [
      { keys: <Key>N</Key>, labelKey: 'shortcuts.new' },
      { keys: <Key>E</Key>, labelKey: 'shortcuts.editSelected' },
      { keys: <Key>Delete</Key>, labelKey: 'shortcuts.deleteSelected' },
    ],
  },
  {
    titleKey: 'shortcuts.general',
    rows: [
      { keys: <Key>Esc</Key>, labelKey: 'shortcuts.clearClose' },
      {
        keys: (
          <>
            <Key>⌘</Key>
            <Key>K</Key>
          </>
        ),
        labelKey: 'shortcuts.commandPalette',
      },
      { keys: <Key>?</Key>, labelKey: 'shortcuts.shortcutsRef' },
    ],
  },
]

/** Keyboard shortcuts reference (opened with `?`). ⌘ = Cmd on macOS, Ctrl elsewhere. */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation('reservations')
  return (
    <Dialog open={open} onClose={onClose} title={t('shortcuts.title')}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <div key={group.titleKey} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t(group.titleKey)}
            </span>
            {group.rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft">{t(row.labelKey)}</span>
                <span className="flex shrink-0 items-center gap-1">{row.keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">{t('shortcuts.footnote')}</p>
    </Dialog>
  )
}
