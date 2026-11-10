import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { generateTokens, resolveColour } from '../tokens/generate.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tokens = JSON.parse(read('../tokens/tokens.json'))
const SCHEMES = ['light', 'dark']

/** The `--ar-*` hex colours a stylesheet defines, as { name: '#rrggbb' } in lower case. */
function brandHexes(css) {
  return Object.fromEntries(
    [...css.matchAll(/(--ar-[a-z-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, name, hex]) => [name, hex.toLowerCase()]),
  )
}

/** The `--ar-<kind>-*` values a stylesheet defines (shadows, trackings), whitespace collapsed. */
function brandValues(css, kind) {
  return Object.fromEntries(
    [...css.matchAll(new RegExp(`(--ar-${kind}-[a-z]+):\\s*([^;]+);`, 'g'))].map(([, name, v]) => [
      name,
      v.trim().replace(/\s+/g, ' '),
    ]),
  )
}

/** WCAG 2 relative luminance of an [r, g, b] colour in 0-255. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A colour token as the eye sees it on an opaque background token: alpha composited. */
function seen(scheme, name, onName) {
  const [r, g, b, a] = resolveColour(tokens, tokens.color[scheme][name]).rgba
  const under = resolveColour(tokens, tokens.color[scheme][onName]).rgba
  expect(under[3], `${scheme}.${onName} must be opaque to be a background`).toBe(1)
  return [r, g, b].map((v, i) => v * a + under[i] * (1 - a))
}

function contrast(scheme, fg, bg) {
  const [x, y] = [luminance(seen(scheme, fg, bg)), luminance(seen(scheme, bg, bg))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('generated token files', () => {
  // A hand edit to an output, or a token change without a regeneration, fails here:
  // run `node tools/gen-tokens.mjs`.
  for (const [path, text] of Object.entries(generateTokens(tokens))) {
    it(`frontend/${path} is what the generator writes from tokens.json`, () => {
      expect(read(`../${path}`)).toBe(text)
    })
  }

  it('writes exactly the three files both clients read', () => {
    expect(Object.keys(generateTokens(tokens)).sort()).toEqual([
      'src/assets/tokens.css',
      'tokens/RunwayTokens.kt',
      'tokens/tailwind-tokens.js',
    ])
  })
})

describe('brand', () => {
  it('copies the Agentic Reach kit unchanged', () => {
    const kit = brandHexes(read('../../docs/design/2026-10-31-unified-ui/shared/brand/tokens.css'))
    for (const [name, hex] of Object.entries(tokens.brand)) {
      const variable = '--ar-' + name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
      expect(kit[variable], variable).toBe(hex.toLowerCase())
    }
  })

  it("copies the kit's shadows and trackings unchanged", () => {
    // The brand allows no shadow but the kit's; style.css masks a drift in the old UI, so it
    // would first show in the new one.
    const kit = read('../../docs/design/2026-10-31-unified-ui/shared/brand/tokens.css')
    const generated = generateTokens(tokens)['src/assets/tokens.css']
    for (const kind of ['shadow', 'tracking']) {
      const want = brandValues(kit, kind)
      expect(Object.keys(want).length, kind).toBe(4)
      expect(brandValues(generated, kind), kind).toEqual(want)
    }
  })

  it("agrees with every shadow the old UI's style.css also defines", () => {
    const generated = brandValues(generateTokens(tokens)['src/assets/tokens.css'], 'shadow')
    const old = brandValues(read('../src/style.css'), 'shadow')
    expect(Object.keys(old).length).toBeGreaterThan(0)
    for (const [name, value] of Object.entries(old)) expect(generated[name], name).toBe(value)
  })

  it("agrees with every brand colour the old UI's style.css also defines", () => {
    // tokens.css loads before style.css, so a disagreement would go unseen in the old UI and
    // silently change the new one once style.css is slimmed.
    const generated = brandHexes(generateTokens(tokens)['src/assets/tokens.css'])
    const old = brandHexes(read('../src/style.css'))
    expect(Object.keys(old).length).toBeGreaterThan(0)
    for (const [name, hex] of Object.entries(old)) expect(generated[name], name).toBe(hex)
  })

  it('every semantic colour is a brand colour or a mix of brand colours', () => {
    const leaves = (value) =>
      typeof value === 'string'
        ? [value]
        : [...leaves(value.mix[0]), ...(value.mix[2] === 'transparent' ? [] : leaves(value.mix[2]))]
    for (const scheme of SCHEMES) {
      for (const [name, value] of Object.entries(tokens.color[scheme])) {
        for (const leaf of leaves(value)) expect(Object.keys(tokens.brand), `${scheme}.${name}`).toContain(leaf)
      }
    }
  })

  it('both schemes name the same colours, the phone design m3 names included', () => {
    expect(Object.keys(tokens.color.dark)).toEqual(Object.keys(tokens.color.light))
    for (const name of ['press', 'overdueEdge', 'strike', 'kbd', 'key', 'swipe']) {
      expect(tokens.color.light).toHaveProperty(name)
    }
  })

  it('mixes as color-mix(in srgb) draws it, a translucent operand included', () => {
    const t = { brand: { ink: '#000000', paper: '#ffffff' } }
    // opaque with opaque: a plain weighted mean, opaque
    expect(resolveColour(t, { mix: ['ink', 40, 'paper'] }).rgba).toEqual([153, 153, 153, 1])
    // opaque with transparent: the channels kept, alpha p
    expect(resolveColour(t, { mix: ['paper', 40, 'transparent'] }).rgba).toEqual([255, 255, 255, 0.4])
    // translucent with transparent: the alphas multiply
    expect(resolveColour(t, { mix: [{ mix: ['paper', 40, 'transparent'] }, 50, 'transparent'] }).rgba).toEqual([
      255, 255, 255, 0.2,
    ])
    // translucent with opaque: premultiplied, so the translucent side weighs less and the
    // result is opaque only where both sides add up to it (0.4 * 0.5 + 1 * 0.5 = 0.7)
    expect(resolveColour(t, { mix: [{ mix: ['ink', 40, 'transparent'] }, 50, 'paper'] }).rgba).toEqual([
      182, 182, 182, 0.7,
    ])
  })

  it('refuses a colour that is not in the brand', () => {
    expect(() => resolveColour(tokens, 'teal')).toThrow(/unknown brand colour teal/)
    expect(() => resolveColour(tokens, { mix: ['coral', 50, 'toString'] })).toThrow(/unknown brand colour/)
  })
})

describe('contrast', () => {
  for (const scheme of SCHEMES) {
    it(`${scheme}: text on the page and on cards is at least 7:1`, () => {
      expect(contrast(scheme, 'text', 'bg')).toBeGreaterThanOrEqual(7)
      expect(contrast(scheme, 'text', 'surface')).toBeGreaterThanOrEqual(7)
    })

    it(`${scheme}: muted text is at least 4.5:1 on the page and on cards`, () => {
      expect(contrast(scheme, 'mute', 'bg')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(scheme, 'mute', 'surface')).toBeGreaterThanOrEqual(4.5)
    })

    it(`${scheme}: ink on the coral action is at least 7:1`, () => {
      expect(contrast(scheme, 'onAction', 'action')).toBeGreaterThanOrEqual(7)
    })

    it(`${scheme}: the overdue colour is at least 4.5:1 on the page`, () => {
      expect(contrast(scheme, 'overdue', 'bg')).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('font licence', () => {
  it('ships with the build: public/fonts/OFL.txt is the licence next to the font files', () => {
    // Vite emits only what something references, so the copy in src/assets/fonts/ never reaches
    // dist; public/ is copied as is and served at /fonts/OFL.txt (brief 0047).
    const shipped = read('../public/fonts/OFL.txt')
    expect(shipped).toBe(read('../src/assets/fonts/OFL.txt'))
    expect(shipped).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/)
  })
})
