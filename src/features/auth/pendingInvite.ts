/**
 * Pending invite code (Phase 9). Captured from the URL at app startup and kept
 * in sessionStorage so redemption survives the signup round-trip and any URL
 * cleanup. The session store redeems it centrally, BEFORE deciding a user has no
 * restaurant — otherwise an invited signup races into the open-owner
 * "create your restaurant" path.
 */
const KEY = 'rfm.pendingInvite'

/** Stash the `?invite=CODE` param, if present. Call once at startup. */
export function stashInviteFromUrl(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('invite')
    if (code) sessionStorage.setItem(KEY, code.trim().toUpperCase())
  } catch {
    // sessionStorage/URL unavailable — invites simply won't auto-redeem.
  }
}

export function getPendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
