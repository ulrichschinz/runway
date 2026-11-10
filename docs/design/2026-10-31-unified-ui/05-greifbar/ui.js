// Greifbar: shared formatting, glyphs and row markup for web and Android prototypes.
import { TODAY, parseTw, berlinDay, contextsOf, tagParts, toTw } from './store.js'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---------- dates (always Europe/Berlin, against the server's "today") ----------
const fmt = (o) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ...o })
const fDay = fmt({ weekday: 'short' })
const fDM = fmt({ day: '2-digit', month: '2-digit' })
const fHM = fmt({ hour: '2-digit', minute: '2-digit' })
const fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
export const dm = (tw) => fDM.format(parseTw(tw)).replace(/\.?$/, '.')
export const wdm = (tw) => `${fDay.format(parseTw(tw)).replace('.', '')} ${dm(tw)}`
export const hm = (tw) => fHM.format(parseTw(tw))
export const longToday = () => fLong.format(new Date(Date.UTC(2026, 9, 31, 9)))

export function dueInfo(t) {
  if (!t.due) return null
  const d = berlinDay(t.due)
  if (d < TODAY) return { kind: 'overdue', text: `überfällig · ${dm(t.due)}`, status: 'überfällig' }
  if (d === TODAY) return { kind: 'today', text: 'fällig heute', status: 'fällig heute' }
  return { kind: 'later', text: `fällig ${wdm(t.due)}`, status: 'Nächste' }
}

export function followInfo(t) {
  const src = t.scheduled || t.wait
  if (!src) return { kind: 'quiet', text: `wartet seit ${dm(t.entry)}`, status: 'Wartet' }
  const d = berlinDay(src)
  if (d === TODAY) return { kind: 'due', text: 'Nachhaken heute', status: 'Nachhaken fällig' }
  if (d < TODAY) return { kind: 'due', text: `Nachhaken seit ${dm(src)}`, status: 'Nachhaken fällig' }
  return { kind: 'quiet', text: `Wiedervorlage ${wdm(src)}`, status: 'Wartet' }
}

