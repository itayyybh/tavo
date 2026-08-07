import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, Text } from '@/components/ui'
import { useLayoutStore, useSettingsStore } from '@/stores'
import type { PreferredCombo } from '@/types'
import { SettingsSection } from './SettingsSection'
import { NumberField } from './NumberField'

/** Split a "7, 10, 11 + 12" style entry into trimmed, de-duplicated labels. */
function parseCombo(raw: string): string[] {
  return [...new Set(raw.split(/[+,\s]+/).map((s) => s.trim()).filter(Boolean))]
}

/**
 * Preferred large-party combos editor (Phase 11 — Settings). A soft preference:
 * when a party at/above the threshold is seated in the zone, the listed table set
 * is offered first (scored higher), but the engine may still fall back to others.
 * Stored in the seating merge config (autosaved).
 */
export function PreferredCombosEditor() {
  const { t } = useTranslation('settings')
  const zones = useLayoutStore((s) => s.zones)
  const combos = useSettingsStore((s) => s.seating.merge.preferredCombos)
  const updateMergeConfig = useSettingsStore((s) => s.updateMergeConfig)

  const list = useMemo(() => combos ?? [], [combos])
  const [zoneName, setZoneName] = useState('')
  const [minPartySize, setMinPartySize] = useState(8)
  const [comboText, setComboText] = useState('')

  const zoneOptions = zones.map((z) => ({ value: z.name, label: z.name }))
  const canAdd = zoneName !== '' && parseCombo(comboText).length >= 2

  const add = () => {
    const combo = parseCombo(comboText)
    if (!zoneName || combo.length < 2) return
    const entry: PreferredCombo = { zoneName, minPartySize, combo }
    updateMergeConfig({ preferredCombos: [...list, entry] })
    setComboText('')
  }

  const remove = (index: number) =>
    updateMergeConfig({ preferredCombos: list.filter((_, i) => i !== index) })

  return (
    <SettingsSection title={t('preferredCombos.title')} description={t('preferredCombos.description')}>
      {/* Add a combo */}
      <div className="flex flex-wrap items-end gap-3 pb-1">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {t('preferredCombos.zone')}
          <Select
            className="w-40"
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            placeholder={t('preferredCombos.selectZone')}
            options={zoneOptions}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {t('preferredCombos.minParty')}
          <NumberField value={minPartySize} onCommit={setMinPartySize} min={1} max={100} />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[13px] text-muted">
          {t('preferredCombos.tables')}
          <Input
            value={comboText}
            onChange={(e) => setComboText(e.target.value)}
            placeholder={t('preferredCombos.tablesPlaceholder')}
          />
        </label>
        <Button variant="secondary" onClick={add} disabled={!canAdd}>
          {t('preferredCombos.add')}
        </Button>
      </div>

      {list.length > 0 && <div className="my-1 h-px bg-line" />}

      {list.length === 0 ? (
        <Text muted className="pt-2 text-[13px]">
          {t('preferredCombos.empty')}
        </Text>
      ) : (
        <div className="flex flex-col">
          {list.map((c, i) => (
            <div
              key={`${c.zoneName}-${i}`}
              className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0"
            >
              <p className="min-w-0 text-sm text-ink">
                <span className="font-medium">{c.zoneName}</span>
                <span className="text-muted">
                  {' · '}
                  {t('preferredCombos.partyAtLeast', { n: c.minPartySize })}
                  {' · '}
                </span>
                {c.combo.join(' + ')}
              </p>
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 text-[13px] text-muted transition-colors hover:text-status-occupied"
              >
                {t('preferredCombos.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}
