import { describe, expect, it } from 'vitest'

import {
  NeedsAnswer,
  applyPayload,
  beforeOf,
  clarifyPayload,
  contextPayload,
  inversePayload,
  isAddableTag,
  isInbox,
  isNext,
  listOf,
  listPayload,
  planPayload,
  reviewDue,
  tagPayload,
} from '../src/shared/gtdRules.js'
import { allTagParts } from '../src/shared/contextTags.js'

const todo = (extra = {}) => ({
  uuid: 'u-1',
  description: 'x',
  project: null,
  tags: [],
  scheduled: null,
  due: null,
  start: null,
  priority: null,
  ...extra,
})

/** Move, then undo: the parts, project and scheduled day must be what they were. */
function roundTrip(t, body) {
  const before = beforeOf(t)
  const moved = applyPayload(t, body)
  const undone = applyPayload(moved, inversePayload(before, body))
  return { moved, undone }
}

const partsOf = (t) => [...allTagParts(t)].sort()

describe('clarify', () => {
  it('to Nächste with a context adds next and the context, nothing else', () => {
    const body = clarifyPayload('next:@anrufe')
    expect(body).toEqual({ tags_add: ['next', '@anrufe'] })
    const t = applyPayload(todo(), body)
    expect(isNext(t)).toBe(true)
    expect(isInbox(t)).toBe(false)
  })

  it('never guesses a context: NeedsAnswer says what is missing', () => {
    for (const to of ['next', 'next:', 'project:Garten']) {
      let caught
      try {
        clarifyPayload(to)
      } catch (error) {
        caught = error
      }
      expect(caught, to).toBeInstanceOf(NeedsAnswer)
      expect(caught.what).toBe('context')
    }
  })

  it('refuses a target it does not know, and a project without a name', () => {
    expect(() => clarifyPayload('trash')).toThrow(/unknown clarify target/)
    expect(() => clarifyPayload('project:', { ctx: '@a' })).toThrow(/unknown clarify target/)
  })

  it('keeps a colon inside a project name', () => {
    expect(clarifyPayload('project:a:b', { ctx: '@a' }).project).toBe('a:b')
  })
})

describe('list moves', () => {
  it('refuses a target that is not a list', () => {
    expect(() => listPayload(todo({ tags: ['next', '@a'] }), 'inbox')).toThrow(/not a list move/)
  })

  it('setting or removing a context never touches next', () => {
    let t = todo({ tags: ['next', '@computer'] })
    for (const ctx of ['@anrufe', '@computer', '@anrufe']) t = applyPayload(t, contextPayload(t, ctx))
    expect(t.tags).toEqual(['next'])
  })

  it('removing a context held both alone and in a comma tag removes every copy', () => {
    const t = todo({ tags: ['next', '@home', '@home,@work'] })
    const body = contextPayload(t, '@home')
    expect(body).toEqual({ tags_remove: ['@home', '@home,@work'], tags_add: ['@work'] })
    expect(partsOf(applyPayload(t, body))).toEqual(['@work', 'next'])
  })

  it('a legacy comma tag is never sent back to the server (F2)', () => {
    const t = todo({ tags: ['next,@home', '@unterwegs,@buero'] })
    const bodies = [listPayload(t, 'waiting'), listPayload(t, 'someday'), contextPayload(t, '@buero')]
    for (const body of bodies) {
      const inverse = inversePayload(beforeOf(t), body)
      for (const tag of [...(body.tags_add || []), ...(inverse.tags_add || [])]) {
        expect(tag, JSON.stringify(body)).not.toContain(',')
      }
    }
  })
})

