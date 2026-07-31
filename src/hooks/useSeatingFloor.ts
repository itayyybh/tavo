import { useMemo } from 'react'
import { useLayoutStore, useSettingsStore } from '@/stores'
import type { SeatingFloor } from '@/services/seating/types'

/**
 * Assemble the read-only `SeatingFloor` snapshot the Seating Engine reasons over,
 * from the layout + settings stores. Memoized on the underlying slices so it only
 * changes when the floor or seating config actually does. The engine itself stays
 * store-free; this hook is the single bridge the UI uses.
 */
export function useSeatingFloor(): SeatingFloor {
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const zones = useLayoutStore((s) => s.zones)
  const obstacles = useLayoutStore((s) => s.obstacles)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const config = useSettingsStore((s) => s.seating)

  return useMemo(
    () => ({ tables, tableTypes, zones, obstacles, mergedGroups, config }),
    [tables, tableTypes, zones, obstacles, mergedGroups, config],
  )
}
