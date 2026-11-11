import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useModalLayers } from '../src/composables/useModalLayers.js'

// AppFrame's palette and `?` sheet (brief 0062): the page behind an open layer is inert.
function layers() {
  const calls = []
  const api = useModalLayers((on) => calls.push(on))
  return { ...api, calls, inert: () => calls.at(-1) ?? false }
}

describe('useModalLayers', () => {
  it('makes the page inert once a layer is up and frees it as the last one closes', async () => {
    const l = layers()
    l.open('palette')
    await nextTick()
    expect(l.inert()).toBe(true)
    l.close('palette')
    expect(l.inert()).toBe(false)
  })

  it('keeps the page inert when the palette hands over to the sheet in one tick ("Tastenkürzel")', async () => {
    const l = layers()
    l.open('palette')
    await nextTick()
    // CommandPalette.run: close() first, then the item's action opens the sheet
    l.close('palette')
    l.open('sheet')
    await nextTick()
    expect(l.sheet.value).toBe(true)
    expect(l.inert()).toBe(true)
  })

  it('keeps the first focus target when one layer replaces the other', () => {
    const l = layers()
    const field = { id: 'field' }
    l.open('sheet', field)
    l.open('palette', { id: 'sheet-button' })
    expect(l.returnTo.value).toBe(field)
    expect(l.palette.value && !l.sheet.value).toBe(true)
  })
})
