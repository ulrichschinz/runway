// Prototype store for proposal 01. Same rules on web and Android: these functions are what
// would live in runway's frontend/src/shared/ (pure, testable) and in the Kotlin gtd/ package.
import { TASKS, PROJECTS, TODAY, tagParts, contextsOf, parseTw } from '../shared/data/tasks.js'

export { TODAY }
export const NOW_LABEL = '09:42'
const NOW_TW = '20261031T084200Z'
export const UNDO_MS = 6000

// ---- demo state: a copy of the shared data, plus what this proposal needs to show ----
// 1. "Für heute": two next actions are marked for today (scheduled = today), so the
//    Tageslinse has a plan to measure against. The three todos done this morning were marked
//    for today too, so they count as planned (3 von 7). 2. Waiting items carry a follow-up day.
// 3. One inbox item is eleven days old, to show the attention dot (older than seven days).
const tasks = structuredClone(TASKS)
const byDesc = (d) => tasks.find((t) => t.description === d)
const TODAY_TW = '20261030T230000Z' // 31.10. 00:00 Europe/Berlin
byDesc('Steuerberatung zurückrufen').scheduled = TODAY_TW
byDesc('Startseiten-Text kürzen').scheduled = TODAY_TW
for (const d of ['Wochenplan aufschreiben', 'Zahnarzttermin vereinbaren', 'Newsletter-Abo kündigen']) byDesc(d).scheduled = TODAY_TW
byDesc('Winterreifen wechseln lassen').entry = '20261020T081500Z'
byDesc('Rückmeldung Vermieter zur Kaution').scheduled = '20261028T230000Z'
byDesc('Play-Store-Prüfung der App').scheduled = '20261101T230000Z'
const projects = structuredClone(PROJECTS).map((p) => ({ ...p, status: p.status === 'someday' ? 'on_hold' : p.status }))
let seq = Math.max(...tasks.map((t) => t.id))

export const state = {
  tasks,
  projects,
  view: 'next',
  context: null,
  query: '',
  showDone: false,
  openId: null,
  clarifyId: null,
  projectName: null,
  holds: [], // pending writes, undoable for UNDO_MS (same outbox rule as Android)
  lastReview: '2026-10-25',
  plans: {
    Garten: { purpose: 'Der Garten übersteht den Winter ohne Schäden.', vision: 'Beete gemulcht, Rosen geschnitten, Wasserleitung entleert.', brainstorm: ['Rosen zurückschneiden', 'Laub auf die Beete', 'Außenwasserhahn abstellen', 'Kübelpflanzen in die Garage'], organized: ['Rosen zurückschneiden', 'Außenwasserhahn abstellen', 'Laub auf die Beete'] },
  },
}

// ---- dates (Europe/Berlin; CET on 31.10.2026) ----
export function dayOf(tw) {
  const d = parseTw(tw)
  if (!d) return null
  return new Date(d.getTime() + 3600_000).toISOString().slice(0, 10)
}
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export function fmtDay(day, { weekday = true } = {}) {
  if (!day) return ''
  const [y, m, d] = day.split('-')
  const wd = WD[new Date(`${day}T12:00:00Z`).getUTCDay()]
  return `${weekday ? wd + ' ' : ''}${d}.${m}.`
}
export function relDay(day) {
  if (!day) return ''
  const diff = Math.round((Date.parse(day) - Date.parse(TODAY)) / 86400000)
  if (diff === 0) return 'heute'
  if (diff === 1) return 'morgen'
  if (diff === -1) return 'gestern'
  if (diff > 1 && diff < 7) return fmtDay(day)
  return fmtDay(day, { weekday: diff > -7 && diff < 7 })
}
export function age(tw) {
  const ms = parseTw(NOW_TW) - parseTw(tw)
  const h = Math.round(ms / 3600_000)
  if (h < 1) return 'gerade eben'
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'seit gestern' : `seit ${d} Tagen`
}
const addDays = (n) => {
  const d = new Date(Date.parse(TODAY) + n * 86400000)
  return d.toISOString().slice(0, 10).replace(/-/g, '') + 'T080000Z'
}

// ---- rules ----
const has = (t, tag) => tagParts(t).includes(tag)
export const ctxOf = contextsOf
export const isOpen = (t) => t.status === 'pending' && !heldDone(t.id)
function heldDone(id) { return state.holds.some((h) => h.id === id && (h.kind === 'done' || h.kind === 'delete')) }

