import { useTranslation } from 'react-i18next'
import { Panel } from '@/components/ui'
import type { SettingsGroupId } from '../settingsNav'

/**
 * Placeholder for a roadmapped settings group that isn't built yet (`soon` in the
 * nav). Keeps the group discoverable in the sidebar without pretending it works.
 */
export function SoonSettings({ group }: { group: SettingsGroupId }) {
  const { t } = useTranslation('settings')
  return (
    <Panel>
      <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
        <p className="text-sm font-medium text-ink">{t(`nav.${group}`)}</p>
        <p className="text-[13px] text-muted">{t('soon')}</p>
      </div>
    </Panel>
  )
}
