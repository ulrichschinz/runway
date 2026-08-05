import { describe, expect, it } from 'vitest'

import { byUrgencyDescending, filterTasks, matchesSearch } from '../src/shared/taskFilters.js'

const task = (overrides = {}) => ({
  description: 'a task',
  project: null,
  tags: [],
  urgency: 0,
  ...overrides,
})

describe('filterTasks — context', () => {
  it('returns everything when no context is active', () => {
    const tasks = [task({ description: 'a' }), task({ description: 'b' })]
    expect(filterTasks(tasks)).toHaveLength(2)
  })

  it('keeps only tasks carrying the active context', () => {
    const tasks = [
      task({ description: 'at home', tags: ['@home'] }),
      task({ description: 'at work', tags: ['@work'] }),
    ]
    expect(filterTasks(tasks, { context: '@home' }).map((t) => t.description)).toEqual(['at home'])
  })

  it('matches a context inside a comma-joined tag', () => {
    const tasks = [task({ description: 'both', tags: ['@home,@errands'] })]
    expect(filterTasks(tasks, { context: '@errands' })).toHaveLength(1)
  })
})

describe('filterTasks — search', () => {
  it('matches the description, case-insensitively', () => {
    const tasks = [task({ description: 'Write the Brief' }), task({ description: 'other' })]
    expect(filterTasks(tasks, { query: 'brief' })).toHaveLength(1)
  })

  it('matches the project name', () => {
    const tasks = [task({ description: 'x', project: 'runway' }), task({ description: 'y' })]
    expect(filterTasks(tasks, { query: 'runway' })).toHaveLength(1)
  })

  it('matches a tag', () => {
    const tasks = [task({ description: 'x', tags: ['next'] }), task({ description: 'y' })]
    expect(filterTasks(tasks, { query: 'next' })).toHaveLength(1)
  })

  it('searches the RAW tag string, so a comma-joined tag matches as one string', () => {
    const tasks = [task({ description: 'x', tags: ['@home,@work'] })]
    expect(filterTasks(tasks, { query: 'home,@work' })).toHaveLength(1)
  })

  it('treats a whitespace-only query as no query', () => {
    const tasks = [task({ description: 'a' }), task({ description: 'b' })]
    expect(filterTasks(tasks, { query: '   ' })).toHaveLength(2)
  })

  it('is safe on a task with a null project', () => {
    expect(filterTasks([task({ project: null })], { query: 'anything' })).toEqual([])
  })

  it('applies the context filter before the search', () => {
    const tasks = [
      task({ description: 'shopping', tags: ['@home'] }),
      task({ description: 'shopping', tags: ['@work'] }),
    ]
    expect(filterTasks(tasks, { context: '@home', query: 'shopping' })).toHaveLength(1)
  })
})

describe('matchesSearch', () => {
  it('expects an already-normalised needle', () => {
    expect(matchesSearch(task({ description: 'Uppercase' }), 'uppercase')).toBe(true)
  })
})

describe('byUrgencyDescending', () => {
  it('sorts most urgent first', () => {
    const sorted = byUrgencyDescending([task({ urgency: 1 }), task({ urgency: 9 })])
    expect(sorted.map((t) => t.urgency)).toEqual([9, 1])
  })

  it('does not mutate the input', () => {
    const input = [task({ urgency: 1 }), task({ urgency: 9 })]
    byUrgencyDescending(input)
    expect(input.map((t) => t.urgency)).toEqual([1, 9])
  })

  it('handles an empty list', () => {
    expect(byUrgencyDescending([])).toEqual([])
  })
})