export const isInbox = (t) => isOpen(t) && !t.project && tagParts(t).length === 0
export const isWaiting = (t) => isOpen(t) && has(t, 'waiting')
export const isSomeday = (t) => isOpen(t) && has(t, 'someday')
// Prototype only: the shared demo data has no +next tags and treats "has a context" as next.
// The real lists.js uses +next, exactly as /gtd/next does (Android's P08 compares the sets).
export const isNext = (t) => isOpen(t) && !has(t, 'waiting') && !has(t, 'someday') && (has(t, 'next') || ctxOf(t).length > 0)
export const isDue = (t) => isOpen(t) && !!t.due && dayOf(t.due) <= TODAY
export const isOverdue = (t) => isOpen(t) && !!t.due && dayOf(t.due) < TODAY
export const isRunning = (t) => t.status === 'pending' && !!t.start
export const isMarkedToday = (t) => !!t.scheduled && dayOf(t.scheduled) <= TODAY && !has(t, 'waiting')
// "Planned for today" is one rule for open and done todos: due today or earlier, marked for
// today (scheduled <= today) or started. A completed todo keeps due, scheduled and start.
export const isPlannedToday = (t) => (!!t.due && dayOf(t.due) <= TODAY) || isMarkedToday(t) || !!t.start
// Next actions in the "für heute" group (sorted first inside Nächste Aktionen)
export const isToday = (t) => isNext(t) && isPlannedToday(t)
export const INBOX_STALE_DAYS = 7
export const inboxAgeDays = (t) => Math.floor((Date.parse(TODAY) - Date.parse(dayOf(t.entry))) / 86400000)
export const isStale = (t) => inboxAgeDays(t) > INBOX_STALE_DAYS
export const isTickler = (t) => isOpen(t) && !!t.wait && dayOf(t.wait) > TODAY && !has(t, 'waiting')
export const followUp = (t) => dayOf(t.scheduled || t.wait)
export const followUpDue = (t) => isWaiting(t) && !!followUp(t) && followUp(t) <= TODAY
export const doneToday = () => state.tasks.filter((t) => t.status === 'completed' && dayOf(t.end) === TODAY)

// Context filter, one rule on both clients: a task matches when it carries the context or has
// no context at all (it can be done anywhere). Fällig is never filtered.
export const matchesContext = (t, ctx = state.context) => !ctx || ctxOf(t).length === 0 || ctxOf(t).includes(ctx)

export function contexts() {
  const set = new Set()
  state.tasks.filter(isOpen).forEach((t) => ctxOf(t).forEach((c) => set.add(c)))
  return ['@computer', '@anrufe', '@zuhause', '@unterwegs', '@buero'].filter((c) => set.has(c))
    .concat([...set].filter((c) => !['@computer', '@anrufe', '@zuhause', '@unterwegs', '@buero'].includes(c)).sort())
}

const byUrgency = (a, b) => b.urgency - a.urgency
const byEntryDesc = (a, b) => (b.entry > a.entry ? 1 : -1)

// Nächste has the shape Android's acceptance contract P08 pins, on both clients:
// "Fällig" (every open todo due today or earlier, never filtered) and then "Nächste Aktionen",
// which is exactly /gtd/next under the context filter. A due next action therefore appears in
// both. Inside Nächste Aktionen the "für heute" group comes first (a row mark, not a section).
export function lists() {
  const open = state.tasks.filter(isOpen)
  const due = open.filter(isDue).sort((a, b) => (a.due > b.due ? 1 : -1))
  const nextAll = open.filter((t) => isNext(t) && matchesContext(t))
  const today = nextAll.filter(isToday).sort((a, b) => (isRunning(b) - isRunning(a)) || (isDue(b) - isDue(a)) || byUrgency(a, b))
  const later = nextAll.filter((t) => !isToday(t)).sort(byUrgency)
  const next = [...today, ...later]
  const waiting = open.filter(isWaiting).sort((a, b) => (followUpDue(b) - followUpDue(a)) || ((followUp(a) || '9') > (followUp(b) || '9') ? 1 : -1))
  return {
    inbox: open.filter(isInbox).sort(byEntryDesc),
    due, today, later, next,
    nextCount: open.filter(isNext).length,
    waiting,
    someday: open.filter(isSomeday).sort(byUrgency),
    tickler: open.filter(isTickler),
    all: state.tasks.filter((t) => state.showDone ? t.status !== 'deleted' : isOpen(t)).sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || byUrgency(a, b)),
  }
}

