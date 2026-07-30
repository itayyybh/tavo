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
  return (
    <Dialog open={!!reservation} onClose={onClose} title="Delete reservation">
      {reservation && (
        <div className="flex flex-col gap-5">
          <Text muted>
            Permanently delete the reservation for{' '}
            <span className="font-medium text-ink">{reservation.guestName}</span> (party
            of {reservation.partySize})? This can’t be undone.
          </Text>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Keep
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onConfirm(reservation.id)
                onClose()
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
