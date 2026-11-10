import { describe, expect, it } from 'vitest'

import { beforeOf, inversePayload, listPayload } from '../src/shared/gtdRules.js'
import {
  HOLD_MS, IN_FLIGHT_MS, alreadyApplied, applyOutbox, begin, captureRow, commit, createOp, enqueue, fail, failureOf, hold,
  inFlightUntil, isSendable, KEEPALIVE_MS, opsOf, pauseAuth, recover, restore, resume, retry, serialize, undo, verifyRequest, withOpsOf, withSettled,
} from '../src/shared/outboxQueue.js'

const T0 = Date.UTC(2026, 10, 1, 8, 41) // 09:41 in Berlin
const USER = 'uli'
let n = 0
const meta = (at = T0) => ({ id: `op${++n}`, at, user: USER })
const next = (now = T0) => ({ newId: `op${++n}`, now })

const waitingTodo = () => ({
  uuid: 'u-vermieter', description: 'Rückmeldung Vermieter', status: 'pending', project: null,
  tags: ['waiting', '@anrufe'], scheduled: '20261030T230000Z', annotations: [], entry: '20261020T090000Z',
})
const inboxTodo = () => ({
  uuid: 'u-idee', description: 'Idee', status: 'pending', project: null, tags: [], annotations: [], entry: '20261031T090000Z',
})

/** A move as the store makes it: the PUT body and its exact inverse from M2's rules. */
function moveOp(task, list, at = T0) {
  const body = listPayload(task, list)
  return createOp('put', { uuid: task.uuid, body, label: task.description, inverse: inversePayload(beforeOf(task), body) }, meta(at))
}
const doneOp = (task, at = T0) => createOp('done', { uuid: task.uuid, label: task.description, plannedAtHold: true }, meta(at))
const captureOp = (text, at = T0) => createOp('capture', { description: text, label: text }, meta(at))
const states = (ops) => ops.map((op) => op.state)

/** What `useOutbox` does around one request: begin, then the outcome. */
const sendOk = (ops, id, reply = null) => commit(begin(ops, id), id, reply, next())

describe('createOp', () => {
  it('builds each kind’s request', () => {
    const m = meta()
    expect(createOp('capture', { description: 'Milch', note: 'fettarm' }, m)).toMatchObject({
      method: 'POST', path: '/inbox', body: { description: 'Milch', note: 'fettarm' }, uuid: `local:${m.id}`,
    })
    expect(createOp('capture', { description: 'Milch', note: '' }, meta()).body).toEqual({ description: 'Milch' })
    expect(createOp('done', { uuid: 'u1' }, meta())).toMatchObject({ method: 'POST', path: '/tasks/u1/done', body: null })
    expect(createOp('delete', { uuid: 'u1' }, meta())).toMatchObject({ method: 'DELETE', path: '/tasks/u1' })
    expect(createOp('annotate', { uuid: 'u1', text: 'x' }, meta())).toMatchObject({ path: '/tasks/u1/annotate', body: { text: 'x' } })
    expect(createOp('projectStatus', { name: 'Haus & Hof', status: 'on_hold' }, meta())).toMatchObject({
      method: 'PUT', path: '/projects/Haus%20%26%20Hof/status', body: { status: 'on_hold' }, name: 'Haus & Hof',
    })
    expect(createOp('review', {}, meta())).toMatchObject({ method: 'POST', path: '/gtd/review', body: { kind: 'weekly' } })
    expect(() => createOp('rename', {}, meta())).toThrow(/unknown outbox kind/)
  })
})

