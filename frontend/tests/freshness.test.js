import { describe, expect, it } from 'vitest'

import { REFRESH_GAP_MS, afterRefresh, mayRefresh } from '../src/composables/useFreshness.js'
import { timeOf } from '../src/shared/dates.js'

const T0 = Date.UTC(2026, 10, 1, 8, 41) // 09:41 in Berlin

describe('the refresh throttle', () => {
  it('lets the first refresh through', () => {
    expect(mayRefresh(null, T0)).toBe(true)
  })

  it('allows at most one refresh per 30 s', () => {
    expect(REFRESH_GAP_MS).toBe(30_000)
    expect(mayRefresh(T0, T0 + 1)).toBe(false)
    expect(mayRefresh(T0, T0 + 29_999)).toBe(false)
    expect(mayRefresh(T0, T0 + 30_000)).toBe(true)
  })

  it('takes another gap', () => {
    expect(mayRefresh(T0, T0 + 5000, { gap: 5000 })).toBe(true)
  })

  it('lets the network’s return after a failed refresh through at once', () => {
    expect(mayRefresh(T0, T0 + 1000, { reconnect: true })).toBe(true)
  })
})

describe('the freshness after a refresh', () => {
  it('a success moves the Stand to when it started and clears offline', () => {
    expect(afterRefresh({ at: T0, offline: true }, { ok: true, at: T0 + 60_000 })).toEqual({ at: T0 + 60_000, offline: false })
  })

  it('a failure keeps the Stand and sets offline', () => {
    expect(afterRefresh({ at: T0, offline: false }, { ok: false, at: T0 + 60_000 })).toEqual({ at: T0, offline: true })
    expect(afterRefresh({ at: null, offline: false }, { ok: false, at: T0 })).toEqual({ at: null, offline: true })
  })
})

describe('"Stand hh:mm"', () => {
  it('is the time of day in the server’s zone', () => {
    expect(timeOf(T0)).toBe('09:41')
    expect(timeOf(new Date(T0))).toBe('09:41')
  })

  it('pads and uses 24 hours', () => {
    expect(timeOf(Date.UTC(2026, 10, 1, 23, 5))).toBe('00:05') // the next day in Berlin
    expect(timeOf(Date.UTC(2026, 10, 1, 12, 0))).toBe('13:00')
  })

  it('follows summer time', () => {
    expect(timeOf(Date.UTC(2026, 6, 1, 7, 41))).toBe('09:41')
  })
})
