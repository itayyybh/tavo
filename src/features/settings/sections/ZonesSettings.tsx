import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, Toggle, Text } from '@/components/ui'
import { useLayoutStore } from '@/stores'
import { zoneAllowsRelocation } from '@/utils'
import type { Zone } from '@/types'
import { SettingsSection } from '../SettingsSection'

/**
 * Zones settings group — per-zone policy (smoking, cross-zone table relocation)
 * and availability (open for bookings). Reads the layout store's zones and edits
 * them through `updateZone`, so changes ride the layout autosave. Geometry and
 * naming stay in the layout editor; this surfaces the non-visual policy.
 */
export function ZonesSettings() {
  const { t } = useTranslation('settings')
  const zones = useLayoutStore((s) => s.zones)
  const updateZone = useLayoutStore((s) => s.updateZone)

  if (zones.length === 0) {
    return (
      <SettingsSection title={t('zones.title')} description={t('zones.description')}>
        <div className="px-1 py-6 text-center">
          <Text muted className="text-[13px]">
            {t('zones.empty')}
          </Text>
        </div>
      </SettingsSection>
    )
  }

  const smokingOptions = [
    { value: 'none', label: t('zones.smoking.none') },
    { value: 'non-smoking', label: t('zones.smoking.non') },
    { value: 'smoking', label: t('zones.smoking.yes') },
  ]

  const arrangeOptions = [
    { value: 'auto', label: t('zones.arrange.auto') },
    { value: 'horizontal', label: t('zones.arrange.horizontal') },
    { value: 'vertical', label: t('zones.arrange.vertical') },
  ]

  return (
    <>
      <SettingsSection title={t('zones.title')} description={t('zones.description')}>
        {zones.map((zone) => (
          <ZoneRow key={zone.id} zone={zone}>
            <div className="flex items-center gap-4">
              <Select
                className="w-40"
                aria-label={t('zones.smoking.label')}
                value={zone.smoking ?? 'none'}
                onChange={(e) =>
                  updateZone(zone.id, {
                    smoking:
                      e.target.value === 'none'
                        ? undefined
                        : (e.target.value as Zone['smoking']),
                  })
                }
                options={smokingOptions}
              />
              <Select
                className="w-36"
                aria-label={t('zones.arrange.label')}
                value={zone.arrangeDir ?? 'auto'}
                onChange={(e) =>
                  updateZone(zone.id, {
                    arrangeDir:
                      e.target.value === 'auto'
                        ? undefined
                        : (e.target.value as Zone['arrangeDir']),
                  })
                }
                options={arrangeOptions}
              />
              <label className="flex items-center gap-2 text-[13px] text-muted">
                {t('zones.relocation.short')}
                <Toggle
                  checked={zone.allowTableRelocation ?? zoneAllowsRelocation(zone)}
                  onChange={(v) => updateZone(zone.id, { allowTableRelocation: v })}
                  aria-label={t('zones.relocation.label', { zone: zone.name })}
                />
              </label>
            </div>
          </ZoneRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title={t('zones.availability.title')}
        description={t('zones.availability.description')}
      >
        {zones.map((zone) => (
          <ZoneRow key={zone.id} zone={zone}>
            <Toggle
              checked={zone.bookable ?? true}
              onChange={(v) => updateZone(zone.id, { bookable: v })}
              aria-label={t('zones.availability.label', { zone: zone.name })}
            />
          </ZoneRow>
        ))}
      </SettingsSection>
    </>
  )
}

/** One zone's row: colour swatch + name on the start, controls on the end. */
function ZoneRow({ zone, children }: { zone: Zone; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
          style={{ backgroundColor: zone.color }}
        />
        <span className="truncate text-sm font-medium text-ink">{zone.name}</span>
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}
