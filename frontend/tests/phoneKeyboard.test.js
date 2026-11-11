import { describe, expect, it } from 'vitest'
import { KEYBOARD_MIN_PX, isTextEntry, keyboardOpen } from '../src/shared/phoneKeyboard.js'

describe('keyboardOpen', () => {
  // Pixel 9 in Chrome: 915 px layout viewport, Gboard about 336 px (m3)
  it('is open with a text field focused and the visual viewport a keyboard shorter', () => {
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 579, entry: true })).toBe(true)
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 915 - KEYBOARD_MIN_PX, entry: true })).toBe(true)
  })

  it('is closed for a focus nobody tapped (the Inbox focuses its field on open)', () => {
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 915, entry: true })).toBe(false)
  })

  it('is closed without a text field, however small the visual viewport (pinch-zoom)', () => {
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 300, entry: false })).toBe(false)
  })

  it('is closed for the URL bar sliding away', () => {
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 859, entry: true })).toBe(false)
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: 915 - KEYBOARD_MIN_PX + 1, entry: true })).toBe(false)
  })

  it('is closed where the browser has no visual viewport, or before layout', () => {
    expect(keyboardOpen({ layoutHeight: 915, visualHeight: null, entry: true })).toBe(false)
    expect(keyboardOpen({ layoutHeight: 0, visualHeight: 0, entry: true })).toBe(false)
  })
})

describe('isTextEntry', () => {
  it('takes text inputs, textareas and contenteditable', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT', type: 'password' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT', type: 'date' })).toBe(true)
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true)
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('leaves out buttons, checkboxes, links and fields that take no typing', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'button' })).toBe(false)
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false)
    expect(isTextEntry({ tagName: 'A' })).toBe(false)
    expect(isTextEntry({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false)
    expect(isTextEntry({ tagName: 'TEXTAREA', disabled: true })).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})
