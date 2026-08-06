/**
 * Settings navigation model (Phase 11 — Settings shell). The single source of
 * truth for the sidebar: which groups exist, their order, and whether a group is
 * built yet (`ready`) or a roadmap placeholder (`soon`). The layout renders the
 * sidebar from this, and the router resolves `/settings/:section` against it.
 *
 * Labels are not stored here — they come from the `settings` i18n namespace
 * (`nav.<id>`) so the sidebar is translatable.
 */
export type SettingsGroupId =
  | 'restaurant'
  | 'reservations'
  | 'floor'
  | 'zones'
  | 'staff'
  | 'system'

export interface SettingsGroup {
  id: SettingsGroupId
  /** `ready` groups have a page; `soon` render a muted "coming soon" placeholder. */
  status: 'ready' | 'soon'
}

export const SETTINGS_NAV: readonly SettingsGroup[] = [
  { id: 'restaurant', status: 'ready' },
  { id: 'reservations', status: 'ready' },
  { id: 'floor', status: 'ready' },
  { id: 'zones', status: 'ready' },
  { id: 'staff', status: 'ready' },
  { id: 'system', status: 'ready' },
]

/** The group shown when `/settings` is opened with no explicit section. */
export const DEFAULT_SECTION: SettingsGroupId = 'restaurant'

/** Look up a group by id (undefined if the id isn't a known section). */
export function findGroup(id: string | undefined): SettingsGroup | undefined {
  return SETTINGS_NAV.find((g) => g.id === id)
}
