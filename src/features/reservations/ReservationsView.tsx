import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Heading, Input } from '@/components/ui'
import { useLayoutStore, useSettingsStore } from '@/stores'
import type { ID, Reservation } from '@/types'
import { cn, floorTotals } from '@/utils'
import { useReservationFilters } from './hooks/useReservationFilters'
import { ReservationFilters } from './ReservationFilters'
import { ReservationList, type ZoneMeta } from './ReservationList'
import { SeatingPanel } from './SeatingPanel'
import { ReservationSummary } from './ReservationSummary'
import { ServiceLoadChart } from './ServiceLoadChart'
import { ReservationTimeline } from './ReservationTimeline'
import { ReservationDialog } from './ReservationDialog'
import { useReservationStore } from '@/stores'
import { buildSampleReservations } from './sampleData'
import { useReservationShortcuts } from './hooks/useReservationShortcuts'
import { useAssignAll } from './hooks/useAssignAll'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { CommandPalettePlaceholder } from './CommandPalettePlaceholder'
import { ShortcutsHelp } from './ShortcutsHelp'

type ViewMode = 'list' | 'timeline'

/**
 * Reservation Engine surface — search, filter, list/timeline, and CRUD.
 * Reads the reservation store (+ zones as read-only config); no table coupling.
 */
export function ReservationsView() {
  // Reservation hydration + realtime is lifted app-wide (see App -> useReservationSync).
  const { t } = useTranslation('reservations')

  const zones = useLayoutStore((s) => s.zones)
  const tables = useLayoutStore((s) => s.tables)
  const tableTypes = useLayoutStore((s) => s.tableTypes)
  const mergedGroups = useLayoutStore((s) => s.mergedGroups)
  const removeReservation = useReservationStore((s) => s.removeReservation)
  const addReservation = useReservationStore((s) => s.addReservation)
  const replaceAll = useReservationStore((s) => s.replaceAll)
  const { state, patch, results, slotSource } = useReservationFilters()
  const {
    assignAll,
    assignableCount,
    clearAll: clearTableAssignments,
    assignedCount,
  } = useAssignAll()

  // Total floor seats — lets the load chart show occupancy against real capacity
  // (free space = the visible remainder). Read-only; no reservation↔table coupling.
  const floorCapacity = useMemo(
    () => floorTotals(tables, tableTypes, mergedGroups).seats,
    [tables, tableTypes, mergedGroups],
  )
  const bufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)

  const seedSamples = () => {
    buildSampleReservations({ zones, tables, tableTypes, bufferMin }).forEach(addReservation)
  }
  const clearAll = () => replaceAll([])

  const [view, setView] = useState<ViewMode>('list')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Reservation | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const zoneChoices = useMemo(
    () => zones.map((z) => ({ id: z.id, name: z.name, color: z.color })),
    [zones],
  )
  const zoneMeta = useMemo<Map<ID, ZoneMeta>>(
    () => new Map(zones.map((z) => [z.id, { name: z.name, color: z.color }])),
    [zones],
  )
  // Table id → label, so a row can show its reserved table(s) (Phase 7).
  const tableLabels = useMemo<Map<ID, string>>(
    () => new Map(tables.map((t) => [t.id, t.label])),
    [tables],
  )

  const [helpOpen, setHelpOpen] = useState(false)

  const openCreate = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }
  const openEdit = (reservation: Reservation) => {
    setEditing(reservation)
    setDialogOpen(true)
  }

  const focusSearch = () => document.getElementById('reservation-search')?.focus()

  // Move keyboard selection through the visible list, scrolling the row into view.
  const navigate = (dir: 1 | -1) => {
    if (results.length === 0) return
    const idx = results.findIndex((r) => r.id === selectedId)
    const next =
      idx === -1
        ? dir === 1
          ? 0
          : results.length - 1
        : Math.min(results.length - 1, Math.max(0, idx + dir))
    const id = results[next].id
    setSelectedId(id)
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-reservation-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    )
  }

  const selected = results.find((r) => r.id === selectedId)

  // Shortcuts are disabled while any modal is open (dialogs own their own Escape).
  const active = !(dialogOpen || paletteOpen || helpOpen || !!deleteTarget)

  useReservationShortcuts(
    {
      onNew: openCreate,
      onFocusSearch: focusSearch,
      onEscape: () => {
        if (state.query) patch({ query: '' })
        ;(document.getElementById('reservation-search') as HTMLInputElement | null)?.blur()
      },
      onNavigate: navigate,
      onOpenSelected: () => selected && openEdit(selected),
      onEditSelected: () => selected && openEdit(selected),
      onDeleteSelected: () => selected && setDeleteTarget(selected),
      onOpenPalette: () => setPaletteOpen(true),
      onOpenHelp: () => setHelpOpen(true),
    },
    active,
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {/* Header. */}
      <div className="flex items-end justify-between">
        <Heading level={1}>{t('title')}</Heading>
        <div className="flex items-center gap-2">
          {import.meta.env.DEV && (
            <>
              <Button variant="secondary" onClick={seedSamples}>
                {t('seed20')}
              </Button>
              <Button variant="ghost" onClick={clearAll}>
                {t('clearAll')}
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            aria-label={t('shortcutsAria')}
            title={t('shortcutsTitle')}
            onClick={() => setHelpOpen(true)}
          >
            ?
          </Button>
          {assignableCount > 0 && (
            <Button variant="secondary" onClick={assignAll}>
              {t('assignAll', { count: assignableCount })}
            </Button>
          )}
          {assignedCount > 0 && (
            <Button variant="ghost" onClick={clearTableAssignments}>
              {t('clearTables', { count: assignedCount })}
            </Button>
          )}
          <Button onClick={openCreate}>{t('new')}</Button>
        </div>
      </div>

      {/* Service dashboard. */}
      <ReservationSummary reservations={results} />

      {/* Search + view toggle. */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            id="reservation-search"
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {(['list', 'timeline'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200',
                view === mode ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
              )}
            >
              {t(`view.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <ReservationFilters state={state} patch={patch} zones={zoneChoices} />

      {view === 'list' ? (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <ReservationList
              reservations={results}
              zoneMeta={zoneMeta}
              tableLabels={tableLabels}
              selectedId={selectedId ?? undefined}
              onSelect={setSelectedId}
              onEdit={openEdit}
              onDelete={removeReservation}
            />
          </div>
          <aside className="hidden w-64 shrink-0 md:block">
            <div className="sticky top-6 flex flex-col gap-4">
              {selected && <SeatingPanel reservation={selected} />}
              <ServiceLoadChart
                reservations={slotSource}
                capacity={floorCapacity}
                activeStart={state.slotStart}
                onSelect={(slotStart) => patch({ slotStart })}
              />
            </div>
          </aside>
        </div>
      ) : (
        <ReservationTimeline reservations={results} onEdit={openEdit} />
      )}

      <ReservationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
      />
      <DeleteConfirmDialog
        reservation={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeReservation}
      />
      <CommandPalettePlaceholder
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
