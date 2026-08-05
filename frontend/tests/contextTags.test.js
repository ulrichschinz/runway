import { describe, expect, it } from 'vitest'

import {
  allTagParts,
  collectContextTags,
  contextTagsOf,
  parseTagInput,
  splitTagParts,
  taskHasContext,
} from '../src/shared/contextTags.js'

/**
 * These pin the behaviour of the comma-splitting that commits c6ce0f2 and 472b673 had to
 * fix by hand. Taskwarrior returns a comma-entered tag as ONE array element, so every
 * reader has to split it — and every reader that forgets is a bug.
 */

describe('splitTagParts', () => {
  it('returns a single-element list for a plain tag', () => {
    expect(splitTagParts('@home')).toEqual(['@home'])
  })

  it('splits a comma-joined tag — the c6ce0f2 regression', () => {
    expect(splitTagParts('@home,@errands')).toEqual(['@home', '@errands'])
  })

  it('trims whitespace around each part', () => {
    expect(splitTagParts('@home , @errands')).toEqual(['@home', '@errands'])
  })

  it('preserves empty parts rather than silently dropping them', () => {
    expect(splitTagParts('@home,,@work')).toEqual(['@home', '', '@work'])
  })

  it('handles a tag that is only whitespace', () => {
    expect(splitTagParts('   ')).toEqual([''])
  })
})

describe('contextTagsOf', () => {
  it('keeps only @-prefixed parts', () => {
    const task = { tags: ['next', '@home', 'work'] }
    expect(contextTagsOf(task)).toEqual(['@home'])
  })

  it('unpacks contexts hidden inside a comma-joined tag', () => {
    const task = { tags: ['@home,@errands'] }
    expect(contextTagsOf(task)).toEqual(['@home', '@errands'])
  })

  it('mixes plain tags and comma-joined contexts', () => {
    const task = { tags: ['next', '@home,@errands', 'waiting'] }
    expect(contextTagsOf(task)).toEqual(['@home', '@errands'])
  })

  it('returns nothing for a task with no tags', () => {
    expect(contextTagsOf({})).toEqual([])
    expect(contextTagsOf({ tags: [] })).toEqual([])
  })

  it('does not treat an @ in the middle of a tag as a context', () => {
    expect(contextTagsOf({ tags: ['email@example.com'] })).toEqual([])
  })
})

describe('taskHasContext', () => {
  it('matches a plain context tag', () => {
    expect(taskHasContext({ tags: ['@home'] }, '@home')).toBe(true)
  })

  it('matches a context inside a comma-joined tag', () => {
    expect(taskHasContext({ tags: ['@home,@errands'] }, '@errands')).toBe(true)
  })

  it('does not match on a prefix', () => {
    expect(taskHasContext({ tags: ['@homework'] }, '@home')).toBe(false)
  })

  it('does not match a different context', () => {
    expect(taskHasContext({ tags: ['@home'] }, '@work')).toBe(false)
  })

  it('is safe on a task with no tags', () => {
    expect(taskHasContext({}, '@home')).toBe(false)
  })
})

describe('collectContextTags', () => {
  it('deduplicates across tasks and sorts', () => {
    const tasks = [
      { tags: ['@work'] },
      { tags: ['@home,@errands'] },
      { tags: ['@work', 'next'] },
    ]
    expect(collectContextTags(tasks)).toEqual(['@errands', '@home', '@work'])
  })

  it('returns an empty list when nothing carries a context', () => {
    expect(collectContextTags([{ tags: ['next'] }, {}])).toEqual([])
  })

  it('handles an empty task list', () => {
    expect(collectContextTags([])).toEqual([])
  })
})

describe('allTagParts', () => {
  it('returns every part, contexts and ordinary tags alike', () => {
    expect(allTagParts({ tags: ['next', '@home,@errands'] })).toEqual([
      'next',
      '@home',
      '@errands',
    ])
  })

  it('drops empty parts so they cannot become blank chips', () => {
    expect(allTagParts({ tags: ['next,,'] })).toEqual(['next'])
  })

  it('is safe on a task with no tags', () => {
    expect(allTagParts({})).toEqual([])
  })
})

describe('parseTagInput', () => {
  it('accepts a single tag', () => {
    expect(parseTagInput('next')).toEqual(['next'])
  })

  it('splits a comma-separated list', () => {
    expect(parseTagInput('next,@home')).toEqual(['next', '@home'])
  })

  it('tolerates the leading + that Taskwarrior users type out of habit', () => {
    expect(parseTagInput('+next')).toEqual(['next'])
    expect(parseTagInput('+next,+@home')).toEqual(['next', '@home'])
  })

  it('drops a bare @ — what is left when someone types the prefix and stops', () => {
    expect(parseTagInput('@')).toEqual([])
    expect(parseTagInput('@,next')).toEqual(['next'])
  })

  it('drops empty entries', () => {
    expect(parseTagInput('next,,@home')).toEqual(['next', '@home'])
  })

  it('returns nothing for empty or whitespace input', () => {
    expect(parseTagInput('')).toEqual([])
    expect(parseTagInput('   ')).toEqual([])
  })

  it('strips only ONE leading +', () => {
    expect(parseTagInput('++next')).toEqual(['+next'])
  })
})
