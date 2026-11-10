// M5 "Überall": the data the phone shows, derived from the shared demo set.
// Android uses the preset contexts @home @computer @work @business, so the demo contexts are
// mapped here (shared/data stays untouched). Rules follow the Android app: Inbox newest first,
// lenient context filter on Nächste, "Fällig" never filtered, a due task shown only once.

import { TASKS, parseTw, tagParts } from '../../shared/data/tasks.js'

export const TODAY = '2026-10-31'
export const CONTEXTS = ['Alle', '@home', '@computer', '@work', '@business'] // widget chip order
export const CTX_MAP = { '@computer': '@computer', '@anrufe': '@business', '@zuhause': '@home', '@unterwegs': '@home', '@buero': '@work' }

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function freshTasks() {
  return structuredClone(TASKS).map((t) => {
    const tags = [...new Set(tagParts(t).map((p) => (p.startsWith('@') ? CTX_MAP[p] || p : p)))]
    const out = { ...t, tags }
    // one follow-up that is due today, so Warten auf shows its "Nachhaken" state
    if (t.description === 'Rückmeldung Vermieter zur Kaution') out.scheduled = '20261030T080000Z'
    return out
  })
}

export const day = (tw) => {
  const d = parseTw(tw)
  return d ? d.toISOString().slice(0, 10) : null
}
export const dmy = (tw) => {
  const d = parseTw(tw)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`
}
export const wdmy = (tw) => `${WD[parseTw(tw).getUTCDay()]} ${dmy(tw)}`

const ctxOf = (t) => t.tags.filter((p) => p.startsWith('@'))
const has = (t, tag) => t.tags.includes(tag)
const visible = (t) => t.status === 'pending' && !t._held

export function inbox(tasks) {
  return tasks.filter((t) => visible(t) && !t.project && ctxOf(t).length === 0 && !has(t, 'waiting') && !has(t, 'someday'))
    .sort((a, b) => (b.entry > a.entry ? 1 : -1))
}
export function due(tasks) {
  return tasks.filter((t) => visible(t) && t.due && day(t.due) <= TODAY)
    .sort((a, b) => (a.due > b.due ? 1 : -1))
}
export function next(tasks, ctx = 'Alle') {
  const dueIds = new Set(due(tasks).map((t) => t.id))
  return tasks.filter((t) => visible(t) && ctxOf(t).length > 0 && !has(t, 'waiting') && !has(t, 'someday') && !dueIds.has(t.id))
    .filter((t) => ctx === 'Alle' || ctxOf(t).includes(ctx) || ctxOf(t).length === 0)
    .sort((a, b) => b.urgency - a.urgency)
}
export const followDue = (t) => {
  const d = t.scheduled || t.wait
  return !!d && day(d) <= TODAY
}
export function waiting(tasks) {
  return tasks.filter((t) => visible(t) && has(t, 'waiting'))
    .sort((a, b) => (followDue(b) - followDue(a)) || ((a.wait || 'z') > (b.wait || 'z') ? 1 : -1))
}

/** One row as the app (and the widget) shows it: text, meta parts, accessibility status. */
export function rowOf(t, list) {
  const id8 = t.local ? `lokal ${String(t.uuid).slice(-8)}` : `ID ${t.uuid.slice(-8)}`
  const meta = []
  let status = 'Inbox'
  let overdue = false
  if (list === 'inbox') {
    if (t.net === 'wait') { status = 'wartet auf Netz'; meta.push('<span class="net">wartet auf Netz</span>') }
    if (t.net === 'setup') { status = 'wartet auf Setup'; meta.push('<span class="net">wartet auf Setup</span>') }
    if (t.net === 'fail') { status = 'Nicht gesendet'; meta.push('<span class="fail">Nicht gesendet · antippen</span>') }
  } else if (list === 'waiting') {
    if (followDue(t)) { status = 'Nachhaken fällig'; meta.push('<span class="fu">Nachhaken fällig</span>') } else status = 'Wartet'
    if (t.wait && !followDue(t)) meta.push(`<span>Wiedervorlage ${wdmy(t.wait)}</span>`)
    const since = t.annotations?.[0]?.entry || t.entry
    meta.push(`<span>seit ${dmy(since)}</span>`)
    if (t.project) meta.push(`<span>${t.project}</span>`)
  } else {
    status = 'Nächste'
    if (t.due && day(t.due) < TODAY) { status = 'überfällig'; overdue = true; meta.push(`<span class="od">überfällig ${dmy(t.due)}</span>`) }
    else if (t.due && day(t.due) === TODAY) { status = 'fällig heute'; meta.push('<span class="td">fällig heute</span>') }
    else if (t.due) meta.push(`<span>${wdmy(t.due)}</span>`)
    if (t.start) meta.push('<span class="run">läuft</span>')
    if (t.project) meta.push(`<span>${t.project}</span>`)
    meta.push(`<span>${ctxOf(t).join(' ')}</span>`)
  }
  return { id: t.id, text: t.description, meta: meta.join(''), overdue, a11y: `${t.description}, ${status}, ${id8}`, fresh: !!t.fresh }
}
