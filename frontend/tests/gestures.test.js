import { describe, expect, it } from 'vitest'

import {
  AXIS_SLOP_PX, FLICK_PX_S, SWIPE_MIN_PX, swipeAxis, swipeCompletes, swipeOffset, swipeThreshold, trayAt,
} from '../src/shared/gestures.js'

const touch = (dx, width = 380, axis = 'x') => ({ pointerType: 'touch', axis, dx, width })

describe('swipe to complete', () => {
  it('needs 35 % of the row, never less than 96 px', () => {
    expect(swipeThreshold(400)).toBe(140)
    expect(swipeThreshold(200)).toBe(SWIPE_MIN_PX)
    expect(swipeCompletes(touch(140, 400))).toBe(true)
    expect(swipeCompletes(touch(139, 400))).toBe(false)
    expect(swipeCompletes(touch(95, 200))).toBe(false)
    expect(swipeCompletes(touch(96, 200))).toBe(true)
  })

  it('completes on touch only: a mouse or a pen drag never does', () => {
    expect(swipeCompletes({ ...touch(300), pointerType: 'mouse' })).toBe(false)
    expect(swipeCompletes({ ...touch(300), pointerType: 'pen' })).toBe(false)
  })

  it('never completes a vertical gesture, an undecided one or a swipe to the left', () => {
    expect(swipeCompletes(touch(300, 380, 'y'))).toBe(false)
    expect(swipeCompletes(touch(300, 380, null))).toBe(false)
    expect(swipeCompletes(touch(-300))).toBe(false)
  })

  it('decides the axis once the finger has moved far enough, by the larger component', () => {
    expect(swipeAxis(3, 4)).toBe(null)
    expect(swipeAxis(AXIS_SLOP_PX, 0)).toBe('x')
    expect(swipeAxis(8, 12)).toBe('y')
    expect(swipeAxis(12, 12)).toBe('y')
    expect(swipeAxis(-30, 5)).toBe('x')
  })

  it('draws the row to the right only', () => {
    expect(swipeOffset(-40)).toBe(0)
    expect(swipeOffset(55)).toBe(55)
  })
})

describe('which tray a card lands in (the card stack)', () => {
  // five trays of 140 × 96 px in a row at y 600–696, 10 px apart
  const rects = [0, 1, 2, 3, 4].map((i) => ({ left: 100 + i * 150, right: 240 + i * 150, top: 600, bottom: 696 }))

  it('is the tray under the pointer, within 22 px while dragging and 30 px on release', () => {
    expect(trayAt(rects, 170, 650)).toBe(0)
    expect(trayAt(rects, 470, 650)).toBe(2)
    expect(trayAt(rects, 170, 580)).toBe(0)
    expect(trayAt(rects, 170, 575)).toBe(-1)
    expect(trayAt(rects, 170, 575, undefined, true)).toBe(0)
    expect(trayAt(rects, 170, 560, undefined, true)).toBe(-1)
  })

  it('is the tray the pointer is in, never its neighbour\'s margin, the same while dragging and on release', () => {
    // 15 px inside the fifth tray (left 700), 5 px inside the second (left 250): the neighbours' margins reach over both
    for (const release of [false, true]) {
      expect(trayAt(rects, 715, 650, undefined, release)).toBe(4)
      expect(trayAt(rects, 255, 650, undefined, release)).toBe(1)
      expect(trayAt(rects, 238, 650, undefined, release)).toBe(0)
    }
    // the trays on the phone, 6 px apart: a third of each tray is no longer its left neighbour's
    const phone = [0, 1, 2, 3, 4].map((i) => ({ left: 16 + i * 66, right: 76 + i * 66, top: 600, bottom: 692 }))
    expect(trayAt(phone, 84, 640, undefined, true)).toBe(1)
    expect(trayAt(phone, 84, 640)).toBe(1)
  })

  it('is the nearest tray when the pointer is in a gap or just outside, by distance not by order', () => {
    // in the 10 px gap between the first and the second tray (240–250): the closer edge wins
    expect(trayAt(rects, 242, 650)).toBe(0)
    expect(trayAt(rects, 248, 650, undefined, true)).toBe(1)
    // two rows (seven trays and more): just below the first row, the tray above, not the one before it
    const grid = [0, 1, 2, 3].flatMap((c) => [0, 1].map((row) => ({ left: 100 + c * 150, right: 240 + c * 150, top: 600 + row * 70, bottom: 660 + row * 70 })))
    // rects are column-major here, so findIndex would have met column 0, row 1 first
    expect(trayAt(grid, 400, 664, undefined, true)).toBe(4)
    expect(trayAt(grid, 400, 667, undefined, true)).toBe(5)
  })

  it('keeps a card let go over a tray in that tray, however fast the hand still moved', () => {
    // over the first tray's centre, moving down at 1200 px/s: 0.12 s ahead would be 144 px below it
    expect(trayAt(rects, 170, 648, { vx: 0, vy: 1200 }, true)).toBe(0)
    expect(trayAt(rects, 470, 648, { vx: 1500, vy: 0 }, true)).toBe(2)
  })

  it('is nothing for a slow release over no tray', () => {
    expect(trayAt(rects, 400, 300, { vx: 0, vy: 600 }, true)).toBe(-1)
  })

  it('looks a little ahead along the hand\'s velocity', () => {
    // 0.12 s at 1000 px/s down carries 520 → 640
    expect(trayAt(rects, 170, 520, { vx: 0, vy: 1000 })).toBe(0)
  })

  it('sends a flick to the tray closest to its direction, and nowhere when none is close enough', () => {
    const from = { x: 545, y: 300 }
    expect(FLICK_PX_S).toBe(650)
    // down and a little right from x 545: the fourth tray (centre 620); down and left: the third or the second
    expect(trayAt(rects, from.x, from.y, { vx: 200, vy: 900 }, true)).toBe(3)
    expect(trayAt(rects, from.x, from.y, { vx: -200, vy: 900 }, true)).toBe(2)
    expect(trayAt(rects, from.x, from.y, { vx: -400, vy: 900 }, true)).toBe(1)
    // upwards: away from every tray
    expect(trayAt(rects, from.x, from.y, { vx: 0, vy: -900 }, true)).toBe(-1)
    // the same direction, too slow to be a flick
    expect(trayAt(rects, from.x, from.y, { vx: 100, vy: 500 }, true)).toBe(-1)
    // only on release
    expect(trayAt(rects, from.x, from.y, { vx: 200, vy: 900 })).toBe(-1)
  })
})
