import { useTranslation } from 'react-i18next'
import { useLayoutStore } from '@/stores'
import type { TableShape } from '@/types'
import { Field, NumField, TextField } from './fields'

/** Manage configurable table types — capacities/geometry are never hardcoded. */
export function TableTypesPanel() {
  const { t } = useTranslation('editor')
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
          <span className="text-base leading-none">+</span> {t('types.newType')}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {tableTypes.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted">{t('types.emptyHint')}</p>
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
                  aria-label={t('types.deleteAria', { name: type.name })}
                  title={used > 0 ? t('types.inUse', { count: used }) : t('types.deleteType')}
                  disabled={used > 0}
                  onClick={() => removeTableType(type.id)}
                  className="shrink-0 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ✕
                </button>
              </div>

              <label className="flex items-center justify-between text-[11px] text-muted">
                {t('types.shape')}
                <select
                  value={type.shape}
                  onChange={(e) =>
                    updateTableType(type.id, { shape: e.target.value as TableShape })
                  }
                  className="rounded border border-line bg-surface px-1.5 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                >
                  <option value="square">{t('types.square')}</option>
                  <option value="round">{t('types.round')}</option>
                  <option value="rectangle">{t('types.rectangle')}</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t('types.width')}>
                  <NumField
                    value={type.defaultSize.x}
                    min={20}
                    onCommit={(x) =>
                      updateTableType(type.id, { defaultSize: { ...type.defaultSize, x } })
                    }
                  />
                </Field>
                <Field label={t('types.height')}>
                  <NumField
                    value={type.defaultSize.y}
                    min={20}
                    onCommit={(y) =>
                      updateTableType(type.id, { defaultSize: { ...type.defaultSize, y } })
                    }
                  />
                </Field>
                <Field label={t('types.clearance')}>
                  <NumField
                    value={type.clearance}
                    onCommit={(clearance) => updateTableType(type.id, { clearance })}
                  />
                </Field>
                <div />
                <Field label={t('types.soloSeats')}>
                  <NumField
                    value={type.soloCapacity}
                    onCommit={(soloCapacity) => updateTableType(type.id, { soloCapacity })}
                  />
                </Field>
                <Field label={t('types.connectedSeats')}>
                  <NumField
                    value={type.connectedCapacity}
                    onCommit={(connectedCapacity) =>
                      updateTableType(type.id, { connectedCapacity })
                    }
                  />
                </Field>
              </div>

              <p className="text-[11px] text-muted">{t('types.usedBy', { count: used })}</p>
            </div>
          )
        })}
      </div>

      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        {t('types.sizeNote')}
      </p>
    </div>
  )
}
