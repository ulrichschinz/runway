// Rendering helpers (from 03's common.js): German dates, headings with one Fraunces accent word,
// the ink strike, the keyed DOM patch. Strings come from the message table (i18n.js).

import { TODAY, NOW, dayKey, parseTw, contextsOf, followUp } from './store.js'
import { t } from './i18n.js'

// Big quiet headings with exactly one Fraunces italic accent word: [before, accent, after] in i18n.js
export const heading = (key) => { const [a, b, c] = t(`h.${key}`); return `${esc(a)}<em>${esc(b)}</em>${esc(c)}` }

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
export const dayOfKey = (key) => day(new Date(key + 'T12:00:00Z'))
const keyPlus = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const TOMORROW = keyPlus(TODAY, 1)
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)

export function dueInfo(task) {
  if (!task.due) return null
  const d = parseTw(task.due)
  const k = dayKey(d)
  if (k < TODAY) return { text: t('due.overdue', { d: dm(d) }), tone: 'overdue', status: t('status.overdue') }
  if (k === TODAY) return { text: t('due.today'), tone: 'today', status: t('status.dueToday') }
  if (k === TOMORROW) return { text: t('due.tomorrow'), tone: 'soon' }
  return { text: day(d), tone: daysBetween(TODAY, k) <= 7 ? 'soon' : '' }
}
// Android P10: "Nachhaken" appears on due follow-ups only, always with the yellow ring; later ones
// read "Wiedervorlage".
export function followInfo(task) {
  const f = followUp(task)
  if (f) {
    const k = dayKey(f)
    if (k <= TODAY) return { text: k === TODAY ? t('follow.today') : t('follow.since', { d: dm(f) }), tone: 'follow', due: true, key: k }
    return { text: t('follow.later', { d: day(f) }), tone: '', due: false, key: k }
  }
  return { text: t('follow.none', { d: dm(parseTw(task.entry)) }), tone: '', due: false, key: null }
}
export function entryInfo(task) {
  const d = parseTw(task.entry)
  const k = dayKey(d)
  if (k === TODAY) return t('entry.today', { t: hm(d) })
  if (daysBetween(k, TODAY) === 1) return t('entry.yesterday', { t: hm(d) })
  return day(d)
}
export const sinceStart = (task) => task.start ? hm(parseTw(task.start)) : ''

// Follow-up choices for Warten auf (graft from 05): morgen · Freitag · nächste Woche · ohne Datum.
export function followOptions() {
  // after review: follow-ups are mostly business, so "morgen" is the next working day (Montag on a
  // Friday or weekend) and "nächste Woche" is the Monday after that day, never a weekend day
  const wd = (k) => new Date(k + 'T12:00:00Z').getUTCDay()
  let work = TOMORROW
  while ([0, 6].includes(wd(work))) work = keyPlus(work, 1)
  let friday = keyPlus(TODAY, ((5 - wd(TODAY) + 7) % 7) || 7)
  if (friday === work) friday = keyPlus(friday, 7) // on a Thursday, "morgen" already is Friday
  let monday = keyPlus(work, 1)
  while (wd(monday) !== 1) monday = keyPlus(monday, 1)
  return [
    { day: work, label: work === TOMORROW ? t('fu.tomorrow') : t('fu.monday') },
    { day: friday, label: t('fu.friday') },
    { day: monday, label: t('fu.week') },
    { day: '', label: t('fu.none') },
  ].map((o) => ({ ...o, hint: o.day ? dayOfKey(o.day) : t('fu.noneHint') }))
}

// The brand mark, verbatim from shared/brand/logos/mark-color.svg (never redrawn or recoloured).
// On dark surfaces the kit's own .ar-on-dark rule recolours the plum strokes and nodes to paper.
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true" class="mark"><g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19.000" r="2" fill="#F4C84A"/></svg>`

// The kit's .ar-nav-brand: the 32 px mark plus "Agentic Reach" in the page font (brand rule 10).
export const LOCKUP = `<span class="lockup">${MARK}<span>Agentic Reach</span></span>`

// Seeded wobble so every strike looks hand-drawn but stays the same for a todo.
const rnd = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280
export function strikePath(id) {
  const r = rnd(Number(id) * 7919 + 13)
  const y0 = 6.2 + (r() - 0.5) * 1.4, y3 = 5.4 + (r() - 0.5) * 1.6
  const c1 = 5 + (r() - 0.5) * 2.2, c2 = 6.4 + (r() - 0.5) * 2.2
  return `M0.6 ${y0.toFixed(2)} C 30 ${c1.toFixed(2)}, 62 ${c2.toFixed(2)}, 99.4 ${y3.toFixed(2)}`
}
export const strikeSVG = (id) =>
  `<svg class="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="${strikePath(id)}"/></svg>`

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

export const html = (s) => { const tpl = document.createElement('template'); tpl.innerHTML = s.trim(); return tpl.content.firstElementChild }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export { TODAY, NOW, contextsOf }
