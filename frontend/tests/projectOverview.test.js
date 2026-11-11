import { describe, expect, it } from 'vitest'

import { overviewCounts, overviewSections, projectSections, projectState, statusChoices } from '../src/shared/projectOverview.js'
import { projectStalled, withSnapshot } from '../src/shared/projectStalled.js'

// Overview rows as `GET /gtd/projects/overview` returns them (brief 0060).
const row = (name, fields = {}) => ({
  name, status: 'active', explicit: false, has_plan: false, pending: 0, next: 0, waiting: 0, hidden: 0, stalled: false, ...fields,
})
const todo = (uuid, project, tags = []) => ({ uuid, description: uuid, status: 'pending', project, tags })

describe('projectStalled', () => {
  it('is stalled when an existing active project has no next action and nothing waiting', () => {
    expect(projectStalled(row('Podcast', { pending: 1 }), [todo('a', 'Podcast', ['someday'])])).toBe(true)
  })

  it('ends with a next action or a waiting todo in the snapshot, whatever the server said', () => {
    const p = row('Podcast', { pending: 1, stalled: true })
    expect(projectStalled(p, [todo('a', 'Podcast', ['next', '@home'])])).toBe(false)
    expect(projectStalled(p, [todo('b', 'Podcast', ['waiting'])])).toBe(false)
    // a legacy comma tag counts by its parts
    expect(projectStalled(p, [todo('c', 'Podcast', ['next,@home'])])).toBe(false)
  })

  it('begins when the last next action leaves the snapshot, before the server says so', () => {
    expect(projectStalled(row('Garten', { pending: 1, next: 1, stalled: false }), [todo('a', 'Garten')])).toBe(true)
  })

  it('keeps a project with todos in the tickler moving (the snapshot does not hold them)', () => {
    expect(projectStalled(row('Steuer', { hidden: 1 }), [])).toBe(false)
  })

  it('is never stalled resting, done, or when only the status table knows the name', () => {
    expect(projectStalled(row('A', { status: 'on_hold', pending: 1 }), [])).toBe(false)
    expect(projectStalled(row('B', { status: 'done', explicit: true }), [])).toBe(false)
    expect(projectStalled(row('Tippfehler'), [])).toBe(false)
  })

  it('takes a project created a moment ago (no counts yet) as stalled', () => {
    expect(projectStalled({ name: 'Neu', status: 'active', explicit: true }, [])).toBe(true)
  })

  it('reads names exactly: a subproject’s next action does not move its parent', () => {
    expect(projectStalled(row('home', { explicit: true }), [todo('a', 'home.garden', ['next'])])).toBe(true)
  })
})

describe('withSnapshot', () => {
  it('adds the snapshot’s stalled reading and the open todos by list', () => {
    const [p] = withSnapshot([row('Haus', { pending: 3 })], [
      todo('a', 'Haus', ['next', '@home']), todo('b', 'Haus', ['next', 'waiting']), todo('c', 'Haus', ['someday']),
      todo('d', 'Haus', ['@home']), todo('e', 'Andere', ['next']),
    ])
    expect(p.stalled).toBe(false)
    // the dual-tagged one is in Warten auf only (F4)
    expect(p.counts).toEqual({ next: 1, waiting: 1, someday: 1, none: 1 })
  })
})

describe('overviewSections', () => {
  it('puts stalled projects first among the active, then orders by name in German', () => {
    const s = overviewSections([
      row('Zaun'), row('Äpfel'), row('Podcast', { stalled: true }), row('Büro', { status: 'on_hold' }),
      row('Abend', { status: 'done' }), row('Auto', { stalled: true }), row('Ost', { status: 'on_hold' }),
    ])
    expect(s.active.map((p) => p.name)).toEqual(['Auto', 'Podcast', 'Äpfel', 'Zaun'])
    expect(s.on_hold.map((p) => p.name)).toEqual(['Büro', 'Ost'])
    expect(s.done.map((p) => p.name)).toEqual(['Abend'])
  })

  it('reads a status the API does not know as active', () => {
    expect(overviewSections([row('X', { status: 'someday' })]).active.map((p) => p.name)).toEqual(['X'])
  })
})

describe('overviewCounts', () => {
  it('counts the active projects and the stalled among them', () => {
    expect(overviewCounts([
      row('A', { stalled: true }), row('B'), row('C', { status: 'on_hold' }), row('D', { status: 'done' }),
    ])).toEqual({ active: 2, stalled: 1 })
  })
})

describe('projectState and statusChoices', () => {
  it('names the state: stalled before the status', () => {
    expect(projectState(row('A', { stalled: true }))).toBe('stalled')
    expect(projectState(row('A'))).toBe('active')
    expect(projectState(row('A', { status: 'on_hold' }))).toBe('on_hold')
    expect(projectState(row('A', { status: 'done' }))).toBe('done')
  })

  it('offers what a status can become (06’s pills)', () => {
    expect(statusChoices('active')).toEqual(['on_hold', 'done'])
    expect(statusChoices('on_hold')).toEqual(['active', 'done'])
    expect(statusChoices('done')).toEqual(['active'])
  })
})

describe('projectSections', () => {
  it('takes the project’s todos from each list in the list’s order, exact names only', () => {
    const lists = {
      next: [todo('n2', 'Haus'), todo('x', 'Haus.Keller'), todo('n1', 'Haus')],
      waiting: [todo('w', 'Haus')],
      someday: [],
      unlisted: [todo('o', 'Haus'), todo('y', null)],
    }
    const s = projectSections(lists, 'Haus')
    expect(s.next.map((t) => t.uuid)).toEqual(['n2', 'n1'])
    expect(s.waiting.map((t) => t.uuid)).toEqual(['w'])
    expect(s.someday).toEqual([])
    expect(s.none.map((t) => t.uuid)).toEqual(['o'])
  })
})
