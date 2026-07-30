import { Dialog } from '@/components/ui'
import { useReservationStore } from '@/stores'
import type { Reservation } from '@/types'
import type { NewReservation } from '@/stores/reservationStore'
import { ReservationForm } from './ReservationForm'

interface ReservationDialogProps {
  open: boolean
  onClose: () => void
  /** Present when editing; absent when creating. */
  editing?: Reservation
}

/** Create/edit modal. Owns the store write so the form stays presentational. */
export function ReservationDialog({ open, onClose, editing }: ReservationDialogProps) {
  const addReservation = useReservationStore((s) => s.addReservation)
  const updateReservation = useReservationStore((s) => s.updateReservation)

  const handleSubmit = (input: NewReservation) => {
    if (editing) {
      updateReservation(editing.id, input)
    } else {
      addReservation(input)
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit reservation' : 'New reservation'}
    >
      {/* Remount per edit target so the form resets its local draft. */}
      {open && (
        <ReservationForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </Dialog>
  )
}
