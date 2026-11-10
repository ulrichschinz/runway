import { describe, expect, it } from 'vitest'

import {
  committingEnter, deferredUntil, detailFields, extraTagsOf, fieldEdit, formOf, isDeferred, noteDay, readDay, readTag, runningSince,
} from '../src/shared/detailFields.js'

const TODAY = '2026-11-01'
const todo = (extra = {}) => ({
  uuid: 'u-1',
  description: 'Steuerberatung zurückrufen',
  project: null,
  tags: ['next', '@anrufe'],
  priority: null,
  due: null,
  scheduled: null,
  wait: null,
  until: null,
  recur: null,
  depends: [],
  ...extra,
})

describe('formOf', () => {
  it('holds days in server time, not the stamp’s UTC date', () => {
    // Taskwarrior stores a bare day as Berlin midnight: 23:00 UTC the day before in winter.
    expect(formOf(todo({ due: '20261104T230000Z', wait: '20261101T230000Z' }))).toMatchObject({
      due: '2026-11-05', wait: '2026-11-02', scheduled: '', until: '', recur: '', project: '', priority: null,
    })
  })
})

describe('fieldEdit: one field, as a delta of the form', () => {
  it('sends only the field that changed', () => {
    expect(fieldEdit(todo(), { due: '2026-11-05' })).toEqual({ due: '2026-11-05' })
    expect(fieldEdit(todo(), { priority: 'H' })).toEqual({ priority: 'H' })
    expect(fieldEdit(todo(), { project: ' Website-Relaunch ' })).toEqual({ project: 'Website-Relaunch' })
  })

  it('clears with an empty string', () => {
    expect(fieldEdit(todo({ due: '20261104T230000Z' }), { due: '' })).toEqual({ due: '' })
    expect(fieldEdit(todo({ priority: 'H' }), { priority: null })).toEqual({ priority: '' })
  })

  it('never sends the tags, whatever the form holds', () => {
    const body = fieldEdit(todo(), { description: 'Steuerberatung anrufen', tags: ['x'] })
    expect(body).toEqual({ description: 'Steuerberatung anrufen' })
  })

  it('sends the dependencies only when they changed, as the complete list', () => {
    const t = todo({ depends: ['a', 'b'] })
    expect(fieldEdit(t, { depends: ['b', 'a'] })).toBeNull()
    expect(fieldEdit(t, { depends: ['a'] })).toEqual({ depends: ['a'] })
    expect(fieldEdit(t, { depends: [] })).toEqual({ depends: [] })
  })

  it('never clears the description and leaves an unchanged one out', () => {
    expect(fieldEdit(todo(), { description: '   ' })).toBeNull()
    expect(fieldEdit(todo(), { description: ' Steuerberatung zurückrufen ' })).toBeNull()
  })

  it('returns null when nothing would change', () => {
    expect(fieldEdit(todo({ due: '20261104T230000Z' }), { due: '2026-11-05' })).toBeNull()
  })

  it('keeps due and rhythm of a recurring todo, but lets them change', () => {
    const t = todo({ recur: 'weekly', due: '20261104T230000Z' })
    expect(fieldEdit(t, { due: '' })).toBeNull()
    expect(fieldEdit(t, { recur: '' })).toBeNull()
    expect(fieldEdit(t, { due: '2026-11-12' })).toEqual({ due: '2026-11-12' })
    expect(fieldEdit(t, { recur: 'monthly' })).toEqual({ recur: 'monthly' })
  })

  it('sends a rhythm without a due day as asked: the server explains its refusal', () => {
    expect(fieldEdit(todo(), { recur: 'weekly' })).toEqual({ recur: 'weekly' })
  })
})

describe('detailFields: what the detail offers', () => {
  it('offers "für heute" where t plans, and nowhere else', () => {
    expect(detailFields(todo(), TODAY).plan).toBe(true)
    expect(detailFields(todo({ tags: ['@anrufe'], project: 'Garten' }), TODAY).plan).toBe(true)
    for (const tags of [[], ['waiting'], ['someday'], ['next', 'waiting']]) {
      expect(detailFields(todo({ tags }), TODAY).plan, tags.join()).toBe(false)
    }
  })

  it('names scheduled the follow-up day in Warten auf, a planned day elsewhere', () => {
    expect(detailFields(todo({ tags: ['waiting'] }), TODAY).scheduled).toBe('follow')
    expect(detailFields(todo({ tags: ['next,waiting'] }), TODAY).scheduled).toBe('follow')
    expect(detailFields(todo(), TODAY).scheduled).toBe('plan')
    expect(detailFields(todo({ tags: ['someday'] }), TODAY).scheduled).toBe('plan')
  })

  it('knows a todo planned for today or before, by its server day', () => {
    expect(detailFields(todo({ scheduled: '20261031T230000Z' }), TODAY).planned).toBe(true)
    expect(detailFields(todo({ scheduled: '20261029T230000Z' }), TODAY).planned).toBe(true)
    expect(detailFields(todo({ scheduled: '20261101T230000Z' }), TODAY).planned).toBe(false)
    expect(detailFields(todo(), TODAY).planned).toBe(false)
  })

  it('lets a recurring todo keep its due day and rhythm', () => {
    expect(detailFields(todo(), TODAY)).toMatchObject({ list: 'next', clearDue: true, clearRecur: true })
    expect(detailFields(todo({ recur: 'weekly', due: '20261104T230000Z' }), TODAY)).toMatchObject({ clearDue: false, clearRecur: false })
  })
})

