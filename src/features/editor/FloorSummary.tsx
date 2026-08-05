import { useTranslation } from 'react-i18next'
import { useLayoutStore } from '@/stores'
import { floorTotals } from '@/utils'

/** Compact live tally of tables + seats on the floor. Isolated so it can update
 * without re-rendering the surrounding page. */
export function FloorSummary() {
  const { t } = useTranslation('editor')
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const { tables: count, seats } = floorTotals(tables, tableTypes, mergedGroups)

  return (
    <span className="tabular-nums text-ink">
      {t('summary.table', { count })} · {t('summary.seat', { count: seats })}
    </span>
  )
}
