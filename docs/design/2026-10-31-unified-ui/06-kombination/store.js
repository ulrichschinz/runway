// One store for the web prototype of proposal 06. Base: 03's store (GTD lists exactly as the server
// defines them, lenient context rule on Nächste, Inbox newest first, 6 s hold for done and delete).
// Grafts: 01's day progress (Tageslinse), 04's Jetzt · Bald · Später sections and "ohne Kontext",
// 02's web write path (captures sent at once, undo = DELETE; held writes mirrored to IndexedDB and
// flushed with keepalive; failures stay visible as "Nicht gesendet · Erneut senden"), 05's rule that
// nothing is filed into Nächste without a context. Every write is recorded in `calls` as the request
// the real client would send.

import { TASKS, PROJECTS, CONTEXTS, TODAY, tagParts, contextsOf, parseTw } from '../shared/data/tasks.js'
import {
  STATUS_TAGS, has, isNext, isWaiting, isSomeday, isInbox, listOf, NeedsAnswer, morningTw,
  clarifyPayload, listPayload, contextPayload, inversePayload, applyPayload, projectNameError,
  ringOf, plannedToday, dayProgress,
} from './rules.js'

export { TODAY, CONTEXTS, contextsOf, tagParts, parseTw, isNext, isWaiting, isSomeday, isInbox, listOf, projectNameError, NeedsAnswer }
export const NOW = new Date('2026-10-31T08:41:00Z') // 09:41 in Berlin, the prototype's fixed "now"
export const UNDO_MS = 6000
export const NO_CTX = '-' // filter value for "ohne Kontext"

const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (d) => fmtKey.format(d)
export const dayOf = (tw) => tw ? dayKey(parseTw(tw)) : null
const tw = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
export const followUp = (t) => parseTw(t.scheduled || t.wait)
export const plusDays = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const DAYCTX = { day: dayOf, today: TODAY, plusDays }
export const ring = (t) => ringOf(t, DAYCTX)
export const isPlanned = (t) => plannedToday(t, DAYCTX)