describe('tags beyond lists and contexts', () => {
  it('lists the other tag parts once, legacy comma tags split', () => {
    expect(extraTagsOf(todo({ tags: ['next', '@anrufe', 'kunde', 'kunde,@home', 'waiting,rechnung'] }))).toEqual(['kunde', 'rechnung'])
  })

  it('reads a typed tag, dropping a leading + and refusing what the API would', () => {
    expect(readTag(' +kunde ')).toEqual({ tag: 'kunde' })
    expect(readTag('@neu')).toEqual({ tag: '@neu' })
    expect(readTag('next')).toEqual({ error: 'd.tagList' })
    for (const bad of ['', '@', 'a,b', 'a b', '-x']) expect(readTag(bad), bad).toEqual({ error: 'd.tagBad' })
  })

  it('refuses a tag or context the todo already has, so the field never removes one', () => {
    const t = todo({ tags: ['next', '@zuhause', 'kunde,alt'] })
    expect(readTag('@zuhause', t)).toEqual({ error: 'd.tagHas' })
    expect(readTag('+kunde', t)).toEqual({ error: 'd.tagHas' })
    expect(readTag('alt', t)).toEqual({ error: 'd.tagHas' })
    expect(readTag('@anrufe', t)).toEqual({ tag: '@anrufe' })
  })
})

describe('readDay: what a date field may send', () => {
  it('sends a whole day with a four-digit year', () => {
    expect(readDay('2027-11-07')).toEqual({ day: '2027-11-07' })
    expect(readDay('2028-02-29')).toEqual({ day: '2028-02-29' })
  })

  it('holds back the years a browser reports while one is typed, and impossible days', () => {
    for (const raw of ['0002-11-07', '0020-11-07', '0202-11-07', '2027-02-30', '2027-13-01', '2027-1-7', 'x']) {
      expect(readDay(raw), raw).toBeNull()
    }
  })

  it('clears only a field emptied on purpose, not an unfinished one', () => {
    expect(readDay('')).toEqual({ day: '' })
    expect(readDay('', false)).toEqual({ day: '' })
    expect(readDay('', true)).toBeNull()
  })
})

describe('isDeferred', () => {
  it('is a todo whose wait lies after today', () => {
    expect(isDeferred(todo({ wait: '20261120T230000Z' }), TODAY)).toBe(true)
    expect(isDeferred(todo({ status: 'waiting', wait: '20261120T230000Z' }), TODAY)).toBe(true)
  })

  it('is not one whose wait has come, has none, or is done or deleted', () => {
    expect(isDeferred(todo({ wait: '20261031T230000Z' }), TODAY)).toBe(false)
    expect(isDeferred(todo(), TODAY)).toBe(false)
    expect(isDeferred(todo({ status: 'completed', wait: '20261120T230000Z' }), TODAY)).toBe(false)
    expect(isDeferred(todo({ status: 'deleted', wait: '20261120T230000Z' }), TODAY)).toBe(false)
    expect(isDeferred(null, TODAY)).toBe(false)
  })

  it('names the day a deferred todo comes back', () => {
    expect(deferredUntil(todo({ wait: '20261119T230000Z' }), TODAY)).toBe('Fr 20.11.')
    expect(deferredUntil(todo(), TODAY)).toBe('')
  })
})

describe('the live bar and the notes', () => {
  it('says since when a todo runs: the time today, the day before', () => {
    expect(runningSince(todo({ start: '20261101T073000Z' }), TODAY)).toBe('08:30')
    expect(runningSince(todo({ start: '20261030T073000Z' }), TODAY)).toMatch(/30\.10\.$/)
    expect(runningSince(todo(), TODAY)).toBe('')
  })

  it('dates a note by its server day', () => {
    expect(noteDay({ entry: '20261031T233000Z' })).toMatch(/01\.11\.$/)
    expect(noteDay({})).toBe('')
  })
})

describe('committingEnter', () => {
  it('is a plain Enter, not the one that confirms an IME conversion', () => {
    expect(committingEnter({ key: 'Enter' })).toBe(true)
    expect(committingEnter({ key: 'Enter', isComposing: true })).toBe(false)
    expect(committingEnter({ key: 'Enter', keyCode: 229 })).toBe(false)
    expect(committingEnter({ key: 'a' })).toBe(false)
  })
})