// The Tageslinse: done versus today's plan. The denominator only changes when the plan changes
// (T marks a todo for today, a due date arrives), never because something unplanned was done.
// total = open and planned (Fällig + für heute) + done today and planned.
// extra = done today but never planned: shown apart ("4 von 7 · 1 zusätzlich"), no bead.
export function progress() {
  const open = state.tasks.filter(isOpen)
  const planned = open.filter((t) => isDue(t) || isToday(t)).length
  const doneAll = doneToday()
  const done = doneAll.filter(isPlannedToday).length
  const extra = doneAll.length - done
  const total = done + planned
  return { done, planned, extra, total, level: total ? done / total : 0 }
}
export const countsForToday = (t) => isOpen(t) && (isDue(t) || isToday(t))
export function progressLabel(p, { heute = true, short = false } = {}) {
  if (short) return `${p.done} von ${p.total}${p.extra ? ` +${p.extra}` : ''}` // under the 72 px phone lens
  return `${p.done} von ${p.total}${heute ? ' heute' : ''}${p.extra ? ` · ${p.extra} zusätzlich` : ''}`
}

export function projectOverview() {
  const open = state.tasks.filter(isOpen)
  return state.projects.map((p) => {
    const mine = open.filter((t) => t.project === p.name)
    const next = mine.filter(isNext).length
    const waiting = mine.filter(isWaiting).length
    const tickler = mine.filter(isTickler).length
    const stalled = p.status === 'active' && next === 0 && waiting === 0 && tickler === 0
    return { ...p, open: mine.length, next, waiting, stalled, hasPlan: !!state.plans[p.name] }
  })
}

export function counts() {
  const l = lists()
  const ov = projectOverview()
  return {
    inbox: l.inbox.length, next: l.nextCount, waiting: l.waiting.length,
    followUps: l.waiting.filter(followUpDue).length,
    projects: ov.filter((p) => p.status === 'active').length, stalled: ov.filter((p) => p.stalled).length,
    someday: l.someday.length + l.tickler.length, overdue: state.tasks.filter(isOverdue).length,
  }
}

export function find(id) { return state.tasks.find((t) => String(t.id) === String(id) || t.uuid === id || t.description === id) }

export function search(q, { done = false } = {}) {
  const s = q.trim().toLowerCase()
  if (!s) return []
  return state.tasks.filter((t) => (done ? t.status !== 'deleted' : isOpen(t)))
    .filter((t) => [t.description, t.project || '', tagParts(t).join(' '), ...(t.annotations || []).map((a) => a.description)].join(' ').toLowerCase().includes(s))
    .slice(0, 12)
}

export function listOf(t) {
  if (t.status === 'completed') return 'Erledigt'
  if (isInbox(t)) return 'Inbox'
  if (isWaiting(t)) return 'Warten auf'
  if (isSomeday(t)) return 'Irgendwann'
  if (isTickler(t)) return 'Zurückgelegt'
  if (isNext(t)) return 'Nächste'
  return t.project ? 'Projekt' : 'Ohne Liste'
}

// ---- events ----
const listeners = new Set()
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function emit(type, detail = {}) { listeners.forEach((fn) => fn(type, detail)) }

// ---- writes: each one is held for UNDO_MS before it would be sent (client-side hold) ----
function hold(kind, id, undo, label) {
  const h = { kind, id, undo, label, at: performance.now(), key: Math.random().toString(36).slice(2) }
  state.holds.push(h)
  setTimeout(() => { const i = state.holds.indexOf(h); if (i >= 0) { state.holds.splice(i, 1); emit('sent', h) } }, UNDO_MS)
  return h
}

export function complete(id) {
  const t = find(id)
  if (!t || t.status !== 'pending') return null
  const before = progress()
  const prev = { status: t.status, end: t.end, start: t.start }
  t.status = 'completed'; t.end = NOW_TW // start stays: a started todo counts as planned
  const h = hold('done', t.id, () => Object.assign(t, prev), `Erledigt: ${t.description}`)
  const after = progress()
  emit('completed', { id: t.id, before, after, hold: h })
  return h
}

export function capture(text, note = '') {
  const description = String(text || '').replace(/\s+/g, ' ').trim()
  if (!description) return null
  seq += 1
  const t = { id: seq, uuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, description, status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 1, entry: NOW_TW.replace('0842', '0843').replace(/T(\d{4})/, (m, hm) => `T${hm}`), start: null, annotations: note ? [{ entry: NOW_TW, description: note }] : [] }
  t.entry = `20261031T08${String(42 + (seq % 17)).padStart(2, '0')}00Z`
  state.tasks.push(t)
  const h = hold('capture', t.id, () => { t.status = 'deleted' }, 'In Inbox ✓')
  emit('captured', { id: t.id, hold: h })
  return t
}

