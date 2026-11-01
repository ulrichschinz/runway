/**
 * The write path's queue: every write the new UI has asked for and the server has not yet
 * confirmed, as plain data (plan §6.4, brief 0049).
 *
 * Pure: no timers, no storage, no requests. `composables/useOutbox.js` runs the effects —
 * it persists the queue to `localStorage['outbox']` before every request, arms the hold
 * timers, sends, and feeds the answers back through `commit`, `fail` and `pauseAuth`.
 *
 * An op's life:
 *   held     done/delete inside its 6 s window          → undo drops it · timer/flush → sending
 *   queued   to be sent now                             → sending
 *   sending  in flight (persisted before it left)        → commit removes it · fail · pauseAuth
 *   failed   refused (4xx) or not delivered             → retry → queued · undo drops it
 *   auth     a 401 paused it until the next login       → resume → held or queued
 *
 * Every function returns a new array; the ops in it are never mutated.
 */

import { applyPayload } from './gtdRules.js'

/** How long done and delete wait for Rückgängig before they are sent. */
export const HOLD_MS = 6000

/** The version of the stored shape (`serialize`). */
const VERSION = 1

/** A capture with the same text is "the same capture" if entered this long before the op. */
const CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * How long an op another tab put in flight is left to that tab before `recover` resends
 * it: a second tab that boots while the first one's request is still under way must not
 * send the same capture or note again.
 */
export const IN_FLIGHT_MS = 30_000

/**
 * The same window for an op sent with keepalive as its page went away (`flush`): that page
 * never sees the answer, so another tab, or the reloaded page, takes it over — verified
 * first — once a keepalive request has had time to arrive.
 */
export const KEEPALIVE_MS = 3_000

/** When another tab may take over an op in flight. */
export const inFlightUntil = (op) => (op.sentAt ?? 0) + (op.keepalive ? KEEPALIVE_MS : IN_FLIGHT_MS)

/** The longest `q` that `GET /tasks` takes (backend `max_length=200`). */
const QUERY_MAX = 200

const STATES = ['held', 'queued', 'sending', 'failed', 'auth']

/** Each kind's request. `fields` are what the caller knows; a body is JSON or null. */
const REQUESTS = {
  capture: ({ description, note }) => ['POST', '/inbox', note ? { description, note } : { description }],
  put: ({ uuid, body }) => ['PUT', `/tasks/${uuid}`, body],
  done: ({ uuid }) => ['POST', `/tasks/${uuid}/done`, null],
  delete: ({ uuid }) => ['DELETE', `/tasks/${uuid}`, null],
  start: ({ uuid }) => ['POST', `/tasks/${uuid}/start`, null],
  stop: ({ uuid }) => ['POST', `/tasks/${uuid}/stop`, null],
  annotate: ({ uuid, text }) => ['POST', `/tasks/${uuid}/annotate`, { text }],
  createProject: ({ name }) => ['POST', '/projects', { name }],
  projectStatus: ({ name, status }) => ['PUT', `/projects/${encodeURIComponent(name)}/status`, { status }],
  review: () => ['POST', '/gtd/review', { kind: 'weekly' }],
}

/**
 * Kinds that may be sent twice with the same result. The others (capture, done, delete,
 * annotate, createProject) are checked against the server first when an earlier try may
 * have arrived (`verify`).
 */
const IDEMPOTENT = new Set(['put', 'start', 'stop', 'projectStatus', 'review'])

/** The uuid a capture's row carries until the server names the task. */
const localUuid = (id) => `local:${id}`

/** A Taskwarrior stamp (`20261101T131021Z`) of an instant; such stamps sort in time order. */
const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')

const find = (ops, id) => ops.find((op) => op.id === id)
const without = (ops, id) => ops.filter((op) => op.id !== id)
const patch = (ops, id, changes) => ops.map((op) => (op.id === id ? { ...op, ...changes } : op))

/**
 * A new op, not yet in a queue.
 *
 * @param {string} kind one of the keys of the request table above
 * @param {object} fields `uuid`, `label` (the task's text, for notices), the kind's own
 *   fields (`description`/`note`, `body`, `text`, `name`/`status`), and optionally
 *   `inverse` (a move's exact inverse) and `plannedAtHold` (F6, for done)
 * @param {{id: string, at: number, user: string|null}} meta
 */
export function createOp(kind, fields, { id, at, user }) {
  const request = REQUESTS[kind]
  if (!request) throw new Error(`unknown outbox kind ${kind}`)
  const [method, path, body] = request(fields)
  const op = { id, kind, user, at, label: fields.label || '', method, path, body }
  op.uuid = kind === 'capture' ? localUuid(id) : fields.uuid || null
  if (fields.name) op.name = fields.name
  if (fields.inverse) op.inverse = fields.inverse
  if (fields.plannedAtHold !== undefined) op.plannedAtHold = fields.plannedAtHold
  return op
}

