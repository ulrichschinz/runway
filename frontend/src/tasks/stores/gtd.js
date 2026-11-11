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
 * A todo hidden by a future `wait` outside Warten auf is in none of these reads. When the detail
 * opens one (a `?task=` link, or one just deferred), it is held aside (`keepAside`): `taskOf`
 * and the writes reach it, the lists never show it (plan M7, brief 0053).
 *
 * Writes (plan §6.4): captures and moves go out at once, Rückgängig sends the exact inverse
 * or a DELETE; done and delete wait 6 s; field edits, start/stop and notes have no undo.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import client from '../../api/client.js'
import { useFreshness } from '../../composables/useFreshness.js'
import { useOutbox } from '../../composables/useOutbox.js'
import { clarifyContexts, contextCounts, orderContexts, presentContexts } from '../../shared/contexts.js'
import { dayOf, plusDays, timeOf } from '../../shared/dates.js'
import { countsAsPlanned, dayProgress, lensCaption } from '../../shared/dayProgress.js'
import {
  beforeOf, clarifyPayload, contextPayload, inversePayload, listOf, listPayload, planPayload, projectNameError, tagPayload,
  reviewAge as reviewAgeRule, reviewDue as reviewDueRule,
} from '../../shared/gtdRules.js'
import { cap } from '../../shared/capping.js'
import { isDeferred } from '../../shared/detailFields.js'
import { applyOutbox, captureRow, localUuid, withSettled } from '../../shared/outboxQueue.js'
import { withSnapshot } from '../../shared/projectStalled.js'
import { byWeight, followUpOf, followUps as followUpsRule, nextSections, waitingSections } from '../../shared/sections.js'

/**
 * Newest first; Taskwarrior stamps sort in time order. Captures of the same second keep one order
 * (by uuid), so a reply that replaces a task never reshuffles them (the card stack's top card).
 */