describe('Rückgängig', () => {
  it('after filing sends exactly the inverse, follow-up day included', () => {
    const body = clarifyPayload('waiting', { followUp: '2026-11-06' })
    const { moved, undone } = roundTrip(todo(), body)
    expect(moved.scheduled).toBe('2026-11-06')
    expect(isInbox(undone)).toBe(true)
    expect(undone.scheduled).toBe(null)
  })

  it('Warten auf → Nächste clears the follow-up day, and undo restores it', () => {
    const t = todo({ tags: ['waiting', '@anrufe'], scheduled: '20261030T230000Z' })
    const body = listPayload(t, 'next')
    expect(body).toEqual({ tags_add: ['next'], tags_remove: ['waiting'], scheduled: '' })
    const { moved, undone } = roundTrip(t, body)
    expect(moved.scheduled).toBe(null)
    expect([listOf(undone), undone.scheduled]).toEqual(['waiting', '2026-10-31'])
  })

  it('restores the parts of a comma tag, so the tag is repaired, not lost (F2)', () => {
    const cases = [
      [todo({ tags: ['next,@home'] }), 'waiting'],
      [todo({ tags: ['next,@home'] }), 'someday'],
      [todo({ tags: ['@home', 'waiting,someday,@x'] }), 'next'],
      [todo({ tags: ['next', '@unterwegs,@buero'] }), 'someday'],
    ]
    for (const [t, list] of cases) {
      const { moved, undone } = roundTrip(t, listPayload(t, list))
      expect(listOf(moved), JSON.stringify(t.tags)).toBe(list)
      expect(partsOf(undone), JSON.stringify(t.tags)).toEqual(partsOf(t))
      // a comma tag the move did not touch stays; one it removed comes back as parts
      const commaTags = undone.tags.filter((tag) => tag.includes(','))
      expect(commaTags.every((tag) => moved.tags.includes(tag)), JSON.stringify(t.tags)).toBe(true)
    }
  })

  it('a context toggle on a comma tag round-trips to the same parts', () => {
    const t = todo({ tags: ['next', '@unterwegs,@buero'] })
    const { undone } = roundTrip(t, contextPayload(t, '@buero'))
    expect(partsOf(undone)).toEqual(['@buero', '@unterwegs', 'next'])
  })

  it('restores the project of a clarify, and leaves an unchanged project alone', () => {
    const body = clarifyPayload('project:Garten', { ctx: '@zuhause' })
    expect(inversePayload(beforeOf(todo()), body)).toEqual({ tags_remove: ['next', '@zuhause'], project: '' })
    expect(inversePayload(beforeOf(todo({ project: 'Garten' })), body)).toEqual({ tags_remove: ['next', '@zuhause'] })
  })

  it('an inverse of an inverse is the move again', () => {
    const t = todo({ tags: ['waiting', '@anrufe'], scheduled: '20261030T230000Z' })
    const body = listPayload(t, 'next')
    const moved = applyPayload(t, body)
    const inverse = inversePayload(beforeOf(t), body)
    expect(inversePayload(beforeOf(moved), inverse)).toEqual(body)
  })
})

describe('applyPayload', () => {
  it('returns a new task and leaves its argument alone', () => {
    const t = todo({ tags: ['waiting'], scheduled: '20261030T230000Z' })
    const copy = structuredClone(t)
    const after = applyPayload(t, { tags_add: ['next', '@a'], tags_remove: ['waiting'], scheduled: '' })
    expect(t).toEqual(copy)
    expect(after).not.toBe(t)
    expect(after.description).toBe('x')
  })

  it('never invents a timestamp: a sent day stays a day (F3)', () => {
    expect(applyPayload(todo(), { scheduled: '2026-10-31' }).scheduled).toBe('2026-10-31')
  })
})

describe('plan for today', () => {
  it('plans and unplans, and its inverse restores the previous plan', () => {
    const t = todo({ tags: ['next', '@a'], scheduled: '20261105T230000Z' })
    const body = planPayload(t, '2026-10-31')
    expect(body).toEqual({ scheduled: '2026-10-31' })
    const planned = applyPayload(t, body)
    expect(planPayload(planned, '2026-10-31')).toEqual({ scheduled: '' })
    expect(inversePayload(beforeOf(t), body)).toEqual({ scheduled: '2026-11-06' })
  })
})

