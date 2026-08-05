import { useTranslation } from 'react-i18next'
import { Button, Dialog, Text } from '@/components/ui'

interface ClearAllConfirmDialogProps {
  open: boolean
  /** How many reservations will be deleted — shown in the body. */
  count: number
  onClose: () => void
  onConfirm: () => void
}

/** Confirmation for permanently deleting every reservation (Clear All). */
export function ClearAllConfirmDialog({
  open,
  count,
  onClose,
  onConfirm,
}: ClearAllConfirmDialogProps) {
  const { t } = useTranslation('reservations')
  return (
    <Dialog open={open} onClose={onClose} title={t('clearAllConfirm.title')}>
      <div className="flex flex-col gap-5">
        <Text muted>{t('clearAllConfirm.body', { count })}</Text>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('clearAllConfirm.keep')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {t('clearAllConfirm.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
