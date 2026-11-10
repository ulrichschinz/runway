// Startbahn: state and GTD rules shared by index.html (web) and android.html.
// One rule set for both clients is part of the proposal (README "Unified rules").
import { TASKS, PROJECTS, CONTEXTS, TODAY, tagParts, contextsOf, parseTw } from '../shared/data/tasks.js'

const clone = (x) => JSON.parse(JSON.stringify(x))
export { CONTEXTS, TODAY, tagParts, contextsOf }

// ---------- data (copied, never mutate the shared arrays) ----------
const tasks = clone(TASKS)
const projects = clone(PROJECTS).map((p) => ({ ...p, status: p.status === 'someday' ? 'on_hold' : p.status }))
// Prototype-only: follow-up days (API field `scheduled`) for the waiting items, so the
// holding pattern can show "Nachhaken fällig". The shared demo data has none.
const FOLLOW_UP = {
  'Rückmeldung Vermieter zur Kaution': '20261026T230000Z',
  'Play-Store-Prüfung der App': '20261030T230000Z',
  'Feedback von Nora zum Logo-Entwurf': '20261102T230000Z',
  'Unterschrift Pilotkunde': '20261106T230000Z',
}
for (const t of tasks) if (FOLLOW_UP[t.description]) t.scheduled = FOLLOW_UP[t.description]
// Prototype-only: three completions from earlier days, so Erledigt can show "Früher"
// (GET /tasks?status=completed&completed_since=…). The shared demo data has only today.
let seq = 1000
for (const [description, end, tags] of [
  ['Domain für die Website verlängern', '20261030T151200Z', ['@computer']],
  ['Kaution überweisen', '20261029T093000Z', ['@computer']],
  ['Pflanzen winterfest einpacken', '20261028T160500Z', ['@zuhause']],
]) {
  seq += 1
  tasks.push({ id: seq, uuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, description, status: 'completed', project: null, tags, priority: null, due: null, scheduled: null, wait: null, urgency: 0, entry: '20261027T080000Z', end, start: null, annotations: [] })
}
// A plan for one project, so the plan tab has content (API: purpose, principles, vision,
// brainstorm[{id,text}], organized[{id,text}]; strings here for brevity).
const PLANS = {
  'Website-Relaunch': {
    purpose: 'Interessenten verstehen in 30 Sekunden, was wir tun, und fragen ein Erstgespräch an.',
    principles: 'Echte Fälle statt Behauptungen. Kurz vor lang. Jede Seite hat eine Frage, die sie beantwortet.',
    vision: 'Die Startseite erzählt drei echte Fälle. Jede Woche kommt mindestens eine Anfrage über die Seite.',
    brainstorm: ['Fallbeispiele als kurze Videos', 'Startseite kürzen', 'Logo-Feedback einholen', 'Kontaktformular vereinfachen'],
    organized: ['Logo-Feedback einholen', 'Startseite kürzen', 'Fallbeispiele als kurze Videos'],
  },
}

const NOW_MIN = 9 * 60 + 41 // prototype clock: Sa 31.10.2026, 09:41 Berlin
const listeners = new Set()

export const store = {
  tasks, projects, plans: PLANS,
  filter: null,
  held: [], // held ops (done, delete, clarify, edit): {key, id, uuid, kind, until, timer, ...}
  recent: [], // sent captures that can still be undone: {key, id, until}
  failed: [], // ops the server did not take: shown as "Nicht gesendet · Erneut senden"
  users: [{ name: 'uli', role: 'admin', you: true }, { name: 'demo', role: 'user' }],
  registration: false,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  emit(evt) { for (const fn of listeners) fn(evt) },
}