// ── The web write path (graft from 02) ─────────────────────────────────────────────────────────
export const net = { up: true } // proto.network(false) shows the failure state
const idb = (() => {
  // IndexedDB keeps the held queue across a closed tab or a crash. Every access is guarded:
  // private windows and blocked storage simply skip persistence.
  let dbp = null
  const open = () => (dbp ??= new Promise((res, rej) => {
    try {
      const r = indexedDB.open('runway-06-held', 1)
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
    put: (op) => run('readwrite', (s) => s.put({ key: op.key, kind: op.kind, uuid: op.uuid, until: op.until })),
    del: (key) => run('readwrite', (s) => s.delete(key)),
    clear: () => run('readwrite', (s) => s.clear()),
  }
})()

export function createStore() {
  const tasks = TASKS.map((t) => ({ ...t, tags: [...t.tags], annotations: t.annotations.map((a) => ({ ...a })) }))
  const projects = PROJECTS.map((p) => ({ ...p, plan: null }))
  const byDesc = (d) => tasks.find((t) => t.description === d)

  // ── Demo data, brought in line with the real API and with what this proposal shows.
  // 1. The shared data marks next actions by a context alone. The server needs +next.
  for (const t of tasks) if (contextsOf(t).length && !STATUS_TAGS.some((s) => has(t, s))) t.tags.unshift('next')
  // 2. The API knows active | on_hold | done; the demo's "someday" project is on hold.
  for (const p of projects) if (!['active', 'on_hold', 'done'].includes(p.status)) p.status = 'on_hold'
  // 3. One waiting todo has a follow-up day in the past, so "Nachhaken" is visible.
  byDesc('Rückmeldung Vermieter zur Kaution').scheduled = '20261030T070000Z'
  // 4. Planned for today (T sets scheduled = today): two next actions and this morning's three done
  //    todos, so the Tageslinse reads "3 von 7 heute" (as in 01).
  for (const d of ['Steuerberatung zurückrufen', 'Startseiten-Text kürzen', 'Wochenplan aufschreiben', 'Zahnarzttermin vereinbaren', 'Newsletter-Abo kündigen']) byDesc(d).scheduled = '20261031T070000Z'
  // 5. One next action from before the "never guess" rule, without a context: the "ohne Kontext" chip.
  tasks.push({
    id: 90, uuid: '00000000-0000-4000-8000-000000000090', description: 'Hosting-Vertrag prüfen', status: 'pending',
    project: 'Website-Relaunch', tags: ['next'], priority: null, due: null, scheduled: null, wait: null, urgency: 4.2,
    entry: '20261012T090000Z', start: null, annotations: [],
  })

  const holds = new Map() // id -> { kind, timer, until, key }
  const subs = new Set()
  const clarified = [] // { id, description, label, inverse, to }
  const calls = [] // the requests the real client would send, in order
  const failed = [] // ops the server did not take: "Nicht gesendet · Erneut senden"
  let seq = 0
  let lastHold = null
  let nextId = 100

  projects.find((p) => p.name === 'Website-Relaunch').plan = {
    purpose: 'Die Website soll Gespräche anbahnen, nicht nur informieren.',
    principles: 'Klare Sprache, echte Beispiele, nichts Erfundenes.',
    vision: 'Ein Besucher versteht in einer Minute, was wir tun, und bucht ein Erstgespräch.',
    brainstorm: ['Use Cases als eigene Seiten', 'Kundenstimmen als kurze Videos', 'Startseite kürzen'],
    organized: ['Startseite kürzen', 'Use-Case-Seiten anlegen', 'Logo-Feedback einarbeiten'],
  }
  projects.find((p) => p.name === 'Garten').plan = {
    purpose: 'Der Garten übersteht den Winter ohne Schäden.',
    principles: 'Ein Samstag reicht.',
    vision: 'Beete sind abgedeckt, Rosen geschnitten, Wasser ist abgestellt.',
    brainstorm: ['Rosen schneiden', 'Laub auf die Beete', 'Außenwasserhahn abstellen'],
    organized: ['Rosen zurückschneiden', 'Außenwasserhahn abstellen', 'Laub auf die Beete'],
  }

  const emit = (why, detail) => subs.forEach((f) => f(why, detail))
  const get = (id) => tasks.find((t) => t.id === id || t.uuid === id)
  const visible = (t) => t.status === 'pending' && !['done', 'delete'].includes(holds.get(t.id)?.kind)

  // Transport: the prototype has no server, so a request resolves locally, or fails while net.up is false.
  function send(method, path, body, meta = {}) {
    const op = { key: `${method}${path}${++seq}`, method, path, body, ...meta }
    calls.push({ method, path, body })
    if (!net.up) {
      op.state = 'failed'
      failed.push(op)
      if (meta.id != null) { const t = get(meta.id); if (t) t.sync = 'failed' }
      queueMicrotask(() => emit('failed', { op }))
      return op
    }
    op.state = 'sent'
    return op
  }
  const put = (t, body) => { send('PUT', `/tasks/${t.uuid}`, body, { id: t.id, label: t.description }); applyPayload(t, body); return body }
  const isDone = (t) => t.status === 'completed' || holds.get(t.id)?.kind === 'done'
  const doneTodayOf = () => tasks.filter((t) => isDone(t) && (!t.end || dayOf(t.end) === TODAY))
    .sort((a, b) => (a.end || 'Z').localeCompare(b.end || 'Z'))

  const inCtx = (t, ctx) => !ctx || (ctx === NO_CTX ? contextsOf(t).length === 0 : contextsOf(t).includes(ctx) || contextsOf(t).length === 0)

  function lists(ctx = null) {
    const open = tasks.filter(visible)
    const byUrg = (a, b) => (b.start ? 1 : 0) - (a.start ? 1 : 0) || (b.priority === 'H') - (a.priority === 'H') || b.urgency - a.urgency
    const inbox = open.filter(isInbox).sort((a, b) => b.entry.localeCompare(a.entry))
    const next = open.filter(isNext).sort(byUrg)
    const dueAll = open.filter((t) => t.due && dayOf(t.due) <= TODAY && !isInbox(t)).sort((a, b) => a.due.localeCompare(b.due))
    // with a context active, due items of other contexts stay visible apart (graft from 02), never ranked
    const due = dueAll.filter((t) => inCtx(t, ctx))
    const dueOther = ctx ? dueAll.filter((t) => !inCtx(t, ctx)) : []
    const dueIds = new Set(dueAll.map((t) => t.id))
    const nextIn = next.filter((t) => inCtx(t, ctx))
    const rest = nextIn.filter((t) => !dueIds.has(t.id))
    const rings = { jetzt: [], bald: [], spaeter: [] }
    for (const t of rest) rings[ring(t)].push(t)
    const waiting = open.filter(isWaiting).sort((a, b) => {
      const fa = followUp(a), fb = followUp(b)
      if (fa && fb) return fa - fb
      return fa ? -1 : fb ? 1 : a.entry.localeCompare(b.entry)
    })
    const someday = open.filter(isSomeday).sort(byUrg)
    const unlisted = open.filter((t) => listOf(t) === 'none').sort(byUrg)
    const doneToday = doneTodayOf()
    const weekAgo = plusDays(TODAY, -6)
    const doneWeek = tasks.filter((t) => isDone(t) && (!t.end || dayOf(t.end) >= weekAgo))
      .sort((a, b) => (b.end || 'Z').localeCompare(a.end || 'Z'))
    const ctxCount = Object.fromEntries(CONTEXTS.map((c) => [c, next.filter((t) => contextsOf(t).includes(c)).length]))
    ctxCount[NO_CTX] = next.filter((t) => contextsOf(t).length === 0).length
    return { open, inbox, next, nextIn, due, dueOther, rings, waiting, someday, unlisted, doneToday, doneWeek, ctxCount }
  }

  const progress = () => dayProgress(tasks.filter(visible), doneTodayOf(), DAYCTX)

  function projectOverview() {
    const open = tasks.filter(visible)
    const order = { active: 0, on_hold: 1, done: 2 }
    return projects.map((p) => {
      const ts = open.filter((t) => t.project === p.name)
      const next = ts.filter(isNext).length
      const waiting = ts.filter(isWaiting).length
      const stalled = p.status === 'active' && next === 0 && waiting === 0
      return { ...p, open: ts.length, next, waiting, stalled }
    }).sort((a, b) => (b.stalled - a.stalled) || (order[a.status] - order[b.status]) || a.name.localeCompare(b.name, 'de'))
  }

  // done and delete are held 6 s (the API cannot reopen or undelete), mirrored to IndexedDB
  function hold(kind, t) {
    const prev = holds.get(t.id)
    if (prev) { clearTimeout(prev.timer); idb.del(prev.key) }
    const h = { kind, id: t.id, uuid: t.uuid, until: Date.now() + UNDO_MS, seq: ++seq, key: `${kind}-${t.uuid}` }
    h.timer = setTimeout(() => commit(t.id), UNDO_MS)
    holds.set(t.id, h)
    idb.put(h)
    lastHold = h
    return h
  }
  function commit(id, { keepalive = false } = {}) {
    const h = holds.get(id)
    if (!h) return
    clearTimeout(h.timer)
    holds.delete(id)
    idb.del(h.key)
    const t = get(id)
    if (h.kind === 'done') { send('POST', `/tasks/${t.uuid}/done`, null, { id: t.id, label: t.description, keepalive }); t.status = 'completed'; t.end = t.end || tw(new Date(NOW.getTime() + h.seq * 60000)) }
    if (h.kind === 'delete') { send('DELETE', `/tasks/${t.uuid}`, null, { id: t.id, label: t.description, keepalive }); t.status = 'deleted' }
    if (lastHold === h) lastHold = null
    emit('commit', { id, kind: h.kind })
  }
  // closing the tab or the lid never drops a check-off: send what is held, with keepalive
  const flush = () => { for (const id of [...holds.keys()]) commit(id, { keepalive: true }) }
  if (typeof document !== 'undefined') {
    addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    idb.clear() // the prototype starts from the demo data every time
  }

  const newTask = (description, extra = {}) => ({
    id: nextId++, uuid: `00000000-0000-4000-9000-${String(nextId).padStart(12, '0')}`, description,
    status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null,
    urgency: 1, entry: tw(new Date(NOW.getTime() + (++seq) * 60000)), start: null, annotations: [], ...extra,
  })

  return {
    tasks, projects, clarified, calls, failed, net,
    get, lists, progress, projectOverview, ring, isPlanned,
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    holdOf: (id) => holds.get(id),
    lastHold: () => lastHold,
    lastReview: '2026-10-23',
    stand: '09:41',

    // Captures go out at once (POST /inbox); their Rückgängig is a DELETE (graft from 02).
    capture(text, note = '') {
      const description = String(text).replace(/\s+/g, ' ').trim().slice(0, 500)
      if (!description) return null
      const t = newTask(description, { annotations: note ? [{ entry: tw(NOW), description: note }] : [], fresh: true })
      tasks.push(t)
      send('POST', '/inbox', { description, note: note || undefined }, { id: t.id, label: description, capture: true })
      emit('capture', { id: t.id })
      return t
    },
    uncapture(id) {
      const t = get(id)
      if (!t || t.status !== 'pending') return false
      t.status = 'deleted'
      const i = failed.findIndex((f) => f.id === id && f.capture)
      if (i >= 0) failed.splice(i, 1) // never sent: nothing to delete on the server
      else send('DELETE', `/tasks/${t.uuid}`, null, { id: t.id, label: t.description })
      emit('undo', { id, kind: 'capture' })
      return true
    },
    complete(id) {
      const t = get(id)
      if (!t || !visible(t)) return null
      t.end = tw(new Date(NOW.getTime() + (++seq) * 60000))
      const h = hold('done', t)
      emit('done', { id: t.id })
      return h
    },
    remove(id) {
      const t = get(id)
      if (!t || !visible(t)) return null
      const h = hold('delete', t)
      emit('delete', { id: t.id })
      return h
    },
    // Rückgängig takes back exactly one held action; earlier holds commit on schedule.
    undo(id) {
      const h = id ? holds.get(id) : lastHold
      if (!h) return false
      clearTimeout(h.timer)
      holds.delete(h.id)
      idb.del(h.key)
      if (h.kind === 'done') get(h.id).end = null
      if (lastHold === h) lastHold = null
      const i = clarified.findLastIndex((c) => c.id === h.id)
      if (i >= 0) clarified.splice(i, 1)
      emit('undo', { id: h.id, kind: h.kind })
      return true
    },
    retry(key) {
      const ops = key ? failed.filter((f) => f.key === key) : [...failed]
      if (!net.up) return false
      for (const op of ops) {
        failed.splice(failed.indexOf(op), 1)
        calls.push({ method: op.method, path: op.path, body: op.body, retry: true })
        if (op.id != null) { const t = get(op.id); if (t) t.sync = null }
      }
      emit('sync', {})
      return true
    },
    // Inbox item -> 'next:@ctx' | 'waiting' | 'someday' | 'project:Name' | 'delete' | 'done'.
    // opts: { followUp: 'YYYY-MM-DD' | '' } for waiting, { ctx } for a project. Filing is sent at once
    // (it is reversible through the API); Rückgängig sends the exact inverse. Nächste without a
    // context throws NeedsAnswer: the caller asks for it.
    clarify(id, to, opts = {}) {
      const t = get(id)
      if (!t) return null
      const [kind, arg] = String(to).split(/:(.*)/s)
      let label, inverse = null
      if (kind === 'delete') { this.remove(t.id); label = { k: 'filed.deleted' } }
      else if (kind === 'done') { this.complete(t.id); label = { k: 'filed.done' } }
      else {
        const body = clarifyPayload(to, opts) // may throw NeedsAnswer before anything is sent
        const before = { tags: [...t.tags], project: t.project, scheduledDay: dayOf(t.scheduled) }
        inverse = inversePayload(before, body)
        put(t, body)
        label = kind === 'next' ? { k: 'filed.next', v: { ctx: arg } }
          : kind === 'waiting' ? { k: opts.followUp ? 'filed.waitingOn' : 'filed.waiting', v: { day: opts.followUp } }
          : kind === 'someday' ? { k: 'filed.someday' } : { k: 'filed.project', v: { p: arg, ctx: opts.ctx } }
        t.fresh = false
      }
      clarified.push({ id: t.id, description: t.description, label, inverse, to })
      if (!['delete', 'done'].includes(kind)) emit('clarify', { id: t.id, to })
      return label
    },
    undoClarify(id) {
      const i = clarified.findLastIndex((c) => c.id === id && c.inverse)
      if (i < 0) return false
      const [c] = clarified.splice(i, 1)
      put(get(id), c.inverse)
      emit('edit', { id })
      return true
    },
    setList(id, list) {
      const t = get(id)
      if (!t || listOf(t) === list) return
      const body = listPayload(t, list) // Nächste without a context throws NeedsAnswer
      const before = { tags: [...t.tags], project: t.project, scheduledDay: dayOf(t.scheduled) }
      put(t, body)
      emit('edit', { id: t.id })
      return inversePayload(before, body) // for Rückgängig
    },
    /** Rückgängig for a list move: send the exact inverse. */
    undoMove(id, inverse) {
      const t = get(id)
      if (!t || !inverse) return
      put(t, inverse)
      emit('edit', { id: t.id })
    },
    setContext(id, ctx) { const t = get(id); if (!t) return; put(t, contextPayload(t, ctx)); emit('edit', { id: t.id }) },
    // T: plan for today (scheduled = today) or take it off today's plan. Changes the lens's denominator.
    togglePlanned(id) {
      const t = get(id)
      if (!t || !isNext(t)) return null
      const on = !(t.scheduled && dayOf(t.scheduled) <= TODAY)
      t.scheduled = on ? morningTw(TODAY) : null
      send('PUT', `/tasks/${t.uuid}`, { scheduled: on ? TODAY : '' }, { id: t.id, label: t.description })
      emit('plan', { id: t.id, on })
      return on
    },
    setPriority(id, p) { const t = get(id); t.priority = t.priority === p ? null : p; send('PUT', `/tasks/${t.uuid}`, { priority: t.priority || '' }); emit('edit', { id: t.id }) },
    setDue(id, key) { const t = get(id); t.due = key ? key.replace(/-/g, '') + 'T160000Z' : null; send('PUT', `/tasks/${t.uuid}`, { due: key || '' }); emit('edit', { id: t.id }) },
    rename(id, text) { const t = get(id); const v = String(text).trim(); if (v && v !== t.description) { t.description = v; send('PUT', `/tasks/${t.uuid}`, { description: v }) } emit('edit', { id: t.id }) },
    toggleStart(id) { const t = get(id); t.start = t.start ? null : tw(NOW); send('POST', `/tasks/${t.uuid}/${t.start ? 'start' : 'stop'}`, null); emit('edit', { id: t.id }) },
    addNote(id, text) { const t = get(id); if (text.trim()) { t.annotations.push({ entry: tw(NOW), description: text.trim() }); send('POST', `/tasks/${t.uuid}/annotate`, { text: text.trim() }) } emit('edit', { id: t.id }) },
    addToProject(name, text, ctx) {
      const description = String(text).replace(/\s+/g, ' ').trim()
      if (!description) return null
      if (!ctx) throw new NeedsAnswer('context')
      const t = newTask(description, { project: name, tags: ['next', ctx], urgency: 6 })
      tasks.push(t)
      send('POST', '/tasks', { description, project: name, tags: ['next', ctx] })
      emit('edit', { id: t.id })
      return t
    },
    createProject(name) {
      const n = String(name)
      const err = projectNameError(n, projects.map((p) => p.name))
      if (err) return { error: err }
      projects.push({ name: n, outcome: '', status: 'active', plan: null })
      send('POST', '/projects', { name: n })
      emit('project', { name: n })
      return { name: n }
    },
    setProjectStatus(name, status) {
      const p = projects.find((x) => x.name === name)
      if (!p || p.status === status) return null
      const prev = p.status
      p.status = status
      send('PUT', `/projects/${encodeURIComponent(name)}/status`, { status })
      emit('project', { name, status })
      return prev
    },
    recordReview() { this.lastReview = TODAY; send('POST', '/gtd/review', { kind: 'weekly' }); emit('review') },
  }
}
