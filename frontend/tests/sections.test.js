import { describe, expect, it } from 'vitest'

import { NO_CONTEXT } from '../src/shared/contexts.js'
import { followUpOf, followUps, inContext, nextSections, ringOf, waitingSections } from '../src/shared/sections.js'

const TODAY = '2026-10-31'
const next = (uuid, extra = {}) => ({ uuid, tags: ['next', '@a'], urgency: 1, ...extra })

const ids = (s) => Object.fromEntries(
  ['faellig', 'faelligAndere', 'jetzt', 'bald', 'spaeter'].map((k) => [k, s[k].map((t) => t.uuid)]),
)

describe('the context filter', () => {
  it('is lenient for a context, strict for "ohne Kontext", open without a filter', () => {
    const own = { tags: ['next', '@a'] }
    const loose = { tags: ['next'] }
    const other = { tags: ['next', '@b'] }
    const legacy = { tags: ['next,@b,@a'] }
    expect([own, loose, other, legacy].map((t) => inContext(t, '@a'))).toEqual([true, true, false, true])
    expect([own, loose, other, legacy].map((t) => inContext(t, NO_CONTEXT))).toEqual([false, true, false, false])
    expect([own, loose, other, legacy].map((t) => inContext(t, null))).toEqual([true, true, true, true])
  })
})

describe('Nächste sections', () => {
  it('shows a task once: Fällig wins over its ring', () => {
    const tasks = [next('due-and-h', { due: '20261030T170000Z', priority: 'H' }), next('h', { priority: 'H' })]
    const s = ids(nextSections({ tasks, today: TODAY }))
    expect(s.faellig).toEqual(['due-and-h'])
    expect(s.jetzt).toEqual(['h'])
    const all = Object.values(s).flat()
    expect(new Set(all).size).toBe(all.length)
  })

  it('orders a ring running first, then priority H, then urgency — urgency never moves a task between rings', () => {
    const tasks = [
      next('hot', { urgency: 50 }),
      next('h', { priority: 'H', urgency: 1 }),
      next('run', { start: '20261031T083000Z', urgency: 0 }),
      next('plan', { scheduled: '20261030T230000Z', urgency: 9 }),
    ]
    const s = ids(nextSections({ tasks, today: TODAY }))
    expect(s.jetzt).toEqual(['run', 'h', 'plan'])
    expect(s.spaeter).toEqual(['hot'])
  })

  it('orders Fällig by due date, oldest first, whatever the urgency', () => {
    const tasks = [
      next('today', { due: '20261031T100000Z', urgency: 20 }),
      next('old', { due: '20261020T100000Z', urgency: 1 }),
      next('yesterday', { due: '20261030T100000Z', urgency: 5 }),
    ]
    expect(ids(nextSections({ tasks, today: TODAY })).faellig).toEqual(['old', 'yesterday', 'today'])
  })

  it('a due todo in Warten auf shows under Fällig; an Inbox item with a due date does not', () => {
    const tasks = [
      { uuid: 'w', tags: ['waiting'], due: '20261031T100000Z' },
      { uuid: 'i', tags: [], due: '20261031T100000Z' },
    ]
    expect(ids(nextSections({ tasks, today: TODAY })).faellig).toEqual(['w'])
  })

  it('merges into the one Fällig heading only when the filtered context has nothing due', () => {
    const tasks = [next('a-due', { due: '20261031T100000Z' }), next('b-due', { tags: ['next', '@b'], due: '20261031T100000Z' })]
    expect(nextSections({ tasks, today: TODAY }, '@a').dueMerged).toBe(false)
    expect(nextSections({ tasks, today: TODAY }, '@c').dueMerged).toBe(true)
    expect(nextSections({ tasks, today: TODAY }, null).dueMerged).toBe(false)
    expect(nextSections({ tasks: [], today: TODAY }, '@c').dueMerged).toBe(false)
  })

  it('does not reorder the tasks it was given', () => {
    const tasks = [next('a', { urgency: 1 }), next('b', { urgency: 2 })]
    nextSections({ tasks, today: TODAY })
    expect(tasks.map((t) => t.uuid)).toEqual(['a', 'b'])
  })
})

describe('rings', () => {
  it('count the seventh day as Bald and the eighth as Später, in Berlin days', () => {
    expect(ringOf(next('x', { due: '20261107T225959Z' }), TODAY)).toBe('bald')
    expect(ringOf(next('x', { due: '20261107T230000Z' }), TODAY)).toBe('spaeter')
  })
})

describe('Warten auf sections', () => {
  const w = (uuid, extra = {}) => ({ uuid, tags: ['waiting'], ...extra })

  it('reads the follow-up from scheduled, else from the wait that hides the todo', () => {
    expect(followUpOf(w('a', { scheduled: '20261102T230000Z', wait: '20261110T230000Z' }))).toBe('2026-11-03')
    expect(followUpOf(w('b', { wait: '20261103T230000Z' }))).toBe('2026-11-04')
    expect(followUpOf(w('c'))).toBe(null)
  })

  it('splits into Nachhaken (day has come), this week (seven days) and later or without a day, keeping order', () => {
    const tasks = [
      w('yesterday', { scheduled: '20261029T230000Z' }),
      w('none'),
      w('today', { scheduled: '20261030T230000Z' }),
      w('in7', { scheduled: '20261106T230000Z' }),
      w('in8', { scheduled: '20261107T230000Z' }),
      w('tomorrow', { wait: '20261031T230000Z' }),
    ]
    const s = waitingSections(tasks, TODAY)
    expect(s.due.map((t) => t.uuid)).toEqual(['yesterday', 'today'])
    expect(s.soon.map((t) => t.uuid)).toEqual(['in7', 'tomorrow'])
    expect(s.later.map((t) => t.uuid)).toEqual(['none', 'in8'])
  })
})

describe('the margin\'s Nachhaken', () => {
  const w = (uuid, extra = {}) => ({ uuid, tags: ['waiting'], ...extra })
  it('lists due follow-ups first, then this week, never later or undated ones', () => {
    const tasks = [
      w('none'), w('in8', { scheduled: '2026-11-08' }), w('tomorrow', { scheduled: '2026-11-01' }),
      w('yesterday', { scheduled: '2026-10-30' }),
    ]
    const f = followUps(tasks, TODAY)
    expect(f.rows.map((r) => [r.task.uuid, r.due, r.day])).toEqual([
      ['yesterday', true, '2026-10-30'], ['tomorrow', false, '2026-11-01'],
    ])
    expect(f.due).toBe(1)
  })

  it('shows at most three rows and still counts every due one', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => w(id, { scheduled: '2026-10-29' }))
    const f = followUps(tasks, TODAY)
    expect(f.rows.map((r) => r.task.uuid)).toEqual(['a', 'b', 'c'])
    expect(f.due).toBe(4)
    expect(followUps(tasks, TODAY, 1).rows).toHaveLength(1)
  })

  it('takes a hiding wait as the follow-up day, as Warten auf does', () => {
    const f = followUps([w('hidden', { wait: '20261102T230000Z' })], TODAY)
    expect(f.rows).toEqual([{ task: expect.objectContaining({ uuid: 'hidden' }), due: false, day: '2026-11-03' }])
    expect(f.due).toBe(0)
  })

  it('is empty without waiting todos', () => {
    expect(followUps([], TODAY)).toEqual({ due: 0, rows: [] })
  })
})
