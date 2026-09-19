import { describe, expect, it } from 'vitest'

import { buildTaskPayload, CLEARABLE_FIELDS } from '../src/shared/taskPayload.js'

const blank = () => ({
  description: '',
  project: '',
  tags: [],
  priority: null,
  due: '',
  scheduled: '',
  wait: '',
  until: '',
  recur: '',
  depends: [],
})

const opened = () => ({
  ...blank(),
  description: 'write the brief',
  project: 'runway',
  tags: ['next'],
  priority: 'H',
  due: '2026-09-01',
  scheduled: '2026-08-30',
  wait: '2026-08-29',
  until: '2026-12-31',
  recur: 'weekly',
})

describe('buildTaskPayload on create', () => {
  it('sends null for every empty field', () => {
    const payload = buildTaskPayload({ ...blank(), description: ' new ' }, null)
    expect(payload.description).toBe('new')
    for (const field of CLEARABLE_FIELDS) expect(payload[field]).toBeNull()
  })

  it('sends the values that are set, project trimmed', () => {
    const payload = buildTaskPayload({ ...blank(), description: 'x', project: ' p ', priority: 'M' }, null)
    expect(payload.project).toBe('p')
    expect(payload.priority).toBe('M')
  })

  it('never sends an empty string, which would mean "clear"', () => {
    const payload = buildTaskPayload({ ...blank(), description: 'x', project: '   ' }, null)
    expect(Object.values(payload)).not.toContain('')
  })
})

describe('buildTaskPayload on edit', () => {
  it('clears a field that had a value and is now empty', () => {
    const original = opened()
    const form = { ...original, due: '', project: '' }
    const payload = buildTaskPayload(form, original)
    expect(payload.due).toBe('')
    expect(payload.project).toBe('')
  })

  it('clears the priority when it is deselected', () => {
    const original = opened()
    const payload = buildTaskPayload({ ...original, priority: null }, original)
    expect(payload.priority).toBe('')
  })

  it('omits every field that did not change', () => {
    const original = opened()
    const payload = buildTaskPayload({ ...original }, original)
    for (const field of CLEARABLE_FIELDS) expect(payload).not.toHaveProperty(field)
  })

  it('omits a field that was empty and still is', () => {
    const original = { ...blank(), description: 'x' }
    const payload = buildTaskPayload({ ...original }, original)
    expect(payload).not.toHaveProperty('due')
    expect(payload).not.toHaveProperty('priority')
  })

  it('sends a changed value', () => {
    const original = opened()
    const payload = buildTaskPayload({ ...original, due: '2026-10-01', priority: 'L' }, original)
    expect(payload.due).toBe('2026-10-01')
    expect(payload.priority).toBe('L')
  })

  it('always sends tags and depends as the complete arrays', () => {
    const original = opened()
    const payload = buildTaskPayload({ ...original, tags: [], depends: [] }, original)
    expect(payload.tags).toEqual([])
    expect(payload.depends).toEqual([])
    const kept = buildTaskPayload({ ...original }, original)
    expect(kept.tags).toEqual(['next'])
  })
})
