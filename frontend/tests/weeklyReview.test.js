import { describe, expect, it } from 'vitest'

import { DONE_SHOWN, doneShown, reviewHead, reviewSteps } from '../src/shared/weeklyReview.js'

// The counts the page reads from the snapshot (brief 0061).
const counts = (fields = {}) => ({
  inbox: 2, next: 9, due: 1, waitingDue: 1, waitingSoon: 2, stalled: [], someday: 4, ...fields,
})

describe('reviewSteps', () => {
  it('walks 06’s six steps in order, each into its list (the calendar into none)', () => {
    const steps = reviewSteps(counts())
    expect(steps.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(steps.map((s) => s.what)).toEqual(['rs.1', 'rs.2', 'rs.3', 'rs.4', 'rs.5', 'rs.6'])
    expect(steps.map((s) => s.go)).toEqual(['/inbox', '/next', '/waiting', '/projects', '/someday', null])
  })

  it('gives each step its live count', () => {
    const [inbox, next, waiting, projects, someday, calendar] = reviewSteps(counts())
    expect(inbox.status).toEqual({ key: 'rs.1s', vars: { n: 2 } })
    expect(next.status).toEqual({ key: 'rs.2s', vars: { n: 9, d: 1 } })
    // "heute" are the follow-ups that have come; "diese Woche" counts them too
    expect(waiting.status).toEqual({ key: 'rs.3s', vars: { n: 1, s: 3 } })
    expect(projects.status).toEqual({ key: 'proj.allMoving' })
    expect(someday.status).toEqual({ key: 'rs.5s', vars: { n: 4 } })
    expect(reviewSteps(counts({ someday: 1 }))[4].status).toEqual({ key: 'rs.5s1', vars: { n: 1 } })
    expect(calendar.status).toEqual({ key: 'rs.6s' })
  })

  it('ticks itself where runway can check it: an empty Inbox, no stuck project', () => {
    const open = reviewSteps(counts({ stalled: ['Podcast'] }))
    expect(open.map((s) => s.ok)).toEqual([false, false, false, false, false, false])
    const clear = reviewSteps(counts({ inbox: 0 }))
    expect(clear.filter((s) => s.auto).map((s) => s.id)).toEqual([1, 4])
    expect(clear[0].ok).toBe(true)
    expect(clear[0].status).toEqual({ key: 'rs.empty' })
    expect(clear[3].ok).toBe(true)
  })

  it('keeps a hand tick apart from a self tick', () => {
    const steps = reviewSteps(counts({ stalled: ['Podcast'] }), [2, 4, 6])
    expect(steps.filter((s) => s.ok).map((s) => s.id)).toEqual([2, 4, 6])
    expect(steps.some((s) => s.auto)).toBe(false)
    // a step that ticks itself is ticked with or without the hand tick
    expect(reviewSteps(counts({ inbox: 0 }), [])[0].ok).toBe(true)
    expect(reviewSteps(counts({ inbox: 0 }), [1])[0].ok).toBe(true)
  })

  it('names the stuck projects in step 4', () => {
    const step = reviewSteps(counts({ stalled: ['Podcast', 'Garten'] }))[3]
    expect(step.why).toEqual({ key: 'rs.4stalled', vars: { p: 'Podcast, Garten' } })
    expect(step.status).toEqual({ key: 'proj.stalledN', vars: { n: 2 } })
    expect(reviewSteps(counts())[3].why).toEqual({ key: 'rs.4w' })
  })
})

describe('reviewHead', () => {
  it('says nothing before the first snapshot', () => {
    expect(reviewHead(null)).toEqual([])
  })

  it('says that no review was ever recorded', () => {
    expect(reviewHead({ day: null, days: null, due: true })).toEqual([{ key: 'review.never' }])
  })

  it('names the day and how long ago it was', () => {
    expect(reviewHead({ day: '2026-11-03', days: 8, due: true })).toEqual([
      { key: 'review.last', vars: { day: '2026-11-03' } }, { key: 'review.ago', vars: { n: 8 } },
    ])
    expect(reviewHead({ day: '2026-11-10', days: 1, due: false })[1]).toEqual({ key: 'review.ago1' })
    expect(reviewHead({ day: '2026-11-11', days: 0, due: false })[1]).toEqual({ key: 'review.today' })
  })
})

describe('doneShown', () => {
  const done = (n) => Array.from({ length: n }, (_, i) => ({ uuid: `d${i}` }))

  it('lists the newest few and counts the rest', () => {
    expect(doneShown(done(DONE_SHOWN + 3))).toEqual({ rows: done(DONE_SHOWN), more: 3 })
    expect(doneShown(done(2))).toEqual({ rows: done(2), more: 0 })
    expect(doneShown([])).toEqual({ rows: [], more: 0 })
  })
})
