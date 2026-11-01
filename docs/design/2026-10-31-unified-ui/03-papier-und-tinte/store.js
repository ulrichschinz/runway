// One store for every surface of the prototype (web app, phone app, widget, tile, share card).
// It mirrors the proposal's client rules: GTD lists exactly as the server defines them (rules.js),
// the lenient context rule on Nächste, Inbox newest first, and Android's outbox hold (6 s) for
// done, delete and capture on both platforms, because the API cannot reopen or undelete.
// Every write is recorded in `calls` as the request the real client would send.

import { TASKS, PROJECTS, CONTEXTS, TODAY, tagParts, contextsOf, parseTw } from '../shared/data/tasks.js'
import {
  STATUS_TAGS, has, isNext, isWaiting, isSomeday, isInbox, listOf,
  clarifyPayload, listPayload, contextPayload, inversePayload, applyPayload, projectNameError,
} from './rules.js'

export { TODAY, CONTEXTS, contextsOf, tagParts, parseTw, isNext, isWaiting, isSomeday, isInbox, listOf, projectNameError }
export const NOW = new Date('2026-10-31T08:41:00Z') // 09:41 in Berlin, the prototype's fixed "now"
export const UNDO_MS = 6000

const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (d) => fmtKey.format(d)
const tw = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
export const followUp = (t) => parseTw(t.scheduled || t.wait)
const keyMinus = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

