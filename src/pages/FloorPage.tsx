import { useTranslation } from 'react-i18next'

/**
 * Live Floor — top-down real-time restaurant view.
 * Placeholder shell; built out in Phase 8.
 */
export default function FloorPage() {
  const { t } = useTranslation('common')
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{t('floor.title')}</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{t('floor.body')}</p>
    </section>
  )
}
