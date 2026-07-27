import type { ReactNode } from 'react'
import { useLayoutStore } from '@/stores'
import type { TableShape } from '@/types'
import { cn } from '@/utils'

/** Uncontrolled text input that commits on blur/Enter and reverts empty to the
 * current value. `key` remounts it when the value changes externally (e.g. undo). */
function TextField({
  value,
  onCommit,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => onCommit(e.currentTarget.value.trim() || value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.currentTarget.value = value
          e.currentTarget.blur()
        }
      }}
      className={cn(
        'rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20',
        className,
      )}
    />
  )
}

/** Uncontrolled number input; commits a clamped value on blur/Enter. */
function NumField({
  value,
  min = 0,
  onCommit,
}: {
  value: number
  min?: number
  onCommit: (n: number) => void
}) {
  return (
    <input
      key={value}
      type="number"
      min={min}
      defaultValue={value}
      onBlur={(e) => {
        const n = Number(e.currentTarget.value)
        onCommit(Number.isFinite(n) ? Math.max(min, n) : value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-full rounded border border-line bg-surface px-1.5 py-1 text-sm tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
    />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {label}
      {children}
    </label>
  )
}

/** Manage configurable table types — capacities/geometry are never hardcoded. */
export function TableTypesPanel() {
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const tables = useLayoutStore((s) => s.tables)
  const addTableType = useLayoutStore((s) => s.addTableType)
  const updateTableType = useLayoutStore((s) => s.updateTableType)
  const removeTableType = useLayoutStore((s) => s.removeTableType)

  const countFor = (typeId: string) => tables.filter((t) => t.typeId === typeId).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-2">
        <button
          onClick={addTableType}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <span className="text-base leading-none">+</span> New type
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {tableTypes.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted">
            No table types — add one with the + above.
          </p>
        )}
        {tableTypes.map((type) => {
          const used = countFor(type.id)
          return (
            <div key={type.id} className="space-y-2 rounded-lg border border-line p-2.5">
              <div className="flex items-center gap-2">
                <TextField
                  value={type.name}
                  onCommit={(name) => updateTableType(type.id, { name })}
                  className="min-w-0 flex-1 font-medium"
                />
                <button
                  aria-label={`Delete ${type.name}`}
                  title={used > 0 ? `In use by ${used} table${used === 1 ? '' : 's'}` : 'Delete type'}
                  disabled={used > 0}
                  onClick={() => removeTableType(type.id)}
                  className="shrink-0 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ✕
                </button>
              </div>

              <label className="flex items-center justify-between text-[11px] text-muted">
                Shape
                <select
                  value={type.shape}
                  onChange={(e) =>
                    updateTableType(type.id, { shape: e.target.value as TableShape })
                  }
                  className="rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                >
                  <option value="square">Square</option>
                  <option value="round">Round</option>
                  <option value="rectangle">Rectangle</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Width">
                  <NumField
                    value={type.defaultSize.x}
                    min={20}
                    onCommit={(x) =>
                      updateTableType(type.id, { defaultSize: { ...type.defaultSize, x } })
                    }
                  />
                </Field>
                <Field label="Height">
                  <NumField
                    value={type.defaultSize.y}
                    min={20}
                    onCommit={(y) =>
                      updateTableType(type.id, { defaultSize: { ...type.defaultSize, y } })
                    }
                  />
                </Field>
                <Field label="Clearance">
                  <NumField
                    value={type.clearance}
                    onCommit={(clearance) => updateTableType(type.id, { clearance })}
                  />
                </Field>
                <div />
                <Field label="Solo seats">
                  <NumField
                    value={type.soloCapacity}
                    onCommit={(soloCapacity) => updateTableType(type.id, { soloCapacity })}
                  />
                </Field>
                <Field label="Connected seats">
                  <NumField
                    value={type.connectedCapacity}
                    onCommit={(connectedCapacity) =>
                      updateTableType(type.id, { connectedCapacity })
                    }
                  />
                </Field>
              </div>

              <p className="text-[11px] text-muted">
                Used by {used} table{used === 1 ? '' : 's'}
              </p>
            </div>
          )
        })}
      </div>

      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        Size applies to new tables; existing tables keep their current size.
      </p>
    </div>
  )
}
