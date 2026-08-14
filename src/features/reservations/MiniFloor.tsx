import { useMemo } from 'react'
import type { EffectiveFloor } from '@/services/floor'
import type { TableType } from '@/types'

interface MiniFloorProps {
  /** Derived floor (carries each table's status + preview overlay). */
  effective: EffectiveFloor
  /** Table types — resolves each table's shape (round vs rectangular). */
  tableTypes: TableType[]
}

/** Padding (world units) around the shown tables so nothing touches the edge. */
const PAD = 24
/** Cap the rendered height so the panel stays compact. */
const MAX_HEIGHT = 190

/** Stroke + fill for a table's real status — the backdrop a preview sits on. */
function statusStyle(status: string): { stroke: string; fill: string; fillOpacity: number } {
  switch (status) {
    case 'occupied':
      return { stroke: 'var(--color-status-occupied)', fill: 'var(--color-status-occupied)', fillOpacity: 0.14 }
    case 'reserved':
      return { stroke: 'var(--color-status-reserved)', fill: 'var(--color-status-reserved)', fillOpacity: 0.12 }
    case 'blocked':
    case 'cleaning':
      return { stroke: 'var(--color-muted)', fill: 'var(--color-muted)', fillOpacity: 0.1 }
    default:
      return { stroke: 'var(--color-line)', fill: 'var(--color-surface)', fillOpacity: 1 }
  }
}

/**
 * A compact, read-only top-down snapshot of the floor for seating PREVIEW (Phase
 * 12). Shows only the zones the host is previewing into, painting each table by
 * its real status and layering the dashed preview accent on the hypothetical
 * targets — the same visual language as the Live Floor, in miniature. Pure SVG
 * (no Konva): light, theme-aware via CSS variables, non-interactive. Renders
 * nothing when no preview is active; the parent decides when to show it.
 */
export function MiniFloor({ effective, tableTypes }: MiniFloorProps) {
  const shapeById = useMemo(
    () => new Map(tableTypes.map((t) => [t.id, t.shape])),
    [tableTypes],
  )

  // Show the zones being previewed into: every table sharing a zone with a
  // previewed one, so the target reads in context rather than floating alone.
  const previewedZones = useMemo(() => {
    const zones = new Set<string>()
    for (const et of effective.tables) if (et.preview) zones.add(et.base.zoneId)
    return zones
  }, [effective.tables])

  const shown = useMemo(
    () => effective.tables.filter((et) => previewedZones.has(et.base.zoneId)),
    [effective.tables, previewedZones],
  )

  const box = useMemo(() => {
    if (shown.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const et of shown) {
      const { x, y } = et.position
      const { x: w, y: h } = et.base.size
      minX = Math.min(minX, x - w / 2)
      minY = Math.min(minY, y - h / 2)
      maxX = Math.max(maxX, x + w / 2)
      maxY = Math.max(maxY, y + h / 2)
    }
    return {
      x: minX - PAD,
      y: minY - PAD,
      width: maxX - minX + PAD * 2,
      height: maxY - minY + PAD * 2,
    }
  }, [shown])

  if (!box || shown.length === 0) return null

  const aspect = box.height / box.width
  const height = Math.min(MAX_HEIGHT, Math.round(256 * aspect))

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Seating preview"
      >
        {shown.map((et) => {
          const { x, y } = et.position
          const { x: w, y: h } = et.base.size
          const round = shapeById.get(et.base.typeId) === 'round'
          const base = statusStyle(et.status)
          const previewColor = et.preview
            ? et.preview.contested
              ? 'var(--color-muted)'
              : et.preview.color
            : undefined
          const stroke = previewColor ?? base.stroke
          const fill = previewColor ?? base.fill
          const fillOpacity = previewColor ? 0.16 : base.fillOpacity
          const common = {
            stroke,
            strokeWidth: previewColor ? 2 : 1,
            strokeDasharray: previewColor ? '6 4' : undefined,
            fill,
            fillOpacity,
            transform: et.rotation ? `rotate(${et.rotation} ${x} ${y})` : undefined,
            vectorEffect: 'non-scaling-stroke' as const,
          }
          return round ? (
            <circle key={et.base.id} cx={x} cy={y} r={Math.min(w, h) / 2} {...common} />
          ) : (
            <rect
              key={et.base.id}
              x={x - w / 2}
              y={y - h / 2}
              width={w}
              height={h}
              rx={6}
              {...common}
            />
          )
        })}
      </svg>
    </div>
  )
}
