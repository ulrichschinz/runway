import { describe, expect, it } from 'vitest'

import { ASKING_SCOPES, COMMANDS, ownsKey, repeatsOnHold, resolveKey, shortcutSheet, visibleCursor } from '../src/shared/commands.js'
import messages from '../src/shared/messages.de.js'

const seqs = (c) => c.keys.map((k) => k.join(' '))

describe('the command table', () => {
  it('has unique ids', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('binds no key twice in a scope, and no global key in any other scope but an open question', () => {
    const global = COMMANDS.filter((c) => c.scope === 'global').flatMap(seqs)
    expect(new Set(global).size).toBe(global.length)
    for (const scope of new Set(COMMANDS.map((c) => c.scope).filter((s) => s !== 'global'))) {
      const keys = COMMANDS.filter((c) => c.scope === scope).flatMap(seqs)
      expect(new Set(keys).size, scope).toBe(keys.length)
      if (ASKING_SCOPES.includes(scope)) continue
      for (const k of keys) expect(global, `${scope}: ${k}`).not.toContain(k)
    }
  })

  it('lets no single key shadow the start of a chord', () => {
    const starts = new Set(COMMANDS.flatMap((c) => c.keys.filter((k) => k.length > 1).map((k) => k[0])))
    for (const c of COMMANDS) for (const k of c.keys) if (k.length === 1) expect(starts.has(k[0]), c.id).toBe(false)
  })

  it('names every command and group by a message key', () => {
    for (const c of COMMANDS) {
      expect(Object.hasOwn(messages, c.label), c.label).toBe(true)
      expect(Object.hasOwn(messages, c.group), c.group).toBe(true)
    }
  })
})

describe('resolving keys', () => {
  it('runs a single key in its scope only', () => {
    expect(resolveKey(null, 'x', ['rows'])).toEqual({ command: 'check', pending: null })
    expect(resolveKey(null, 'x', [])).toEqual({ command: null, pending: null })
    expect(resolveKey(null, '3', ['rows', 'next']).command).toBe('ctx.3')
    expect(resolveKey(null, '3', ['rows']).command).toBe(null)
    expect(resolveKey(null, 'd', ['rows', 'all']).command).toBe('toggleDone')
    expect(resolveKey(null, 'ArrowDown', ['rows']).command).toBe('cursor.down')
    expect(resolveKey(null, 'Enter', ['rows']).command).toBe('open')
    expect(resolveKey(null, 'e', ['rows']).command).toBe('edit')
    expect(resolveKey(null, 's', ['rows']).command).toBe('start')
    expect(resolveKey(null, 'z', []).command).toBe('undo')
  })

  it('lets the first listed scope win, global last: an open question answers with its keys', () => {
    expect(resolveKey(null, 'Escape', ['rows']).command).toBe('close')
    expect(resolveKey(null, 'Escape', ['step', 'inbox', 'rows']).command).toBe('step.back')
    expect(resolveKey(null, 'n', ['inbox', 'rows']).command).toBe('capture')
    expect(resolveKey(null, 'n', ['step', 'inbox', 'rows']).command).toBe('capture')
    expect(resolveKey(null, 'n', ['stepProject', 'step', 'inbox', 'rows']).command).toBe('step.new')
    expect(resolveKey(null, '3', ['step', 'inbox', 'rows']).command).toBe('step.3')
    expect(resolveKey(null, '3', ['inbox', 'rows']).command).toBe(null)
    expect(resolveKey(null, 'w', ['inbox', 'rows']).command).toBe('clarify.waiting')
    expect(resolveKey(null, 'w', ['rows']).command).toBe(null)
    expect(resolveKey(null, 'a', ['inbox', 'rows']).command).toBe('clarify.next')
  })

  it('moves a row with m then n, w or v', () => {
    expect(resolveKey(null, 'm', ['rows'])).toEqual({ command: null, pending: 'm' })
    expect(resolveKey('m', 'n', ['rows']).command).toBe('move.next')
    expect(resolveKey('m', 'w', ['rows']).command).toBe('move.waiting')
    expect(resolveKey('m', 'v', ['rows']).command).toBe('move.someday')
    expect(resolveKey(null, 'm', [])).toEqual({ command: null, pending: null })
  })

  it('waits for the second key of a chord, then runs it', () => {
    expect(resolveKey(null, 'g', ['rows'])).toEqual({ command: null, pending: 'g' })
    expect(resolveKey('g', 'w', ['rows'])).toEqual({ command: 'go.waiting', pending: null })
    expect(resolveKey('g', 's', []).command).toBe('go.someday')
    expect(resolveKey('g', 'q', ['rows'])).toEqual({ command: null, pending: null })
  })

  it('leaves keys alone while typing, inside a dialog, while composing, and with a modifier', () => {
    const el = (tagName, extra = {}) => ({ tagName, closest: () => null, ...extra })
    expect(ownsKey({ key: 'x', target: el('DIV') })).toBe(true)
    expect(ownsKey({ key: 'x', target: el('INPUT') })).toBe(false)
    expect(ownsKey({ key: 'x', target: el('TEXTAREA') })).toBe(false)
    expect(ownsKey({ key: 'x', target: el('SELECT') })).toBe(false)
    expect(ownsKey({ key: 'Enter', target: el('BUTTON') })).toBe(false)
    expect(ownsKey({ key: ' ', target: el('A') })).toBe(false)
    expect(ownsKey({ key: 'x', target: el('BUTTON') })).toBe(true)
    expect(ownsKey({ key: 'Enter', target: el('DIV') })).toBe(true)
    expect(ownsKey({ key: 'x', target: el('DIV', { isContentEditable: true }) })).toBe(false)
    expect(ownsKey({ key: 'x', target: el('BUTTON', { closest: (s) => (s === '[role="dialog"]' ? {} : null) }) })).toBe(false)
    expect(ownsKey({ key: 'x', isComposing: true, target: el('DIV') })).toBe(false)
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) expect(ownsKey({ key: 'x', [mod]: true, target: el('DIV') }), mod).toBe(false)
  })
})