export function remove(id) {
  const t = find(id)
  if (!t) return null
  const prev = t.status
  t.status = 'deleted'
  const h = hold('delete', t.id, () => { t.status = prev }, 'Gelöscht')
  emit('deleted', { id: t.id, hold: h })
  return h
}

export function undo(key) {
  const i = key ? state.holds.findIndex((h) => h.key === key) : state.holds.length - 1
  if (i < 0) return null
  const [h] = state.holds.splice(i, 1)
  const before = progress()
  h.undo()
  emit('undone', { hold: h, before, after: progress() })
  return h
}

export function setTags(id, { add = [], remove: rm = [] }) {
  const t = find(id)
  const parts = tagParts(t).filter((p) => !rm.includes(p))
  add.forEach((a) => { if (!parts.includes(a)) parts.push(a) })
  t.tags = parts
}

// Clarify an inbox item: 'next:@computer' | 'next' | 'waiting' | 'someday' | 'delete' | 'done' | 'project:Name'
export function clarify(id, to, extra = {}) {
  const t = find(id)
  if (!t) return null
  const [kind, arg] = String(to).split(':')
  const prevTags = [...t.tags], prevProject = t.project, prevSched = t.scheduled, prevWait = t.wait
  const restore = () => { t.tags = prevTags; t.project = prevProject; t.scheduled = prevSched; t.wait = prevWait }
  if (extra.description) t.description = extra.description
  if (extra.project) t.project = extra.project
  if (kind === 'delete') return remove(id)
  if (kind === 'done') return complete(id)
  if (kind === 'next') { setTags(id, { add: [arg || extra.context || '@computer', 'next'].filter(Boolean), remove: ['waiting', 'someday'] }); t.urgency = 15 + (t.urgency || 0) }
  if (kind === 'waiting') { setTags(id, { add: ['waiting'], remove: ['next', 'someday'] }); t.scheduled = extra.followUp || addDays(3) }
  if (kind === 'someday') setTags(id, { add: ['someday'], remove: ['next', 'waiting'] })
  if (kind === 'tickler') t.wait = extra.until || addDays(7)
  if (kind === 'project') { t.project = arg; setTags(id, { add: [extra.context || '@computer', 'next'] }) }
  const label = { next: 'Nach Nächste', waiting: 'Nach Warten auf', someday: 'Nach Irgendwann', tickler: 'Zurückgelegt', project: `Nach ${arg}` }[kind] || 'Geklärt'
  const h = hold('clarify', t.id, restore, label)
  emit('clarified', { id: t.id, to, hold: h })
  return h
}

// Move any task between lists (the detail panel's status switch). Uses tags_add / tags_remove.
export function moveTo(id, list) {
  const t = find(id)
  if (!t) return
  const strip = ['next', 'waiting', 'someday']
  if (list === 'inbox') { t.tags = []; t.project = null }
  if (list === 'next') setTags(id, { add: ['next', ...(ctxOf(t).length ? [] : ['@computer'])], remove: strip.filter((s) => s !== 'next') })
  if (list === 'waiting') setTags(id, { add: ['waiting'], remove: ['next', 'someday'] })
  if (list === 'someday') setTags(id, { add: ['someday'], remove: ['next', 'waiting'] })
  emit('changed', { id: t.id })
}

export function update(id, fields) {
  const t = find(id)
  if (!t) return
  Object.assign(t, fields)
  emit('changed', { id: t.id })
}
export function toggleToday(id) {
  const t = find(id)
  t.scheduled = isMarkedToday(t) ? null : TODAY_TW
  emit('changed', { id: t.id })
}
export function toggleStart(id) {
  const t = find(id)
  t.start = t.start ? null : NOW_TW
  emit('changed', { id: t.id })
}
export function setContext(id, ctx) {
  const t = find(id)
  const cur = ctxOf(t)
  setTags(id, cur.includes(ctx) ? { remove: [ctx] } : { add: [ctx] })
  emit('changed', { id: t.id })
}
export function annotate(id, text) {
  const t = find(id)
  t.annotations = [...(t.annotations || []), { entry: NOW_TW, description: text }]
  emit('changed', { id: t.id })
}
export function addTask(description, fields = {}) {
  seq += 1
  const t = { id: seq, uuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, description, status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 15, entry: NOW_TW, start: null, annotations: [], ...fields }
  state.tasks.push(t)
  emit('added', { id: t.id })
  return t
}
export function setProjectStatus(name, status) {
  const p = state.projects.find((x) => x.name === name)
  if (p) { p.status = status; emit('changed', {}) }
}
export function recordReview() { state.lastReview = TODAY; emit('changed', {}) }
export function savePlan(name, plan) { state.plans[name] = plan; emit('changed', {}) }
