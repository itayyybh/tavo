import { Trans, useTranslation } from 'react-i18next'
import { Button, Dialog, Text } from '@/components/ui'
import type { Reservation } from '@/types'

interface DeleteConfirmDialogProps {
  /** The reservation pending deletion, or null when closed. */
  reservation: Reservation | null
  onClose: () => void
  onConfirm: (id: string) => void
  /**
   * `false` (default) — a soft delete that moves the reservation to History and
   * can be restored. `true` — a permanent purge from History, no recovery. Only
   * the copy + button emphasis change; the caller supplies the actual action.
   */
  permanent?: boolean
}

/** Confirmation for removing a reservation (soft to History, or a permanent purge). */
export function DeleteConfirmDialog({
  reservation,
  onClose,
  onConfirm,
  permanent = false,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation('reservations')
  const k = permanent ? 'delete' : 'remove'
  return (
    <Dialog open={!!reservation} onClose={onClose} title={t(`${k}.title`)}>
      {reservation && (
        <div className="flex flex-col gap-5">
          <Text muted>
            <Trans
              t={t}
              i18nKey={`${k}.body`}
              values={{ name: reservation.guestName, size: reservation.partySize }}
              components={{ name: <span className="font-medium text-ink" /> }}
            />
          </Text>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t(`${k}.keep`)}
            </Button>
            <Button
              variant={permanent ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm(reservation.id)
                onClose()
              }}
            >
              {t(`${k}.confirm`)}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