describe('send now or hold', () => {
  it('sends captures and moves at once', () => {
    const ops = enqueue(enqueue([], captureOp('Milch')), moveOp(waitingTodo(), 'next'))
    expect(states(ops)).toEqual(['queued', 'queued'])
    expect(ops.every(isSendable)).toBe(true)
  })

  it('holds done and delete for six seconds', () => {
    const [op] = hold([], doneOp(waitingTodo()), T0)
    expect(op).toMatchObject({ state: 'held', until: T0 + HOLD_MS })
    expect(HOLD_MS).toBe(6000)
  })

  it('a second hold on the same task replaces the first', () => {
    const t = waitingTodo()
    const ops = hold(hold([], doneOp(t), T0), createOp('delete', { uuid: t.uuid }, meta()), T0 + 1000)
    expect(ops.map((op) => op.kind)).toEqual(['delete'])
  })

  it('begin moves only a queued or held op to sending', () => {
    const ops = enqueue([], captureOp('Milch'))
    const sending = begin(ops, ops[0].id)
    expect(states(sending)).toEqual(['sending'])
    expect(begin(sending, ops[0].id)).toBe(sending) // a second sender finds nothing to send
  })
})

describe('Rückgängig', () => {
  it('inside the hold, cancels the done: nothing is sent', () => {
    const ops = hold([], doneOp(waitingTodo()), T0)
    const result = undo(ops, ops[0], next())
    expect(result).toEqual({ ops: [], undone: true })
  })

  it('of a sent move enqueues the exact inverse', () => {
    const t = waitingTodo()
    const move = moveOp(t, 'next')
    expect(move.body).toEqual({ tags_add: ['next'], tags_remove: ['waiting'], scheduled: '' })
    const { ops, settled } = sendOk(enqueue([], move), move.id, { ...t })
    expect(ops).toEqual([])
    const result = undo(ops, settled, next())
    expect(result.undone).toBe(true)
    expect(result.ops).toHaveLength(1)
    expect(result.ops[0]).toMatchObject({
      kind: 'put', state: 'queued', method: 'PUT', path: '/tasks/u-vermieter',
      body: { tags_remove: ['next'], tags_add: ['waiting'], scheduled: '2026-10-31' },
    })
  })

  it('of a sent capture enqueues DELETE for the uuid the server gave it', () => {
    const op = captureOp('Milch')
    const { ops, settled } = sendOk(enqueue([], op), op.id, { uuid: 'u-new', description: 'Milch' })
    expect(settled.uuid).toBe('u-new')
    const result = undo(ops, settled, next())
    expect(result.ops).toEqual([expect.objectContaining({ kind: 'delete', method: 'DELETE', path: '/tasks/u-new', state: 'queued' })])
  })

  it('of an unsent capture drops it: nothing reaches the server', () => {
    const op = captureOp('Milch')
    const failed = fail(begin(enqueue([], op), op.id), op.id, { reason: 'network' })
    expect(undo(failed, op, next())).toEqual({ ops: [], undone: true })
  })

  it('of a capture in flight takes it back once the server has named it', () => {
    const op = captureOp('Milch')
    const flying = begin(enqueue([], op), op.id)
    const marked = undo(flying, op, next())
    expect(marked.undone).toBe(true)
    expect(marked.ops[0]).toMatchObject({ state: 'sending', undone: true })
    const { ops, followUp } = commit(marked.ops, op.id, { uuid: 'u-new' }, next())
    expect(followUp).toMatchObject({ kind: 'delete', path: '/tasks/u-new' })
    expect(states(ops)).toEqual(['queued'])
  })

  it('cannot take back a done or delete the server has, or is applying', () => {
    const op = doneOp(waitingTodo())
    const flying = begin(hold([], op, T0), op.id)
    expect(undo(flying, op, next())).toEqual({ ops: flying, undone: false })
    const { ops, settled } = commit(flying, op.id, null, next())
    expect(undo(ops, settled, next())).toEqual({ ops: [], undone: false })
  })

  it('of a field edit without an inverse, once sent, is not possible', () => {
    const op = createOp('put', { uuid: 'u1', body: { priority: 'H' } }, meta())
    const { ops, settled } = sendOk(enqueue([], op), op.id, {})
    expect(undo(ops, settled, next()).undone).toBe(false)
  })
})

