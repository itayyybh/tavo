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
  label: string
}

interface Group {
  title: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    rows: [
      {
        keys: (
          <>
            <Key>↑</Key>
            <Key>↓</Key>
          </>
        ),
        label: 'Navigate reservations',
      },
      { keys: <Key>Enter</Key>, label: 'Open selected reservation' },
    ],
  },
  {
    title: 'Search',
    rows: [
      { keys: <Key>/</Key>, label: 'Focus search' },
      {
        keys: (
          <>
            <Key>⌘</Key>
            <Key>F</Key>
          </>
        ),
        label: 'Focus search',
      },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { keys: <Key>N</Key>, label: 'New reservation' },
      { keys: <Key>E</Key>, label: 'Edit selected reservation' },
      { keys: <Key>Delete</Key>, label: 'Delete selected reservation' },
    ],
  },
  {
    title: 'General',
    rows: [
      { keys: <Key>Esc</Key>, label: 'Clear search / close dialogs' },
      {
        keys: (
          <>
            <Key>⌘</Key>
            <Key>K</Key>
          </>
        ),
        label: 'Command palette',
      },
      { keys: <Key>?</Key>, label: 'Keyboard shortcuts' },
    ],
  },
]

/** Keyboard shortcuts reference (opened with `?`). ⌘ = Cmd on macOS, Ctrl elsewhere. */
export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {group.title}
            </span>
            {group.rows.map((row, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-soft">{row.label}</span>
                <span className="flex shrink-0 items-center gap-1">{row.keys}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">⌘ is Cmd on macOS, Ctrl on Windows/Linux.</p>
    </Dialog>
  )
}
