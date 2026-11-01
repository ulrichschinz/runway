// The list rules of proposal 06 against the server's list rules. Run from the design folder:
//   node --test 06-kombination/rules.test.mjs
// Cases 1-7 come from 03's rules.test.mjs (API-verified moves); the rest pin the grafts:
// never guess metadata (05), Jetzt · Bald · Später (04) and the stable day progress (01).
// In the real web app these move to frontend/tests/listMoves.test.js and dayProgress.test.js,
// and the same JSON vectors run against gtd/ListMoves.kt on Android.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isInbox, isNext, listOf, clarifyPayload, listPayload, contextPayload, inversePayload, applyPayload, projectNameError,
  NeedsAnswer, ringOf, dayProgress, plannedToday, isWaiting as isWaitingT, listOf as listOfT,
} from './rules.js'
import { contextsOf as contextsOf2 } from '../shared/data/tasks.js'
import { createStore } from './store.js'

const todo = (extra = {}) => ({ uuid: 'u-1', description: 'x', project: null, tags: [], scheduled: null, due: null, start: null, priority: null, ...extra })
const day = (tw) => tw ? `${tw.slice(0, 4)}-${tw.slice(4, 6)}-${tw.slice(6, 8)}` : null
const plusDays = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const CTX = { day, today: '2026-10-31', plusDays }

test('clarify to Nächste with a context adds next and the context, nothing else', () => {
  const t = todo()
  const body = clarifyPayload('next:@anrufe')
  assert.deepEqual(body, { tags_add: ['next', '@anrufe'] })
  applyPayload(t, body)
  assert.equal(isNext(t), true)
  assert.equal(isInbox(t), false)
})

test('a context alone is not Nächste (the server needs +next)', () => {
  const t = todo({ tags: ['@computer'] })
  assert.equal(isNext(t), false)
  assert.equal(listOf(t), 'none')
})

test('setting or removing a context never touches next', () => {
  const t = todo({ tags: ['next', '@computer'] })
  applyPayload(t, contextPayload(t, '@anrufe'))
  applyPayload(t, contextPayload(t, '@computer'))
  applyPayload(t, contextPayload(t, '@anrufe'))
  assert.deepEqual(t.tags, ['next'])
})

test('removing one part of a legacy comma tag repairs the tag', () => {
  const t = todo({ tags: ['next', '@unterwegs,@buero'] })
  const body = contextPayload(t, '@buero')
  assert.deepEqual(body, { tags_remove: ['@unterwegs,@buero'], tags_add: ['@unterwegs'] })
})

test('a list move adds one status tag and removes the other two, keeping contexts', () => {
  const t = todo({ tags: ['waiting', '@anrufe', 'ar'] })
  assert.deepEqual(listPayload(t, 'next'), { tags_add: ['next'], tags_remove: ['waiting'] })
})

test('Rückgängig after filing sends exactly the inverse, follow-up day included', () => {
  const t = todo()
  const before = { tags: [...t.tags], project: t.project, scheduledDay: null }
  const body = clarifyPayload('waiting', { followUp: '2026-11-06' })
  applyPayload(t, body)
  assert.equal(t.scheduled, '20261106T070000Z')
  applyPayload(t, inversePayload(before, body))
  assert.equal(isInbox(t), true)
  assert.equal(t.scheduled, null)
})

test('project names follow the API rules', () => {
  assert.equal(projectNameError('Steuer 2026'), '')
  assert.equal(projectNameError('a/b'), 'proj.err.chars')
  assert.equal(projectNameError('Garten', ['Garten']), 'proj.err.exists')
})

test('never guess: Nächste without a context is refused, for clarify and for a list move', () => {
  assert.throws(() => clarifyPayload('next'), NeedsAnswer)
  assert.throws(() => clarifyPayload('project:Garten'), NeedsAnswer)
  assert.deepEqual(clarifyPayload('project:Garten', { ctx: '@zuhause' }), { project: 'Garten', tags_add: ['next', '@zuhause'] })
  assert.throws(() => listPayload(todo({ tags: ['someday'] }), 'next'), NeedsAnswer)
})

test('Jetzt · Bald · Später come from fields, not from the urgency score', () => {
  assert.equal(ringOf(todo({ tags: ['next', '@a'], due: '20261030T170000Z' }), CTX), 'jetzt') // overdue
  assert.equal(ringOf(todo({ tags: ['next', '@a'], priority: 'H' }), CTX), 'jetzt')
  assert.equal(ringOf(todo({ tags: ['next', '@a'], start: '20261031T080000Z' }), CTX), 'jetzt')
  assert.equal(ringOf(todo({ tags: ['next', '@a'], scheduled: '20261031T070000Z' }), CTX), 'jetzt') // planned for today
  assert.equal(ringOf(todo({ tags: ['next', '@a'], due: '20261106T170000Z' }), CTX), 'bald')
  assert.equal(ringOf(todo({ tags: ['next', '@a'], priority: 'M' }), CTX), 'bald')
  assert.equal(ringOf(todo({ tags: ['next', '@a'], urgency: 99 }), CTX), 'spaeter')
})

