/** Small color helpers for canvas fills (Konva can't use CSS color-mix). */

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (full.length !== 6) return null
  const n = Number.parseInt(full, 16)
  if (Number.isNaN(n)) return null
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Blend two hex colors: `t` = 0 returns `a`, `t` = 1 returns `b`. Used to paint a
 * table body a solid, uniform tint of its status color over the surface — a flat
 * fill (no alpha) so overlapping merge passes never stack into darker patches.
 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return a
  const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * t))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
