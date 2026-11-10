// The static Tageslinse (from 01's lens-flat.js): the fallback for prefers-reduced-motion, for a
// failed or lost WebGL context, and the first paint before Three.js has loaded. Same information as
// the 3D lens: the fill level is today's planned progress; the caption beside it carries the numbers.

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
export function flatLens(level, { size = 104 } = {}) {
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
    <clipPath id="${id}c"><circle cx="${c}" cy="${cy}" r="${rl}"/></clipPath>
  </defs>
  <ellipse class="lf-shadow" cx="${c}" cy="${cy + r + size * 0.06}" rx="${r * 0.82}" ry="${size * 0.045}"/>
  <g clip-path="url(#${id}c)">
    <rect class="lf-liquid" x="0" y="${top}" width="${size}" height="${size}"/>
    ${level > 0.001 && level < 0.999 ? `<ellipse class="lf-surface" cx="${c}" cy="${top}" rx="${chord}" ry="${Math.max(1.5, chord * 0.16)}"/>` : ''}
  </g>
  <circle class="lf-glass" cx="${c}" cy="${cy}" r="${r}" fill="url(#${id}g)" stroke-width="1"/>
  <ellipse class="lf-hi" cx="${c - r * 0.38}" cy="${cy - r * 0.48}" rx="${r * 0.26}" ry="${r * 0.14}" transform="rotate(-28 ${c - r * 0.38} ${cy - r * 0.48})"/>
</svg>`
}

// The 14 px rail ring beside "Nächste": the same level as a plain filled circle.
export function miniLens(level) {
  const h = 12 * Math.min(1, Math.max(0, level))
  return `<svg class="mini-lens" viewBox="0 0 14 14" aria-hidden="true"><clipPath id="ml"><circle cx="7" cy="7" r="6"/></clipPath><rect x="0" y="${(13 - h).toFixed(2)}" width="14" height="${(h + 1).toFixed(2)}" clip-path="url(#ml)"/><circle cx="7" cy="7" r="6.25" fill="none" stroke-width="1"/></svg>`
}
