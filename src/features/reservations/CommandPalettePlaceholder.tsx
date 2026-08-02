import { Dialog, Text } from '@/components/ui'

interface CommandPalettePlaceholderProps {
  open: boolean
  onClose: () => void
}

/**
 * Placeholder for a future command palette (⌘K). Real quick-actions arrive with
 * the Seating Engine / Host Experience phases; this reserves the shortcut + slot.
 */
export function CommandPalettePlaceholder({
  open,
  onClose,
}: CommandPalettePlaceholderProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Command palette">
      <div className="flex flex-col gap-2">
        <Text muted>Quick actions and navigation are coming in a later phase.</Text>
        <Text muted className="text-xs">
          Press{' '}
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink">
            Esc
          </kbd>{' '}
          to close.
        </Text>
      </div>
    </Dialog>
  )
}
