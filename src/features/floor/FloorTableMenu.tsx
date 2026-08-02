import type { EffectiveTable } from '@/services/floor'
import { statusLabel } from './status'

/** Occupied-table details for the card. */
interface Occupancy {
  /** The party's window, e.g. `17:00 – 19:00`. */
  timeRange: string
  partySize: number
  /** The next booking on these tables (who's coming, and when). */
  next?: { name: string; time: string }
}

interface FloorTableMenuProps {
  table: EffectiveTable
  /** Seated party's name, when occupied. */
  reservationName?: string
  /** Member labels for a merged table, e.g. `7 + 10 + 11` (omit for a single). */
  tablesLabel?: string
  /** Time window / party size / next booking, when occupied. */
  occupancy?: Occupancy
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
  tablesLabel,
  occupancy,
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
  // Header: the party's name when occupied, else the table(s) it names.
  const heading =
    reservationName ?? (tablesLabel ? `Tables ${tablesLabel}` : `Table ${table.base.label}`)

  return (
    <div className="absolute left-3 top-3 z-20">
      <div className="min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <span className="truncate text-xs font-medium text-ink">{heading}</span>
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

        {/* The connected tables (when a name owns the header) + occupied details. */}
        {(tablesLabel || occupancy) && (
          <div className="mb-1 space-y-0.5 border-b border-line px-2 pb-1.5 pt-0.5">
            {tablesLabel && reservationName && (
              <div className="text-[11px] text-muted">Tables {tablesLabel}</div>
            )}
            {occupancy && (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="tabular-nums text-ink">{occupancy.timeRange}</span>
                  <span className="text-muted">{occupancy.partySize}p</span>
                </div>
                <div className="text-[11px] text-muted">
                  {occupancy.next
                    ? `Next: ${occupancy.next.name} · ${occupancy.next.time}`
                    : 'No next booking'}
                </div>
              </>
            )}
          </div>
        )}

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
