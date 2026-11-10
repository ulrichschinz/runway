// Static Tageslinse and Inbox pebbles: the fallback for prefers-reduced-motion, for a failed
// WebGL context and for the first paint before Three.js has loaded. Same information as the
// 3D version (fill level = today's progress; one pebble per unclarified item).

// Fill height for a volume fraction: the liquid is a spherical cap, so 50 % sits exactly at the
// middle and the level reads like a real vessel. Returns d/2R in [0, 1] (height from the bottom).
export function levelToHeight(level) {
  const f = Math.min(1, Math.max(0, level))
  let lo = 0, hi = 2
  for (let i = 0; i < 32; i++) {
    const d = (lo + hi) / 2
    const v = (d * d * (3 - d)) / 4 // R = 1
    if (v < f) lo = d; else hi = d
  }
  return (lo + hi) / 4
}

let uid = 0
export function flatLens(level, { size = 120 } = {}) {
  const id = `fl${++uid}`
  const c = size / 2, r = size * 0.39, cy = c - size * 0.02
  const rl = r * 0.86
  const h = levelToHeight(level)
  const top = cy + rl - h * 2 * rl
  const chord = Math.sqrt(Math.max(0, rl * rl - (top - cy) ** 2))
  return `<svg class="lens-flat" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <radialGradient id="${id}g" cx="38%" cy="32%" r="75%">
      <stop offset="0" style="stop-color:var(--ar-paper)" stop-opacity=".95"/>
      <stop offset=".55" style="stop-color:var(--ar-paper)" stop-opacity=".55"/>
      <stop offset="1" style="stop-color:var(--ar-coral)" stop-opacity=".28"/>
    </radialGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:color-mix(in srgb, var(--ar-coral) 78%, var(--ar-paper))"/>
      <stop offset="1" style="stop-color:color-mix(in srgb, var(--ar-coral) 86%, var(--ar-plum))"/>
    </linearGradient>
    <clipPath id="${id}c"><circle cx="${c}" cy="${cy}" r="${rl}"/></clipPath>
  </defs>
  <ellipse cx="${c}" cy="${cy + r + size * 0.06}" rx="${r * 0.82}" ry="${size * 0.045}" style="fill:var(--ar-plum)" opacity=".10"/>
  <g clip-path="url(#${id}c)">
    <rect class="lens-flat-liquid" x="0" y="${top}" width="${size}" height="${size}" fill="url(#${id}l)"/>
    ${level > 0.001 && level < 0.999 ? `<ellipse cx="${c}" cy="${top}" rx="${chord}" ry="${Math.max(1.5, chord * 0.16)}" style="fill:color-mix(in srgb, var(--ar-coral) 55%, var(--ar-paper))"/>` : ''}
  </g>
  <circle cx="${c}" cy="${cy}" r="${r}" fill="url(#${id}g)" style="stroke:color-mix(in srgb, var(--ar-coral) 35%, transparent)" stroke-width="1"/>
  <ellipse cx="${c - r * 0.38}" cy="${cy - r * 0.48}" rx="${r * 0.26}" ry="${r * 0.14}" transform="rotate(-28 ${c - r * 0.38} ${cy - r * 0.48})" style="fill:var(--ar-paper)" opacity=".85"/>
</svg>`
}

// Up to nine pebbles in the same heap layout as the 3D scene (x, z on the ground, size).
export const PEBBLE_SLOTS = [
  [0, 0.12, 1.0], [-0.78, -0.18, 0.86], [0.8, -0.1, 0.92], [-0.36, 0.72, 0.8], [0.46, 0.7, 0.84],
  [-1.25, 0.46, 0.7], [1.22, 0.52, 0.72], [-0.1, -0.78, 0.74], [0.02, 1.22, 0.66],
]
export function flatPebbles(n, { size = 120 } = {}) {
  const shown = Math.min(n, PEBBLE_SLOTS.length)
  const s = size / 3.4, spread = size / 4.7 // same tight heap as the 3D scene: nine fit the square
  const items = PEBBLE_SLOTS.slice(0, shown).map(([x, z, k], i) => {
    const px = size / 2 + x * spread, py = size * 0.54 + z * spread * 0.6, w = s * 0.78 * k, hh = w * 0.62
    return { px, py, w, hh, i }
  }).sort((a, b) => a.py - b.py)
  return `<svg class="pebbles-flat" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
  ${shown === 0 ? `<ellipse cx="${size / 2}" cy="${size * 0.6}" rx="${size * 0.3}" ry="${size * 0.07}" fill="none" style="stroke:var(--rw-line-strong)" stroke-dasharray="2 4"/>` : ''}
  ${items.map(({ px, py, w, hh }) => `
    <ellipse cx="${px}" cy="${py + hh * 0.55}" rx="${w * 0.95}" ry="${hh * 0.4}" style="fill:var(--ar-plum)" opacity=".10"/>
    <ellipse cx="${px}" cy="${py}" rx="${w}" ry="${hh}" style="fill:color-mix(in srgb, var(--ar-plum) 14%, var(--ar-paper));stroke:color-mix(in srgb, var(--ar-plum) 22%, transparent)" stroke-width=".8"/>
    <ellipse cx="${px - w * 0.3}" cy="${py - hh * 0.4}" rx="${w * 0.32}" ry="${hh * 0.22}" style="fill:var(--ar-paper)" opacity=".9"/>`).join('')}
</svg>`
}
