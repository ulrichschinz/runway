/**
 * The new UI's one store (plan §6.3, brief 0049): a snapshot of what the server holds, every
 * list computed from it by the shared rules, and every write sent through the outbox.
 *
 * Snapshot — five reads in parallel, at most once per 30 s (`useFreshness`):
 *   GET /gtd/summary                      today, counts, last review
 *   GET /tasks                            every visible pending task
 *   GET /gtd/waiting                      adds +waiting tasks hidden by a future wait (F5)
 *   GET /tasks?completed_since=<today-6>  done this week (Heute, Rückblick, the day progress)
 *   GET /gtd/projects/overview            projects, status, stalled, has_plan
 *
 * Lists are never stored: the outbox's unconfirmed writes are laid over the snapshot
 * (`applyOutbox`), then M2's rules sort them into lists and sections. Every reply that
 * carries a task replaces the local one (F3: no timestamp is made up here).
 *
 * Writes (plan §6.4): captures and moves go out at once, Rückgängig sends the exact inverse
 * or a DELETE; done and delete wait 6 s; field edits, start/stop and notes have no undo.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import client from '../../api/client.js'
import { useFreshness } from '../../composables/useFreshness.js'
import { useOutbox } from '../../composables/useOutbox.js'
import { contextCounts, orderContexts, presentContexts } from '../../shared/contexts.js'
import { dayOf, plusDays, timeOf } from '../../shared/dates.js'
import { countsAsPlanned, dayProgress, lensCaption } from '../../shared/dayProgress.js'
import {
  beforeOf, clarifyPayload, contextPayload, inversePayload, listOf, listPayload, planPayload, projectNameError,
  reviewDue as reviewDueRule,
} from '../../shared/gtdRules.js'
import { applyOutbox, captureRow, captureText, withSettled } from '../../shared/outboxQueue.js'
import { byWeight, followUpOf, nextSections } from '../../shared/sections.js'

/** Newest first; Taskwarrior stamps sort in time order. */
const byEntryDesc = (a, b) => (b.entry || '').localeCompare(a.entry || '')
/** Oldest end first; a done still on its way (no `end` yet) last. */
const byEndAsc = (a, b) => (a.end || 'Z').localeCompare(b.end || 'Z')
/** Soonest follow-up first, then those without one, oldest first. */
const byFollowUp = (a, b) => {
  const fa = followUpOf(a)
  const fb = followUpOf(b)
  if (fa && fb) return fa.localeCompare(fb)
  if (fa || fb) return fa ? -1 : 1
  return (a.entry || '').localeCompare(b.entry || '')
}

/** The server's day for the browser's clock, before `/gtd/summary` has said. */
const clientToday = (now) => dayOf(new Date(now).toISOString())

async function readSnapshot(startedAt) {
  const doneSince = (day) => client.get('/tasks', { params: { completed_since: plusDays(day, -6) } })
  const guess = clientToday(startedAt)
  const [summary, open, waiting, done, projects] = await Promise.all([
    client.get('/gtd/summary'),
    client.get('/tasks'),
    client.get('/gtd/waiting'),
    doneSince(guess),
    client.get('/gtd/projects/overview'),
  ])
  const today = summary.data.today
  const doneWeek = today === guess ? done.data : (await doneSince(today)).data
  const known = new Set(open.data.map((t) => t.uuid))
  return {
    summary: summary.data,
    tasks: [...open.data, ...waiting.data.filter((t) => !known.has(t.uuid))],
    done: doneWeek,
    projects: projects.data,
  }
}

