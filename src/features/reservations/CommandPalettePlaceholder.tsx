import { Trans, useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('reservations')
  return (
    <Dialog open={open} onClose={onClose} title={t('palette.title')}>
      <div className="flex flex-col gap-2">
        <Text muted>{t('palette.body')}</Text>
        <Text muted className="text-xs">
          <Trans
            t={t}
            i18nKey="palette.escHint"
            components={{
              kbd: (
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink" />
              ),
            }}
          />
        </Text>
      </div>
    </Dialog>
  )
}
