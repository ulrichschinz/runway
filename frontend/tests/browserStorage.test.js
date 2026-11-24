/**
 * The browser storage rules (brief 0075, ADR 0047): one inventory, one access path, account data
 * namespaced by a stable account id, an explicit logout that purges it, a 401 that only locks.
 * Pure: every function takes the storage as an argument, so a Map stands in for the profile.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CLASS, INVENTORY, KEY, LEGACY, accountOf, bindAccount, draftKey, forAccount, lockSession, outboxKey,
  pendingChanges, purgeAccount, readKey, removeKey, signOut, startSession, writeKey,
} from '../src/shared/browserStorage.js'

function memory(entries = []) {
  const map = new Map(entries)
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}
const refusing = {
  getItem() {
    throw new DOMException('denied', 'SecurityError')
  },
  setItem() {
    throw new DOMException('full', 'QuotaExceededError')
  },
  removeItem() {
    throw new DOMException('denied', 'SecurityError')
  },
}
const queue = (...ops) => JSON.stringify({ v: 1, ops })
const op = (id, user, label = id) => ({ id, kind: 'capture', method: 'POST', path: '/inbox', body: { description: label }, state: 'queued', user, at: 1, label })

describe('the inventory', () => {
  it('gives every key a data class', () => {
    for (const entry of INVENTORY) expect(Object.values(CLASS)).toContain(entry.dataClass)
  })

  it('only UI preferences are shared between accounts', () => {
    const shared = INVENTORY.filter((k) => !k.accountBound).map((k) => k.name).sort()
    expect(shared).toEqual(['inboxMode', 'theme', 'ui'])
    expect(INVENTORY.filter((k) => !k.accountBound).every((k) => k.dataClass === CLASS.PREFERENCE)).toBe(true)
  })

  it('task content lives only under an account namespace', () => {
    expect(KEY.outbox).toBe('outbox:{account}')
    expect(KEY.draft).toBe('captureDraft:{account}')
  })

  it('declares the legacy keys so the snapshot shows what is still read for migration', () => {
    expect(Object.values(LEGACY).sort()).toEqual(['captureDraft', 'email', 'fullName', 'outbox', 'role'])
  })
})

describe('access', () => {
  it('reads null for an absent key and undefined when storage refuses', () => {
    expect(readKey('theme', memory())).toBe(null)
    expect(readKey('theme', refusing)).toBe(undefined)
    expect(readKey('theme', null)).toBe(undefined)
  })

  it('reports a refused write instead of throwing', () => {
    expect(writeKey('theme', 'dark', refusing)).toBe(false)
    const s = memory()
    expect(writeKey('theme', 'dark', s)).toBe(true)
    expect(removeKey('theme', s)).toBe(true)
    expect(removeKey('theme', refusing)).toBe(false)
  })
})

describe('the account namespace', () => {
  it('needs a bound, well-formed account id', () => {
    expect(forAccount(KEY.outbox, '42')).toBe('outbox:42')
    expect(forAccount(KEY.outbox, null)).toBe(null)
    expect(forAccount(KEY.outbox, '')).toBe(null)
    expect(forAccount(KEY.outbox, '../x')).toBe(null)
    expect(forAccount(KEY.outbox, 'a:b')).toBe(null)
    expect(outboxKey(memory())).toBe(null)
    expect(draftKey(memory([['accountId', '3']]))).toBe('captureDraft:3')
    expect(accountOf(memory([['accountId', 'x'.repeat(65)]]))).toBe(null)
  })

  it('a new session forgets the previous account before its token is used', () => {
    const s = memory([['accountId', '1'], ['username', 'alice'], ['token', 'old']])
    startSession({ token: 'new', username: 'bob' }, s)
    expect(accountOf(s)).toBe(null)
    expect(outboxKey(s)).toBe(null)
    expect(s.map.get('token')).toBe('new')
    expect(s.map.get('username')).toBe('bob')
  })

  it('binding refuses an id it cannot namespace by', () => {
    const s = memory()
    expect(bindAccount({ accountId: undefined, username: 'alice' }, s)).toBe(false)
    expect(bindAccount({ accountId: 'a/b', username: 'alice' }, s)).toBe(false)
    expect(accountOf(s)).toBe(null)
  })

  it("two accounts' keys never coincide", () => {
    const a = memory()
    bindAccount({ accountId: '1', username: 'alice' }, a)
    const b = memory()
    bindAccount({ accountId: '2', username: 'alice' }, b)
    expect(outboxKey(a)).not.toBe(outboxKey(b))
    expect(draftKey(a)).not.toBe(draftKey(b))
  })
})

describe('the one-time legacy migration', () => {
  it("moves the signed-in user's ops and draft into the namespace and leaves the others'", () => {
    const s = memory([
      ['outbox', queue(op('a1', 'alice'), op('b1', 'bob'))],
      ['captureDraft', JSON.stringify({ user: 'alice', tab: 't', text: 'Entwurf' })],
      ['role', 'admin'], ['fullName', 'A'], ['email', 'a@x'],
    ])
    expect(bindAccount({ accountId: '1', username: 'alice' }, s)).toBe(true)
    expect(JSON.parse(s.map.get('outbox:1')).ops.map((o) => o.id)).toEqual(['a1'])
    expect(JSON.parse(s.map.get('outbox')).ops.map((o) => o.id)).toEqual(['b1'])
    expect(JSON.parse(s.map.get('captureDraft:1')).text).toBe('Entwurf')
    expect(s.map.has('captureDraft')).toBe(false)
    for (const k of ['role', 'fullName', 'email']) expect(s.map.has(k)).toBe(false)
  })

  it('removes the legacy queue once nothing is left in it, and never duplicates an op', () => {
    const s = memory([['outbox', queue(op('a1', 'alice'))], ['outbox:1', queue(op('a1', 'alice'))]])
    bindAccount({ accountId: '1', username: 'alice' }, s)
    expect(s.map.has('outbox')).toBe(false)
    expect(JSON.parse(s.map.get('outbox:1')).ops.map((o) => o.id)).toEqual(['a1'])
  })

  it("leaves another user's legacy draft where it is", () => {
    const s = memory([['captureDraft', JSON.stringify({ user: 'bob', tab: 't', text: 'Bobs' })]])
    bindAccount({ accountId: '1', username: 'alice' }, s)
    expect(s.map.has('captureDraft:1')).toBe(false)
    expect(s.map.has('captureDraft')).toBe(true)
  })

  it('does not overwrite a draft already in the namespace', () => {
    const s = memory([
      ['captureDraft', JSON.stringify({ user: 'alice', tab: 't', text: 'alt' })],
      ['captureDraft:1', JSON.stringify({ user: 'alice', tab: 't', text: 'neu' })],
    ])
    bindAccount({ accountId: '1', username: 'alice' }, s)
    expect(JSON.parse(s.map.get('captureDraft:1')).text).toBe('neu')
  })
})

describe('the outbox decision on logout', () => {
  it('counts the own namespace and every legacy op, nobody else’s namespace', () => {
    const s = memory([
      ['accountId', '1'],
      ['outbox:1', queue(op('a1', 'alice'), op('a2', 'alice'))],
      ['outbox:2', queue(op('b9', 'bob'))],
      ['outbox', queue(op('x', 'carol'))],
    ])
    expect(pendingChanges(s)).toBe(3)
  })

  it('an empty or unreadable queue is nothing to ask about', () => {
    expect(pendingChanges(memory([['accountId', '1'], ['outbox:1', queue()]]))).toBe(0)
    expect(pendingChanges(memory([['accountId', '1'], ['outbox:1', 'not json']]))).toBe(0)
    expect(pendingChanges(refusing)).toBe(0)
  })

  it('Abbrechen changes nothing and stays on the page', () => {
    const s = memory([['accountId', '1'], ['token', 't'], ['outbox:1', queue(op('a1', 'alice'))]])
    const before = new Map(s.map)
    const left = []
    const asked = []
    expect(signOut({ storage: s, confirm: (n) => (asked.push(n), false), leave: () => left.push(1) })).toBe(false)
    expect(asked).toEqual([1])
    expect(s.map).toEqual(before)
    expect(left).toEqual([])
  })

  it('confirmed, it purges and leaves; with nothing pending it does not ask', () => {
    const s = memory([['accountId', '1'], ['token', 't'], ['theme', 'dark']])
    const left = []
    expect(signOut({ storage: s, confirm: () => { throw new Error('asked') }, leave: () => left.push(1) })).toBe(true)
    expect(Object.fromEntries(s.map)).toEqual({ theme: 'dark' })
    expect(left).toEqual([1])
  })
})

describe('purge and lock', () => {
  const full = () => memory([
    ['token', 't'], ['username', 'alice'], ['accountId', '1'],
    ['outbox:1', queue(op('a1', 'alice'))], ['captureDraft:1', '{"user":"alice","text":"x"}'],
    ['outbox:2', queue(op('b1', 'bob'))], ['captureDraft:2', '{"user":"bob","text":"y"}'],
    ['outbox', queue(op('c', 'carol'))], ['captureDraft', '{}'], ['role', 'admin'], ['fullName', 'A'], ['email', 'e'],
    ['theme', 'dark'], ['ui', 'neu'], ['inboxMode', 'clarify'],
  ])

  it("purge removes this account's data and every legacy key, and keeps preferences and other locked accounts", () => {
    const s = full()
    purgeAccount(s)
    expect([...s.map.keys()].sort()).toEqual(['captureDraft:2', 'inboxMode', 'outbox:2', 'theme', 'ui'])
  })

  it('purge works with storage that refuses, without throwing', () => {
    expect(() => purgeAccount(refusing)).not.toThrow()
  })

  it('a lock only drops the token: the namespace waits for the same account', () => {
    const s = full()
    lockSession(s)
    expect(s.map.has('token')).toBe(false)
    expect(accountOf(s)).toBe('1')
    expect(s.map.has('outbox:1')).toBe(true)
    expect(s.map.has('captureDraft:1')).toBe(true)
  })
})

// The access rule is held by a scan, as `threeIsolation.test.js` holds the three.js chunk: a
// storage call anywhere else would bypass the inventory, the namespace and the purge.
describe('one access path', () => {
  const SRC = fileURLToPath(new URL('../src', import.meta.url))
  const files = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(js|mjs|vue|ts)$/.test(name) ? [path] : []
  })
  const sources = files(SRC).map((path) => ({ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))

  it('scans the sources', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it('no file but shared/browserStorage.js touches localStorage, sessionStorage or indexedDB', () => {
    const touching = sources
      .filter((s) => /\b(localStorage|sessionStorage|indexedDB)\b/.test(s.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
      .map((s) => s.file)
    expect(touching).toEqual(['shared/browserStorage.js'])
  })
})
