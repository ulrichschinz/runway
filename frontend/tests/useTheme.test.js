import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useTheme is the one composable of M1 with effects; these fakes stand in for the three browser
// objects it touches, so its lifetime can be tested in node without mounting anything.
function fakeBrowser() {
  const classes = new Set()
  const root = { dataset: {}, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } }
  const meta = { content: '', setAttribute: (_, v) => (meta.content = v) }
  const listeners = []
  const media = { matches: false, addEventListener: (_, fn) => listeners.push(fn) }
  const store = new Map()
  vi.stubGlobal('document', { documentElement: root, querySelector: () => meta })
  vi.stubGlobal('window', { matchMedia: () => media })
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  return {
    root,
    classes,
    meta,
    store,
    systemTurns: (dark) => listeners.forEach((fn) => fn({ matches: dark })),
  }
}

let browser
beforeEach(() => {
  vi.resetModules()
  browser = fakeBrowser()
})
afterEach(() => vi.unstubAllGlobals())

describe('useTheme', () => {
  it('keeps the document in step after the component that called it first unmounts', async () => {
    const { useTheme } = await import('../src/composables/useTheme.js')
    const scope = effectScope()
    const { setChoice } = scope.run(() => useTheme()) // what a component's setup does
    expect(browser.root.dataset.theme).toBe('light')
    scope.stop() // what its unmount does

    setChoice('dark')
    expect(browser.store.get('theme')).toBe('dark')
    expect(browser.root.dataset.theme).toBe('dark')
    expect(browser.classes.has('dark')).toBe(true)
    expect(browser.meta.content).not.toBe('')

    setChoice('system')
    expect(browser.store.has('theme')).toBe(false)
    browser.systemTurns(true)
    expect(browser.root.dataset.theme).toBe('dark')
    browser.systemTurns(false)
    expect(browser.root.dataset.theme).toBe('light')
    expect(browser.classes.has('dark')).toBe(false)
  })

  it('reads the choice the old UI stored under the same key', async () => {
    browser.store.set('theme', 'dark')
    const { useTheme } = await import('../src/composables/useTheme.js')
    expect(useTheme().choice.value).toBe('dark')
    expect(browser.root.dataset.theme).toBe('dark')
  })
})
