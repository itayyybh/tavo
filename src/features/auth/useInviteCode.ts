/**
 * The invite code carried in the URL (`?invite=CODE`), if any. Read from the raw
 * location so it works before the router mounts (the AuthGate sits above it).
 */
export function useInviteCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('invite')
  return code ? code.trim().toUpperCase() : null
}
