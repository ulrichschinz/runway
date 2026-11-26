import { describe, expect, it } from 'vitest'

import { canRevoke, day, keyFile, keyName, keyStateKey, legacyDeadline, oneTimeKey, orderedKeys } from '../src/shared/apiKeys.js'

// A placeholder in the key's shape, not a key: the secret part is not 43 characters.
const FRESH = 'rwk_0123456789abcdef_not-a-real-secret'

const row = (over) => ({
  key_id: '0123456789abcdef', label: '', kind: 'issued', prefix: 'rwk_0123456789abcdef',
  created_at: '2026-11-25T10:00:00+00:00', expires_at: '2027-11-25T10:00:00+00:00',
  revoked_at: null, last_used_at: null, state: 'active', ...over,
})

describe('oneTimeKey (brief 0070: shown once, forgotten only after a confirmation)', () => {
  it('holds a fresh key until the person confirms', () => {
    const once = oneTimeKey()
    expect(once.show(FRESH)).toBe(FRESH)
    expect(once.dismiss(false)).toEqual({ forgotten: false, reason: 'set.key.confirmFirst' })
    expect(once.key).toBe(FRESH)
    expect(once.dismiss(true)).toEqual({ forgotten: true })
    expect(once.key).toBeNull()
  })

  it('holds nothing for an empty answer', () => {
    const once = oneTimeKey()
    expect(once.show('')).toBeNull()
    expect(once.dismiss(false)).toEqual({ forgotten: true })
  })

  it('writes nowhere: no storage is touched', () => {
    const touched = []
    const storage = { setItem: (k) => touched.push(k), getItem: () => null }
    globalThis.localStorage = storage
    const once = oneTimeKey()
    once.show(FRESH)
    once.dismiss(true)
    expect(touched).toEqual([])
    delete globalThis.localStorage
  })
})

describe('key rows', () => {
  it('names a row by its label, else its public prefix, and a legacy key as such', () => {
    expect(keyName(row({ label: 'laptop agent' }))).toEqual({ text: 'laptop agent' })
    expect(keyName(row())).toEqual({ text: 'rwk_0123456789abcdef' })
    expect(keyName(row({ kind: 'legacy', prefix: '' }))).toEqual({ key: 'set.key.legacy' })
  })

  it('only an active key can be revoked', () => {
    expect(canRevoke(row())).toBe(true)
    expect(canRevoke(row({ state: 'revoked' }))).toBe(false)
    expect(canRevoke(row({ state: 'expired' }))).toBe(false)
    expect(keyStateKey(row({ state: 'expired' }))).toBe('set.key.expired')
  })

  it('lists active keys first, keeping the server order within each group', () => {
    const list = [row({ key_id: 'a', state: 'revoked' }), row({ key_id: 'b' }), row({ key_id: 'c', state: 'expired' }), row({ key_id: 'd' })]
    expect(orderedKeys(list).map((k) => k.key_id)).toEqual(['b', 'd', 'a', 'c'])
    expect(orderedKeys(null)).toEqual([])
  })

  it('formats a day in UTC', () => {
    expect(day('2027-01-15T00:00:00+00:00')).toBe('15.01.2027')
    expect(day(null)).toBe('')
    expect(day('nonsense')).toBe('')
  })

  it('names the day an active legacy key stops working, and nothing once it is revoked', () => {
    const legacy = row({ kind: 'legacy', prefix: '', expires_at: '2027-01-15T00:00:00+00:00' })
    expect(legacyDeadline([row(), legacy])).toBe('15.01.2027')
    expect(legacyDeadline([row(), { ...legacy, state: 'revoked' }])).toBe('')
  })
})

describe('keyFile', () => {
  it('holds the key and where it belongs', () => {
    const file = keyFile(FRESH, 'https://runway.example')
    expect(file.name).toBe('runway-api-key.txt')
    expect(file.text.trim().split('\n').at(-1)).toBe(FRESH)
    expect(file.text).toContain('https://runway.example')
  })
})
