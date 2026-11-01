// "Knoten-Glyphen": runway's own small glyph set, built from the brand mark's vocabulary
// (1.5 px hairlines with round caps, filled nodes of r 1.6). 20 x 20 grid, currentColor.
// Not a third-party icon library. Android ships the same paths as ImageVectors.

const node = (cx, cy, r = 1.6) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`

export const GLYPHS = {
  inbox: `<path d="M3 11.5v3.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-3.2"/><path d="M3 11.5h3.6l1.3 2.2h4.2l1.3-2.2H17"/><path d="M10 3.5v5"/>${node(10, 9.6, 1.5)}`,
  next: `${node(4.2, 10, 1.9)}<path d="M7 10h9"/><path d="M12.6 6.4 16.2 10l-3.6 3.6"/>`,
  waiting: `<circle cx="10" cy="10" r="6.8"/><path d="M10 10V6.2"/><path d="M10 10l2.6 1.6"/>${node(10, 10, 1.3)}`,
  projects: `<path d="M10 2.9 16.2 6.45v7.1L10 17.1l-6.2-3.55v-7.1Z"/>${node(10, 10, 1.6)}`,
  someday: `<circle cx="10" cy="10" r="6.8" stroke-dasharray="1.6 2.6"/>${node(10, 10, 1.6)}`,
  search: `<circle cx="8.6" cy="8.6" r="5"/><path d="m12.4 12.4 4.2 4.2"/>`,
  plus: `<path d="M10 4v12M4 10h12"/>`,
  check: `<path d="m5.2 10.4 3.2 3.2 6.6-7"/>`,
  review: `<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M14.6 2.8v3.2h-3.2"/>${node(10, 10, 1.3)}`,
  all: `${node(4.4, 5.5, 1.4)}${node(4.4, 10, 1.4)}${node(4.4, 14.5, 1.4)}<path d="M7.8 5.5H16M7.8 10H16M7.8 14.5H13"/>`,
  settings: `<path d="M3.5 6.5h13M3.5 13.5h13"/>${node(7.5, 6.5, 2)}${node(12.8, 13.5, 2)}`,
  undo: `<path d="M5.5 8h6.3a3.7 3.7 0 0 1 0 7.4H8"/><path d="M8.2 5 5.2 8l3 3"/>`,
  close: `<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>`,
  more: `${node(5, 10, 1.5)}${node(10, 10, 1.5)}${node(15, 10, 1.5)}`,
  today: `<circle cx="10" cy="10" r="6.8"/><path d="M3.6 11.6h12.8" opacity=".6"/><path d="M3.9 12.4a6.8 6.8 0 0 0 12.2 0Z" fill="currentColor" stroke="none"/>`,
  play: `<path d="M7 5.2v9.6l7.6-4.8Z"/>`,
  pause: `<path d="M7.5 5.5v9M12.5 5.5v9"/>`,
  calendar: `<rect x="3.5" y="4.8" width="13" height="11.7" rx="2.2"/><path d="M3.5 8.6h13M7 3v3.2M13 3v3.2"/>`,
  note: `<path d="M5 4h7.5L15 6.5V16H5Z"/><path d="M7.6 9.5h4.8M7.6 12.4h3.2"/>`,
  back: `<path d="M12 4.6 6.6 10l5.4 5.4"/>`,
  chevron: `<path d="m8 4.6 5.4 5.4L8 15.4"/>`,
  trash: `<path d="M4.5 6h11M8 6V4h4v2M6 6l.8 10h6.4L14 6"/>`,
  plan: `${node(4.2, 5, 1.4)}<path d="M4.2 6.6v6.8"/>${node(4.2, 15, 1.4)}<path d="M7.6 5h8.4M7.6 10h6M7.6 15h8.4"/>`,
  menu: `<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>`,
  enter: `<path d="M15.5 4.5v5.2a2 2 0 0 1-2 2H5"/><path d="m8 8.5-3 3.2 3 3.2"/>`,
  share: `<path d="M10 3.5v9"/><path d="M6.6 6.6 10 3.2l3.4 3.4"/><path d="M5 10.5v4.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-4.5"/>`,
}

export function glyph(name, { size = 20, label = '', cls = '' } = {}) {
  const body = GLYPHS[name] || ''
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'
  return `<svg class="glyph ${cls}" ${a11y} width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}

// The brand mark, inline (unchanged geometry and colours from shared/brand/logos/mark-color.svg).
export function brandMark(size = 28, { onDark = false } = {}) {
  const line = onDark ? '#FBF6EE' : '#3D2B5C'
  const nodeFill = onDark ? '#FBF6EE' : '#3D2B5C'
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><g stroke="${line}" stroke-width="1.4" fill="none" opacity="0.55"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="${nodeFill}"/><circle cx="47.588" cy="23" r="2.8" fill="${nodeFill}"/><circle cx="47.588" cy="41" r="2.8" fill="${nodeFill}"/><circle cx="32" cy="50" r="2.8" fill="${nodeFill}"/><circle cx="16.412" cy="41" r="2.8" fill="${nodeFill}"/><circle cx="16.412" cy="23" r="2.8" fill="${nodeFill}"/><circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19" r="2" fill="#F4C84A"/></svg>`
}
