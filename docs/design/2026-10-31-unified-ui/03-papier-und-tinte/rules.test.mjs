// The three list moves against the server's list rules. Run from the design folder:
//   node --test 03-papier-und-tinte/rules.test.mjs
// In the real web app these cases move to frontend/tests/listMoves.test.js (pure logic, ADR 0007).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isInbox, isNext, listOf, clarifyPayload, listPayload, contextPayload, inversePayload, applyPayload, projectNameError,
} from './rules.js'
import { createStore } from './store.js'

const todo = (extra = {}) => ({ uuid: 'u-1', description: 'x', project: null, tags: [], ...extra })

test('clarify to Nächste with a context adds next and the context, nothing else', () => {
  const t = todo()
  assert.equal(listOf(t), 'inbox')
  const body = clarifyPayload('next:@anrufe')
  assert.deepEqual(body, { tags_add: ['next', '@anrufe'] })
  applyPayload(t, body)
  assert.equal(isNext(t), true)
  assert.equal(isInbox(t), false)
  assert.deepEqual(t.tags, ['next', '@anrufe'])
})

test('clarify to a project files the item as its next action', () => {
  const t = applyPayload(todo(), clarifyPayload('project:Garten'))
  assert.equal(t.project, 'Garten')
  assert.equal(listOf(t), 'next')
})

test('a context alone is not Nächste (the server needs +next)', () => {
  const t = todo({ tags: ['@computer'] })
  assert.equal(isNext(t), false)
  assert.equal(isInbox(t), false)
  assert.equal(listOf(t), 'none')
})

test('setting or removing a context never touches next', () => {
  const t = todo({ tags: ['next', '@computer'] })
  assert.deepEqual(contextPayload(t, '@anrufe'), { tags_add: ['@anrufe'] })
  applyPayload(t, contextPayload(t, '@anrufe'))
  applyPayload(t, contextPayload(t, '@computer'))
  applyPayload(t, contextPayload(t, '@anrufe'))
  assert.deepEqual(t.tags, ['next'])
  assert.equal(listOf(t), 'next') // Nächste, "überall"
})

test('removing one part of a legacy comma tag repairs the tag', () => {
  const t = todo({ tags: ['next', '@unterwegs,@buero'] })
  const body = contextPayload(t, '@buero')
  assert.deepEqual(body, { tags_remove: ['@unterwegs,@buero'], tags_add: ['@unterwegs'] })
  applyPayload(t, body)
  assert.deepEqual(t.tags, ['next', '@unterwegs'])
})

test('a list move adds one status tag and removes the other two, keeping contexts', () => {
  const t = todo({ tags: ['waiting', '@anrufe', 'ar'] })
  const body = listPayload(t, 'next')
  assert.deepEqual(body, { tags_add: ['next'], tags_remove: ['waiting'] })
  applyPayload(t, body)
  assert.deepEqual(t.tags, ['@anrufe', 'ar', 'next'])
  assert.equal(listOf(t), 'next')
  applyPayload(t, listPayload(t, 'someday'))
  assert.deepEqual(t.tags, ['@anrufe', 'ar', 'someday'])
})

test('Rückgängig after filing sends exactly the inverse', () => {
  const t = todo()
  const before = { tags: [...t.tags], project: t.project }
  const body = clarifyPayload('project:Garten')
  applyPayload(t, body)
  applyPayload(t, inversePayload(before, body))
  assert.equal(isInbox(t), true)
})

test('project names follow the API rules', () => {
  assert.equal(projectNameError('Steuer 2026'), '')
  assert.notEqual(projectNameError('a/b'), '')
  assert.notEqual(projectNameError('overview'), '')
  assert.notEqual(projectNameError('Garten', ['Garten']), '')
})

test('the store sends tags_add / tags_remove, never a full tag set', () => {
  const s = createStore()
  const item = s.lists().inbox[0]
  s.clarify(item.id, 'next:@computer')
  const nx = s.lists().next.find((t) => t.id === item.id)
  assert.ok(nx, 'clarified todo is in Nächste')
  s.setContext(item.id, '@computer')
  assert.ok(s.lists().next.find((t) => t.id === item.id), 'still in Nächste without a context')
  s.setList(item.id, 'waiting')
  assert.ok(s.lists().waiting.find((t) => t.id === item.id))
  for (const c of s.calls.filter((x) => x.method === 'PUT')) assert.equal('tags' in (c.body || {}), false)
})
