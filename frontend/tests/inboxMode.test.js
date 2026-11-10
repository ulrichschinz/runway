import { afterEach, describe, expect, it, vi } from 'vitest'

import { INBOX_MODES, defaultInboxMode, readInboxMode, resolveInboxMode, writeInboxMode } from '../src/shared/inboxMode.js'

/** A Storage with only the two methods used, backed by a Map. */
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    entries: () => Object.fromEntries(map),
  }
}

const refusingStorage = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('SecurityError')
  },
}

const DESKTOP = { coarse: false, phone: false }
const TOUCH = { coarse: true, phone: false }
const PHONE = { coarse: false, phone: true }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Inbox mode', () => {
  it('starts as the stack on a touch screen or a phone, and as the list elsewhere', () => {
    expect(defaultInboxMode(DESKTOP)).toBe('list')
    expect(defaultInboxMode(TOUCH)).toBe('stack')
    expect(defaultInboxMode(PHONE)).toBe('stack')
    expect(defaultInboxMode({ coarse: true, phone: true })).toBe('stack')
  })

  it('keeps what the person chose, on any device', () => {
    expect(resolveInboxMode('stack', DESKTOP)).toBe('stack')
    expect(resolveInboxMode('list', TOUCH)).toBe('list')
    expect(INBOX_MODES).toEqual(['list', 'stack'])
  })

  it('ignores a stored value that names no mode', () => {
    for (const noise of ['Stack', 'LIST', '', null, undefined, 'stapel', ['stack']]) {
      expect(resolveInboxMode(noise, DESKTOP), String(noise)).toBe('list')
      expect(resolveInboxMode(noise, PHONE), String(noise)).toBe('stack')
    }
  })

  it('is remembered in localStorage["inboxMode"]', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    expect(readInboxMode(DESKTOP)).toBe('list')
    writeInboxMode('stack')
    expect(storage.entries()).toEqual({ inboxMode: 'stack' })
    expect(readInboxMode(DESKTOP)).toBe('stack')
    writeInboxMode('kanban')
    expect(storage.entries()).toEqual({ inboxMode: 'stack' })
  })

  it('falls back to the device default when storage refuses, and writes nothing', () => {
    vi.stubGlobal('localStorage', refusingStorage)
    expect(readInboxMode(TOUCH)).toBe('stack')
    expect(readInboxMode(DESKTOP)).toBe('list')
    expect(() => writeInboxMode('stack')).not.toThrow()
  })
})
