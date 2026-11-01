import { describe, expect, it } from 'vitest'

import {
  dayOf,
  followUpDay,
  followUpOptions,
  formatDay,
  parseStamp,
  plusDays,
  weekdayOf,
} from '../src/shared/dates.js'

describe('reading a stamp', () => {
  it('reads Taskwarrior stamps and ISO instants, and nothing else', () => {
    expect(parseStamp('20261030T230000Z').toISOString()).toBe('2026-10-30T23:00:00.000Z')
    expect(parseStamp('2026-10-30T23:00:00Z').toISOString()).toBe('2026-10-30T23:00:00.000Z')
    expect(parseStamp('')).toBe(null)
    expect(parseStamp(null)).toBe(null)
    expect(parseStamp('morgen')).toBe(null)
    expect(dayOf('morgen')).toBe(null)
  })

  it('gives the Berlin day, whatever zone the browser is in', () => {
    // 23:30 UTC on 31.12. is already New Year in Berlin
    expect(dayOf('20261231T233000Z')).toBe('2027-01-01')
    expect(dayOf('2026-07-01T21:59:59Z')).toBe('2026-07-01')
    expect(dayOf('2026-07-01T22:00:00Z')).toBe('2026-07-02')
  })
})

describe('day arithmetic', () => {
  it('steps over both DST changes and month and year ends without losing a day', () => {
    expect(plusDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(plusDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(plusDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(plusDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(plusDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(plusDays('2026-10-31', -6)).toBe('2026-10-25')
  })

  it('knows the weekday of a day', () => {
    expect(['2026-10-31', '2026-11-01', '2026-11-02'].map(weekdayOf)).toEqual([6, 0, 1])
  })
})

describe('showing a day', () => {
  it('is weekday, day and month: Di 03.11.', () => {
    expect(formatDay('2026-11-03')).toBe('Di 03.11.')
    expect(formatDay('2026-10-31')).toBe('Sa 31.10.')
    expect(formatDay('2027-01-01')).toBe('Fr 01.01.')
  })

  it('a due date stored as Berlin midnight shows on its own day, not the day before', () => {
    // the old UI's "one day early" (inventory 1.8): local midnight is 23:00 UTC the day before
    expect(formatDay(dayOf('20261102T230000Z'))).toBe('Di 03.11.')
  })
})

describe('follow-up answers', () => {
  it('on a Saturday, "morgen" is Monday and says so', () => {
    expect(followUpOptions('2026-10-31')).toEqual([
      { answer: 'tomorrow', day: '2026-11-02', label: 'fu.monday' },
      { answer: 'friday', day: '2026-11-06', label: 'fu.friday' },
      { answer: 'week', day: '2026-11-09', label: 'fu.week' },
      { answer: 'none', day: '', label: 'fu.none' },
    ])
  })

  it('never lands on a weekend, and the four answers are distinct, for every day of a week', () => {
    for (let i = 0; i < 7; i += 1) {
      const today = plusDays('2026-11-02', i)
      const days = followUpOptions(today).map((o) => o.day).filter(Boolean)
      expect(new Set(days).size, today).toBe(3)
      for (const day of days) {
        expect(day > today, today).toBe(true)
        expect([0, 6], `${today} → ${day}`).not.toContain(weekdayOf(day))
      }
    }
  })

  it('on a weekday, "morgen" says morgen', () => {
    expect(followUpOptions('2026-11-02')[0]).toEqual({ answer: 'tomorrow', day: '2026-11-03', label: 'fu.tomorrow' })
  })

  it('refuses an answer it does not know', () => {
    expect(() => followUpDay('someday', '2026-10-31')).toThrow(/unknown follow-up answer/)
  })
})
