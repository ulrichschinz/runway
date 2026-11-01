// Orbit icon set: 22 glyphs on a 24 grid, 1.6 stroke, round caps, nodes as filled dots.
// Drawn from the brand mark's own vocabulary (hexagon, node, ring); no icon library.
// The same paths become Android VectorDrawables (README: Iconography).

const P = {
  inbox: '<path d="M4 13.5 6.6 6h10.8l2.6 7.5V18H4z"/><path d="M4 13.5h4.6l1.2 2.2h4.4l1.2-2.2H20"/>',
  next: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="17.7" cy="6.3" r="1.7" fill="currentColor" stroke="none"/>',
  waiting: '<circle cx="12" cy="12" r="8" stroke-dasharray="3.2 2.6"/><path d="M12 8v4.2l2.8 1.8"/>',
  projects: '<path d="M12 3.5 19.4 7.75v8.5L12 20.5l-7.4-4.25v-8.5z"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  someday: '<circle cx="12" cy="12" r="8" stroke-dasharray="1 3.1"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  all: '<path d="M8.5 7h11M8.5 12h11M8.5 17h11"/><circle cx="4.8" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17" r="1.1" fill="currentColor" stroke="none"/>',
  review: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.2 4.6v3.6h-3.6"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4.5 8h9M17.5 8h2M4.5 16h2M10.5 16h9"/><circle cx="15.5" cy="8" r="2"/><circle cx="8.5" cy="16" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5.5 12.5 4 4 9-9"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  trash: '<path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12h8.4L17 7"/>',
  note: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h4"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  calendar: '<rect x="4.5" y="6" width="15" height="13.5" rx="2.5"/><path d="M4.5 10.5h15M9 3.8V7M15 3.8V7"/>',
  command: '<path d="M9 9h6v6H9z"/><path d="M9 9V7a2 2 0 1 0-2 2h2M15 9V7a2 2 0 1 1 2 2h-2M9 15v2a2 2 0 1 1-2-2h2M15 15v2a2 2 0 1 0 2-2h-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  more: '<circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none"/>',
  orbit: '<ellipse cx="12" cy="12" rx="9" ry="5.2"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="19.2" cy="9.3" r="1.5" fill="currentColor" stroke="none"/>',
}

export function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`
}

/**
 * A tiny pie that shows where a context sits on the orbit. `sec` is the model's sector
 * ({ a0, a1 } in orbit angles: 0 = bottom, decreasing = clockwise) or null when the context has
 * no open next action right now (an empty ring).
 */
export function sectorGlyph(sec, size = 14) {
  const c = size / 2, r = size / 2 - 1.2
  const p = (a) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c + r * Math.cos(a)).toFixed(2)}`
  const wedge = !sec ? '' : Math.abs(sec.a0 - sec.a1) > 6.2
    ? `<circle cx="${c}" cy="${c}" r="${r}" fill="currentColor"/>`
    : `<path d="M${c} ${c}L${p(sec.a0)}A${r} ${r} 0 ${Math.abs(sec.a0 - sec.a1) > Math.PI ? 1 : 0} 1 ${p(sec.a1)}Z" fill="currentColor"/>`
  return `<svg class="sg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/>${wedge}</svg>`
}

/** The hub glyph for "ohne Kontext": a ring with a filled centre. */
export function hubGlyph(size = 14) {
  const c = size / 2
  return `<svg class="sg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${c - 1.2}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/><circle cx="${c}" cy="${c}" r="${c * 0.42}" fill="currentColor"/></svg>`
}

/** Concentric rings with ring k highlighted: the section glyph for Jetzt / Bald / Später. */
export function ringGlyph(k, size = 14) {
  const c = size / 2
  const rs = [2.2, 4.2, 6.2]
  return `<svg class="rg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${rs.map((r, i) =>
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="currentColor" stroke-width="${i === k ? 1.6 : 0.9}" stroke-opacity="${i === k ? 1 : 0.35}"/>`).join('')}<circle cx="${c}" cy="${c}" r="1" fill="currentColor"/></svg>`
}

/**
 * The static place of one task on the orbit, for the detail header: three rings, the sector
 * shaded, a dot on the task's ring. Replaces the 3D close-up (it explained nothing more).
 */
export function placeGlyph(sec, ring, size = 44, hub = false) {
  const c = size / 2, R = [0.3, 0.5, 0.7].map((f) => f * c), out = c - 1
  const p = (a, r) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c + r * Math.cos(a)).toFixed(2)}`
  let h = `<svg class="pg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
  if (sec && Math.abs(sec.a0 - sec.a1) < 6.2) h += `<path class="pg-sec" d="M${p(sec.a0, c * 0.2)}L${p(sec.a0, out)}A${out} ${out} 0 ${Math.abs(sec.a0 - sec.a1) > Math.PI ? 1 : 0} 1 ${p(sec.a1, out)}L${p(sec.a1, c * 0.2)}Z"/>`
  else if (sec) h += `<circle class="pg-sec" cx="${c}" cy="${c}" r="${out}"/>`
  h += R.map((r, i) => `<circle class="pg-ring ${i === ring ? 'on' : ''}" cx="${c}" cy="${c}" r="${r}"/>`).join('')
  h += `<circle class="pg-you" cx="${c}" cy="${c}" r="${c * 0.13}"/>`
  if (hub) h += `<circle class="pg-dot" cx="${c}" cy="${(c - c * 0.2).toFixed(2)}" r="2.6"/>`
  else if (sec && ring >= 0 && ring <= 2) { const a = (sec.a0 + sec.a1) / 2; h += `<circle class="pg-dot" cx="${(c + R[ring] * Math.sin(a)).toFixed(2)}" cy="${(c + R[ring] * Math.cos(a)).toFixed(2)}" r="2.6"/>` }
  return h + '</svg>'
}

/** The brand mark, inline and unchanged (logos/mark-color.svg). */
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19.000" r="2" fill="#F4C84A"/></svg>`
/** The kit's own on-dark variant, inline and unchanged (logos/mark-mono-light.svg). */
export const MARK_LIGHT = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#FFFFFF" stroke-width="1.4" fill="none" opacity="0.7"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="#FFFFFF"/><circle cx="47.588" cy="23" r="2.8" fill="#FFFFFF"/><circle cx="47.588" cy="41" r="2.8" fill="#FFFFFF"/><circle cx="32" cy="50" r="2.8" fill="#FFFFFF"/><circle cx="16.412" cy="41" r="2.8" fill="#FFFFFF"/><circle cx="16.412" cy="23" r="2.8" fill="#FFFFFF"/><circle cx="32" cy="14" r="4.4" fill="#FFFFFF"/><circle cx="51.588" cy="19.000" r="2" fill="#FFFFFF"/></svg>`
/** Both marks; CSS shows the colour mark on light surfaces and the mono-light mark on Plum-Nacht. */
export const MARKS = `<span class="mark mark-c">${MARK}</span><span class="mark mark-l">${MARK_LIGHT}</span>`