export const useGtdStore = defineStore('gtd', () => {
  const snapshot = ref({ tasks: [], done: [], projects: [] })
  const summary = ref(null)
  /** The last action, for Rückgängig (`undo()` without an argument). */
  const lastAction = ref(null)
  /** Uuids completed while they counted as planned (F6: `start` is dropped on done). */
  const plannedAtDone = ref([])
  /** Per task uuid, the state the last reply gave it and when (`withSettled`). */
  const settled = new Map()

  function settleTask(uuid, task, at = Date.now()) {
    settled.set(uuid, { at, task })
    snapshot.value = withSettled(snapshot.value, new Map([[uuid, { at, task }]]), at)
  }

  async function readTask(uuid) {
    try {
      settleTask(uuid, (await client.get(`/tasks/${uuid}`)).data)
    } catch {
      // The next refresh brings it.
    }
  }

  function onSettled(op, reply) {
    if (lastAction.value?.id === op.id) lastAction.value = op // a capture now has its server uuid
    switch (op.kind) {
      case 'put':
      case 'start':
      case 'stop':
      case 'annotate':
        if (reply?.uuid) settleTask(reply.uuid, reply)
        else readTask(op.uuid)
        break
      case 'done': {
        const task = snapshot.value.tasks.find((t) => t.uuid === op.uuid)
        if (op.plannedAtHold) plannedAtDone.value = [...plannedAtDone.value, op.uuid]
        settleTask(op.uuid, task ? { ...task, status: 'completed', end: null } : null)
        break
      }
      case 'delete':
        settleTask(op.uuid, null)
        break
      case 'capture':
        settleTask(op.uuid, captureRow(op))
        readTask(op.uuid)
        break
      case 'createProject':
        if (!snapshot.value.projects.some((p) => p.name === op.name)) {
          snapshot.value = { ...snapshot.value, projects: [...snapshot.value.projects, { name: op.name, status: 'active', explicit: true }] }
        }
        break
      case 'projectStatus':
        snapshot.value = {
          ...snapshot.value,
          projects: snapshot.value.projects.map((p) => (p.name === op.name ? { ...p, status: op.body.status } : p)),
        }
        break
      case 'review':
        if (summary.value && reply?.reviewed_at) {
          summary.value = { ...summary.value, last_review: { ...summary.value.last_review, weekly: reply.reviewed_at } }
        }
        break
      default:
        break
    }
  }

  const outbox = useOutbox({ onSettled })

  async function load(startedAt) {
    outbox.resumeAuth()
    const fresh = await readSnapshot(startedAt)
    summary.value = fresh.summary
    const { tasks, done, projects } = withSettled(fresh, settled, startedAt)
    snapshot.value = { tasks, done, projects }
    for (const [uuid, entry] of settled) if (entry.at < startedAt) settled.delete(uuid)
  }

  const freshness = useFreshness(load, { onWake: () => outbox.retry({ auto: true }) })

  // ── what the views read ─────────────────────────────────────────────────────────────
  const today = computed(() => summary.value?.today ?? null)
  const loaded = computed(() => freshness.at.value != null)
  const stand = computed(() => (freshness.at.value == null ? '' : timeOf(freshness.at.value)))
  const offline = freshness.offline

  const view = computed(() => applyOutbox(snapshot.value, outbox.ops.value))
  /** Every open todo the user should see, unconfirmed writes applied. */
  const open = computed(() => view.value.tasks)
  const inList = (list) => open.value.filter((t) => listOf(t) === list)
  const inbox = computed(() => inList('inbox').sort(byEntryDesc))
  const next = computed(() => inList('next').sort(byWeight))
  const waiting = computed(() => inList('waiting').sort(byFollowUp))
  const someday = computed(() => inList('someday').sort(byWeight))
  const unlisted = computed(() => inList('none').sort(byWeight))
  const done = computed(() =>
    view.value.done.map((t) => (plannedAtDone.value.includes(t.uuid) ? { ...t, plannedAtHold: true } : t)),
  )
  const doneToday = computed(() => done.value.filter((t) => !t.end || dayOf(t.end) === today.value).sort(byEndAsc))
  const doneWeek = computed(() => {
    const since = today.value && plusDays(today.value, -6)
    return done.value.filter((t) => !t.end || dayOf(t.end) >= since).sort((a, b) => byEndAsc(b, a))
  })
  const projects = computed(() => view.value.projects)
  const contexts = computed(() => orderContexts(presentContexts(open.value)))
  const contextCount = computed(() => contextCounts(open.value))
  const progress = computed(() => (today.value ? dayProgress(open.value, doneToday.value, today.value) : null))
  const caption = computed(() => (progress.value ? lensCaption(progress.value) : ''))
  /** The weekly review is due: never done, or last done seven or more days ago (06 rail). */
  const reviewDue = computed(() => reviewDueRule(summary.value?.last_review?.weekly, today.value))
  /** Nächste in sections under a context filter (`null`, `'@x'` or `NO_CONTEXT`). */
  const sectionsFor = (ctx = null) => nextSections({ tasks: open.value, today: today.value }, ctx)

  const opsIn = (state) => computed(() => outbox.ops.value.filter((op) => op.state === state))
  /** "Nicht gesendet · Erneut senden". */
  const failed = opsIn('failed')
  /** "wartet auf Anmeldung". */
  const paused = opsIn('auth')
  const held = opsIn('held')

  // ── writes ──────────────────────────────────────────────────────────────────────────
  // A capture the server has not named yet (`local:…`) cannot be written to: its uuid would
  // reach the API. Its own Rückgängig works through the op, not through this lookup.
  const find = (uuid) => (String(uuid).startsWith('local:') ? null : open.value.find((t) => t.uuid === uuid))
  const remember = (op) => {
    lastAction.value = op
    return op
  }
  /** A PUT that Rückgängig can take back exactly. */
  const move = (t, body) =>
    remember(outbox.add('put', { uuid: t.uuid, body, label: t.description, inverse: inversePayload(beforeOf(t), body) }))

  /** A new todo into the Inbox, sent at once. @returns the op, or null for empty text */
  function capture(text, note = '') {
    const { description, note: full } = captureText(text, note)
    if (!description) return null
    return remember(outbox.add('capture', { description, note: full, label: description }))
  }

  /** Tick a todo off; sent after the hold unless undone. */
  function complete(uuid) {
    const t = find(uuid)
    if (!t || !today.value) return null
    return remember(outbox.hold('done', { uuid, label: t.description, plannedAtHold: countsAsPlanned(t, today.value) }))
  }

  /** Delete a todo; sent after the hold unless undone. */
  function remove(uuid) {
    const t = find(uuid)
    return t ? remember(outbox.hold('delete', { uuid, label: t.description })) : null
  }

  /**
   * Rückgängig: the last action, or the one given.
   * @returns {boolean} false when it is too late (a done or delete the server has)
   */
  function undo(action = lastAction.value) {
    if (!action) return false
    const undone = outbox.undo(action)
    if (undone && lastAction.value?.id === action.id) lastAction.value = null
    return undone
  }

  /**
   * File an Inbox item: `'next:@ctx'`, `'waiting'`, `'someday'`, `'project:Name'`, `'done'`
   * or `'delete'` (see `clarifyPayload` for `opts`).
   * @throws {NeedsAnswer} before anything is sent, when a context is missing
   */
  function clarify(uuid, to, opts = {}) {
    if (to === 'done') return complete(uuid)
    if (to === 'delete') return remove(uuid)
    const t = find(uuid)
    return t ? move(t, clarifyPayload(to, opts)) : null
  }

  /** Move between Nächste, Warten auf and Irgendwann. @throws {NeedsAnswer} */
  function setList(uuid, list) {
    const t = find(uuid)
    return t && listOf(t) !== list ? move(t, listPayload(t, list)) : null
  }

  /** Toggle one context. @throws {NeedsAnswer} */
  function setContext(uuid, ctx) {
    const t = find(uuid)
    return t ? move(t, contextPayload(t, ctx)) : null
  }

  /** `t`: plan for today, or take it off today's plan. null where planning is refused. */
  function togglePlanned(uuid) {
    const t = find(uuid)
    const body = t && today.value ? planPayload(t, today.value) : null
    return body ? move(t, body) : null
  }

  /** Field edits from the detail (description, priority, due, …), sent at once. */
  function update(uuid, fields) {
    const t = find(uuid)
    return t ? outbox.add('put', { uuid, body: fields, label: t.description }) : null
  }

  const taskOp = (kind, uuid, fields = {}) => {
    const t = find(uuid)
    return t ? outbox.add(kind, { uuid, label: t.description, ...fields }) : null
  }
  const start = (uuid) => taskOp('start', uuid)
  const stop = (uuid) => taskOp('stop', uuid)
  function annotate(uuid, text) {
    const note = String(text).trim()
    return note ? taskOp('annotate', uuid, { text: note }) : null
  }

  /** @returns {{name: string}|{error: string}} `error` is a message key */
  function createProject(name) {
    const n = String(name)
    const error = projectNameError(n, projects.value.map((p) => p.name))
    if (error) return { error }
    outbox.add('createProject', { name: n, label: n })
    return { name: n }
  }

  function setProjectStatus(name, status) {
    const p = projects.value.find((x) => x.name === name)
    return p && p.status !== status ? outbox.add('projectStatus', { name, status, label: name }) : null
  }

  const recordReview = () => outbox.add('review', {})

  /** "Erneut senden": one failed op, or all of them. */
  const retry = (id = null) => outbox.retry({ id })

  freshness.refresh({ force: true })

  return {
    // state
    summary, today, loaded, stand, offline, lastAction,
    // lists
    open, inbox, next, waiting, someday, unlisted, doneToday, doneWeek, projects,
    contexts, contextCount, progress, caption, reviewDue, sectionsFor,
    // the outbox
    ops: outbox.ops, failed, paused, held,
    // actions
    refresh: freshness.refresh,
    capture, complete, remove, undo, clarify, setList, setContext, togglePlanned, update,
    start, stop, annotate, createProject, setProjectStatus, recordReview, retry,
  }
})
