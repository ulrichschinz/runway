import { describe, expect, it } from 'vitest'

import {
  AXIS_SLOP_PX, SWIPE_MIN_PX, swipeAxis, swipeCompletes, swipeOffset, swipeThreshold,
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
