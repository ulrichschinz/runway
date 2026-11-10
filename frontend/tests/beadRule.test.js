import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LAND_MAX_MS, PHONE_MAX, beadRoute, canvasAllowed, easeOut, easePull, flightAllowed, hairlineColour, landingBook,
  settleWithin,
} from '../src/shared/lensMath.js'

describe('when a bead flies', () => {
  const all = { counts: true, slot: true, reduced: false, ring: true }

  it('flies for a todo that counts for today, with a lens on screen, motion allowed and its ring visible', () => {
    expect(flightAllowed(all)).toBe(true)
  })

  it('does not fly for a todo that does not count (it is "zusätzlich")', () => {
    expect(flightAllowed({ ...all, counts: false })).toBe(false)
  })

  it('does not fly without a lens on screen (Inbox, scrolled away, another page)', () => {
    expect(flightAllowed({ ...all, slot: false })).toBe(false)
  })

  it('does not fly with reduced motion', () => {
    expect(flightAllowed({ ...all, reduced: true })).toBe(false)
  })

  it('does not fly without a ring to leave from', () => {
    expect(flightAllowed({ ...all, ring: false })).toBe(false)
  })
})

describe('when the WebGL canvas is used', () => {
  const desk = { width: 1440, reduced: false, webgl: true }

  it('on a desktop with WebGL and motion', () => {
    expect(canvasAllowed(desk)).toBe(true)
    expect(canvasAllowed({ ...desk, width: PHONE_MAX + 1 })).toBe(true)
  })

  it('never on the phone (plan D5), with reduced motion, without WebGL, or after a lost context', () => {
    expect(canvasAllowed({ ...desk, width: PHONE_MAX })).toBe(false)
    expect(canvasAllowed({ ...desk, width: 412 })).toBe(false)
    expect(canvasAllowed({ ...desk, reduced: true })).toBe(false)
    expect(canvasAllowed({ ...desk, webgl: false })).toBe(false)
    expect(canvasAllowed({ ...desk, lost: true })).toBe(false)
  })
})

describe('the thread', () => {
  const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number)

  it('starts at the ring and ends in the lens', () => {
    const d = beadRoute({ x: 300, y: 600 }, { x: 900, y: 120 }, 140)
    expect(d.startsWith('M300,600 ')).toBe(true)
    expect(d.endsWith(' 900,120')).toBe(true)
  })

  it('runs up the gutter left of the ring, and along a band above the head', () => {
    const d = beadRoute({ x: 300, y: 600 }, { x: 900, y: 120 }, 100)
    const xs = nums(d).filter((_, i) => i % 2 === 0)
    // never right of the ring before the band: the gutter is 28 px left of it
    expect(d).toContain('L272,')
    expect(Math.min(...xs)).toBe(272)
    // the band: 14 px above the head's top (86)
    expect(d).toContain(',86 L866,86')
  })

  it('keeps the band above the lens entry when the head starts lower', () => {
    expect(beadRoute({ x: 300, y: 600 }, { x: 900, y: 120 }, 140)).toContain(',102 L866,102')
  })

  it('without a head, keeps the band 18 px above the entry', () => {
    const d = beadRoute({ x: 300, y: 600 }, { x: 900, y: 120 })
    expect(d).toContain(',102 L866,102')
  })

  it('eases from 0 to 1', () => {
    for (const ease of [easeOut, easePull]) {
      expect(ease(0)).toBeCloseTo(0, 6)
      expect(ease(1)).toBeCloseTo(1, 6)
      expect(ease(0.5)).toBeGreaterThan(0)
      expect(ease(0.5)).toBeLessThan(1)
    }
    expect(easePull(-1)).toBeCloseTo(0, 6)
    expect(easePull(2)).toBeCloseTo(1, 6)
  })
})
describe('a landing always settles', () => {
  afterEach(() => vi.useRealTimers())

  it('settles when the lens reports the landing', async () => {
    let land
    const done = vi.fn()
    settleWithin(new Promise((r) => { land = r }), LAND_MAX_MS).then(done)
    land()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('settles after the bound when the lens never reports it (lost context, replaced animation)', async () => {
    vi.useFakeTimers()
    const done = vi.fn()
    settleWithin(new Promise(() => {}), LAND_MAX_MS).then(done)
    await vi.advanceTimersByTimeAsync(LAND_MAX_MS - 1)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('settles, never rejects, when the landing fails', async () => {
    await expect(settleWithin(Promise.reject(new Error('lost')), LAND_MAX_MS)).resolves.toBeUndefined()
  })
})

describe('the lens keeps its word to every bead', () => {
  it('resolves a bead when it lands, once', () => {
    const book = landingBook()
    const r = vi.fn()
    const landed = book.add(r)
    landed()
    landed()
    book.settleAll()
    expect(r).toHaveBeenCalledTimes(1)
    expect(book.size).toBe(0)
  })

  it('resolves an earlier bead when a second one replaces it in the air, and the second when it lands', () => {
    const book = landingBook()
    const first = vi.fn()
    const second = vi.fn()
    book.add(first)
    book.settleAll() // the second bead's drop settles what is still in the air
    const landed = book.add(second)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    landed()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('resolves every bead in the air when the context is lost or the tab hides', () => {
    const book = landingBook()
    const rs = [vi.fn(), vi.fn(), vi.fn()]
    rs.forEach((r) => book.add(r))
    book.settleAll()
    rs.forEach((r) => expect(r).toHaveBeenCalledTimes(1))
    expect(book.size).toBe(0)
  })
})

describe('the light lens hairlines', () => {
  const rule = 'rgba(27,20,40,0.10)'

  it('strengthen the rule colour by the look, so tuned A shows them stronger than B', () => {
    expect(hairlineColour(rule, 1 * 2.4)).toBe('rgba(27,20,40,0.24)')
    expect(hairlineColour(rule, 0.6 * 2.4)).toBe('rgba(27,20,40,0.144)')
  })

  it('cap at opaque, read rgb() as opaque, and pass anything else through', () => {
    expect(hairlineColour(rule, 20)).toBe('rgba(27,20,40,1)')
    expect(hairlineColour('rgb(1, 2, 3)', 0.5)).toBe('rgba(1,2,3,0.5)')
    expect(hairlineColour('#1B1428', 2)).toBe('#1B1428')
  })
})
