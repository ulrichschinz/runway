// The page every route serves, against the two sources it copies from (brief 0063): its title is
// the product's name in the message table, and its theme-color is the light page background the
// tokens generate. index.html is static, so nothing regenerates it when either changes; this
// fails instead. A static read, nothing is rendered (ADR 0007).

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import messages from '../src/shared/messages.de.js'
import { themeColorFor } from '../src/shared/theme.js'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

/** Every `<meta name="theme-color">` of the page, as its `content`. */
const themeColors = [...html.matchAll(/<meta\s+name="theme-color"\s+content="([^"]*)"[^>]*>/g)].map(([, c]) => c)

describe('index.html', () => {
  it('is titled with the product name of the new UI', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(messages['brand.product'])
  })

  it('has one theme-color, the light page background from the tokens', () => {
    // One, without `media`: useTheme writes the first it finds, and a second one for dark
    // would override a stored light choice in a dark system.
    expect(themeColors).toEqual([themeColorFor('light')])
  })
})