// ---------- glyphs: own 20px line set, 1.5 stroke, nodes borrowed from the mark ----------
const P = (d) => `<path d="${d}"/>`
const N = (x, y, r = 1.7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`
const G = {
  inbox: P('M3 11.5 5.6 4.5h8.8l2.6 7v4H3z') + P('M3 11.5h4.2l1.1 1.8h3.4l1.1-1.8H17'),
  next: N(4.2, 10) + P('M7 10h9M12.6 6.5 16.1 10l-3.5 3.5'),
  waiting: '<circle cx="10" cy="10" r="6.6"/>' + P('M10 6.4V10l2.6 1.6'),
  projects: '<rect x="3" y="6.5" width="11.5" height="9.5" rx="2.2"/>' + P('M6.5 3.8h8.2a2.2 2.2 0 0 1 2.2 2.2v7.4'),
  // a cloud: ideas that may wait (the earlier ring of six dots read as a loading spinner)
  someday: P('M6.2 15.2h8.1a3.1 3.1 0 0 0 .5-6.2 4.5 4.5 0 0 0-8.6-1.1 3.7 3.7 0 0 0 0 7.3z'),
  tickler: '<rect x="3.8" y="5" width="12.4" height="11" rx="2"/>' + P('M3.8 8.6h12.4M7.2 3.5v3M12.8 3.5v3') + N(13, 13, 1.3),
  all: N(4.5, 5.5, 1.3) + N(4.5, 10, 1.3) + N(4.5, 14.5, 1.3) + P('M8 5.5h8M8 10h8M8 14.5h5.5'),
  settings: P('M10 3.2 15.9 6.6v6.8L10 16.8l-5.9-3.4V6.6z') + N(10, 10, 1.9),
  search: '<circle cx="8.8" cy="8.8" r="5.2"/>' + P('m12.7 12.7 3.8 3.8'),
  plus: P('M10 4.5v11M4.5 10h11'),
  close: P('m5.5 5.5 9 9m0-9-9 9'),
  check: P('m5 10.4 3.3 3.3L15.2 6.6'),
  play: P('M7 5.2v9.6l7.4-4.8z'),
  pause: P('M7.5 5.5v9M12.5 5.5v9'),
  back: P('M12.5 5 7.5 10l5 5'),
  forward: P('m7.5 5 5 5-5 5'),
  more: N(10, 4.8, 1.4) + N(10, 10, 1.4) + N(10, 15.2, 1.4),
  undo: P('M7 6.5 4.2 9.2 7 12') + P('M4.6 9.2h7a4 4 0 0 1 0 8H9'),
  done: '<circle cx="10" cy="10" r="6.8"/>' + P('m7 10.3 2.2 2.2 4-4.4'),
  trash: P('M4.5 6.2h11M8 6.2V4.3h4v1.9M6 6.2l.8 10h6.4l.8-10'),
  stack: '<rect x="4" y="7.5" width="12" height="8.5" rx="2"/>' + P('M5.6 5.2h8.8M7.2 3h5.6'),
  later: P('M4 10h9.5M10.5 6.5 14 10l-3.5 3.5M16.5 5v10'),
  edit: P('M4.5 15.5h3l7.6-7.6-3-3-7.6 7.6z') + P('m10.8 6.2 3 3'),
  folder: P('M3.5 6.2a1.7 1.7 0 0 1 1.7-1.7h3l1.6 1.8h5a1.7 1.7 0 0 1 1.7 1.7v6.3a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7z'),
  note: P('M5 4.5h10v11H5z') + P('M7.5 8h5M7.5 11h3.5'),
  calendar: '<rect x="3.8" y="5" width="12.4" height="11" rx="2"/>' + P('M3.8 8.6h12.4M7.2 3.5v3M12.8 3.5v3'),
  key: '<rect x="3" y="5.5" width="14" height="9" rx="2.2"/>' + N(6.5, 8.6, 0.9) + N(10, 8.6, 0.9) + N(13.5, 8.6, 0.9) + P('M7 11.6h6'),
  review: P('M4.5 10a5.5 5.5 0 1 0 1.8-4.1') + P('M4.2 3.8v2.8H7') + P('m8 10.2 1.6 1.6 3-3.2'),
  share: N(5, 10, 1.6) + N(14.5, 5, 1.6) + N(14.5, 15, 1.6) + P('m6.6 9.2 6.3-3.4M6.6 10.8l6.3 3.4'),
  bolt: P('M11 2.8 6.5 10.6h4.2L9 17.2l4.5-7.8H9.3z'),
  wifi: P('M3 8a10.5 10.5 0 0 1 14 0M5.6 10.9a6.6 6.6 0 0 1 8.8 0M8.2 13.7a2.8 2.8 0 0 1 3.6 0') + N(10, 16, 1.1),
  bt: P('m6.5 6.5 7 6.5-3.5 3.3V3.7l3.5 3.3-7 6.5'),
}
/** The brand mark, unchanged (shared/brand/logos/mark-color.svg); on dark it is recoloured the brand way (ar-on-dark). */
export const MARK_SVG = `<svg class="mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"> <g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55"> <line x1="32" y1="14" x2="47.588" y2="23"></line> <line x1="47.588" y1="23" x2="47.588" y2="41"></line> <line x1="47.588" y1="41" x2="32" y2="50"></line> <line x1="32" y1="50" x2="16.412" y2="41"></line> <line x1="16.412" y1="41" x2="16.412" y2="23"></line> <line x1="16.412" y1="23" x2="32" y2="14"></line> <line x1="32" y1="32" x2="32" y2="14"></line> <line x1="32" y1="32" x2="47.588" y2="23"></line> <line x1="32" y1="32" x2="47.588" y2="41"></line> <line x1="32" y1="32" x2="32" y2="50"></line> <line x1="32" y1="32" x2="16.412" y2="41"></line> <line x1="32" y1="32" x2="16.412" y2="23"></line> </g> <circle cx="32" cy="32" r="3.6" fill="#3D2B5C"></circle> <circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"></circle> <circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"></circle> <circle cx="32" cy="50" r="2.8" fill="#3D2B5C"></circle> <circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"></circle> <circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"></circle> <circle cx="32" cy="14" r="4.4" fill="#FF7A6B"></circle> <circle cx="51.588" cy="19.000" r="2" fill="#F4C84A"></circle> </svg>`

export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[name] || ''}</svg>`

export const VIEWS = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox', key: 'I', sub: 'Alles, was reinkommt. Eins nach dem anderen klären.' },
  { id: 'next', label: 'Nächste', icon: 'next', key: 'N', sub: 'Was du jetzt tun kannst.' },
  { id: 'waiting', label: 'Warten auf', icon: 'waiting', key: 'W', sub: 'Was andere für dich erledigen.' },
  { id: 'projects', label: 'Projekte', icon: 'projects', key: 'P', sub: 'Jedes Projekt braucht eine nächste Aktion.' },
  { id: 'someday', label: 'Irgendwann', icon: 'someday', key: 'S', sub: 'Ideen, die warten dürfen.' },
]

export const TRAYS = [
  { to: 'next', label: 'Nächste', icon: 'next', key: '1', hint: 'Kontext wählen' },
  { to: 'waiting', label: 'Warten auf', icon: 'waiting', key: '2', hint: 'jemand anderes' },
  { to: 'someday', label: 'Irgendwann', icon: 'someday', key: '3', hint: 'nicht jetzt' },
  { to: 'done', label: 'Erledigt', icon: 'check', key: '4', hint: 'unter 2 Minuten' },
  { to: 'delete', label: 'Löschen', icon: 'trash', key: '5', hint: 'braucht keiner' },
]

// ---------- clarify steps: the trays turn into the options a destination needs ----------
const fWD = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' })
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10) }
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay()
/** 08:00 Europe/Berlin on a calendar day, as a Taskwarrior timestamp (CET or CEST). */
export function berlinMorning(day) {
  const [y, m, d] = day.split('-').map(Number)
  let t = new Date(Date.UTC(y, m - 1, d, 7))
  if (new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(t) === '09') t = new Date(t.getTime() - 3600e3)
  return toTw(t)
}
const dayLabel = (day) => fWD.format(new Date(`${day}T12:00:00Z`)).replace(/\.,? /, ' ').replace(/\.?$/, '.')
/** Date choices relative to the server's "today" (Europe/Berlin). */
export function dateOptions(kind) {
  const tomorrow = addDays(TODAY, 1)
  const friday = addDays(TODAY, ((5 - weekday(TODAY) + 7) % 7) || 7)
  const week = addDays(TODAY, 7)
  const month = addDays(TODAY, 28)
  const o = [
    { day: tomorrow, label: 'morgen' },
    { day: friday, label: 'Freitag' },
    { day: week, label: 'nächste Woche' },
    kind === 'tickler' ? { day: month, label: 'in vier Wochen' } : { day: '', label: 'ohne Datum' },
  ]
  return o.map((x, i) => ({ to: `date:${x.day}`, label: x.label, icon: kind === 'tickler' ? 'tickler' : 'calendar', key: String(i + 1), hint: x.day ? dayLabel(x.day) : 'nur Warten auf', day: x.day }))
}
export const dayText = (day) => dayLabel(day)
export const BACK_TRAY = { to: 'back', label: 'Zurück', icon: 'back', key: '0', hint: 'Ziel ändern' }

/** Accessibility text shared with Android's contract: "<description>, <status>, ID <8>". */
export function a11yRow(t, status) {
  return `${t.description}, ${status}, ID ${t.uuid.slice(-8)}`
}

export function ctxLabel(t) {
  return contextsOf(t).join(' ')
}

/** One task row. opts: { view, selected, android } */
export function rowHTML(t, opts = {}) {
  const due = dueInfo(t)
  const fol = opts.view === 'waiting' ? followInfo(t) : null
  const ctx = contextsOf(t)
  const meta = []
  if (t.start) meta.push(`<span class="live"><i class="pulse"></i>läuft seit ${hm(t.start)}</span>`)
  if (fol) meta.push(`<span class="m-follow ${fol.kind}">${fol.text}</span>`)
  if (due && opts.view !== 'waiting') meta.push(`<span class="m-due ${due.kind}">${due.text}</span>`)
  if (t.priority === 'H') meta.push('<span class="m-prio">hoch</span>')
  if (t.project && opts.view !== 'project') meta.push(`<span class="m-proj">${esc(t.project)}</span>`)
  if (ctx.length && !opts.hideCtx) meta.push(`<span class="m-ctx">${ctx.map(esc).join(' ')}</span>`)
  if (t.annotations.length && !opts.android) meta.push(`<span class="m-note">${icon('note')}${t.annotations.length}</span>`)
  const status = fol ? fol.status : due ? due.status : opts.view === 'inbox' ? 'Inbox' : opts.view === 'someday' ? 'Irgendwann' : 'Nächste'
  const urgent = (due && due.kind === 'overdue') || (fol && fol.kind === 'due')
  return `<li class="row${urgent ? ' urgent' : ''}${t.start ? ' running' : ''}${opts.selected ? ' sel' : ''}${opts.other ? ' other' : ''}" data-id="${t.id}" role="listitem" aria-label="${esc(a11yRow(t, status))}">
    <button class="check" data-act="check" aria-label="Abhaken: ${esc(t.description)}"><span class="pill"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 10.4 3 3 6-6.6"/></svg></span></button>
    <div class="row-body" data-act="open">
      <div class="row-text">${esc(t.description)}${t.priority === 'H' ? '<i class="prio" title="Priorität hoch"></i>' : ''}</div>
      ${meta.length ? `<div class="row-meta">${meta.join('<span class="dot">·</span>')}</div>` : ''}
    </div>
    ${opts.android ? '' : `<div class="row-tools">
      <button class="tool" data-act="start" aria-label="${t.start ? 'Pausieren' : 'Starten'}" title="${t.start ? 'Pausieren' : 'Starten'} (S)">${icon(t.start ? 'pause' : 'play')}</button>
      <button class="tool" data-act="open" aria-label="Details" title="Details (Enter)">${icon('forward')}</button>
    </div>`}
  </li>`
}

export function sectionHTML(title, count, rows, opts = {}) {
  return `<section class="sec${opts.cls ? ' ' + opts.cls : ''}">
    <h3 class="eyebrow"><span class="slash">//</span> ${esc(title)}${count != null ? ` <span class="sec-n">${count}</span>` : ''}</h3>
    ${rows.length ? `<ul class="sheet rows" role="list">${rows.join('')}</ul>` : `<p class="sheet empty">${esc(opts.empty || 'Nichts hier.')}</p>`}
  </section>`
}

export function trayHTML(tr, count, opts = {}) {
  return `<button class="tray tray-${tr.to.replace(/[^a-z]/g, '')}" data-to="${tr.to}" aria-label="${esc(tr.label)} (Taste ${tr.key})">
    <span class="tray-top">${icon(tr.icon)}<kbd>${tr.key}</kbd></span>
    <span class="tray-label">${esc(tr.label)}</span>
    <span class="tray-foot"><span class="tray-hint">${esc(tr.hint)}</span>${count != null && !opts.noCount ? `<span class="tray-n" data-n="${count}">${count}</span>` : ''}</span>
  </button>`
}

export function stackFaceHTML(t, i, n) {
  if (!t) return ''
  const note = t.annotations[0]?.description
  return `<div class="face-top"><span class="eyebrow"><span class="slash">//</span> erfasst ${wdm(t.entry)} · ${hm(t.entry)}</span><span class="face-n">${t.project ? esc(t.project) : ''}</span></div>
    <p class="face-text">${esc(t.description)}</p>
    ${note ? `<p class="face-note">${icon('note')}${esc(note)}</p>` : '<p class="face-note face-note-empty"></p>'}
    <div class="face-tools">
      <button class="chip ghost" data-face="project">${icon('folder')}${t.project ? esc(t.project) : 'Projekt'}<kbd>P</kbd></button>
      <button class="chip ghost" data-face="edit">${icon('edit')}Bearbeiten<kbd>E</kbd></button>
      <button class="chip ghost" data-face="tickler">${icon('tickler')}Zurückstellen<kbd>T</kbd></button>
      <button class="chip ghost" data-face="skip">${icon('later')}Überspringen<kbd>→</kbd></button>
    </div>`
}

export { contextsOf, tagParts }
