import { describe, expect, it } from 'vitest'

import { copyFailedKey, maskKey, passwordError, roleAfter, roleError, shownText } from '../src/shared/settingsRules.js'

const KEY = 'rw_4f1c9e2b7a6d4c3f9a0b1e2d3c4b5a69'

describe('passwordError', () => {
  it('refuses before anything is sent', () => {
    expect(passwordError({ current: '', next: 'neu', confirm: 'neu' })).toBe('set.pw.needCurrent')
    expect(passwordError({ current: 'alt', next: '', confirm: '' })).toBe('set.pw.needNew')
    expect(passwordError({ current: 'alt', next: 'neu', confirm: 'nue' })).toBe('set.pw.mismatch')
  })

  it('lets a complete form through: the server checks the current password', () => {
    expect(passwordError({ current: 'alt', next: 'neu', confirm: 'neu' })).toBeNull()
  })
})

describe('maskKey', () => {
  it('never shows the key, only its last four characters', () => {
    const shown = maskKey(KEY)
    expect(shown).not.toContain(KEY.slice(0, -4))
    expect(shown.endsWith('5a69')).toBe(true)
    expect(shown.startsWith('•')).toBe(true)
  })

  it('shows only dots for a key too short to give four characters away', () => {
    expect(maskKey('abcd1234')).toMatch(/^•+$/)
  })

  it('is empty while the key has not loaded', () => {
    expect(maskKey(null)).toBe('')
    expect(maskKey(undefined)).toBe('')
  })
})

describe('shownText', () => {
  const step = `export RUNWAY_API_KEY='${KEY}'   # in ~/.zshenv\ncurl -H "X-Api-Key: ${KEY}"`

  it('masks every occurrence of the key while it is hidden', () => {
    const shown = shownText(step, KEY, false)
    expect(shown).not.toContain(KEY)
    expect(shown.split(maskKey(KEY))).toHaveLength(3)
    expect(shown).toContain("export RUNWAY_API_KEY='")
  })

  it('shows the text as it is once revealed', () => {
    expect(shownText(step, KEY, true)).toBe(step)
  })

  it('leaves a text without the key, or before the key has loaded, unchanged', () => {
    expect(shownText('claude mcp add … ${RUNWAY_API_KEY}', KEY, false)).toBe('claude mcp add … ${RUNWAY_API_KEY}')
    expect(shownText("export RUNWAY_API_KEY='<your-api-key>'", null, false)).toBe("export RUNWAY_API_KEY='<your-api-key>'")
  })
})

describe('roles', () => {
  it('gives the other of the two roles', () => {
    expect(roleAfter('admin')).toBe('user')
    expect(roleAfter('user')).toBe('admin')
  })

  it('says why the server refused', () => {
    expect(roleError(409)).toBe('set.admin.lastAdmin')
    expect(roleError(404)).toBe('set.admin.noUser')
    expect(roleError(undefined)).toBe('set.offline')
    expect(roleError(500)).toBe('set.failed')
  })
})

describe('copyFailedKey (review: a hand copy of a masked text takes the dots)', () => {
  it('asks to select and copy by hand when the shown text is the text to copy', () => {
    expect(copyFailedKey('https://runway.example/mcp', null)).toBe('set.copyFailed')
    expect(copyFailedKey('claude plugin update runway@runway', 'claude plugin update runway@runway')).toBe('set.copyFailed')
  })

  it('says to show the key first when the key is masked in what is shown', () => {
    const step = `export RUNWAY_API_KEY=${KEY}`
    expect(copyFailedKey(shownText(step, KEY, false), step)).toBe('set.copyFailedHidden')
    expect(copyFailedKey(maskKey(KEY), KEY)).toBe('set.copyFailedHidden')
  })

  it('asks only for the hand copy once the key is shown', () => {
    const step = `export RUNWAY_API_KEY=${KEY}`
    expect(copyFailedKey(shownText(step, KEY, true), step)).toBe('set.copyFailed')
  })
})
