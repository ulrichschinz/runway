// The message table against the two places that depend on it: the strings Android pins
// (the vectors' `strings` section) and every `t('…')` call in the source. A static scan,
// nothing is rendered (ADR 0007).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { followUpOptions } from '../src/shared/dates.js'
import { projectNameError } from '../src/shared/gtdRules.js'
import messages from '../src/shared/messages.de.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const vectors = JSON.parse(readFileSync(new URL('./vectors/gtd-rules.v1.json', import.meta.url), 'utf8'))

/** Every .js and .vue file under frontend/src. */
function sourceFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(js|vue)$/.test(entry.name) ? [path] : []
  })
}

/** `t('key'` and `t("key"` with a literal key; `$t` and `.t(` count too, `at(` or `get(` do not. */
const T_CALL = /(?<![\w])\$?t\(\s*(['"])([^'"\n]+)\1/g

function literalKeys() {
  const found = []
  for (const file of sourceFiles()) {
    // comment lines may show the pattern (`t('key')`) without calling it
    const code = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')
    for (const match of code.matchAll(T_CALL)) found.push({ file, key: match[2] })
  }
  return found
}

describe('the strings Android pins', () => {
  it('equal the message table exactly', () => {
    for (const [key, text] of Object.entries(vectors.strings)) {
      expect(messages[key], key).toBe(text)
    }
  })

  it('include every string the plan names', () => {
    const pinned = Object.values(vectors.strings)
    for (const text of [
      'Inbox', 'Nächste', 'Warten auf', 'Fällig', 'Stand {t}', 'Nachhaken', 'Neues Todo', 'In Inbox ✓',
      'Erledigt', 'Gelöscht', 'Rückgängig', 'Abhaken: {d}', 'Nicht gesendet', 'Alle', 'Nichts fällig',
      'Du wartest auf nichts', 'Inbox ist leer',
    ]) {
      expect(pinned).toContain(text)
    }
  })
})

describe('the message table', () => {
  it('holds only text: strings, or arrays of strings and string pairs, never markup', () => {
    const texts = (value) => (Array.isArray(value) ? value.flatMap(texts) : [value])
    for (const [key, value] of Object.entries(messages)) {
      for (const text of texts(value)) {
        expect(typeof text, key).toBe('string')
        expect(text, key).not.toMatch(/<[a-z/]/i)
      }
    }
  })

  it('has headings with exactly one emphasised word', () => {
    for (const [key, value] of Object.entries(messages).filter(([k]) => k.startsWith('h.'))) {
      expect(value, key).toHaveLength(3)
      expect(value[1].trim(), key).not.toBe('')
    }
  })

  it('keeps no +N form of the lens caption', () => {
    expect('lens.extraShort' in messages).toBe(false)
    expect(Object.values(messages).filter((v) => typeof v === 'string' && /\+\{n\}/.test(v))).toEqual([
      '+{n} ohne Kontext',
    ])
  })
})

describe('every t() call in frontend/src', () => {
  const calls = literalKeys()

  it('is found by the scan (the shared rules call it)', () => {
    expect(calls.some((c) => c.file.endsWith('contexts.js'))).toBe(true)
    expect(calls.some((c) => c.file.endsWith('dayProgress.js'))).toBe(true)
  })

  it('names a key the table has', () => {
    const missing = calls.filter((c) => !Object.hasOwn(messages, c.key))
    expect(missing.map((c) => `${c.file.slice(SRC.length + 1)}: ${c.key}`)).toEqual([])
  })
})

describe('the keys the rules return instead of calling t()', () => {
  // The static scan sees only literal t('…') calls; these keys are built or returned.
  const has = (key) => Object.hasOwn(messages, key)

  it('every projectNameError key exists', () => {
    const keys = [
      projectNameError('   '),
      projectNameError('x'.repeat(101)),
      projectNameError('a/b'),
      projectNameError('+x'),
      projectNameError('overview'),
      projectNameError('Garten', ['garten']),
    ]
    expect(keys).toEqual(['proj.err.empty', 'proj.err.long', 'proj.err.chars', 'proj.err.edge', 'proj.err.reserved', 'proj.err.exists'])
    expect(keys.filter((key) => !has(key))).toEqual([])
  })

  it('every followUpOptions label exists, on a weekday and before a weekend', () => {
    const labels = ['2026-10-28', '2026-10-30', '2026-10-31'].flatMap((today) => followUpOptions(today).map((o) => o.label))
    expect(labels).toContain('fu.monday')
    expect(labels).toContain('fu.tomorrow')
    expect(labels.filter((key) => !has(key))).toEqual([])
  })

  it('both lens caption keys exist (lensCaption picks one in a ternary)', () => {
    expect(['lens.short', 'lens.cap', 'lens.extra'].filter((key) => !has(key))).toEqual([])
  })
})