describe('failures', () => {
  it('classifies a failed request', () => {
    expect(failureOf(undefined)).toBe('network')
    expect(failureOf(0)).toBe('network')
    expect(failureOf(401)).toBe('auth')
    for (const status of [500, 502, 503, 408, 429]) expect(failureOf(status)).toBe('server')
    for (const status of [400, 403, 404, 409, 422]) expect(failureOf(status)).toBe('refused')
  })

  it('a 4xx fails with the server’s message and is never retried automatically', () => {
    const op = moveOp(waitingTodo(), 'someday')
    const ops = fail(begin(enqueue([], op), op.id), op.id, { reason: 'refused', message: 'Invalid tag: a/b' })
    expect(ops[0]).toMatchObject({ state: 'failed', failure: { reason: 'refused', message: 'Invalid tag: a/b' }, verify: false })
    expect(retry(ops, { auto: true })).toEqual(ops)
    expect(states(retry(ops))).toEqual(['queued']) // "Erneut senden" may
  })

  it('a network failure is retried automatically, and a non-idempotent op is verified first', () => {
    const move = moveOp(waitingTodo(), 'next')
    const capture = captureOp('Milch')
    let ops = enqueue(enqueue([], move), capture)
    ops = begin(begin(ops, move.id), capture.id)
    ops = fail(fail(ops, move.id, { reason: 'network' }), capture.id, { reason: 'server', message: 'boom' })
    expect(ops.map((op) => [op.state, op.verify])).toEqual([['failed', false], ['failed', true]])
    expect(states(retry(ops, { auto: true }))).toEqual(['queued', 'queued'])
  })

  it('"Erneut senden" on one op leaves the others', () => {
    const a = captureOp('A')
    const b = captureOp('B')
    let ops = begin(begin(enqueue(enqueue([], a), b), a.id), b.id)
    ops = fail(fail(ops, a.id, { reason: 'network' }), b.id, { reason: 'network' })
    expect(states(retry(ops, { id: b.id }))).toEqual(['failed', 'queued'])
  })

  it('a failed op whose undo came while it was in flight is dropped', () => {
    const op = captureOp('Milch')
    const marked = undo(begin(enqueue([], op), op.id), op, next()).ops
    expect(fail(marked, op.id, { reason: 'network' })).toEqual([])
  })
})

describe('401: the session ends, the writes wait for the next login', () => {
  it('pauses every op, keeps holds, and verifies other ops that were in flight', () => {
    const refused = moveOp(waitingTodo(), 'next')
    const flying = captureOp('Milch')
    const held = doneOp(inboxTodo())
    let ops = enqueue(enqueue([], refused), flying)
    ops = hold(begin(begin(ops, refused.id), flying.id), held, T0)
    ops = pauseAuth(ops, refused.id)
    expect(ops.map((op) => [op.kind, op.state, op.verify])).toEqual([
      ['put', 'auth', false],
      ['capture', 'auth', true], // may have arrived before the session ended
      ['done', 'auth', false],
    ])
    expect(ops[2].until).toBe(T0 + HOLD_MS)
  })

  it('resumes after login: an expired hold is sent, a hold still in its window waits', () => {
    const a = doneOp(inboxTodo())
    const b = doneOp(waitingTodo())
    const ops = pauseAuth(hold(hold([], a, T0), b, T0 + 5000))
    expect(states(resume(ops, T0 + HOLD_MS + 1))).toEqual(['queued', 'held'])
  })

  // The interceptor (shared/sessionEnd.js) reloads /login on a token-carrying 401; whether
  // or not the catch handler still runs, the queue was stored before the request left.
  it('survives the reload either way and resumes when the store boots after login', () => {
    const move = moveOp(waitingTodo(), 'next')
    const capture = captureOp('Milch')
    const sending = begin(begin(enqueue(enqueue([], move), capture), move.id), capture.id)

    // the catch ran: paused, stored, reloaded, logged in
    const paused = restore(serialize(pauseAuth(sending, move.id)))
    expect(states(recover(paused, T0 + 60_000, { authed: false }))).toEqual(['auth', 'auth'])
    const resumed = recover(paused, T0 + 60_000, { authed: true })
    expect(resumed.map((op) => [op.state, op.verify])).toEqual([['queued', false], ['queued', true]])

    // the reload won: still "sending" in storage
    const stored = recover(restore(serialize(sending)), T0 + 60_000, { authed: true })
    expect(stored.map((op) => [op.state, op.verify])).toEqual([['queued', false], ['queued', true]])
  })
})