// ---------- dates (Europe/Berlin calendar day, as Android does today) ----------
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' })
const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
const wdFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' })
export const day = (tw) => (tw ? dayFmt.format(parseTw(tw)) : null)
export const ddmm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`
export const hhmm = (tw) => timeFmt.format(parseTw(tw))
const weekday = (tw) => wdFmt.format(parseTw(tw)).replace('.', '')
export const nowLabel = () => `${String(Math.floor(NOW_MIN / 60)).padStart(2, '0')}:${String(NOW_MIN % 60).padStart(2, '0')}`
export function daysFrom(d) { return Math.round((Date.parse(d) - Date.parse(TODAY)) / 86400000) }
// Berlin midnight of TODAY + n days, as a Taskwarrior timestamp (CET in November: UTC+1)
export const twInDays = (n) => { const d = new Date(Date.parse(TODAY) + (n - 1) * 86400000); return `${d.toISOString().slice(0, 10).replace(/-/g, '')}T230000Z` }

// ---------- classification ----------
const has = (t, tag) => tagParts(t).includes(tag)
export const isOpen = (t) => t.status === 'pending' && !t.held
export function listOf(t) {
  if (has(t, 'waiting')) return 'waiting'
  if (has(t, 'someday')) return 'someday'
  if (contextsOf(t).length || has(t, 'next')) return 'next'
  if (!t.project && tagParts(t).length === 0) return 'inbox'
  return null // project-only task (shows in its project)
}
export const isOverdue = (t) => !!t.due && day(t.due) < TODAY
export const isDueToday = (t) => !!t.due && day(t.due) === TODAY
export const isDue = (t) => isOverdue(t) || isDueToday(t)
export const followUp = (t) => t.scheduled || t.wait || null
export const followUpDue = (t) => !!followUp(t) && day(followUp(t)) <= TODAY
export const isHidden = (t) => !!t.wait && day(t.wait) > TODAY

// Urgency as three readable tiers (README "Urgency tiers"). Drives the lane light, the core
// colour, the coral ring and the widget lane dot. The raw urgency number only sorts.
export const SOON_DAYS = 3
export function tierOf(t) {
  if (isOverdue(t)) return 'over'
  if (t.due && daysFrom(day(t.due)) <= SOON_DAYS) return 'soon'
  return 'calm'
}

// Unified context rule: a context filter keeps tasks with that context and tasks without any
// context (they can be done anywhere). It applies to Nächste (and the widget). Due items of
// other contexts stay visible, but separately and never in the cleared three.
export const matchesContext = (t, ctx) => !ctx || contextsOf(t).includes(ctx) || contextsOf(t).length === 0

const byUrgency = (a, b) => b.urgency - a.urgency
const byDue = (a, b) => (isOverdue(b) - isOverdue(a)) || (parseTw(a.due) - parseTw(b.due))

export const sel = {
  open: () => tasks.filter(isOpen),
  inbox: () => sel.open().filter((t) => listOf(t) === 'inbox').sort((a, b) => b.entry.localeCompare(a.entry)),
  due: () => sel.open().filter((t) => isDue(t) && !['waiting', 'someday', 'inbox'].includes(listOf(t))).sort(byDue),
  // Nächste for a context: due (in context) first, then the rest by urgency. `dueOther` holds
  // due items of other contexts: shown as "Fällig · andere Kontexte", never ranked.
  next: (ctx = store.filter) => {
    const dueAll = sel.due()
    const due = dueAll.filter((t) => matchesContext(t, ctx))
    const dueOther = dueAll.filter((t) => !matchesContext(t, ctx))
    const rest = sel.open().filter((t) => listOf(t) === 'next' && !dueAll.includes(t) && matchesContext(t, ctx)).sort(byUrgency)
    return { due, dueOther, rest, all: [...due, ...rest] }
  },
  // The runway: the first three of Nächste (in the active context) are cleared, the rest queue.
  runway: (ctx = store.filter) => {
    const all = sel.next(ctx).all
    return { cleared: all.slice(0, 3), queue: all.slice(3) }
  },
  ctxCount: (ctx) => sel.next(ctx).all.length, // one number for chip, sidebar and title
  waiting: () => sel.open().filter((t) => listOf(t) === 'waiting')
    .sort((a, b) => (followUpDue(b) - followUpDue(a)) || ((followUp(a) || '9').localeCompare(followUp(b) || '9'))),
  someday: () => sel.open().filter((t) => listOf(t) === 'someday').sort(byUrgency),
  // Zurückgestellt: hidden until a date. Waiting items live in Warten auf only.
  tickler: () => sel.open().filter((t) => isHidden(t) && listOf(t) !== 'waiting').sort((a, b) => a.wait.localeCompare(b.wait)),
  doneToday: () => tasks.filter((t) => t.status === 'completed' && t.end && day(t.end) === TODAY)
    .sort((a, b) => b.end.localeCompare(a.end)),
  doneEarlier: () => tasks.filter((t) => t.status === 'completed' && t.end && day(t.end) < TODAY)
    .sort((a, b) => b.end.localeCompare(a.end)),
  done: () => tasks.filter((t) => t.status === 'completed').sort((a, b) => (b.end || '').localeCompare(a.end || '')),
  byId: (id) => tasks.find((t) => t.id === Number(id)),
  contexts: () => CONTEXTS.map((c) => ({ name: c, count: sel.ctxCount(c) })),
  project: (name) => projects.find((p) => p.name === name),
  projectTasks: (name) => sel.open().filter((t) => t.project === name),
  projects: () => projects.map((p) => {
    const ts = sel.projectTasks(p.name)
    const next = ts.filter((t) => listOf(t) === 'next').length
    const waiting = ts.filter((t) => listOf(t) === 'waiting').length
    const hidden = ts.filter(isHidden).length
    const doneTotal = tasks.filter((t) => t.project === p.name && t.status === 'completed').length
    const stalled = p.status === 'active' && next === 0 && waiting === 0 && hidden === 0
    return { ...p, open: ts.length, next, waiting, hidden, doneTotal, stalled, hasPlan: !!PLANS[p.name] }
  }).sort((a, b) => (b.stalled - a.stalled) || ((a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1))),
  counts: () => ({
    inbox: sel.inbox().length,
    next: sel.next(null).all.length,
    waiting: sel.waiting().length,
    projects: projects.filter((p) => p.status === 'active').length,
    someday: sel.someday().length,
    tickler: sel.tickler().length,
    doneToday: sel.doneToday().length,
    due: sel.due().length,
    overdue: sel.due().filter(isOverdue).length,
    followUps: sel.waiting().filter(followUpDue).length,
    stalled: sel.projects().filter((p) => p.stalled).length,
    failed: store.failed.length,
  }),
}

// ---------- labels (German, calm, no exclamation marks) ----------
export const LIST_NAMES = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', projects: 'Projekte', someday: 'Irgendwann' }
export function dueLabel(t) {
  if (!t.due) return null
  const d = day(t.due)
  if (d < TODAY) return { text: `überfällig seit ${ddmm(d)}`, tone: 'over' }
  if (d === TODAY) return { text: 'fällig heute', tone: 'today' }
  const n = daysFrom(d)
  return { text: n === 1 ? 'fällig morgen' : `fällig ${weekday(t.due)} ${ddmm(d)}`, tone: n <= SOON_DAYS ? 'soon' : 'later' }
}
export function followUpLabel(t) {
  const f = followUp(t)
  if (!f) return { text: 'ohne Wiedervorlage', tone: 'none' }
  const d = day(f)
  if (d < TODAY) return { text: `Nachhaken seit ${ddmm(d)}`, tone: 'due' }
  if (d === TODAY) return { text: 'Nachhaken heute', tone: 'due' }
  return { text: `Wiedervorlage ${ddmm(d)}`, tone: 'later' }
}
export const startedLabel = (t) => (t.start ? `läuft seit ${hhmm(t.start)}` : null)
export const contextLabel = (t) => contextsOf(t).join(' ')

// "Laub rechen @zuhause" -> { text: 'Laub rechen', ctxs: ['@zuhause'] }
export function splitContexts(text) {
  const ctxs = []
  const rest = String(text || '').replace(/(^|\s)(@[\p{L}\p{N}_-]+)/gu, (m, sp, c) => { ctxs.push(c.toLowerCase()); return sp }).replace(/\s+/g, ' ').trim()
  return { text: rest, ctxs: [...new Set(ctxs)] }
}

// Project name rules from the API (models.py): 1–100 chars, none of ( ) " ' \ : / ? # %,
// no leading + - or space, no trailing space, not "overview" or "plans", not taken.
export function projectNameError(raw) {
  const name = String(raw ?? '')
  if (!name.trim()) return 'Name fehlt'
  if (name.length > 100) return 'Höchstens 100 Zeichen'
  if (/[()"'\\:/?#%]/.test(name)) return 'Ohne ( ) " \' \\ : / ? # %'
  if (/^[+\- ]/.test(name) || / $/.test(name)) return 'Nicht mit + - oder Leerzeichen beginnen oder enden'
  if (['overview', 'plans'].includes(name.toLowerCase())) return 'Dieser Name ist reserviert'
  if (projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'Dieses Projekt gibt es schon'
  return null
}

// =====================================================================
// Sending (web): README "Web build plan · useUndoHold and the outbox"
// - Captures go out at once (POST /inbox). Their undo is a DELETE.
// - Done, delete, clarify and small edits are held 6 s for undo. The held queue is kept in
//   IndexedDB and flushed with fetch(…, { keepalive: true }) on pagehide and
//   visibilitychange=hidden, so closing the tab or the lid never drops a check-off.
// - A request the server does not take stays in store.failed: "Nicht gesendet · Erneut senden".
// Android keeps its own Room outbox with the same states (README "Android build plan").
// =====================================================================
const UNDO_MS = 6000
export const net = { up: true, apiBase: null } // prototype: no server; proto.network(false) shows failures

function request(op) {
  const u = op.uuid
  switch (op.kind) {
    case 'capture': return { method: 'POST', path: '/inbox', body: { description: op.description } }
    case 'uncapture': case 'delete': return { method: 'DELETE', path: `/tasks/${u}` }
    case 'done': return { method: 'POST', path: `/tasks/${u}/done` }
    case 'create': return { method: 'POST', path: '/tasks', body: op.body }
    case 'project': return { method: 'POST', path: '/projects', body: { name: op.name } }
    case 'plan': return { method: 'PUT', path: `/projects/plans/${encodeURIComponent(op.name)}`, body: op.body }
    default: return { method: 'PUT', path: `/tasks/${u}`, body: op.patch } // clarify, edit
  }
}
// The real transport. In the prototype there is no API, so it resolves (or fails) locally.
function transport(op, { keepalive = false } = {}) {
  const r = request(op)
  if (net.apiBase) {
    return fetch(net.apiBase + r.path, {
      method: r.method, keepalive, credentials: 'include',
      headers: r.body ? { 'Content-Type': 'application/json' } : undefined,
      body: r.body ? JSON.stringify(r.body) : undefined,
    }).then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res })
  }
  return new Promise((res, rej) => setTimeout(() => (net.up ? res({ ok: true }) : rej(new Error('offline'))), keepalive ? 0 : 180))
}
async function send(op, opts) {
  op.state = 'sending'
  const t = op.id != null ? sel.byId(op.id) : null
  if (t && op.kind === 'capture') t.sync = 'sending'
  try {
    await transport(op, opts)
    op.state = 'sent'
    store.failed = store.failed.filter((f) => f !== op)
    if (t && op.kind === 'capture') t.sync = 'sent'
    store.emit({ type: 'sync', op })
  } catch {
    op.state = 'failed'
    if (!store.failed.includes(op)) store.failed.push(op)
    if (t && op.kind === 'capture') t.sync = 'failed'
    store.emit({ type: 'failed', op })
  }
}

// IndexedDB keeps the held queue across a closed tab or a crash. Every access is guarded:
// private windows and blocked storage simply skip persistence.
const idb = (() => {
  let dbp = null
  const open = () => (dbp ??= new Promise((res, rej) => {
    try {
      const r = indexedDB.open('runway-held', 1)
      r.onupgradeneeded = () => r.result.createObjectStore('held', { keyPath: 'key' })
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    } catch (e) { rej(e) }
  }))
  const run = async (mode, fn) => {
    try {
      const db = await open()
      return await new Promise((res, rej) => {
        const tx = db.transaction('held', mode)
        const req = fn(tx.objectStore('held'))
        tx.oncomplete = () => res(req && req.result)
        tx.onerror = () => rej(tx.error)
      })
    } catch { return null }
  }
  return {
    put: (op) => run('readwrite', (s) => s.put(JSON.parse(JSON.stringify({ ...op, timer: undefined })))),
    del: (key) => run('readwrite', (s) => s.delete(key)),
    all: () => run('readonly', (s) => s.getAll()),
  }
})()
let persist = false

function hold(t, kind, extra = {}) {
  const op = { key: `${kind}-${t.id}-${Date.now()}`, id: t.id, uuid: t.uuid, kind, until: Date.now() + UNDO_MS, label: t.description, ...extra }
  op.timer = setTimeout(() => commit(op), UNDO_MS)
  store.held.push(op)
  if (persist) idb.put(op)
  return op
}
function commit(op, opts) {
  clearTimeout(op.timer)
  if (!store.held.includes(op)) return
  store.held = store.held.filter((h) => h !== op)
  if (persist) idb.del(op.key)
  const t = sel.byId(op.id)
  if (t) {
    if (op.kind === 'delete') t.status = 'deleted'
    delete t.held
  }
  send(op, opts)
  store.emit({ type: 'commit', id: op.id, kind: op.kind })
}

export const outbox = {
  // Web: keep the held queue in IndexedDB and send whatever a closed tab left behind.
  async enablePersistence() {
    persist = true
    const left = (await idb.all()) || []
    for (const op of left) {
      const t = sel.byId(op.id)
      if (t && t.status === 'pending') {
        if (op.kind === 'done') { t.status = 'completed'; t.end = t.end || '20261031T084100Z' }
        if (op.kind === 'delete') t.status = 'deleted'
        if (op.patch) Object.assign(t, op.patch)
      }
      idb.del(op.key)
      send(op)
    }
    if (left.length) store.emit({ type: 'update', field: 'restore' })
    const flush = () => outbox.flush()
    addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  },
  // Send every held op now (keepalive survives the page going away).
  flush() { for (const op of [...store.held]) commit(op, { keepalive: true }) },
  retry(key) {
    const ops = key ? store.failed.filter((f) => f.key === key) : [...store.failed]
    for (const op of ops) send(op)
  },
}

// ---------- actions ----------
export const act = {
  complete(id) {
    const t = sel.byId(id)
    if (!t || !isOpen(t)) return null
    const before = { list: listOf(t), runway: sel.runway(), project: t.project }
    t.end = '20261031T084100Z'
    t.status = 'completed' // counts as done today at once; the hold only delays sending
    t.held = 'done'
    hold(t, 'done')
    const proj = t.project ? sel.projects().find((p) => p.name === t.project) : null
    const evt = { type: 'complete', id: t.id, task: t, before, stalled: proj && proj.stalled ? proj.name : null }
    store.emit(evt)
    return evt
  },
  capture(text) {
    const description = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    if (!description) return null
    seq += 1
    const t = {
      id: seq, uuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, description, status: 'pending',
      project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 1.0,
      entry: `20261031T08${String(41 + (seq % 18)).padStart(2, '0')}00Z`, start: null, annotations: [], fresh: true, sync: 'sending',
    }
    tasks.push(t)
    const key = `capture-${t.id}`
    const op = { key, id: t.id, uuid: t.uuid, kind: 'capture', description, label: description }
    send(op) // at once: a closed tab cannot lose a capture
    const entry = { key, id: t.id, until: Date.now() + UNDO_MS }
    entry.timer = setTimeout(() => { store.recent = store.recent.filter((r) => r !== entry); delete t.fresh; store.emit({ type: 'update', id: t.id, field: 'fresh' }) }, UNDO_MS)
    store.recent.push(entry)
    const evt = { type: 'capture', id: t.id, task: t }
    store.emit(evt)
    return evt
  },
  // to: 'next:@ctx' | 'next' | 'waiting' | 'someday' | 'delete' | 'done' | 'project:Name'
  clarify(id, to) {
    const t = sel.byId(id)
    if (!t || !isOpen(t)) return null
    const from = listOf(t)
    if (to === 'delete') return act.remove(id, 'clarify')
    if (to === 'done') return act.complete(id)
    const [kind, ...rest] = String(to).split(':')
    const arg = rest.join(':') || null
    const prev = { tags: [...t.tags], scheduled: t.scheduled, project: t.project, urgency: t.urgency }
    const strip = (tags) => tags.filter((g) => !['next', 'waiting', 'someday'].includes(g))
    if (kind === 'next') {
      t.tags = [...new Set([...strip(t.tags), 'next', ...(arg ? [arg] : [])])]
      t.urgency = Math.max(t.urgency, 0) + 15 + (arg ? 1 : 0) - 9 // demo: lands mid-queue
    } else if (kind === 'waiting') {
      t.tags = [...strip(t.tags), 'waiting']
      t.scheduled = t.scheduled || twInDays(7)
    } else if (kind === 'someday') {
      t.tags = [...strip(t.tags), 'someday']
    } else if (kind === 'project') {
      // into an existing project as its next step (lands in Nächste and in the project)
      t.project = arg
      t.tags = [...new Set([...strip(t.tags), 'next'])]
      t.urgency = Math.max(t.urgency, 0) + 6
    }
    hold(t, 'clarify', { prev, patch: { tags: t.tags, scheduled: t.scheduled, project: t.project } })
    const evt = { type: 'clarify', id: t.id, task: t, from, to: kind, arg }
    store.emit(evt)
    return evt
  },
  remove(id, via = 'delete', extra = {}) {
    const t = sel.byId(id)
    if (!t || !isOpen(t)) return null
    const from = listOf(t)
    t.held = 'delete'
    hold(t, 'delete', extra)
    const evt = { type: 'delete', id: t.id, task: t, from, via }
    store.emit(evt)
    return evt
  },
  // Rückgängig: the most recent held op or sent capture that is still inside its window.
  undo() {
    const h = store.held[store.held.length - 1]
    const r = store.recent[store.recent.length - 1]
    if (!h && !r) return null
    if (r && (!h || r.until > h.until)) {
      clearTimeout(r.timer)
      store.recent.pop()
      const t = sel.byId(r.id)
      if (!t) return null
      const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1)
      if (t.sync === 'sent') send({ key: `uncapture-${t.id}`, id: null, uuid: t.uuid, kind: 'uncapture', label: t.description })
      store.failed = store.failed.filter((f) => f.id !== t.id)
      const evt = { type: 'undo', id: t.id, kind: 'capture', task: t }
      store.emit(evt)
      return evt
    }
    clearTimeout(h.timer)
    store.held.pop()
    if (persist) idb.del(h.key)
    const t = sel.byId(h.id)
    if (!t) return null
    if (h.kind === 'done') { t.status = 'pending'; delete t.end }
    if (h.prev) Object.assign(t, h.prev)
    if (h.createdProject) { const i = projects.findIndex((p) => p.name === h.createdProject); if (i >= 0) projects.splice(i, 1) }
    delete t.held
    const evt = { type: 'undo', id: t.id, kind: h.kind, task: t }
    store.emit(evt)
    return evt
  },
  toggleStart(id) {
    const t = sel.byId(id)
    if (!t) return
    t.start = t.start ? null : '20261031T084100Z'
    send({ key: `start-${t.id}-${Date.now()}`, id: t.id, uuid: t.uuid, kind: 'edit', patch: { start: t.start }, label: t.description })
    store.emit({ type: 'update', id: t.id, field: 'start' })
  },
  update(id, patch) {
    const t = sel.byId(id)
    if (!t) return
    Object.assign(t, patch)
    send({ key: `edit-${t.id}-${Date.now()}`, id: t.id, uuid: t.uuid, kind: 'edit', patch, label: t.description })
    store.emit({ type: 'update', id: t.id, patch })
  },
  // Warten auf: "Nachgehakt" moves the follow-up a week out, with undo.
  followedUp(id, days = 7) {
    const t = sel.byId(id)
    if (!t || !isOpen(t)) return null
    const prev = { scheduled: t.scheduled }
    t.scheduled = twInDays(days)
    hold(t, 'edit', { prev, patch: { scheduled: t.scheduled } })
    store.emit({ type: 'update', id: t.id, field: 'scheduled' })
    return t
  },
  setList(id, list) { // exclusive status tag in the UI (tags_add / tags_remove on the API)
    const t = sel.byId(id)
    if (!t) return
    const others = t.tags.filter((g) => !['next', 'waiting', 'someday'].includes(g))
    t.tags = list === 'inbox' ? others.filter((g) => !g.startsWith('@')) : [...others, list]
    if (list === 'next' && !contextsOf(t).length) t.tags.push('next')
    t.tags = [...new Set(t.tags)]
    act.update(t.id, { tags: t.tags })
  },
  toggleContext(id, ctx) {
    const t = sel.byId(id)
    if (!t) return
    const parts = tagParts(t)
    act.update(t.id, { tags: parts.includes(ctx) ? parts.filter((p) => p !== ctx) : [...parts, ctx] })
  },
  annotate(id, text) {
    const t = sel.byId(id)
    if (!t || !text.trim()) return
    t.annotations.push({ entry: '20261031T084100Z', description: text.trim() })
    send({ key: `note-${t.id}-${Date.now()}`, id: t.id, uuid: t.uuid, kind: 'edit', patch: { annotate: text.trim() }, label: t.description })
    store.emit({ type: 'update', id: t.id, field: 'annotations' })
  },
  // A next step for a project. The context comes from the chips or from "@kontext" in the
  // text; without one the step has no context (it then shows under every context filter).
  addNext(project, raw, ctx = null) {
    const { text, ctxs } = splitContexts(raw)
    const description = text.slice(0, 500)
    if (!description) return null
    const contexts = [...new Set([...(ctx ? [ctx] : []), ...ctxs])]
    seq += 1
    const t = {
      id: seq, uuid: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, description, status: 'pending',
      project, tags: ['next', ...contexts], priority: null, due: null, scheduled: null, wait: null, urgency: 7.5,
      entry: '20261031T084100Z', start: null, annotations: [],
    }
    tasks.push(t)
    send({ key: `create-${t.id}`, id: t.id, uuid: t.uuid, kind: 'create', body: { description, project, tags: t.tags }, label: description })
    store.emit({ type: 'update', id: t.id, field: 'project' })
    return t
  },
  createProject(raw, outcome = '') {
    const name = String(raw ?? '').trim()
    const error = projectNameError(name)
    if (error) return { error }
    projects.push({ name, outcome, status: 'active', explicit: true })
    send({ key: `project-${name}`, id: null, kind: 'project', name, label: name })
    store.emit({ type: 'project', name })
    return { name }
  },
  savePlan(name, plan) {
    PLANS[name] = clone(plan)
    send({ key: `plan-${name}-${Date.now()}`, id: null, kind: 'plan', name, body: plan, label: name })
    store.emit({ type: 'project', name })
  },
  setFilter(ctx) { store.filter = ctx || null; store.emit({ type: 'filter', ctx: store.filter }) },
  setProjectStatus(name, status) {
    const p = projects.find((x) => x.name === name)
    if (p) { p.status = status; store.emit({ type: 'project', name }) }
  },
  setRole(name, role) { const u = store.users.find((x) => x.name === name); if (u) { u.role = role; store.emit({ type: 'settings' }) } },
  setRegistration(on) { store.registration = !!on; store.emit({ type: 'settings' }) },
}
