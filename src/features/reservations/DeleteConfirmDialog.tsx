import { Trans, useTranslation } from 'react-i18next'
import { Button, Dialog, Text } from '@/components/ui'
import type { Reservation } from '@/types'

interface DeleteConfirmDialogProps {
  /** The reservation pending deletion, or null when closed. */
  reservation: Reservation | null
  onClose: () => void
  onConfirm: (id: string) => void
}

/** Confirmation for permanently deleting a reservation. */
export function DeleteConfirmDialog({
  reservation,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('reservations')
  return (
    <Dialog open={!!reservation} onClose={onClose} title={t('delete.title')}>
      {reservation && (
        <div className="flex flex-col gap-5">
          <Text muted>
            <Trans
              t={t}
              i18nKey="delete.body"
              values={{ name: reservation.guestName, size: reservation.partySize }}
              components={{ name: <span className="font-medium text-ink" /> }}
            />
          </Text>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('delete.keep')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onConfirm(reservation.id)
                onClose()
              }}
            >
              {t('delete.delete')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