describe('restore after a reload', () => {
  it('round-trips through storage', () => {
    const ops = hold(enqueue([], captureOp('Milch')), doneOp(inboxTodo()), T0)
    expect(restore(serialize(ops))).toEqual(ops)
  })

  it('reads garbage, another version or malformed ops as nothing', () => {
    expect(restore(null)).toEqual([])
    expect(restore('{nope')).toEqual([])
    expect(restore(JSON.stringify({ v: 2, ops: [] }))).toEqual([])
    expect(restore(JSON.stringify([{ id: 'x' }]))).toEqual([])
    const good = enqueue([], captureOp('Milch'))[0]
    const stored = JSON.stringify({ v: 1, ops: [good, { ...good, id: 'bad', kind: 'rename' }, { ...good, id: 'bad2', state: 'lost' }, null] })
    expect(restore(stored)).toEqual([good])
  })

  it('sends holds whose window passed (the user did not undo) and keeps those still open', () => {
    const late = doneOp(inboxTodo())
    const fresh = doneOp(waitingTodo())
    const ops = hold(hold([], late, T0), fresh, T0 + 4000)
    expect(states(recover(ops, T0 + HOLD_MS + 1, { authed: true }))).toEqual(['queued', 'held'])
  })

  it('verifies ops left in flight, unless resending them is harmless', () => {
    const done = doneOp(inboxTodo())
    const move = moveOp(waitingTodo(), 'next')
    let ops = hold(enqueue([], move), done, T0)
    ops = begin(begin(ops, move.id), done.id)
    const out = recover(ops, T0 + 1000, { authed: true })
    expect(out.map((op) => [op.kind, op.state, op.verify])).toEqual([['put', 'queued', false], ['done', 'queued', true]])
    expect(verifyRequest(out[0])).toBeNull()
    expect(verifyRequest(out[1])).toEqual({ path: '/tasks/u-idee' })
  })

  it('leaves failed ops failed', () => {
    const op = captureOp('Milch')
    const ops = fail(begin(enqueue([], op), op.id), op.id, { reason: 'refused' })
    expect(recover(ops, T0, { authed: true })).toEqual(ops)
  })
})