const byEntryDesc = (a, b) => (b.entry || '').localeCompare(a.entry || '') || a.uuid.localeCompare(b.uuid)
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
  /** A capture the Inbox has not been visited since: the yellow dot on its count (plan M6). */
  const inboxDot = ref(false)
  /** Uuids a rhythm turned into Taskwarrior's template: the detail says why they are gone. */
  const recurred = ref([])
  /** A capture's `local:…` uuid → the uuid the server gave it, so a view that holds one can follow it. */
  const named = ref({})
  /** The uuid a task has now: a capture's server uuid once it is known, else the uuid given. */
  const uuidNow = (uuid) => named.value[uuid] ?? uuid
  /** Per task uuid, the state the last reply gave it and when (`withSettled`). */
  const settled = new Map()
  /** Deferred todos the detail shows although no list does (`keepAside`). */
  const aside = ref([])

  /** Hold a deferred todo for its detail; any other state lets it go. */
  function keepAside(task) {
    if (!task?.uuid) return
    const rest = aside.value.filter((t) => t.uuid !== task.uuid)
    const deferred = isDeferred(task, summary.value?.today ?? clientToday(Date.now()))
    if (deferred || rest.length !== aside.value.length) aside.value = deferred ? [...rest, task] : rest
  }

  function settleTask(uuid, task, at = Date.now()) {
    settled.set(uuid, { at, task })
    snapshot.value = withSettled(snapshot.value, new Map([[uuid, { at, task }]]), at)
    keepAside(task ?? { uuid, status: 'deleted' })
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
        // Given a rhythm and a due day, Taskwarrior turns the todo into a template
        // (`recurring`) and makes the first occurrence under a new uuid: drop the template,
        // and read the snapshot again so the occurrence shows up.
        if (reply?.status === 'recurring') {
          recurred.value = [...recurred.value, reply.uuid]
          settleTask(reply.uuid, null)
          freshness.refresh({ force: true })
        } else if (reply?.uuid) settleTask(reply.uuid, reply)
        else readTask(op.uuid)
        break
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
        named.value = { ...named.value, [localUuid(op.id)]: op.uuid }
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

  /** Held-aside todos the snapshot does not have (any more): in the view, in no list. */
  const hidden = computed(() => {
    const known = new Set(snapshot.value.tasks.map((t) => t.uuid))
    return aside.value.filter((t) => !known.has(t.uuid))
  })
  const view = computed(() =>
    applyOutbox({ ...snapshot.value, tasks: [...snapshot.value.tasks, ...hidden.value] }, outbox.ops.value))
  /** Every open todo the user should see, unconfirmed writes applied. */
  const open = computed(() => {
    if (!hidden.value.length) return view.value.tasks
    const ids = new Set(hidden.value.map((t) => t.uuid))
    return view.value.tasks.filter((t) => !ids.has(t.uuid))
  })
  /** One open todo for its detail, a deferred one held aside included. */
  const taskOf = (uuid) => view.value.tasks.find((t) => t.uuid === uuid) ?? null
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
  /**
   * The projects overview with the snapshot's reading (plan M13): `stalled` as the server reads
   * it, but from the todos on screen now, and `counts` by list (`withSnapshot`).
   */
  const projects = computed(() => withSnapshot(view.value.projects, open.value))
  const contexts = computed(() => orderContexts(presentContexts(open.value)))
  /** The contexts the clarify panel offers for Nächste (D1, or the preset for a user without any). */
  const contextChoices = computed(() => clarifyContexts(contexts.value))
  const contextCount = computed(() => contextCounts(open.value))
  const progress = computed(() => (today.value ? dayProgress(open.value, doneToday.value, today.value) : null))
  const caption = computed(() => (progress.value ? lensCaption(progress.value) : ''))
  /** The weekly review is due: never done, or last done seven or more days ago (06 rail). */
  const reviewDue = computed(() => reviewDueRule(summary.value?.last_review?.weekly, today.value))
  /** The margin's Rückblick (plan M12): the last weekly review's day and the days since. */
  const reviewAge = computed(() => (today.value ? reviewAgeRule(summary.value?.last_review?.weekly, today.value) : null))
  /** The margin's Nachhaken (plan M12): Warten auf's due and this week's follow-ups, three at most. */
  const followUps = computed(() => (today.value ? followUpsRule(waiting.value, today.value) : { due: 0, rows: [] }))
  /** The Rückblick's step 3 (plan M14): Warten auf's follow-ups that have come, and those of the coming week. */
  const followUpCounts = computed(() => {
    if (!today.value) return { due: 0, soon: 0 }
    const s = waitingSections(waiting.value, today.value)
    return { due: s.due.length, soon: s.soon.length }
  })
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
  const find = (uuid) => (String(uuid).startsWith('local:') ? null : taskOf(uuid))
  const remember = (op) => {
    lastAction.value = op
    return op
  }
  /** A PUT that Rückgängig can take back exactly. */
  const move = (t, body) =>
    remember(outbox.add('put', { uuid: t.uuid, body, label: t.description, inverse: inversePayload(beforeOf(t), body) }))

  /**
   * A new todo into the Inbox, sent at once, capped as Android caps it (`shared/capping.js`).
   * @returns the op, or null when there is nothing to capture
   */
  function capture(text, note = null) {
    const capped = cap(text, note)
    if (!capped) return null
    inboxDot.value = true
    return remember(outbox.add('capture', { ...capped, label: capped.description }))
  }

  /**
   * The page goes away with a draft: capture it and send it with keepalive at once, so it
   * reaches the server although the page does not live to see the answer.
   */
  function captureOnLeave(text) {
    const op = capture(text)
    if (op) outbox.flush()
    return op
  }

  /** The Inbox is on screen: what was captured has been seen. */
  function seeInbox() {
    inboxDot.value = false
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
    // A capture the server has named since: its Rückgängig deletes that uuid.
    if (lastAction.value?.id === action.id) action = lastAction.value
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

  /** Move between Nächste, Warten auf and Irgendwann (`ctx`: Nächste's answer, same PUT). @throws {NeedsAnswer} */
  function setList(uuid, list, ctx = '') {
    const t = find(uuid)
    return t && listOf(t) !== list ? move(t, listPayload(t, list, ctx)) : null
  }

  /** Toggle one context. @throws {NeedsAnswer} */
  function setContext(uuid, ctx) {
    const t = find(uuid)
    return t ? move(t, contextPayload(t, ctx)) : null
  }

  /** Add or remove one other tag (the detail's Tags), as a delta. @throws {NeedsAnswer} */
  function toggleTag(uuid, tag) {
    const t = find(uuid)
    return t ? move(t, tagPayload(t, tag)) : null
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

  /**
   * A project's next action (plan M13, 06 `addToProject`): a capture into the project with
   * `next` and its context, sent at once (`POST /tasks`), Rückgängig a DELETE. It needs a context
   * (06 open question 6), so without one nothing is sent.
   * @returns the op, or null when there is no text, no project or no context
   */
  function addNextAction(project, text, ctx) {
    const capped = cap(text)
    if (!capped || !project || !ctx) return null
    return remember(outbox.add('capture', {
      description: capped.description, project, tags: ['next', ctx], label: capped.description,
    }))
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
    summary, today, loaded, stand, offline, lastAction, inboxDot, recurred,
    // lists
    open, taskOf, uuidNow, keepAside, inbox, next, waiting, someday, unlisted, doneToday, doneWeek, projects,
    contexts, contextChoices, contextCount, progress, caption, reviewDue, reviewAge, followUps, followUpCounts, sectionsFor,
    // the outbox
    ops: outbox.ops, failed, paused, held,
    // actions
    refresh: freshness.refresh,
    capture, captureOnLeave, seeInbox, complete, remove, undo, clarify, setList, setContext, toggleTag, togglePlanned, update,
    start, stop, annotate, addNextAction, createProject, setProjectStatus, recordReview, retry,
  }
})
