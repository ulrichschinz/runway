// Greifbar: one task model for the web and the Android prototype.
// Mirrors runway's GTD rules (task_service.py) on top of the shared demo data.
import { TASKS, PROJECTS, CONTEXTS, TODAY, tagParts, contextsOf, parseTw } from '../shared/data/tasks.js'

export { TODAY, tagParts, contextsOf, parseTw }

const has = (t, tag) => tagParts(t).includes(tag)
const clone = (t) => ({ ...t, tags: [...t.tags], annotations: t.annotations.map((a) => ({ ...a })) })

// Prototype clock: Saturday 31.10.2026, 09:12 Berlin (CET, UTC+1), advancing in real time.
const T0 = Date.UTC(2026, 9, 31, 8, 12, 0)
const started = Date.now()
export const now = () => new Date(T0 + (Date.now() - started))
export const toTw = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
/** Berlin calendar day 'YYYY-MM-DD' of a Taskwarrior timestamp. */
export const berlinDay = (tw) => (tw ? dayFmt.format(parseTw(tw)) : null)

export function createStore() {
  const s = {
    tasks: TASKS.map(clone),
    projects: PROJECTS.map((p) => ({ ...p, status: p.status === 'someday' ? 'on_hold' : p.status })),
    contexts: [...CONTEXTS],
    undo: [],
    lastReview: '20261023T160000Z',
    seq: 1000,
    // Day's high-water mark of the Inbox count (kept on the client per day in the real app).
    // The companion lights the share cleared since then, so a 20-item Inbox shows progress too.
    inboxHigh: 0,
  }
  const subs = new Set()
  const emit = (ev) => subs.forEach((f) => f(ev))

  const byId = (id) => s.tasks.find((t) => t.id === Number(id) || t.uuid === id)
  const pending = () => s.tasks.filter((t) => t.status === 'pending')

  /** Hidden by a future `wait` (the tickler). Inbox, Nächste and Irgendwann show visible tasks only. */
  const hidden = (t) => !!t.wait && t.wait > toTw(now())
  const isInbox = (t) => !t.project && tagParts(t).length === 0 && !hidden(t)
  const isWaiting = (t) => has(t, 'waiting')
  const isSomeday = (t) => has(t, 'someday') && !hidden(t)
  const isNext = (t) => !isWaiting(t) && !has(t, 'someday') && !hidden(t) && (has(t, 'next') || contextsOf(t).length > 0)
  const isTickler = (t) => hidden(t) && !isWaiting(t)
  /** Lenient context rule (runway skill, Android): the context, or no context at all. */
  const inContext = (t, ctx) => !ctx || contextsOf(t).includes(ctx) || contextsOf(t).length === 0

  function followUp(t) {
    const d = berlinDay(t.scheduled || t.wait)
    if (!d) return { due: false, day: null }
    return { due: d <= TODAY, day: d }
  }

  function lists(ctx = null) {
    const open = pending()
    const inbox = open.filter(isInbox).sort((a, b) => (b.entry > a.entry ? 1 : -1))
    const nextAll = open.filter(isNext).sort((a, b) => b.urgency - a.urgency)
    const due = open.filter((t) => t.due && berlinDay(t.due) <= TODAY)
      .sort((a, b) => (a.due > b.due ? 1 : -1))
    // Fällig is never filtered (Android contract); Nächste Aktionen leaves out what Fällig already shows.
    const dueIds = new Set(due.map((t) => t.id))
    const next = nextAll.filter((t) => inContext(t, ctx) && !dueIds.has(t.id))
    const waiting = open.filter(isWaiting).sort((a, b) => {
      const fa = followUp(a), fb = followUp(b)
      if (fa.due !== fb.due) return fa.due ? -1 : 1
      return (fa.day || '9') > (fb.day || '9') ? 1 : -1
    })
    const someday = open.filter(isSomeday)
    const doneToday = s.tasks.filter((t) => t.status === 'completed' && berlinDay(t.end) === TODAY)
      .sort((a, b) => (b.end > a.end ? 1 : -1))
    const tickler = open.filter(isTickler).sort((a, b) => (a.wait > b.wait ? 1 : -1))
    const unclarified = open.filter((t) => !isInbox(t) && !isNext(t) && !isWaiting(t) && !isSomeday(t) && !isTickler(t))
    return { inbox, next, nextAll, due, waiting, someday, tickler, doneToday, unclarified, all: open }
  }

  function projects() {
    const open = pending()
    return s.projects.map((p) => {
      const mine = open.filter((t) => t.project === p.name && !isTickler(t))
      const next = mine.filter(isNext)
      const waiting = mine.filter(isWaiting)
      const someday = mine.filter(isSomeday)
      const rest = mine.filter((t) => !isNext(t) && !isWaiting(t) && !isSomeday(t))
      const done = s.tasks.filter((t) => t.project === p.name && t.status === 'completed')
      const parked = open.filter((t) => t.project === p.name && isTickler(t))
      const stalled = p.status === 'active' && next.length === 0 && waiting.length === 0 && parked.length === 0
      return { ...p, next, waiting, someday, rest, done, open: mine.length, stalled }
    })
  }

  function counts(ctx = null) {
    const l = lists(ctx)
    const pr = projects()
    s.inboxHigh = Math.max(s.inboxHigh, l.inbox.length)
    return {
      inbox: l.inbox.length, next: l.nextAll.length, nextCtx: l.next.length, waiting: l.waiting.length,
      someday: l.someday.length, due: l.due.length, doneToday: l.doneToday.length,
      projects: pr.filter((p) => p.status === 'active').length, stalled: pr.filter((p) => p.stalled).length,
      followUpDue: l.waiting.filter((t) => followUp(t).due).length, tickler: l.tickler.length,
      cleared: s.inboxHigh ? 1 - l.inbox.length / s.inboxHigh : 1,
    }
  }

  function remember(label, t, extra = {}) {
    s.undo.push({ label, snap: clone(t), at: Date.now(), ...extra })
    if (s.undo.length > 20) s.undo.shift()
  }

  function capture(text, note) {
    const description = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    if (!description) return null
    s.seq += 1
    const t = {
      id: s.seq, uuid: `00000000-0000-4000-8000-${String(s.seq).padStart(12, '0')}`, description,
      status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null,
      urgency: 1.0, entry: toTw(now()), start: null, end: null,
      annotations: note ? [{ entry: toTw(now()), description: note }] : [],
    }
    s.tasks.push(t)
    s.undo.push({ label: 'In Inbox', created: t.id, at: Date.now() })
    emit({ type: 'capture', id: t.id })
    return t
  }

  function complete(id) {
    const t = byId(id)
    if (!t || t.status !== 'pending') return null
    remember('Erledigt', t)
    t.status = 'completed'; t.end = toTw(now()); t.start = null
    emit({ type: 'complete', id: t.id, project: t.project })
    return t
  }

  function remove(id) {
    const t = byId(id)
    if (!t || t.status !== 'pending') return null
    remember('Gelöscht', t)
    t.status = 'deleted'
    emit({ type: 'delete', id: t.id })
    return t
  }

  /** to: 'next:@ctx' | 'waiting' | 'someday' | 'tickler' | 'done' | 'delete' | 'inbox'
   *  opts: { project, scheduled (follow-up day), wait (hide until) } as Taskwarrior timestamps or null */
  function clarify(id, to, opts = {}) {
    const t = byId(id)
    if (!t || t.status !== 'pending') return null
    if (to === 'done') return complete(id)
    if (to === 'delete') return remove(id)
    if (to.startsWith('next') && !to.includes(':@') && contextsOf(t).length === 0) throw new Error('Nächste needs a context')
    remember('Einsortiert', t, { clarified: true })
    const keep = tagParts(t).filter((p) => !['next', 'waiting', 'someday'].includes(p) && !p.startsWith('@'))
    if (opts.project !== undefined) t.project = opts.project
    if (opts.scheduled !== undefined) t.scheduled = opts.scheduled
    if (opts.wait !== undefined) t.wait = opts.wait
    if (to === 'tickler') {
      // Zurückstellen: hidden until the day, then back in the Inbox (no tags, no project) or its list.
      emit({ type: 'clarify', id: t.id, to })
      return t
    }
    if (to.startsWith('next')) {
      const ctx = to.split(':')[1]
      const ctxs = ctx ? [ctx] : contextsOf(t)
      t.tags = ['next', ...ctxs, ...keep]
      t.urgency = Math.max(t.urgency, 6 + Math.random() * 4)
    } else if (to === 'waiting') t.tags = ['waiting', ...keep]
    else if (to === 'someday') t.tags = ['someday', ...keep]
    else if (to === 'inbox') { t.tags = []; t.project = null }
    emit({ type: 'clarify', id: t.id, to })
    return t
  }

  function update(id, patch) {
    const t = byId(id)
    if (!t) return null
    Object.assign(t, patch)
    emit({ type: 'update', id: t.id })
    return t
  }

  function toggleContext(id, ctx) {
    const t = byId(id)
    if (!t) return
    const parts = tagParts(t)
    t.tags = parts.includes(ctx) ? parts.filter((p) => p !== ctx) : [...parts, ctx]
    emit({ type: 'update', id: t.id })
  }

  function toggleStart(id) {
    const t = byId(id)
    if (!t || t.status !== 'pending') return
    t.start = t.start ? null : toTw(now())
    emit({ type: 'update', id: t.id })
  }

  function addNote(id, text) {
    const t = byId(id)
    if (!t || !text.trim()) return
    t.annotations.push({ entry: toTw(now()), description: text.trim() })
    emit({ type: 'update', id: t.id })
  }

  function addNextAction(project, description, ctx) {
    const t = capture(description)
    if (!t) return null
    s.undo.pop()
    t.project = project; t.tags = ['next', ctx]; t.urgency = 7.5
    emit({ type: 'clarify', id: t.id, to: `next:${ctx}` })
    return t
  }

  /** POST /projects. Name rules from api/app/models.py; returns an error text or the project. */
  function createProject(raw, outcome = '') {
    const name = String(raw || '').trim()
    if (!name) return { error: 'Gib dem Projekt einen Namen.' }
    if (name.length > 100) return { error: 'Höchstens 100 Zeichen.' }
    if (/[()"'\\:/?#%]/.test(name) || /^[+-]/.test(name)) return { error: 'Ohne ( ) " \' \\ : / ? # % und nicht mit + oder - am Anfang.' }
    if (['overview', 'plans'].includes(name.toLowerCase())) return { error: 'Dieser Name ist reserviert.' }
    if (s.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { error: 'Das Projekt gibt es schon.' }
    const p = { name, outcome: outcome || 'Noch kein Ergebnis beschrieben', status: 'active' }
    s.projects.push(p)
    emit({ type: 'project', name })
    return { project: p }
  }

  function setProjectStatus(name, status) {
    const p = s.projects.find((x) => x.name === name)
    if (p) { p.status = status; emit({ type: 'project', name }) }
  }

  function undoLast() {
    const u = s.undo.pop()
    if (!u) return null
    if (u.created) {
      const t = byId(u.created)
      if (t) t.status = 'deleted'
      emit({ type: 'undo', id: u.created, label: u.label })
      return u
    }
    const t = byId(u.snap.id)
    Object.assign(t, clone(u.snap))
    emit({ type: 'undo', id: t.id, label: u.label })
    return u
  }

  function search(q) {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return pending().filter((t) => [t.description, t.project || '', ...t.tags, ...t.annotations.map((a) => a.description)]
      .join(' ').toLowerCase().includes(needle))
  }

  function where(t) {
    if (t.status === 'completed') return 'done'
    if (isTickler(t)) return 'tickler'
    if (isInbox(t)) return 'inbox'
    if (isWaiting(t)) return 'waiting'
    if (isSomeday(t)) return 'someday'
    if (isNext(t)) return 'next'
    return 'project'
  }

  return {
    state: s, on: (f) => (subs.add(f), () => subs.delete(f)), get: byId, lists, projects, counts,
    capture, complete, remove, clarify, update, toggleContext, toggleStart, addNote, addNextAction,
    setProjectStatus, createProject, undoLast, search, where, followUp, inContext,
    recordReview() { s.lastReview = toTw(now()); emit({ type: 'review' }) },
    peekUndo: () => s.undo[s.undo.length - 1] || null,
  }
}