describe('verification before a resend', () => {
  it('a capture retry runs the duplicate check first and adopts a capture that did arrive', () => {
    const op = captureOp('Milch kaufen', T0)
    const failed = fail(begin(enqueue([], op), op.id), op.id, { reason: 'network' })[0]
    expect(verifyRequest(failed)).toEqual({ path: '/tasks', params: { status: 'all', q: 'Milch kaufen' } })
    const arrived = { uuid: 'u-new', description: 'Milch kaufen', status: 'pending', entry: '20261101T084100Z' }
    expect(alreadyApplied(failed, [arrived])).toEqual({ uuid: 'u-new', description: 'Milch kaufen' })
  })

  it('a capture with the same text from before, deleted or merely similar is not the one', () => {
    const op = { ...captureOp('Milch kaufen', T0), verify: true }
    expect(alreadyApplied(op, [
      { uuid: 'old', description: 'Milch kaufen', status: 'pending', entry: '20261025T090000Z' },
      { uuid: 'gone', description: 'Milch kaufen', status: 'deleted', entry: '20261101T084100Z' },
      { uuid: 'more', description: 'Milch kaufen und Brot', status: 'pending', entry: '20261101T084100Z' },
    ])).toBeNull()
  })

  it('done and delete: settled when the task is done, deleted or gone', () => {
    const done = { ...doneOp(inboxTodo()), verify: true }
    expect(alreadyApplied(done, { status: 'completed' })).toEqual({})
    expect(alreadyApplied(done, null)).toEqual({})
    expect(alreadyApplied(done, { status: 'pending' })).toBeNull()
    const del = { ...createOp('delete', { uuid: 'u1' }, meta()), verify: true }
    expect(alreadyApplied(del, { status: 'deleted' })).toEqual({})
    expect(alreadyApplied(del, { status: 'completed' })).toBeNull()
  })

  it('a note: settled when the same text was added since', () => {
    const op = { ...createOp('annotate', { uuid: 'u1', text: 'angerufen' }, meta(T0)), verify: true }
    const task = { uuid: 'u1', status: 'pending', annotations: [{ entry: '20261101T084130Z', description: 'angerufen' }] }
    expect(alreadyApplied(op, task)).toBe(task)
    expect(alreadyApplied(op, { ...task, annotations: [{ entry: '20261020T084130Z', description: 'angerufen' }] })).toBeNull()
  })

  it('a project: settled when the name exists', () => {
    const op = { ...createOp('createProject', { name: 'Garten' }, meta()), verify: true }
    expect(verifyRequest(op)).toEqual({ path: '/gtd/projects' })
    expect(alreadyApplied(op, ['Haus', 'Garten'])).toEqual({})
    expect(alreadyApplied(op, ['Haus'])).toBeNull()
  })
})