/** Add an op to be sent now. */
export function enqueue(ops, op) {
  return [...ops, { ...op, state: 'queued' }]
}

/**
 * Add a done or delete that waits `ms` for Rückgängig. A second hold on the same task
 * (done, then delete inside the window) replaces the first: only the last one is sent.
 */
export function hold(ops, op, now, ms = HOLD_MS) {
  const rest = ops.filter((o) => !(o.state === 'held' && o.uuid === op.uuid))
  return [...rest, { ...op, state: 'held', until: now + ms }]
}

/** Whether an op may be moved to `sending` now. */
export const isSendable = (op) => !!op && (op.state === 'queued' || op.state === 'held')

/** Mark an op as in flight. Anything but a queued or held op is left alone. */
export function begin(ops, id, { now = null, tab = null, keepalive = false } = {}) {
  return isSendable(find(ops, id))
    ? patch(ops, id, { state: 'sending', sentAt: now, tab, keepalive: keepalive || undefined })
    : ops
}

/** The op that takes back an op the server has already applied, or null when none can. */
function inverseOf(op, { id, at }) {
  const meta = { id, at, user: op.user }
  if (op.kind === 'capture' && !op.uuid.startsWith('local:')) {
    return createOp('delete', { uuid: op.uuid, label: op.label }, meta)
  }
  if (op.kind === 'put' && op.inverse) {
    return createOp('put', { uuid: op.uuid, body: op.inverse, label: op.label }, meta)
  }
  return null
}

/**
 * The server applied an op: remove it. For a capture, the reply names the task.
 *
 * @param {object|null} reply the response body (a capture's `{uuid, description}`)
 * @param {{newId: string, now: number}} next the id and time for a follow-up op
 * @returns {{ops: object[], settled: object|null, followUp: object|null}} `settled` is the
 *   op as sent (a capture with its server uuid); `followUp` the inverse an undo asked for
 *   while the op was in flight, already enqueued
 */
export function commit(ops, id, reply, { newId, now }) {
  const op = find(ops, id)
  if (!op) return { ops, settled: null, followUp: null }
  const settled = op.kind === 'capture' && reply?.uuid ? { ...op, uuid: reply.uuid } : op
  let rest = without(ops, id)
  const followUp = op.undone ? inverseOf(settled, { id: newId, at: now }) : null
  if (followUp) rest = enqueue(rest, followUp)
  return { ops: rest, settled, followUp }
}

/**
 * What a failed request means for its op.
 *
 * @param {number|undefined} status the HTTP status, or nothing when no response came
 * @returns {'network'|'server'|'auth'|'refused'}
 */
export function failureOf(status) {
  if (!status) return 'network'
  if (status === 401) return 'auth'
  if (status === 408 || status === 429 || status >= 500) return 'server'
  return 'refused'
}

/**
 * The server did not take an op. `refused` (4xx) is final until the user retries; the
 * other reasons may have reached the server, so a non-idempotent op is verified before
 * it is sent again. An op whose undo arrived while it was in flight is dropped: the user
 * no longer wants it.
 *
 * @param {{reason: 'network'|'server'|'refused', message?: string}} failure
 */
export function fail(ops, id, { reason, message = '' }) {
  const op = find(ops, id)
  if (!op) return ops
  if (op.undone) return without(ops, id)
  const unknown = reason !== 'refused' && !IDEMPOTENT.has(op.kind)
  return patch(ops, id, { state: 'failed', failure: { reason, message }, verify: !!op.verify || unknown })
}

/**
 * A 401: the session is over, so every op waits for the next login. `id` is the op that
 * was refused (it certainly did not arrive); other ops in flight may still arrive, so they
 * are verified when they are sent again.
 */
export function pauseAuth(ops, id = null) {
  return ops.map((op) => {
    if (op.state === 'auth') return op
    const inFlight = op.state === 'sending' && op.id !== id
    return { ...op, state: 'auth', verify: !!op.verify || (inFlight && !IDEMPOTENT.has(op.kind)) }
  })
}

/** After a login: paused ops go out again, a hold only once its window has passed. */
export function resume(ops, now) {
  return ops.map((op) =>
    op.state === 'auth' ? { ...op, state: op.until > now ? 'held' : 'queued' } : op,
  )
}

/**
 * Send failed ops again: one (`id`) or all. `auto` (online, focus, a visible tab) retries
 * only what may succeed on its own — never a refused op, which only the user retries.
 */
export function retry(ops, { id = null, auto = false } = {}) {
  return ops.map((op) => {
    if (op.state !== 'failed' || (id && op.id !== id)) return op
    if (auto && op.failure?.reason === 'refused') return op
    return { ...op, state: 'queued' }
  })
}

