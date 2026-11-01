// The capture capping rule (plan M6, brief 0052). The first block is Android's
// `gtd/CappingTest.kt` case for case, so both clients answer the same; the second adds what
// the web relies on besides.

import { describe, expect, it } from 'vitest'

import { MAX_DESCRIPTION_CHARS, MAX_NOTE_BYTES, cap, truncateUtf8 } from '../src/shared/capping.js'

const bytes = (s) => new TextEncoder().encode(s).length
const codePoints = (s) => Array.from(s).length

describe("Android's CappingTest.kt", () => {
  it('description is trimmed', () => {
    expect(cap('  Milch kaufen \n')).toEqual({ description: 'Milch kaufen', note: null })
  })

  it('blank capture gives nothing', () => {
    expect(cap('   \n\t')).toBeNull()
    expect(cap('', '  ')).toBeNull()
  })

  it('exactly 500 chars stay whole', () => {
    const s = 'a'.repeat(500)
    expect(cap(s)).toEqual({ description: s, note: null })
  })

  it('over 500 chars - first 500 stay, rest goes to note', () => {
    const p = cap('a'.repeat(500) + 'REST')
    expect(p.description).toBe('a'.repeat(500))
    expect(p.note).toBe('REST')
  })

  it('rest goes before an existing note', () => {
    const p = cap('b'.repeat(501), 'the note')
    expect(p.description).toHaveLength(500)
    expect(p.note).toBe('b\n\nthe note')
  })

  it('cap counts code points and never splits a surrogate pair', () => {
    const emoji = '😀'
    const p = cap(emoji.repeat(501))
    expect(codePoints(p.description)).toBe(500)
    expect(p.note).toBe(emoji)
  })

  it('note is capped at 32 KB of UTF-8', () => {
    const p = cap('x', 'ä'.repeat(20_000))
    expect(bytes(p.note)).toBeLessThanOrEqual(MAX_NOTE_BYTES)
    expect(p.note).toHaveLength(MAX_NOTE_BYTES / 2)
  })

  it('line breaks in the description collapse to one space', () => {
    expect(cap('eins\n\n  zwei').description).toBe('eins zwei')
  })

  it('only a note - its first line becomes the description', () => {
    expect(cap('', 'Titel\nmehr Text')).toEqual({ description: 'Titel', note: 'mehr Text' })
  })

  it('truncateUtf8 keeps short strings', () => {
    expect(truncateUtf8('abc', 3)).toBe('abc')
    expect(truncateUtf8('abc', 2)).toBe('ab')
    expect(truncateUtf8('€', 2)).toBe('')
  })
})

describe('the web besides', () => {
  it('keeps inner spaces and tabs, which Taskwarrior stores as typed', () => {
    expect(cap(' Leer  zeichen\tTab ').description).toBe('Leer  zeichen\tTab')
  })

  it('collapses \\r\\n and lone \\r like \\n, with the spaces around them', () => {
    expect(cap('a \r\n b\rc').description).toBe('a b c')
  })

  it('drops the spaces at the cut and before the rest', () => {
    const p = cap('x'.repeat(MAX_DESCRIPTION_CHARS - 1) + '  Rest')
    expect(p.description).toBe('x'.repeat(MAX_DESCRIPTION_CHARS - 1))
    expect(p.note).toBe('Rest')
  })

  it('never cuts a 4-byte code point at the note limit', () => {
    const note = 'a'.repeat(MAX_NOTE_BYTES - 2) + '😀'
    const p = cap('x', note)
    expect(p.note).toBe('a'.repeat(MAX_NOTE_BYTES - 2))
  })

  it('only a note split by a lone \\r keeps the first line only, as Capping.kt does', () => {
    expect(cap('', 'Titel\rmehr')).toEqual({ description: 'Titel', note: null })
    expect(cap('', 'Titel\r\nmehr')).toEqual({ description: 'Titel', note: 'mehr' })
  })
})
