import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UI_DEFAULT,
  currentUi,
  parseUi,
  rememberUi,
  resolveUi,
} from '../src/shared/uiFlag.js'

/** A Storage with only the two methods the switch uses, backed by a Map. */
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    entries: () => Object.fromEntries(map),
  }
}

/** A Storage that refuses every access, as a browser blocking site data does. */
const refusingStorage = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('SecurityError')
  },
}

// Values a query or the store may hold that name no UI.
const NOISE = ['NEU', 'Alt', 'new', 'old', ' neu', '', null, undefined, ['neu'], ['neu', 'alt'], 1, {}]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveUi', () => {
  // Since M16 (brief 0063) the new UI is the default; the old one stays reachable until M17.
  it('renders the new UI when nothing was chosen', () => {
    expect(UI_DEFAULT).toBe('neu')
    expect(resolveUi(undefined, null)).toBe('neu')
    expect(resolveUi(undefined, undefined)).toBe('neu')
  })

  it('still reaches the old UI through ?ui=alt or a stored alt', () => {
    expect(resolveUi('alt', null)).toBe('alt')
    expect(resolveUi(undefined, 'alt')).toBe('alt')
    expect(resolveUi('alt', 'neu')).toBe('alt')
  })

  it('uses the stored choice when the query names none', () => {
    expect(resolveUi(undefined, 'neu')).toBe('neu')
    expect(resolveUi(undefined, 'alt')).toBe('alt')
  })

  it('lets a valid query override the stored choice, in both directions', () => {
    expect(resolveUi('neu', 'alt')).toBe('neu')
    expect(resolveUi('alt', 'neu')).toBe('alt')
    expect(resolveUi('neu', null)).toBe('neu')
  })

  it('ignores a query value that names no UI', () => {
    for (const value of NOISE) {
      expect(resolveUi(value, 'neu')).toBe('neu')
      expect(resolveUi(value, 'alt')).toBe('alt')
      expect(resolveUi(value, null)).toBe('neu')
    }
  })

  it('ignores a stored value that names no UI', () => {
    for (const value of NOISE) {
      expect(resolveUi(undefined, value)).toBe('neu')
      expect(resolveUi('alt', value)).toBe('alt')
    }
  })
})

describe('parseUi', () => {
  it('accepts exactly the two words', () => {
    expect(parseUi('alt')).toBe('alt')
    expect(parseUi('neu')).toBe('neu')
    for (const value of NOISE) expect(parseUi(value)).toBeNull()
  })
})

describe('currentUi', () => {
  it('reads the stored choice under the key ui', () => {
    vi.stubGlobal('localStorage', memoryStorage({ ui: 'neu' }))
    expect(currentUi(undefined)).toBe('neu')
    expect(currentUi('alt')).toBe('alt')
  })

  it('renders the new UI in a browser that never chose', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(currentUi(undefined)).toBe('neu')
    expect(currentUi('alt')).toBe('alt')
  })

  it('falls back to the query or the default when storage refuses', () => {
    vi.stubGlobal('localStorage', refusingStorage)
    expect(currentUi(undefined)).toBe('neu')
    expect(currentUi('alt')).toBe('alt')
  })

  it('falls back when there is no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(currentUi(undefined)).toBe('neu')
    expect(currentUi('alt')).toBe('alt')
  })
})

describe('rememberUi', () => {
  it('stores a valid choice under the key ui', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    rememberUi('neu')
    expect(storage.entries()).toEqual({ ui: 'neu' })
    rememberUi('alt')
    expect(storage.entries()).toEqual({ ui: 'alt' })
  })

  it('leaves the stored choice alone for a value that names no UI', () => {
    const storage = memoryStorage({ ui: 'neu' })
    vi.stubGlobal('localStorage', storage)
    for (const value of NOISE) rememberUi(value)
    expect(storage.entries()).toEqual({ ui: 'neu' })
  })

  it('never throws when storage refuses the write or is missing', () => {
    vi.stubGlobal('localStorage', refusingStorage)
    expect(() => rememberUi('neu')).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(() => rememberUi('neu')).not.toThrow()
  })

  it('makes the next page load render the stored choice', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    rememberUi('alt')
    expect(currentUi(undefined)).toBe('alt')
    rememberUi('neu')
    expect(currentUi(undefined)).toBe('neu')
  })

  it('keeps a browser that went back to the old UI there, until it asks for the new one', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    rememberUi('alt')
    for (const value of NOISE) rememberUi(value)
    expect(currentUi(undefined)).toBe('alt')
    rememberUi('neu')
    expect(currentUi(undefined)).toBe('neu')
  })
})
