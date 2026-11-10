// Rendering helpers shared by the web app (web.js) and the phone app (android.js):
// German dates, list names and headings, the row markup, the ink strike and the tally.

import { TODAY, NOW, dayKey, parseTw, contextsOf, followUp } from './store.js'

export const VIEW = {
  inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', projects: 'Projekte', someday: 'Irgendwann',
  review: 'Rückblick', all: 'Alle', settings: 'Einstellungen',
}

// Big quiet headings with exactly one Fraunces italic accent word.
export const HEADINGS = {
  inbox: ['Was ist ', 'das', '?'],
  inboxEmpty: ['Inbox ist ', 'leer', '.'],
  next: ['Was jetzt ', 'zählt', ''],
  waiting: ['Worauf du ', 'wartest', ''],
  projects: ['Was du ', 'bewegst', ''],
  someday: ['Später, ', 'vielleicht', ''],
  review: ['Die Woche, ', 'sortiert', ''],
  all: ['Alles auf ', 'einen', ' Blick'],
  settings: ['Dein ', 'runway', ''],
  search: ['Gefunden in ', 'allen', ' Listen'],
}
export const heading = (key) => { const [a, b, c] = HEADINGS[key]; return `${esc(a)}<em>${esc(b)}</em>${esc(c)}` }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const fWd = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
const fLong = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' })
const fDM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
const fHM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
export const wd = (d) => fWd.format(d).replace('.', '')
export const dm = (d) => { const s = fDM.format(d); return s.endsWith('.') ? s : s + '.' }
export const hm = (d) => fHM.format(d)
export const longDay = (d) => fLong.format(d)
export const day = (d) => `${wd(d)} ${dm(d)}`
const keyPlus = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const TOMORROW = keyPlus(TODAY, 1)
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)

export function dueInfo(t) {
  if (!t.due) return null
  const d = parseTw(t.due)
  const k = dayKey(d)
  if (k < TODAY) return { text: `überfällig · ${day(d)}`, short: 'überfällig', tone: 'overdue', status: 'überfällig' }
  if (k === TODAY) return { text: 'heute', short: 'heute', tone: 'today', status: 'fällig heute' }
  if (k === TOMORROW) return { text: 'morgen', short: 'morgen', tone: 'soon' }
  return { text: day(d), short: dm(d), tone: daysBetween(TODAY, k) <= 7 ? 'soon' : '' }
}
// Android P10: the word "Nachhaken" appears on due follow-ups only, always with the yellow ring
// ("needs a look"); later ones read "Wiedervorlage".
export function followInfo(t) {
  const f = followUp(t)
  if (f) {
    const k = dayKey(f)
    if (k <= TODAY) return { text: k === TODAY ? 'Nachhaken heute' : `Nachhaken seit ${dm(f)}`, tone: 'follow', due: true, key: k }
    return { text: `Wiedervorlage ${day(f)}`, tone: '', due: false, key: k }
  }
  return { text: `wartet seit ${dm(parseTw(t.entry))}`, tone: '', due: false, key: null }
}
export function entryInfo(t) {
  const d = parseTw(t.entry)
  const k = dayKey(d)
  if (k === TODAY) return `heute ${hm(d)}`
  if (daysBetween(k, TODAY) === 1) return `gestern ${hm(d)}`
  return day(d)
}
export const sinceStart = (t) => t.start ? hm(parseTw(t.start)) : ''

// The brand mark, verbatim from shared/brand/logos/mark-color.svg (never redrawn or recoloured).
// On dark surfaces the kit's own .ar-on-dark rule recolours the plum strokes and nodes to paper.
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true" class="mark"><g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19.000" r="2" fill="#F4C84A"/></svg>`

// The kit's .ar-nav-brand: the 32 px mark plus "Agentic Reach" in the page font (brand rule 10).
export const LOCKUP = `<span class="lockup">${MARK}<span>Agentic Reach</span></span>`

// Seeded wobble so every strike looks hand-drawn but stays the same for a task.
const rnd = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280
export function strikePath(id) {
  const r = rnd(Number(id) * 7919 + 13)
  const y0 = 6.2 + (r() - 0.5) * 1.4, y3 = 5.4 + (r() - 0.5) * 1.6
  const c1 = 5 + (r() - 0.5) * 2.2, c2 = 6.4 + (r() - 0.5) * 2.2
  return `M0.6 ${y0.toFixed(2)} C 30 ${c1.toFixed(2)}, 62 ${c2.toFixed(2)}, 99.4 ${y3.toFixed(2)}`
}
export const strikeSVG = (id) =>
  `<svg class="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="${strikePath(id)}"/></svg>`

// Strichliste: four upright strokes per group, the fifth a coral strike across them.
export function tallySVG(n, { fresh = -1 } = {}) {
  const r = rnd(4242)
  const parts = []
  let x = 2
  for (let i = 0; i < n; i++) {
    const inGroup = i % 5
    const cls = i === fresh ? ' fresh' : ''
    if (inGroup === 4) {
      const gx = x - 4 * 7
      parts.push(`<path class="t five${cls}" pathLength="1" d="M${gx - 2} 17.5 L${x - 3} 4.5"/>`)
      x += 8
    } else {
      const tilt = (r() - 0.5) * 2.2
      parts.push(`<path class="t${cls}" pathLength="1" d="M${(x + tilt).toFixed(1)} 3.5 L${(x - tilt * 0.4).toFixed(1)} 19"/>`)
      x += 7
    }
  }
  const w = Math.max(x + 2, 12)
  return `<svg class="tally" width="${w}" height="22" viewBox="0 0 ${w} 22" aria-hidden="true">${parts.join('')}</svg>`
}

// Minimal keyed DOM patch: nodes that stay in order are never detached, so running
// CSS transitions (the strike, the collapse) survive a re-render.
export function patch(parent, nodes) {
  let cur = parent.firstChild
  for (const n of nodes) {
    if (n === cur) { cur = cur.nextSibling; continue }
    parent.insertBefore(n, cur)
  }
  while (cur) { const nx = cur.nextSibling; parent.removeChild(cur); cur = nx }
}

export const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)

export const ctxLabel = (t) => { const c = contextsOf(t); return c.length ? c.join(' ') : 'überall' }
export { TODAY, NOW }