/**
 * Rückgängig for one action (`action` is the op as the caller last saw it; after a commit
 * that is `commit`'s `settled`).
 *
 * @returns {{ops: object[], undone: boolean}} `undone` false: too late (a done or delete
 *   the server has, or is, applying)
 */
export function undo(ops, action, { newId, now }) {
  const op = find(ops, action.id)
  if (op && op.state !== 'sending') return { ops: without(ops, op.id), undone: true }
  if (op) {
    const undoable = op.kind === 'capture' || (op.kind === 'put' && !!op.inverse)
    return undoable ? { ops: patch(ops, op.id, { undone: true }), undone: true } : { ops, undone: false }
  }
  const inverse = inverseOf(action, { id: newId, at: now })
  return inverse ? { ops: enqueue(ops, inverse), undone: true } : { ops, undone: false }
}

/**
 * The queue as it is found after a reload, a crash or another tab.
 *
 * - `sending`: the outcome is unknown, so it is sent again — verified first unless it is
 *   idempotent. An op this tab (`tab`) has in flight, or another tab sent less than
 *   `IN_FLIGHT_MS` ago (`KEEPALIVE_MS` for a keepalive send), is left alone: that tab is
 *   still waiting for the answer.
 * - `held` whose window has passed: sent (the user did not undo it).
 * - `auth`: resumed when the user is logged in (`authed`), else left paused.
 */
export function recover(ops, now, { authed, tab = null }) {
  const out = ops.map((op) => {
    const owned = op.state === 'sending' && (
      (tab && op.tab === tab) || (op.sentAt && op.tab !== tab && now < inFlightUntil(op)))
    if (owned) return op
    if (op.state === 'sending') return { ...op, state: 'queued', verify: !!op.verify || !IDEMPOTENT.has(op.kind) }
    if (op.state === 'held' && op.until <= now) return { ...op, state: 'queued' }
    return op
  })
  return authed ? resume(out, now) : out
}

/**
 * One user's ops out of the stored queue. A browser may hold the queue of a user who
 * logged out; it is kept as it is and never sent with another user's token.
 */
export const opsOf = (all, user) => all.filter((op) => op.user === user)

/** The stored queue with one user's ops replaced; everyone else's are kept as they are. */
export const withOpsOf = (all, user, mine) => [...all.filter((op) => op.user !== user), ...mine]

/** The queue as stored. */
export function serialize(ops) {
  return JSON.stringify({ v: VERSION, ops })
}

const isOp = (op) =>
  !!op &&
  typeof op.id === 'string' &&
  Object.hasOwn(REQUESTS, op.kind) &&
  typeof op.method === 'string' &&
  typeof op.path === 'string' &&
  STATES.includes(op.state)

/**
 * The stored queue. Anything unreadable — no value, broken JSON, another version, a
 * malformed op — reads as nothing rather than as an error.
 *
 * @param {string|null} text
 * @returns {object[]}
 */
export function restore(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  if (!data || data.v !== VERSION || !Array.isArray(data.ops)) return []
  return data.ops.filter(isOp)
}

/**
 * The read that tells whether an op whose outcome is unknown already arrived, or null
 * when the op is resent without asking (idempotent).
 *
 * @returns {{path: string, params?: object}|null}
 */
export function verifyRequest(op) {
  if (!op.verify || IDEMPOTENT.has(op.kind)) return null
  if (op.kind === 'capture') {
    // `alreadyApplied` compares the whole text, so a cut query still matches exactly.
    const q = Array.from(op.body.description).slice(0, QUERY_MAX).join('')
    return { path: '/tasks', params: { status: 'all', q } }
  }
  if (op.kind === 'createProject') return { path: '/gtd/projects' }
  return { path: `/tasks/${op.uuid}` }
}

/**
 * Whether the answer to `verifyRequest(op)` shows the op already applied.
 *
 * @param {*} answer the response body, or null when the task does not exist (the API
 *   answers 400 "Task not found")
 * @returns {object|null} what `commit` takes as the reply (a capture's `{uuid}`), or null
 *   when the op must still be sent
 */
export function alreadyApplied(op, answer) {
  if (op.kind === 'capture') {
    const since = stampOf(op.at - CLOCK_SKEW_MS)
    const twin = (answer || []).find(
      (t) => t.description === op.body.description && t.status !== 'deleted' && (t.entry || '') >= since,
    )
    return twin ? { uuid: twin.uuid, description: twin.description } : null
  }
  if (op.kind === 'createProject') return (answer || []).includes(op.name) ? {} : null
  // A task that no longer exists has nothing left to do or to undo.
  if (!answer) return {}
  if (op.kind === 'done') return answer.status === 'pending' ? null : {}
  if (op.kind === 'delete') return answer.status === 'deleted' ? {} : null
  if (op.kind === 'annotate') {
    const since = stampOf(op.at - CLOCK_SKEW_MS)
    const has = (answer.annotations || []).some((a) => a.description === op.body.text && a.entry >= since)
    return has ? answer : null
  }
  return null
}

