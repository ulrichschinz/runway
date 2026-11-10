import { describe, expect, it } from 'vitest'
import { clampLevel, flatLensShape, heightToLevel, levelToHeight } from '../src/shared/lensMath.js'

describe('the volume-true level', () => {
  it('puts half the volume exactly at the middle, and the ends at the ends', () => {
    expect(levelToHeight(0)).toBeCloseTo(0, 9)
    expect(levelToHeight(0.5)).toBeCloseTo(0.5, 9)
    expect(levelToHeight(1)).toBeCloseTo(1, 7)
  })

  it('is the spherical cap: height and volume invert each other', () => {
    for (const level of [0.01, 1 / 7, 0.25, 3 / 7, 0.6, 6 / 7, 0.99]) {
      expect(heightToLevel(levelToHeight(level))).toBeCloseTo(level, 7)
    }
    // a cap a quarter of the diameter high holds 5/32 of the sphere
    expect(heightToLevel(0.25)).toBeCloseTo(5 / 32, 9)
  })

  it('rises fast near the ends and slowly round the waist, never backwards', () => {
    let last = -1
    for (let i = 0; i <= 100; i++) {
      const h = levelToHeight(i / 100)
      expect(h).toBeGreaterThan(last)
      last = h
    }
    // the first seventh of the volume fills more than a seventh of the height
    expect(levelToHeight(1 / 7)).toBeGreaterThan(1 / 7)
    expect(levelToHeight(1 / 7)).toBeCloseTo(0.2379, 3)
  })

  it('clamps what is out of range or not a number', () => {
    expect(levelToHeight(-0.5)).toBe(levelToHeight(0))
    expect(levelToHeight(2)).toBe(levelToHeight(1))
    expect(clampLevel(Number.NaN)).toBe(0)
    expect(clampLevel(undefined)).toBe(0)
    expect(clampLevel(0.3)).toBe(0.3)
  })
})

describe('the flat lens', () => {
  it('keeps the liquid inside the glass, its surface at the volume-true height', () => {
    const s = flatLensShape(0.5, 104)
    expect(s.rl).toBeLessThan(s.r)
    expect(s.top).toBeCloseTo(s.cy, 6) // half full: the surface through the centre
    expect(s.chord).toBeCloseTo(s.rl, 6)
    expect(s.surface).toBe(true)
  })

  it('shows no liquid when empty and no surface when full', () => {
    expect(flatLensShape(0, 52)).toMatchObject({ liquid: false, surface: false })
    const full = flatLensShape(1, 52)
    expect(full).toMatchObject({ liquid: true, surface: false })
    expect(full.top).toBeCloseTo(full.cy - full.rl, 6)
  })

  it('scales with the slot', () => {
    const a = flatLensShape(3 / 7, 52)
    const b = flatLensShape(3 / 7, 104)
    expect(b.top).toBeCloseTo(a.top * 2, 6)
    expect(b.r).toBeCloseTo(a.r * 2, 6)
  })
})