test('day progress: the denominator moves only with the plan', () => {
  const planned = todo({ tags: ['next', '@a'], scheduled: '20261031T070000Z' })
  const other = todo({ tags: ['next', '@a'] })
  const doneA = todo({ tags: ['@a'], scheduled: '20261031T070000Z', status: 'completed' })
  let p = dayProgress([planned, other], [doneA], CTX)
  assert.deepEqual([p.done, p.total, p.extra], [1, 2, 0])
  p = dayProgress([planned], [doneA, other], CTX) // an unplanned todo was done
  assert.deepEqual([p.done, p.total, p.extra], [1, 2, 1])
  p = dayProgress([], [doneA, planned, other], CTX)
  assert.deepEqual([p.done, p.total, p.extra, p.level], [2, 2, 1, 1])
})

test('the store: demo reads 3 von 7, completing a planned todo gives 4 von 7', () => {
  const s = createStore()
  assert.deepEqual([s.progress().done, s.progress().total], [3, 7])
  s.complete(s.tasks.find((t) => t.description === 'Steuerberatung zurückrufen').id)
  assert.deepEqual([s.progress().done, s.progress().total, s.progress().extra], [4, 7, 0])
  s.complete(s.tasks.find((t) => t.description === 'Kellerregal ausmisten').id)
  assert.deepEqual([s.progress().done, s.progress().total, s.progress().extra], [4, 7, 1])
})

test('the store sends tags_add / tags_remove, never a full tag set, and refuses a guess', () => {
  const s = createStore()
  const item = s.lists().inbox[0]
  assert.throws(() => s.clarify(item.id, 'next'), NeedsAnswer)
  assert.equal(s.calls.length, 0, 'nothing was sent for the refused move')
  s.clarify(item.id, 'next:@computer')
  assert.ok(s.lists().next.find((t) => t.id === item.id))
  s.setList(item.id, 'waiting')
  for (const c of s.calls.filter((x) => x.method === 'PUT')) assert.equal('tags' in (c.body || {}), false)
})

test('moving from Warten auf to Nächste clears the follow-up day, and Rückgängig restores it', () => {
  const t = todo({ tags: ['waiting', '@anrufe'], scheduled: '20261031T070000Z' })
  const before = { tags: [...t.tags], project: t.project, scheduledDay: '2026-10-31' }
  assert.equal(plannedToday(t, CTX), false, 'a follow-up day is not a plan')
  const body = listPayload(t, 'next')
  assert.deepEqual(body, { tags_add: ['next'], tags_remove: ['waiting'], scheduled: '' })
  applyPayload(t, body)
  assert.equal(t.scheduled, null)
  assert.equal(plannedToday(t, CTX), false, 'the old follow-up must not become "für heute"')
  assert.equal(ringOf(t, CTX), 'spaeter')
  const inv = inversePayload(before, body)
  assert.deepEqual(inv, { tags_remove: ['next'], tags_add: ['waiting'], scheduled: '2026-10-31' })
  applyPayload(t, inv)
  assert.deepEqual([listOf(t), t.scheduled], ['waiting', '20261031T070000Z'])
  // a plan set in Nächste stays when the todo moves to Irgendwann and back (only a follow-up is cleared)
  const p = todo({ tags: ['next', '@a'], scheduled: '20261031T070000Z' })
  assert.equal('scheduled' in listPayload(p, 'someday'), false)
})

test('the store: Warten auf -> Nächste does not change the Tageslinse', () => {
  const s = createStore()
  const w = s.tasks.find((t) => t.description === 'Rückmeldung Vermieter zur Kaution') // follow-up 30.10.
  assert.ok(isWaitingT(w) && w.scheduled)
  assert.throws(() => s.setList(w.id, 'next'), NeedsAnswer, 'no context yet: ask, never guess')
  s.setContext(w.id, '@anrufe')
  assert.equal(contextsOf2(w).length, 1)
  const before = [s.progress().done, s.progress().total]
  const inv = s.setList(w.id, 'next')
  assert.deepEqual([s.progress().done, s.progress().total], before)
  assert.equal(s.calls.at(-1).body.scheduled, '')
  s.undoMove(w.id, inv)
  assert.equal(listOfT(w), 'waiting')
  assert.ok(w.scheduled)
})
