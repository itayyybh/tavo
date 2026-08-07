import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Dialog, Text } from '@/components/ui'
import { useSessionStore } from '@/stores'
import { can, useCan, type PermissionAction } from '@/features/auth'
import { InviteDialog } from '@/features/auth/InviteDialog'
import { listMembers, removeMember, type Member, type MembershipRole } from '@/services/supabase/auth'
import { cn } from '@/utils'
import { SettingsSection } from '../SettingsSection'

/** Roles and the capabilities shown in the matrix (derived live from `can`). */
const ROLES: MembershipRole[] = ['owner', 'manager']
const CAPABILITIES: PermissionAction[] = [
  'manageFloor',
  'deleteReservation',
  'editLayout',
  'editSettings',
  'inviteManager',
]

/**
 * Staff & Permissions group — the restaurant's team (invite, view, remove) and a
 * read-only matrix of what each role may do. Roles are fixed (owner/manager); the
 * capability matrix reads straight from the auth `can` policy, so it never drifts
 * from the real gates. Only owners reach Settings, so team edits are owner-only.
 */
export function StaffSettings() {
  const { t } = useTranslation('settings')
  const restaurantId = useSessionStore((s) => s.restaurantId)
  const myUserId = useSessionStore((s) => s.user?.id ?? null)
  const canManageTeam = useCan('inviteManager')

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  /** Trigger a refetch (after invite/remove). */
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  // Load the team on mount and whenever a refetch is requested. Loading shows
  // once (initial); refetches swap the list in place without a flash.
  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    listMembers(restaurantId)
      .then((m) => {
        if (cancelled) return
        setMembers(m)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Could not load the team.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [restaurantId, nonce])

  const confirmRemove = async () => {
    if (!restaurantId || !removing) return
    setBusy(true)
    try {
      await removeMember(restaurantId, removing.userId)
      setRemoving(null)
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the member.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsSection title={t('staff.title')} description={t('staff.description')}>
        {loading ? (
          <Text muted className="px-1 py-4 text-[13px]">
            {t('staff.loading')}
          </Text>
        ) : (
          <div className="flex flex-col">
            {members.map((m) => {
              const isSelf = m.userId === myUserId
              const canRemove = canManageTeam && !isSelf && m.role !== 'owner'
              return (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-4 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {m.name || m.email || t('staff.unknown')}
                      {isSelf && <span className="ms-1.5 text-muted">{t('staff.you')}</span>}
                    </p>
                    {m.email && m.name && (
                      <p className="truncate text-[13px] text-muted">{m.email}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge
                      className={cn(
                        m.role === 'owner' && 'border-transparent bg-ink text-surface',
                      )}
                    >
                      {t(`staff.role.${m.role}`)}
                    </Badge>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setRemoving(m)}
                        className="text-[13px] text-muted transition-colors hover:text-status-occupied"
                      >
                        {t('staff.remove')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 text-[13px] text-status-occupied">{error}</p>
        )}

        {canManageTeam && (
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setInviteOpen(true)}>{t('staff.invite')}</Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('roles.title')} description={t('roles.description')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-sm">
            <thead>
              <tr className="text-start">
                <th className="py-2 pe-4 text-start font-medium text-muted">
                  {t('roles.capability')}
                </th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-2 text-center font-medium text-ink">
                    {t(`staff.role.${r}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((action) => (
                <tr key={action} className="border-t border-line">
                  <td className="py-2.5 pe-4 text-ink">{t(`roles.action.${action}`)}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-4 py-2.5 text-center">
                      {can(r, action) ? (
                        <span className="text-ink" aria-label={t('roles.granted')}>
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted" aria-label={t('roles.notGranted')}>
                          –
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>

      <InviteDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false)
          reload()
        }}
      />

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('staff.removeConfirm.title')}
      >
        <Text className="text-muted">
          {t('staff.removeConfirm.body', {
            name: removing?.name || removing?.email || t('staff.unknown'),
          })}
        </Text>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRemoving(null)} disabled={busy}>
            {t('staff.removeConfirm.cancel')}
          </Button>
          <Button variant="danger" onClick={confirmRemove} disabled={busy}>
            {busy ? t('staff.removeConfirm.removing') : t('staff.removeConfirm.confirm')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
