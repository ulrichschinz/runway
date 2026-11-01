import { describe, expect, it } from 'vitest'

import { parseTheme, resolveTheme, themeColorFor } from '../src/shared/theme.js'

describe('parseTheme', () => {
  it("accepts exactly the two values the old UI's useDarkMode writes", () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })

  it('treats anything else as no choice', () => {
    for (const value of [null, undefined, '', 'system', 'Dark', ' dark', 'auto', 1, ['dark']]) {
      expect(parseTheme(value), JSON.stringify(value)).toBeNull()
    }
  })
})

describe('resolveTheme', () => {
  it('follows the system when nothing is stored', () => {
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme(null, true)).toBe('dark')
  })

  it('a stored choice wins over the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system when the stored value names no scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('DARK', false)).toBe('light')
  })
})

describe('themeColorFor', () => {
  it('is the page background of each scheme', () => {
    expect(themeColorFor('light')).toBe('#fbf6ee')
    expect(themeColorFor('dark')).toBe('#1b1428')
  })
})
