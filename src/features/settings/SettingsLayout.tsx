import type { ReactNode } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Heading, Text } from '@/components/ui'
import { cn } from '@/utils'
import {
  DEFAULT_SECTION,
  SETTINGS_NAV,
  findGroup,
  type SettingsGroupId,
} from './settingsNav'
import { RestaurantSettings } from './sections/RestaurantSettings'
import { ReservationsSettings } from './sections/ReservationsSettings'
import { FloorSettings } from './sections/FloorSettings'
import { ZonesSettings } from './sections/ZonesSettings'
import { StaffSettings } from './sections/StaffSettings'
import { SystemSettings } from './sections/SystemSettings'
import { SoonSettings } from './sections/SoonSettings'

/** Render the body for a ready group. Soon groups fall through to the placeholder. */
const READY_SECTIONS: Partial<Record<SettingsGroupId, () => ReactNode>> = {
  restaurant: () => <RestaurantSettings />,
  reservations: () => <ReservationsSettings />,
  floor: () => <FloorSettings />,
  zones: () => <ZonesSettings />,
  staff: () => <StaffSettings />,
  system: () => <SystemSettings />,
}

/**
 * Settings surface shell (Phase 11) — a sidebar of groups plus the active group's
 * page. The URL owns the active section (`/settings/:section`) so a group is
 * deep-linkable and the back button works. An unknown section redirects to the
 * default group.
 */
export function SettingsLayout() {
  const { t } = useTranslation('settings')
  const { section } = useParams()
  const group = findGroup(section)

  if (!group) return <Navigate to={`/settings/${DEFAULT_SECTION}`} replace />

  const renderReady = READY_SECTIONS[group.id]

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <Heading level={1}>{t('title')}</Heading>
        <Text muted className="mt-1">
          {t('subtitle')}
        </Text>
      </header>

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[200px_1fr] md:gap-10">
        <nav
          aria-label={t('title')}
          className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0"
        >
          {SETTINGS_NAV.map((g) => (
            <NavLink
              key={g.id}
              to={`/settings/${g.id}`}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
                  isActive ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                )
              }
            >
              <span className="flex items-center gap-2.5">
                <GroupIcon id={g.id} />
                {t(`nav.${g.id}`)}
              </span>
              {g.status === 'soon' && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  {t('soonTag')}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-8">
          {renderReady ? renderReady() : <SoonSettings group={group.id} />}
        </div>
      </div>
    </div>
  )
}

/** Minimal stroke glyph per settings group (no icon dependency — matches the app). */
function GroupIcon({ id }: { id: SettingsGroupId }) {
  const p = {
    className: 'h-4 w-4 shrink-0',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (id) {
    case 'restaurant':
      return (
        <svg {...p}>
          <path d="M4 9h16l-1 11H5L4 9Z" />
          <path d="M4 9 6 4h12l2 5" />
        </svg>
      )
    case 'reservations':
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" />
        </svg>
      )
    case 'floor':
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 9v12" />
        </svg>
      )
    case 'zones':
      return (
        <svg {...p}>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      )
    case 'staff':
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a6 6 0 0 0-4-5.6" />
        </svg>
      )
    case 'system':
      return (
        <svg {...p}>
          <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="16" cy="18" r="2" />
        </svg>
      )
  }
}