describe('the ? sheet', () => {
  it('is generated from the table: every command once, commands sharing a label on one line', () => {
    const sheet = shortcutSheet()
    expect(sheet.map((g) => g.group)).toEqual(['keys.g.all', 'keys.g.lists', 'keys.g.rows', 'keys.g.inbox'])
    const rows = sheet.flatMap((g) => g.rows)
    expect(rows.find((r) => r.label === 'keys.move').keys).toEqual(['j', '↓', 'k', '↑'])
    expect(rows.find((r) => r.label === 'keys.delete').keys).toEqual(['Entf', '⌫'])
    expect(rows.find((r) => r.label === 'list.waiting').keys).toEqual(['g w'])
    expect(rows.find((r) => r.label === 'keys.ctx').keys).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(rows.find((r) => r.label === 'keys.moveTo').keys).toEqual(['m n', 'm w', 'm v'])
    expect(rows.find((r) => r.label === 'keys.cl.back').keys).toEqual(['Esc'])
    const keyCount = COMMANDS.reduce((n, c) => n + c.keys.length, 0)
    expect(rows.reduce((n, r) => n + r.keys.length, 0)).toBe(keyCount)
  })
})

describe('repeatsOnHold', () => {
  it('lets only the cursor keys repeat while held', () => {
    expect(repeatsOnHold('cursor.down')).toBe(true)
    expect(repeatsOnHold('cursor.up')).toBe(true)
    for (const id of ['check', 'delete', 'plan', 'toggleDone', 'undo', 'ctx.1', 'go.inbox']) {
      expect(repeatsOnHold(id)).toBe(false)
    }
  })
})

describe('visibleCursor', () => {
  it('keeps the cursor on a visible row and drops it when its row left the screen', () => {
    expect(visibleCursor(['a', 'b'], 'b')).toBe('b')
    expect(visibleCursor(['a', 'b'], 'c')).toBe(null)
    expect(visibleCursor([], 'a')).toBe(null)
    expect(visibleCursor(['a'], null)).toBe(null)
  })
})
