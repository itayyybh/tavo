import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Heading, Input, Panel, Select, Text, Toggle } from '@/components/ui'
import { useSettingsStore } from '@/stores'
import { LOCALES, type Locale } from '@/i18n/config'
import { SettingRow } from './SettingRow'
import { NumberField } from './NumberField'
import { useRestaurantProfile } from './useRestaurantProfile'

/** Human label per locale code, in its own language. */
const LOCALE_LABELS: Record<Locale, string> = { en: 'English', he: 'עברית' }

/** IANA time zones for the profile select, or a short fallback if unavailable. */
function timezoneOptions(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf
  if (supported) {
    try {
      return supported('timeZone')
    } catch {
      /* fall through */
    }
  }
  return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Jerusalem']
}

/**
 * Settings surface (Phase 11) — restaurant-wide configuration. Floor and seating
 * rules read/write the settings store (autosaved to the DB by `useSettingsSync`);
 * language is per-user (localStorage); the profile saves explicitly via its RPC.
 */
export function SettingsView() {
  const { t } = useTranslation('settings')

  // Floor.
  const gridSize = useSettingsStore((s) => s.gridSize)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid)
  const pathWidth = useSettingsStore((s) => s.pathWidth)
  const setPathWidth = useSettingsStore((s) => s.setPathWidth)

  // Seating rules.
  const autoTurnover = useSettingsStore((s) => s.autoTurnover)
  const setAutoTurnover = useSettingsStore((s) => s.setAutoTurnover)
  const turnoverBufferMin = useSettingsStore((s) => s.seating.turnoverBufferMin)
  const updateSeatingConfig = useSettingsStore((s) => s.updateSeatingConfig)
  const defaultStayMinutes = useSettingsStore((s) => s.defaultStayMinutes)
  const maxStayMinutes = useSettingsStore((s) => s.maxStayMinutes)
  const setStayMinutes = useSettingsStore((s) => s.setStayMinutes)
  const reservedLookaheadMin = useSettingsStore((s) => s.reservedLookaheadMin)
  const setReservedLookaheadMin = useSettingsStore((s) => s.setReservedLookaheadMin)
  const waitlistEnabled = useSettingsStore((s) => s.waitlistEnabled)
  const setWaitlistEnabled = useSettingsStore((s) => s.setWaitlistEnabled)

  // Language (per-user).
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)

  // Profile.
  const profile = useRestaurantProfile()
  const tzOptions = useMemo(
    () => timezoneOptions().map((tz) => ({ value: tz, label: tz })),
    [],
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <Heading level={1}>{t('title')}</Heading>
        <Text muted className="mt-1">
          {t('subtitle')}
        </Text>
      </header>

      <Section title={t('floor.title')} description={t('floor.description')}>
        <SettingRow label={t('floor.gridSize.label')} help={t('floor.gridSize.help')} htmlFor="set-grid">
          <NumberField id="set-grid" value={gridSize} onCommit={setGridSize} min={4} max={200} suffix={t('units')} />
        </SettingRow>
        <Divider />
        <SettingRow label={t('floor.snapToGrid.label')} help={t('floor.snapToGrid.help')} htmlFor="set-snap">
          <Toggle id="set-snap" checked={snapToGrid} onChange={setSnapToGrid} aria-label={t('floor.snapToGrid.label')} />
        </SettingRow>
        <Divider />
        <SettingRow label={t('floor.pathWidth.label')} help={t('floor.pathWidth.help')} htmlFor="set-path">
          <NumberField id="set-path" value={pathWidth} onCommit={setPathWidth} min={4} max={400} suffix={t('units')} />
        </SettingRow>
      </Section>

      <Section title={t('seating.title')} description={t('seating.description')}>
        <SettingRow label={t('seating.autoTurnover.label')} help={t('seating.autoTurnover.help')} htmlFor="set-auto">
          <Toggle id="set-auto" checked={autoTurnover} onChange={setAutoTurnover} aria-label={t('seating.autoTurnover.label')} />
        </SettingRow>
        <Divider />
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
        <Divider />
        <SettingRow label={t('seating.defaultStay.label')} help={t('seating.defaultStay.help')} htmlFor="set-defstay">
          <NumberField
            id="set-defstay"
            value={defaultStayMinutes}
            onCommit={(n) => setStayMinutes({ default: n })}
            min={15}
            max={maxStayMinutes}
            suffix={t('minutes')}
          />
        </SettingRow>
        <Divider />
        <SettingRow label={t('seating.maxStay.label')} help={t('seating.maxStay.help')} htmlFor="set-maxstay">
          <NumberField
            id="set-maxstay"
            value={maxStayMinutes}
            onCommit={(n) => setStayMinutes({ max: n })}
            min={defaultStayMinutes}
            max={600}
            suffix={t('minutes')}
          />
        </SettingRow>
        <Divider />
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
        <Divider />
        <SettingRow label={t('seating.waitlist.label')} help={t('seating.waitlist.help')} htmlFor="set-wait">
          <Toggle id="set-wait" checked={waitlistEnabled} onChange={setWaitlistEnabled} aria-label={t('seating.waitlist.label')} />
        </SettingRow>
      </Section>

      <Section title={t('language.title')} description={t('language.description')}>
        <SettingRow label={t('language.label')} htmlFor="set-locale">
          <Select
            id="set-locale"
            className="w-44"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
          />
        </SettingRow>
      </Section>

      <Section title={t('profile.title')} description={t('profile.description')}>
        <SettingRow label={t('profile.name.label')} help={t('profile.name.help')} htmlFor="set-rname">
          <Input
            id="set-rname"
            className="w-64"
            value={profile.name}
            onChange={(e) => profile.setName(e.target.value)}
          />
        </SettingRow>
        <Divider />
        <SettingRow label={t('profile.timezone.label')} help={t('profile.timezone.help')} htmlFor="set-tz">
          <Select
            id="set-tz"
            className="w-64"
            value={profile.timezone}
            onChange={(e) => profile.setTimezone(e.target.value)}
            placeholder={t('profile.timezoneAuto')}
            options={tzOptions}
          />
        </SettingRow>
        <div className="mt-4 flex items-center justify-end gap-3">
          {profile.saveState === 'saved' && (
            <span className="text-[13px] text-muted">{t('profile.saved')}</span>
          )}
          <Button
            onClick={profile.save}
            disabled={!profile.loaded || profile.saveState === 'saving'}
          >
            {profile.saveState === 'saving' ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      </div>
      <Panel>{children}</Panel>
    </section>
  )
}

function Divider() {
  return <div className="h-px bg-line" />
}