/**
 * The Inbox row of a capture the server has not confirmed (or has, until its task is read):
 * the text and note as typed, entered when the op was made.
 */
export function captureRow(op) {
  const entry = stampOf(op.at)
  return {
    uuid: op.uuid, description: op.body.description, status: 'pending', project: null, tags: [],
    annotations: op.body.note ? [{ entry, description: op.body.note }] : [], entry, urgency: 0,
  }
}

/** Fields a `put` body sets directly (beyond tags, project, scheduled and depends). */
const PLAIN_FIELDS = ['priority', 'due', 'wait', 'until', 'recur']

/** A task as a `put` body leaves it, for the row until the server's reply replaces it. */
function patchTask(t, body) {
  const next = applyPayload(t, body)
  if (body.description) next.description = body.description
  for (const field of PLAIN_FIELDS) if (field in body) next[field] = body[field] || null
  if (Array.isArray(body.depends)) next.depends = [...body.depends]
  return next
}

/**
 * The snapshot as the user should see it: what the server said, with every write that
 * is not confirmed yet laid over it. Applied to every snapshot, so a refresh can never
 * bring back a task whose done or delete is still held, failed or paused.
 *
 * Each row an op touches carries `sync` (the op's state) and `opId`.
 *
 * @param {{tasks: object[], done: object[], projects: object[]}} snapshot open tasks,
 *   tasks done this week, the projects overview
 * @returns {{tasks: object[], done: object[], projects: object[]}}
 */
export function applyOutbox({ tasks, done, projects }, ops) {
  let open = tasks
  let finished = done
  let projectRows = projects
  const update = (uuid, fn) => {
    open = open.map((t) => (t.uuid === uuid ? fn(t) : t))
  }
  for (const op of ops) {
    const mark = { sync: op.state, opId: op.id }
    const task = open.find((t) => t.uuid === op.uuid)
    switch (op.kind) {
      case 'capture':
        open = [...open, { ...captureRow(op), ...mark }]
        break
      case 'done':
      case 'delete':
        if (!task) break
        open = open.filter((t) => t !== task)
        if (op.kind === 'done') {
          finished = [...finished, { ...task, status: 'completed', end: null, plannedAtHold: op.plannedAtHold, ...mark }]
        }
        break
      case 'put':
        update(op.uuid, (t) => ({ ...patchTask(t, op.body), ...mark }))
        break
      case 'start':
      case 'stop':
        update(op.uuid, (t) => ({ ...t, start: op.kind === 'start' ? stampOf(op.at) : null, ...mark }))
        break
      case 'annotate':
        update(op.uuid, (t) => ({
          ...t, annotations: [...(t.annotations || []), { entry: stampOf(op.at), description: op.body.text }], ...mark,
        }))
        break
      case 'createProject':
        if (!projectRows.some((p) => p.name === op.name)) {
          projectRows = [...projectRows, { name: op.name, status: 'active', explicit: true, ...mark }]
        }
        break
      case 'projectStatus':
        projectRows = projectRows.map((p) => (p.name === op.name ? { ...p, status: op.body.status, ...mark } : p))
        break
      default:
        break
    }
  }
  return { tasks: open, done: finished, projects: projectRows }
}

/**
 * A refresh that started before a write's reply arrived may have been answered before the
 * write landed. `settled` holds, per task uuid, the state the last reply gave the task
 * (`task`, or null when it is gone) and when it arrived (`at`); every entry at or after
 * `startedAt` is laid over the fresh lists: a completed task goes to `done`, a deleted or
 * missing one nowhere, any other into `tasks`.
 *
 * @param {{tasks: object[], done: object[]}} fresh
 * @param {Map<string, {at: number, task: object|null}>} settled
 * @param {number} startedAt when the refresh's requests left
 */
export function withSettled(fresh, settled, startedAt) {
  const late = [...settled].filter(([, s]) => s.at >= startedAt)
  if (late.length === 0) return fresh
  const touched = new Set(late.map(([uuid]) => uuid))
  const tasks = fresh.tasks.filter((t) => !touched.has(t.uuid))
  const done = fresh.done.filter((t) => !touched.has(t.uuid))
  for (const [, { task }] of late) {
    if (!task || task.status === 'deleted') continue
    if (task.status === 'completed') done.push(task)
    else tasks.push(task)
  }
  return { ...fresh, tasks, done }
}