describe('applyOutbox: the snapshot as the user should see it', () => {
  const snapshot = () => ({ tasks: [waitingTodo(), inboxTodo()], done: [], projects: [{ name: 'Garten', status: 'active' }] })

  it('never resurrects a held, failed or paused done after a refresh', () => {
    const op = doneOp(inboxTodo())
    for (const ops of [
      hold([], op, T0),
      fail(begin(hold([], op, T0), op.id), op.id, { reason: 'network' }),
      pauseAuth(hold([], op, T0)),
    ]) {
      const view = applyOutbox(snapshot(), ops) // a refresh brings the task back as pending
      expect(view.tasks.map((t) => t.uuid)).toEqual(['u-vermieter'])
      expect(view.done).toEqual([expect.objectContaining({ uuid: 'u-idee', status: 'completed', end: null, plannedAtHold: true })])
    }
  })

  it('hides a held delete', () => {
    const ops = hold([], createOp('delete', { uuid: 'u-idee' }, meta()), T0)
    expect(applyOutbox(snapshot(), ops)).toMatchObject({ tasks: [{ uuid: 'u-vermieter' }], done: [] })
  })

  it('patches a move until the server confirms it, and marks the row', () => {
    const op = moveOp(waitingTodo(), 'next')
    const view = applyOutbox(snapshot(), begin(enqueue([], op), op.id))
    expect(view.tasks[0]).toMatchObject({ tags: ['@anrufe', 'next'], scheduled: null, sync: 'sending', opId: op.id })
  })

  it('patches field edits with the day the PUT sent (F3)', () => {
    const op = createOp('put', { uuid: 'u-idee', body: { description: 'Idee, genauer', priority: 'H', due: '2026-11-03' } }, meta())
    expect(applyOutbox(snapshot(), enqueue([], op)).tasks[1]).toMatchObject({
      description: 'Idee, genauer', priority: 'H', due: '2026-11-03',
    })
    const cleared = createOp('put', { uuid: 'u-idee', body: { priority: '', description: '' } }, meta())
    expect(applyOutbox(snapshot(), enqueue([], cleared)).tasks[1]).toMatchObject({ description: 'Idee', priority: null })
  })

  it('patches the dependencies a PUT sends as the complete list', () => {
    const op = createOp('put', { uuid: 'u-idee', body: { depends: ['u-vermieter'] } }, meta())
    expect(applyOutbox(snapshot(), enqueue([], op)).tasks[1].depends).toEqual(['u-vermieter'])
    const cleared = createOp('put', { uuid: 'u-idee', body: { depends: [] } }, meta())
    expect(applyOutbox({ ...snapshot(), tasks: [{ ...inboxTodo(), depends: ['x'] }] }, enqueue([], cleared)).tasks[0].depends).toEqual([])
  })

  it('adds an unsent capture to the Inbox with its note', () => {
    const op = createOp('capture', { description: 'Milch', note: 'fettarm' }, meta(T0))
    const failed = fail(begin(enqueue([], op), op.id), op.id, { reason: 'network' })
    const row = applyOutbox(snapshot(), failed).tasks[2]
    expect(row).toMatchObject({
      uuid: op.uuid, description: 'Milch', tags: [], project: null, entry: '20261101T084100Z', sync: 'failed',
      annotations: [{ entry: '20261101T084100Z', description: 'fettarm' }],
    })
    expect(captureRow(op)).not.toHaveProperty('sync')
  })

  it('shows start, stop and a note before the reply', () => {
    let view = applyOutbox(snapshot(), enqueue([], createOp('start', { uuid: 'u-idee' }, meta(T0))))
    expect(view.tasks[1].start).toBe('20261101T084100Z')
    view = applyOutbox({ ...snapshot(), tasks: [{ ...inboxTodo(), start: 'x' }] }, enqueue([], createOp('stop', { uuid: 'u-idee' }, meta())))
    expect(view.tasks[0].start).toBeNull()
    view = applyOutbox(snapshot(), enqueue([], createOp('annotate', { uuid: 'u-idee', text: 'angerufen' }, meta(T0))))
    expect(view.tasks[1].annotations).toEqual([{ entry: '20261101T084100Z', description: 'angerufen' }])
  })

  it('shows a new project and a status change', () => {
    const ops = enqueue(enqueue([], createOp('createProject', { name: 'Haus' }, meta())),
      createOp('projectStatus', { name: 'Garten', status: 'on_hold' }, meta()))
    expect(applyOutbox(snapshot(), ops).projects.map((p) => [p.name, p.status])).toEqual([['Garten', 'on_hold'], ['Haus', 'active']])
  })

  it('ignores ops for tasks the snapshot does not hold and changes nothing in place', () => {
    const s = snapshot()
    const frozen = JSON.stringify(s)
    const ops = hold(enqueue([], createOp('put', { uuid: 'u-nowhere', body: { priority: 'H' } }, meta())), doneOp({ uuid: 'u-nowhere' }), T0)
    expect(applyOutbox(s, ops)).toEqual(s)
    applyOutbox(s, enqueue([], moveOp(waitingTodo(), 'next')))
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('one queue per user', () => {
  it('sends only the logged-in user’s ops and keeps everyone else’s as they are', () => {
    const anna = createOp('done', { uuid: 'u-a' }, { id: 'a1', at: T0, user: 'anna' })
    const mine = createOp('done', { uuid: 'u-b' }, { id: 'b1', at: T0, user: USER })
    const all = hold(hold([], anna, T0), mine, T0)
    expect(opsOf(all, USER).map((op) => op.id)).toEqual(['b1'])
    const after = withOpsOf(all, USER, [])
    expect(after).toEqual([all[0]])
    expect(opsOf(after, 'anna')[0]).toMatchObject({ id: 'a1', state: 'held' })
  })
})

describe('withSettled: a refresh that started before a reply', () => {
  const fresh = () => ({ tasks: [waitingTodo(), inboxTodo()], done: [], projects: [], summary: { today: '2026-11-01' } })

  it('lays the reply over a refresh that may have been read before the write landed', () => {
    const moved = { ...waitingTodo(), tags: ['@anrufe', 'next'], scheduled: null }
    const settled = new Map([
      ['u-vermieter', { at: T0 + 100, task: moved }],
      ['u-idee', { at: T0 + 200, task: { ...inboxTodo(), status: 'completed', end: null } }],
      ['u-new', { at: T0 + 300, task: { uuid: 'u-new', status: 'pending', tags: [] } }],
    ])
    const out = withSettled(fresh(), settled, T0)
    expect(out.tasks.map((t) => [t.uuid, t.tags])).toEqual([['u-vermieter', ['@anrufe', 'next']], ['u-new', []]])
    expect(out.done.map((t) => t.uuid)).toEqual(['u-idee'])
    expect(out.summary).toEqual({ today: '2026-11-01' })
  })

  it('removes a deleted or vanished task', () => {
    const settled = new Map([['u-idee', { at: T0, task: null }], ['u-vermieter', { at: T0, task: { ...waitingTodo(), status: 'deleted' } }]])
    expect(withSettled(fresh(), settled, T0).tasks).toEqual([])
  })

  it('trusts a refresh that started after the reply', () => {
    const settled = new Map([['u-idee', { at: T0 - 1, task: null }]])
    const f = fresh()
    expect(withSettled(f, settled, T0)).toBe(f)
  })
})

describe('long captures', () => {
  it('a capture over 200 characters is checked with a query the server takes and still adopts its twin', () => {
    const text = 'a'.repeat(299) + '😀'
    const op = captureOp(text, T0)
    const failed = fail(begin(enqueue([], op), op.id), op.id, { reason: 'server' })[0]
    const { params } = verifyRequest(failed)
    expect(Array.from(params.q)).toHaveLength(200)
    expect(text.startsWith(params.q)).toBe(true)
    const twin = { uuid: 'u-long', description: text, status: 'pending', entry: '20261101T084100Z' }
    const prefixOnly = { ...twin, uuid: 'u-other', description: params.q }
    expect(alreadyApplied(failed, [prefixOnly, twin])).toEqual({ uuid: 'u-long', description: text })
  })
})

describe('two tabs', () => {
  it('a booting tab leaves an op another tab has in flight alone, and takes it over once its window has passed', () => {
    const op = captureOp('Milch', T0)
    const sending = begin(enqueue([], op), op.id, { now: T0, tab: 'tab-a' })
    expect(states(recover(sending, T0 + 1000, { authed: true, tab: 'tab-b' }))).toEqual(['sending'])
    const late = recover(sending, T0 + IN_FLIGHT_MS + 1, { authed: true, tab: 'tab-b' })
    expect(late.map((o) => [o.state, o.verify])).toEqual([['queued', true]])
  })

  it('an op sent with keepalive as its page went away is taken over, verified, after KEEPALIVE_MS', () => {
    const op = captureOp('Milch', T0)
    const sending = begin(enqueue([], op), op.id, { now: T0, tab: 'tab-a', keepalive: true })
    expect(inFlightUntil(sending[0])).toBe(T0 + KEEPALIVE_MS)
    expect(states(recover(sending, T0 + KEEPALIVE_MS - 1, { authed: true, tab: 'tab-b' }))).toEqual(['sending'])
    const late = recover(sending, T0 + KEEPALIVE_MS, { authed: true, tab: 'tab-b' })
    expect(late.map((o) => [o.state, o.verify])).toEqual([['queued', true]])
    // sent again the normal way, it gets the normal window
    const again = begin(late, op.id, { now: T0 + KEEPALIVE_MS, tab: 'tab-b' })
    expect(inFlightUntil(again[0])).toBe(T0 + KEEPALIVE_MS + IN_FLIGHT_MS)
  })

  it('a tab never takes back its own op in flight, however long the request takes', () => {
    const op = captureOp('Milch', T0)
    const sending = begin(enqueue([], op), op.id, { now: T0, tab: 'tab-a' })
    expect(states(recover(sending, T0 + 10 * IN_FLIGHT_MS, { authed: true, tab: 'tab-a' }))).toEqual(['sending'])
  })
})