export function createStore() {
  const tasks = TASKS.map((t) => ({ ...t, tags: [...t.tags], annotations: t.annotations.map((a) => ({ ...a })) }))
  const projects = PROJECTS.map((p) => ({ ...p, plan: null }))

  // ── Demo data, brought in line with the real API (documented in README "Changes after review").
  // 1. The shared demo data marks next actions by a context alone. The server needs +next, so the
  //    store gives those tasks the tag the server would hold. After this, the rules are strict.
  for (const t of tasks) if (contextsOf(t).length && !STATUS_TAGS.some((s) => has(t, s))) t.tags.unshift('next')
  // 2. The API knows active | on_hold | done; the demo's "someday" project is on hold.
  for (const p of projects) if (!['active', 'on_hold', 'done'].includes(p.status)) p.status = 'on_hold'
  // 3. One waiting todo gets a follow-up day in the past, so the "Nachhaken" state is visible.
  const landlord = tasks.find((t) => t.description.startsWith('Rückmeldung Vermieter'))
  if (landlord) landlord.scheduled = '20261030T080000Z'

  const holds = new Map() // id -> { kind, timer, until }
  const subs = new Set()
  const clarified = [] // { id, description, label, inverse }
  const calls = [] // the requests the real client would send, in order
  let seq = 0
  let lastHold = null
  let nextId = 100

  // Plans (GTD natural planning) for two projects, so the plan document has something to show.
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
  const call = (method, path, body) => { calls.push({ method, path, body }); return body }
  const put = (t, body) => { call('PUT', `/tasks/${t.uuid}`, body); applyPayload(t, body); return body }

  function lists(ctx = null) {
    const open = tasks.filter(visible)
    const byUrg = (a, b) => (b.start ? 1 : 0) - (a.start ? 1 : 0) || b.urgency - a.urgency
    const inbox = open.filter(isInbox).sort((a, b) => b.entry.localeCompare(a.entry))
    const next = open.filter(isNext).sort(byUrg)
    const nextIn = next.filter((t) => !ctx || contextsOf(t).includes(ctx) || contextsOf(t).length === 0)
    const due = open.filter((t) => t.due && dayKey(parseTw(t.due)) <= TODAY).sort((a, b) => a.due.localeCompare(b.due))
    const waiting = open.filter(isWaiting).sort((a, b) => {
      const fa = followUp(a), fb = followUp(b)
      if (fa && fb) return fa - fb
      return fa ? -1 : fb ? 1 : a.entry.localeCompare(b.entry)
    })
    const someday = open.filter(isSomeday).sort(byUrg)
    // in no list: a project's todo without a status tag, or a context without +next (summary "unclarified")
    const unlisted = open.filter((t) => listOf(t) === 'none').sort(byUrg)
    const isDone = (t) => t.status === 'completed' || holds.get(t.id)?.kind === 'done'
    const doneToday = tasks.filter((t) => isDone(t) && (!t.end || dayKey(parseTw(t.end)) === TODAY))
      .sort((a, b) => (a.end || 'Z').localeCompare(b.end || 'Z'))
    const weekAgo = keyMinus(TODAY, 6)
    const doneWeek = tasks.filter((t) => isDone(t) && (!t.end || dayKey(parseTw(t.end)) >= weekAgo))
      .sort((a, b) => (b.end || 'Z').localeCompare(a.end || 'Z'))
    const ctxCount = Object.fromEntries(CONTEXTS.map((c) => [c, next.filter((t) => contextsOf(t).includes(c)).length]))
    return { open, inbox, next, nextIn, due, waiting, someday, unlisted, doneToday, doneWeek, ctxCount }
  }

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

  function hold(kind, t) {
    const prev = holds.get(t.id)
    if (prev) clearTimeout(prev.timer)
    const h = { kind, id: t.id, until: Date.now() + UNDO_MS, seq: ++seq }
    h.timer = setTimeout(() => commit(t.id), UNDO_MS)
    holds.set(t.id, h)
    lastHold = h
    return h
  }
  function commit(id) {
    const h = holds.get(id)
    if (!h) return
    holds.delete(id)
    const t = get(id)
    if (h.kind === 'done') { call('POST', `/tasks/${t.uuid}/done`, null); t.status = 'completed'; t.end = tw(new Date(NOW.getTime() + h.seq * 60000)); t.start = null }
    if (h.kind === 'delete') { call('DELETE', `/tasks/${t.uuid}`, null); t.status = 'deleted' }
    if (h.kind === 'capture') call('POST', '/inbox', { description: t.description, note: t.annotations[0]?.description || undefined })
    if (lastHold === h) lastHold = null
    emit('commit', { id, kind: h.kind })
  }

  return {
    tasks, projects, clarified, calls,
    get, lists, projectOverview,
    subscribe(f) { subs.add(f); return () => subs.delete(f) },
    holdOf: (id) => holds.get(id),
    lastHold: () => lastHold,
    lastReview: '2026-10-23',
    stand: '09:41',

    capture(text, note = '') {
      const description = String(text).replace(/\s+/g, ' ').trim().slice(0, 500)
      if (!description) return null
      const t = {
        id: nextId++, uuid: `00000000-0000-4000-9000-${String(nextId).padStart(12, '0')}`, description,
        status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null,
        urgency: 1, entry: tw(new Date(NOW.getTime() + (++seq) * 60000)), start: null,
        annotations: note ? [{ entry: tw(NOW), description: note }] : [], fresh: true,
      }
      tasks.push(t)
      hold('capture', t)
      emit('capture', { id: t.id })
      return t
    },
    complete(id) {
      const t = get(id)
      if (!t || !visible(t)) return null
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
    // Rückgängig holds exactly one action: the last one. Earlier holds commit on schedule.
    undo(id) {
      const h = id ? holds.get(id) : lastHold
      if (!h) return false
      clearTimeout(h.timer)
      holds.delete(h.id)
      if (h.kind === 'capture') get(h.id).status = 'deleted'
      if (lastHold === h) lastHold = null
      const i = clarified.findLastIndex((c) => c.id === h.id)
      if (i >= 0) clarified.splice(i, 1)
      emit('undo', { id: h.id, kind: h.kind })
      return true
    },
    // Inbox item -> 'next:@ctx' | 'next' | 'waiting' | 'someday' | 'project:Name' | 'delete' | 'done'.
    // Filing is sent at once (it is reversible through the API); Rückgängig sends the inverse.
    clarify(id, to) {
      const t = get(id)
      if (!t) return null
      const [kind, arg] = String(to).split(/:(.*)/s)
      let label, inverse = null
      if (kind === 'delete') { this.remove(t.id); label = 'gelöscht' }
      else if (kind === 'done') { this.complete(t.id); label = 'erledigt' }
      else {
        const before = { tags: [...t.tags], project: t.project }
        const body = clarifyPayload(to)
        inverse = inversePayload(before, body)
        put(t, body)
        label = { next: arg ? `Nächste · ${arg}` : 'Nächste · überall', waiting: 'Warten auf', someday: 'Irgendwann', project: `Projekt · ${arg}` }[kind]
        t.fresh = false
      }
      clarified.push({ id: t.id, description: t.description, label, inverse })
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
      put(t, listPayload(t, list))
      emit('edit', { id: t.id })
    },
    setContext(id, ctx) {
      const t = get(id)
      if (!t) return
      put(t, contextPayload(t, ctx))
      emit('edit', { id: t.id })
    },
    setPriority(id, p) { const t = get(id); t.priority = t.priority === p ? null : p; call('PUT', `/tasks/${t.uuid}`, { priority: t.priority || '' }); emit('edit', { id: t.id }) },
    setDue(id, key) { const t = get(id); t.due = key ? key.replace(/-/g, '') + 'T160000Z' : null; call('PUT', `/tasks/${t.uuid}`, { due: key || '' }); emit('edit', { id: t.id }) },
    rename(id, text) { const t = get(id); const v = String(text).trim(); if (v) { t.description = v; call('PUT', `/tasks/${t.uuid}`, { description: v }) } emit('edit', { id: t.id }) },
    toggleStart(id) { const t = get(id); t.start = t.start ? null : tw(NOW); call('POST', `/tasks/${t.uuid}/${t.start ? 'start' : 'stop'}`, null); emit('edit', { id: t.id }) },
    addNote(id, text) { const t = get(id); if (text.trim()) { t.annotations.push({ entry: tw(NOW), description: text.trim() }); call('POST', `/tasks/${t.uuid}/annotate`, { text: text.trim() }) } emit('edit', { id: t.id }) },
    addToProject(name, text) {
      const description = String(text).replace(/\s+/g, ' ').trim()
      if (!description) return null
      const t = {
        id: nextId++, uuid: `00000000-0000-4000-9000-${String(nextId).padStart(12, '0')}`, description,
        status: 'pending', project: name, tags: ['next'], priority: null, due: null, scheduled: null, wait: null,
        urgency: 16, entry: tw(new Date(NOW.getTime() + (++seq) * 60000)), start: null, annotations: [],
      }
      tasks.push(t)
      call('POST', '/tasks', { description, project: name, tags: ['next'] })
      emit('edit', { id: t.id })
      return t
    },
    createProject(name) {
      const n = String(name)
      const err = projectNameError(n, projects.map((p) => p.name))
      if (err) return { error: err }
      projects.push({ name: n, outcome: '', status: 'active', plan: null })
      call('POST', '/projects', { name: n })
      emit('project', { name: n })
      return { name: n }
    },
    setProjectStatus(name, status) {
      const p = projects.find((x) => x.name === name)
      if (!p || p.status === status) return null
      const prev = p.status
      p.status = status
      call('PUT', `/projects/${encodeURIComponent(name)}/status`, { status })
      emit('project', { name, status })
      return prev
    },
    recordReview() { this.lastReview = TODAY; call('POST', '/gtd/review', { kind: 'weekly' }); emit('review') },
    // Prototype helper for signature(): file every inbox item but the last one, silently.
    fileAllButOne() {
      const { inbox } = lists()
      inbox.slice(0, -1).forEach((t, i) => applyPayload(t, clarifyPayload(['next:@computer', 'someday', 'waiting', 'next:@anrufe'][i % 4])))
      emit('edit', {})
      return lists().inbox[0]
    },
  }
}
