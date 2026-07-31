import type { EffectiveTable } from '@/services/floor'
import { statusLabel } from './status'

interface FloorTableMenuProps {
  table: EffectiveTable
  /** Seated party's name, when occupied. */
  reservationName?: string
  /** Show the rotate action (hidden for a merged member). */
  canRotate: boolean
  /** Show the split action (a runtime-merged table). */
  canSplit: boolean
  onBlock: () => void
  onUnblock: () => void
  onFinishCleaning: () => void
  onClear: () => void
  onRotate: () => void
  onSplit: () => void
  onClose: () => void
}

const action =
  'w-full rounded-lg px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-surface-2'

/**
 * Contextual actions for a tapped table, pinned to the top-left of the floor so
 * it never covers the table or the canvas. Which actions show depends on the
 * table's effective status — occupied clears, cleaning finishes turnover, blocked
 * unblocks, and a free table blocks.
 */
export function FloorTableMenu({
  table,
  reservationName,
  canRotate,
  canSplit,
  onBlock,
  onUnblock,
  onFinishCleaning,
  onClear,
  onRotate,
  onSplit,
  onClose,
}: FloorTableMenuProps) {
  const { status } = table

  return (
    <div className="absolute left-3 top-3 z-20">
      <div className="min-w-44 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <span className="truncate text-xs font-medium text-ink">
            {reservationName ?? `Table ${table.base.label}`}
          </span>
          <span
            className="flex items-center gap-1 text-xs text-muted"
            title={statusLabel[status]}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--color-status-${status})` }}
            />
            {statusLabel[status]}
          </span>
        </div>

        {status === 'occupied' && (
          <button className={action} onClick={onClear}>
            Clear table
          </button>
        )}
        {status === 'cleaning' && (
          <button className={action} onClick={onFinishCleaning}>
            Finish cleaning
          </button>
        )}
        {status === 'blocked' ? (
          <button className={action} onClick={onUnblock}>
            Unblock
          </button>
        ) : (
          status !== 'occupied' && (
            <button className={action} onClick={onBlock}>
              Block
            </button>
          )
        )}
        {canSplit && (
          <button className={action} onClick={onSplit}>
            Split
          </button>
        )}
        {canRotate && (
          <button className={action} onClick={onRotate}>
            Rotate 90°
          </button>
        )}
        <button className={`${action} text-muted`} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
