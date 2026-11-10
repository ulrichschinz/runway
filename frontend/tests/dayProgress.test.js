import { describe, expect, it } from 'vitest'

import { countsAsPlanned, dayProgress, lensCaption, lensCaptionParts } from '../src/shared/dayProgress.js'
import { applyPayload, contextPayload, listPayload, planPayload } from '../src/shared/gtdRules.js'

const TODAY = '2026-10-31'
const MIDNIGHT = '20261030T230000Z' // 31.10. 00:00 in Berlin: "planned for today"

/**
 * The prototype's demo day as a snapshot ("3 von 7 heute"): four open todos planned
 * (two for today, one running and due soon, one overdue), three done this morning,
 * all three planned, plus open todos that are not planned.
 */
function demoDay() {
  const open = [
    { uuid: 'steuer', tags: ['next', '@anrufe'], priority: 'H', scheduled: MIDNIGHT },
    { uuid: 'startseite', tags: ['next', '@computer'], priority: 'M', scheduled: MIDNIGHT },
    { uuid: 'angebot', tags: ['next', '@computer'], priority: 'H', due: '20261103T170000Z', start: '20261031T083000Z' },
    { uuid: 'belege', tags: ['next', '@computer'], due: '20261030T170000Z' },
    { uuid: 'keller', tags: ['next', '@zuhause'] },
    { uuid: 'vermieter', tags: ['waiting'], scheduled: '20261029T230000Z' },
    { uuid: 'idee', tags: [] },
  ]
  const done = ['wochenplan', 'zahnarzt', 'newsletter'].map((uuid) => ({
    uuid, tags: ['@computer'], scheduled: MIDNIGHT, status: 'completed', end: '20261031T074500Z',
  }))
  return { open, done }
}

/** What the store will do on a tick: record the plan before Taskwarrior drops `start`. */
function tick(state, uuid) {
  const t = state.open.find((x) => x.uuid === uuid)
  const { start: _dropped, ...completed } = t // F6: done drops start
  state.open = state.open.filter((x) => x !== t)
  state.done = [...state.done, { ...completed, status: 'completed', plannedAtHold: countsAsPlanned(t, TODAY) }]
}

const counts = (p) => [p.done, p.total, p.extra]

describe('the Tageslinse', () => {
  it('reads 3 von 7 on the demo day', () => {
    const { open, done } = demoDay()
    expect(lensCaption(dayProgress(open, done, TODAY))).toBe('3 von 7 heute')
  })

  it('completing a planned todo moves the numerator only; an unplanned one shows apart', () => {
    const state = demoDay()
    tick(state, 'steuer')
    expect(counts(dayProgress(state.open, state.done, TODAY))).toEqual([4, 7, 0])
    tick(state, 'keller')
    const p = dayProgress(state.open, state.done, TODAY)
    expect(counts(p)).toEqual([4, 7, 1])
    expect(lensCaption(p)).toBe('4 von 7 heute · 1 zusätzlich')
  })

  it('completing the running todo keeps the denominator, although done drops start (F6)', () => {
    const state = demoDay()
    tick(state, 'angebot')
    expect(state.done.at(-1).start).toBeUndefined()
    expect(counts(dayProgress(state.open, state.done, TODAY))).toEqual([4, 7, 0])
  })

  it('Warten auf → Nächste does not change it: a follow-up day is not a plan', () => {
    const state = demoDay()
    const before = counts(dayProgress(state.open, state.done, TODAY))
    let w = state.open.find((x) => x.uuid === 'vermieter')
    w = applyPayload(w, contextPayload(w, '@anrufe'))
    w = applyPayload(w, listPayload(w, 'next'))
    state.open = state.open.map((x) => (x.uuid === 'vermieter' ? w : x))
    expect(counts(dayProgress(state.open, state.done, TODAY))).toEqual(before)
  })

  it('planning a todo for today moves the denominator, and unplanning it moves it back', () => {
    const state = demoDay()
    const keller = state.open.find((x) => x.uuid === 'keller')
    const planned = applyPayload(keller, planPayload(keller, TODAY))
    const withPlan = state.open.map((x) => (x === keller ? planned : x))
    expect(counts(dayProgress(withPlan, state.done, TODAY))).toEqual([3, 8, 0])
    const unplanned = applyPayload(planned, planPayload(planned, TODAY))
    const back = state.open.map((x) => (x === keller ? unplanned : x))
    expect(counts(dayProgress(back, state.done, TODAY))).toEqual([3, 7, 0])
  })

  it('level is the share done, and 0 with nothing planned', () => {
    expect(dayProgress([], [], TODAY).level).toBe(0)
    const { open, done } = demoDay()
    expect(dayProgress(open, done, TODAY).level).toBeCloseTo(3 / 7)
  })
})

describe('the caption', () => {
  it('has no +N form anywhere', () => {
    for (const short of [false, true]) {
      const caption = lensCaption({ done: 1, total: 2, extra: 3 }, { short })
      expect(caption).not.toMatch(/\+/)
      expect(caption).toMatch(/ · 3 zusätzlich$/)
    }
  })
})

describe('a todo outside the plan', () => {
  it('ticked while due today shows as zusätzlich, never in the denominator (correction to 06)', () => {
    for (const tags of [[], ['waiting'], ['someday']]) {
      const state = demoDay()
      const x = { uuid: 'x', tags, due: '20261031T100000Z' }
      state.open = [...state.open, x]
      const before = counts(dayProgress(state.open, state.done, TODAY))
      tick(state, 'x')
      expect(state.done.at(-1).plannedAtHold, tags.join()).toBe(false)
      expect(counts(dayProgress(state.open, state.done, TODAY)), tags.join()).toEqual([before[0], before[1], 1])
    }
  })

  it('splits into the count and the extra part, so a narrow head can wrap the second (plan M11)', () => {
    expect(lensCaptionParts({ done: 3, total: 7, extra: 1 })).toEqual(['3 von 7 heute', ' · 1 zusätzlich'])
    expect(lensCaptionParts({ done: 3, total: 7, extra: 0 })).toEqual(['3 von 7 heute', ''])
    expect(lensCaptionParts({ done: 3, total: 7, extra: 1 }).join('')).toBe(lensCaption({ done: 3, total: 7, extra: 1 }))
  })
})