describe('a legacy part the API refuses (F2 limit)', () => {
  it('mirrors TAG_RE: contexts and words pass, a slash or a leading digit does not', () => {
    expect(['@home', 'büro', '_x', 'a.b-c', '@'].every(isAddableTag)).toBe(true)
    expect(['a/b', '3x', 'a b', 'a,b', ''].some(isAddableTag)).toBe(false)
  })

  it('refuses the move before anything is sent, instead of a PUT the server answers with 400', () => {
    const t = { uuid: 'a', tags: ['waiting,a/b', '@x'] }
    for (const run of [() => listPayload(t, 'next'), () => contextPayload({ tags: ['next', '@x,a/b'] }, '@x')]) {
      let caught
      try {
        run()
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(NeedsAnswer)
      expect(caught.what).toBe('legacyTag')
    }
  })

  it('still moves a legacy tag whose parts are all addable', () => {
    expect(listPayload({ tags: ['next,foo', '@a'] }, 'waiting')).toEqual({ tags_add: ['waiting', 'foo'], tags_remove: ['next,foo'] })
  })
})

describe('reviewDue', () => {
  it('is due when no weekly review was ever recorded', () => {
    expect(reviewDue(null, '2026-11-01')).toBe(true)
    expect(reviewDue(undefined, '2026-11-01')).toBe(true)
    expect(reviewDue('', '2026-11-01')).toBe(true)
  })
  it('is not due 6 days after the last one, due from 7 days on', () => {
    expect(reviewDue('20261026T100000Z', '2026-11-01')).toBe(false)
    expect(reviewDue('20261025T100000Z', '2026-11-01')).toBe(true)
    expect(reviewDue('20261001T100000Z', '2026-11-01')).toBe(true)
  })
  it('is not due on the same day', () => {
    expect(reviewDue('20261101T080000Z', '2026-11-01')).toBe(false)
  })
  it('counts a stamp by its server-time day across the DST night (25 Oct 2026)', () => {
    // 23:30 UTC on 24 Oct is 01:30 CEST on 25 Oct in Berlin: seven days before 1 Nov.
    expect(reviewDue('20261024T233000Z', '2026-11-01')).toBe(true)
    // 22:30 UTC on 24 Oct is 00:30 CEST on 25 Oct as well.
    expect(reviewDue('20261024T223000Z', '2026-11-01')).toBe(true)
    // 21:30 UTC on 25 Oct is 22:30 CET on 25 Oct; 26 Oct 00:30 CET is 23:30 UTC on 25 Oct.
    expect(reviewDue('20261025T233000Z', '2026-11-01')).toBe(false)
  })
  it('is never due before today is known', () => {
    expect(reviewDue(null, null)).toBe(false)
    expect(reviewDue('20261001T100000Z', null)).toBe(false)
  })
})

describe('tagPayload: one tag on or off, as a delta', () => {
  it('adds a tag the todo does not carry, and removes one it does', () => {
    expect(tagPayload(todo({ tags: ['next', '@home'] }), 'büro-2026')).toEqual({ tags_add: ['büro-2026'] })
    expect(tagPayload(todo({ tags: ['next', 'büro-2026'] }), 'büro-2026')).toEqual({ tags_remove: ['büro-2026'] })
  })

  it('repairs a legacy comma tag: the raw tag goes, its other parts come back singly (F2)', () => {
    expect(tagPayload(todo({ tags: ['kunde,@home'] }), 'kunde')).toEqual({ tags_remove: ['kunde,@home'], tags_add: ['@home'] })
  })

  it('refuses before sending when a part could not be added back', () => {
    expect(() => tagPayload(todo({ tags: ['kunde,a/b'] }), 'kunde')).toThrow(NeedsAnswer)
  })

  it('is what contextPayload sends for a context', () => {
    const t = todo({ tags: ['next', '@unterwegs,@buero'] })
    expect(contextPayload(t, '@buero')).toEqual(tagPayload(t, '@buero'))
    expect(contextPayload(t, '@home')).toEqual(tagPayload(t, '@home'))
  })
})
