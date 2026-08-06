import { useTranslation } from 'react-i18next'
import { Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { SettingRow } from '../SettingRow'
import { NumberField } from '../NumberField'
import { SettingsSection, SettingsDivider } from '../SettingsSection'
import { PreferredCombosEditor } from '../PreferredCombosEditor'

/**
 * Floor settings group — editor grid/drawing behaviour and the operational
 * seating rules (turnover, look-ahead, waitlist). Default/max stay times live in
 * Reservations › Default Values.
 */
export function FloorSettings() {
  const { t } = useTranslation('settings')

  const gridSize = useSettingsStore((s) => s.gridSize)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid)
  const pathWidth = useSettingsStore((s) => s.pathWidth)
  const setPathWidth = useSettingsStore((s) => s.setPathWidth)

  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const setAutoTurnover = useSettingsStore((s) => s.setAutoTurnover)
  const turnoverBufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  const updateSeatingConfig = useSettingsStore((s) => s.updateSeatingConfig)
  const reservedLookaheadMin = useSettingsStore((s) => s.reservedLookaheadMin)
  const setReservedLookaheadMin = useSettingsStore((s) => s.setReservedLookaheadMin)
  const waitlistEnabled = useSettingsStore((s) => s.waitlistEnabled)
  const setWaitlistEnabled = useSettingsStore((s) => s.setWaitlistEnabled)

  // Table rules (Seating Engine config).
  const merge = useSettingsStore((s) => s.seating.merge)
  const maxUnderfill = useSettingsStore((s) => s.seating.maxUnderfill)
  const weights = useSettingsStore((s) => s.seating.weights)
  const updateMergeConfig = useSettingsStore((s) => s.updateMergeConfig)

  return (
    <>
      <SettingsSection title={t('floor.title')} description={t('floor.description')}>
        <SettingRow label={t('floor.gridSize.label')} help={t('floor.gridSize.help')} htmlFor="set-grid">
          <NumberField id="set-grid" value={gridSize} onCommit={setGridSize} min={4} max={200} suffix={t('units')} />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('floor.snapToGrid.label')} help={t('floor.snapToGrid.help')} htmlFor="set-snap">
          <Toggle id="set-snap" checked={snapToGrid} onChange={setSnapToGrid} aria-label={t('floor.snapToGrid.label')} />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('floor.pathWidth.label')} help={t('floor.pathWidth.help')} htmlFor="set-path">
          <NumberField id="set-path" value={pathWidth} onCommit={setPathWidth} min={4} max={400} suffix={t('units')} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('seating.title')} description={t('seating.description')}>
        <SettingRow label={t('seating.autoTurnover.label')} help={t('seating.autoTurnover.help')} htmlFor="set-auto">
          <Toggle id="set-auto" checked={autoTurnover} onChange={setAutoTurnover} aria-label={t('seating.autoTurnover.label')} />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('seating.turnoverBuffer.label')} help={t('seating.turnoverBuffer.help')} htmlFor="set-buffer">
          <NumberField
            id="set-buffer"
            value={turnoverBufferMin}
            onCommit={(n) => updateSeatingConfig({ turnoverBufferMin: n })}
            min={0}
            max={240}
            suffix={t('minutes')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('seating.reservedLookahead.label')} help={t('seating.reservedLookahead.help')} htmlFor="set-look">
          <NumberField
            id="set-look"
            value={reservedLookaheadMin}
            onCommit={setReservedLookaheadMin}
            min={0}
            max={480}
            suffix={t('minutes')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('seating.waitlist.label')} help={t('seating.waitlist.help')} htmlFor="set-wait">
          <Toggle id="set-wait" checked={waitlistEnabled} onChange={setWaitlistEnabled} aria-label={t('seating.waitlist.label')} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title={t('tableRules.title')} description={t('tableRules.description')}>
        <SettingRow label={t('tableRules.crossZone.label')} help={t('tableRules.crossZone.help')} htmlFor="set-crosszone">
          <Toggle
            id="set-crosszone"
            checked={merge.allowCrossZoneMerge}
            onChange={(v) => updateMergeConfig({ allowCrossZoneMerge: v })}
            aria-label={t('tableRules.crossZone.label')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('tableRules.maxCombined.label')} help={t('tableRules.maxCombined.help')} htmlFor="set-maxcombined2">
          <NumberField
            id="set-maxcombined2"
            value={merge.maxMergeSize ?? 5}
            onCommit={(n) => updateMergeConfig({ maxMergeSize: n })}
            min={1}
            max={12}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('tableRules.maxUnderfill.label')} help={t('tableRules.maxUnderfill.help')} htmlFor="set-underfill">
          <NumberField
            id="set-underfill"
            value={maxUnderfill}
            onCommit={(n) => updateSeatingConfig({ maxUnderfill: n })}
            min={0}
            max={12}
            suffix={t('tableRules.seats')}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('tableRules.exactFit.label')} help={t('tableRules.exactFit.help')} htmlFor="set-exactfit">
          <NumberField
            id="set-exactfit"
            value={weights.capacityFit}
            onCommit={(n) => updateSeatingConfig({ weights: { ...weights, capacityFit: n } })}
            min={0}
            max={10}
          />
        </SettingRow>
        <SettingsDivider />
        <SettingRow label={t('tableRules.fewer.label')} help={t('tableRules.fewer.help')} htmlFor="set-fewer">
          <NumberField
            id="set-fewer"
            value={weights.singleTable}
            onCommit={(n) => updateSeatingConfig({ weights: { ...weights, singleTable: n } })}
            min={0}
            max={10}
          />
        </SettingRow>
      </SettingsSection>

      <PreferredCombosEditor />
    </>
  )
}
