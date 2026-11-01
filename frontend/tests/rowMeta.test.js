import { describe, expect, it } from 'vitest'

import {
  contextText, dayMonth, dueInfo, entryInfo, followInfo, metaOf, plannedForToday, rowLabel,
} from '../src/shared/rowMeta.js'

// Saturday; Taskwarrior stamps are UTC, the days Europe/Berlin (CET from 25 Oct).
const TODAY = '2026-10-31'
const at = (day, hm = '1000') => `${day.replaceAll('-', '')}T${hm}00Z`

describe('due dates on a row', () => {
  it('says überfällig with the day, heute, morgen, else the weekday', () => {
    expect(dueInfo({ due: at('2026-10-30') }, TODAY)).toEqual({ text: 'überfällig 30.10.', tone: 'overdue', status: 'überfällig' })
    expect(dueInfo({ due: at('2026-10-31') }, TODAY)).toMatchObject({ text: 'heute', tone: 'today', status: 'fällig heute' })
    expect(dueInfo({ due: at('2026-11-01') }, TODAY)).toEqual({ text: 'morgen', tone: 'soon' })
    expect(dueInfo({ due: at('2026-11-07') }, TODAY)).toEqual({ text: 'Sa 07.11.', tone: 'soon' })
    expect(dueInfo({ due: at('2026-11-08') }, TODAY)).toEqual({ text: 'So 08.11.', tone: '' })
    expect(dueInfo({}, TODAY)).toBe(null)
  })

  it('takes the server day, not UTC: 23:30 UTC on the 30th is the 31st in Berlin', () => {
    expect(dueInfo({ due: '20261030T233000Z' }, TODAY).text).toBe('heute')
  })

  it('formats day and month with a trailing dot', () => {
    expect(dayMonth('2026-03-04')).toBe('04.03.')
  })
})

describe('follow-ups on a waiting row', () => {
  const w = (extra) => ({ tags: ['waiting'], entry: at('2026-10-20'), ...extra })
  it('says Nachhaken only once the day has come, with the ring', () => {
    expect(followInfo(w({ scheduled: at('2026-10-31') }), TODAY)).toEqual({ text: 'Nachhaken heute', tone: 'follow', due: true })
    expect(followInfo(w({ scheduled: at('2026-10-29') }), TODAY)).toEqual({ text: 'Nachhaken seit 29.10.', tone: 'follow', due: true })
  })
  it('says Wiedervorlage for a later day, from the wait when there is no scheduled day', () => {
    expect(followInfo(w({ wait: at('2026-11-03') }), TODAY)).toEqual({ text: 'Wiedervorlage Di 03.11.', tone: '', due: false })
  })
  it('says how long it has waited without a day', () => {
    expect(followInfo(w({}), TODAY).text).toBe('wartet seit 20.10.')
  })
})

describe('capture times', () => {
  it('says heute or gestern with the time, else the day; gerade before the server named it', () => {
    expect(entryInfo({ entry: '20261031T081200Z' }, TODAY)).toBe('heute 09:12')
    expect(entryInfo({ entry: '20261030T174000Z' }, TODAY)).toBe('gestern 18:40')
    expect(entryInfo({ entry: at('2026-10-28') }, TODAY)).toBe('Mi 28.10.')
    expect(entryInfo({}, TODAY)).toBe('gerade')
  })
})

describe('the meta columns', () => {
  it('Nächste: project, context (first and +n, or ohne Kontext), then due or für heute', () => {
    const t = { tags: ['next', '@computer'], project: 'P', due: at('2026-10-30') }
    expect(metaOf(t, 'next', TODAY).map((m) => m.text)).toEqual(['P', '@computer', 'überfällig 30.10.'])
    expect(contextText({ tags: ['next', '@unterwegs,@buero'] })).toBe('@unterwegs +1')
    expect(contextText({ tags: ['next'] })).toBe('ohne Kontext')
    expect(contextText({ tags: ['someday'] })).toBe('')
    const planned = { tags: ['next', '@a'], scheduled: at('2026-10-31', '0700') }
    expect(metaOf(planned, 'next', TODAY)[2]).toEqual({ text: 'für heute', tone: 'planned' })
  })

  it('für heute only for a Nächste todo planned by its day, never for a waiting one or one with a due day', () => {
    const s = at('2026-10-31', '0700')
    expect(plannedForToday({ tags: ['next', '@a'], scheduled: s }, TODAY)).toBe(true)
    expect(plannedForToday({ tags: ['waiting'], scheduled: s }, TODAY)).toBe(false)
    expect(plannedForToday({ tags: ['next', '@a'], scheduled: s, due: at('2026-11-05') }, TODAY)).toBe(false)
    expect(plannedForToday({ tags: ['next', '@a'], scheduled: at('2026-11-02') }, TODAY)).toBe(false)
  })

  it('Inbox: notes and when captured; Warten auf: project and follow-up; Irgendwann: project and since', () => {
    const inbox = { tags: [], entry: '20261031T081200Z', annotations: [{}] }
    expect(metaOf(inbox, 'inbox', TODAY).map((m) => m.text)).toEqual(['¶ 1 Notiz', 'erfasst heute 09:12'])
    expect(metaOf({ ...inbox, annotations: [] }, 'inbox', TODAY)[0].text).toBe('')
    const waiting = { tags: ['waiting'], project: 'P', scheduled: at('2026-10-31') }
    expect(metaOf(waiting, 'waiting', TODAY)[1]).toEqual({ text: 'Nachhaken heute', tone: 'follow', ring: true })
    expect(metaOf({ tags: ['someday'], entry: at('2026-10-01') }, 'someday', TODAY).map((m) => m.text)).toEqual(['', 'seit 01.10.'])
  })

  it('done: project, contexts, and when it was done', () => {
    const done = { tags: ['next', '@a'], project: 'P', end: '20261031T074500Z' }
    expect(metaOf(done, 'done', TODAY).map((m) => m.text)).toEqual(['P', '@a', 'heute 08:45'])
    expect(metaOf({ ...done, end: null }, 'done', TODAY)[2].text).toBe('gerade')
  })
})

describe('the row label (Android: <Beschreibung>, <Status>, ID <8>)', () => {
  it('names overdue, due today, a due follow-up, else the list', () => {
    const uuid = '0f7c2a10-1234-4abc-9def-12345678abcd'
    expect(rowLabel({ uuid, description: 'A', tags: ['next'], due: at('2026-10-29') }, TODAY)).toBe('A, überfällig, ID 5678abcd')
    expect(rowLabel({ uuid, description: 'B', tags: ['next'], due: at('2026-10-31') }, TODAY)).toBe('B, fällig heute, ID 5678abcd')
    expect(rowLabel({ uuid, description: 'C', tags: ['waiting'], scheduled: at('2026-10-30') }, TODAY)).toBe('C, Nachhaken fällig, ID 5678abcd')
    expect(rowLabel({ uuid, description: 'D', tags: [] }, TODAY)).toBe('D, Inbox, ID 5678abcd')
    expect(rowLabel({ uuid, description: 'E', tags: ['someday'], project: 'P' }, TODAY)).toBe('E, Irgendwann, ID 5678abcd')
  })
})
