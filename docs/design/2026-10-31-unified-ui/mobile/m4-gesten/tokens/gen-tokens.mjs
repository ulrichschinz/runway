#!/usr/bin/env node
// One token source, two outputs: tokens.css for the prototype (and later the web) and
// GestenTokens.kt for Compose and Glance. No dependencies.
//   node mobile/m4-gesten/tokens/gen-tokens.mjs
// Brand colours stay var(--ar-*) in CSS (the kit stays the source) and resolve to ARGB for Kotlin.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'tokens.json'), 'utf8'))
const BRAND_VAR = { coral: '--ar-coral', plum: '--ar-plum', yellow: '--ar-yellow', ink: '--ar-ink', bg: '--ar-bg', bgAlt: '--ar-bg-alt', bgCool: '--ar-bg-cool', paper: '--ar-paper' }
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))

function resolve(v) {
  if (typeof v === 'string') {
    if (!T.brand[v]) throw new Error(`unknown brand colour ${v}`)
    return { css: `var(${BRAND_VAR[v]})`, rgba: [...rgb(T.brand[v]), 1] }
  }
  const [a, pct, b] = v.mix
  const A = resolve(a)
  if (b === 'transparent') return { css: `color-mix(in srgb, ${A.css} ${pct}%, transparent)`, rgba: [A.rgba[0], A.rgba[1], A.rgba[2], pct / 100] }
  const B = resolve(b)
  const p = pct / 100
  return { css: `color-mix(in srgb, ${A.css} ${pct}%, ${B.css})`, rgba: [0, 1, 2].map((i) => Math.round(A.rgba[i] * p + B.rgba[i] * (1 - p))).concat(1) }
}
const hex = ([r, g, b, a]) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('') + (a < 1 ? ` @ ${Math.round(a * 100)}%` : '')
const argb = ([r, g, b, a]) => '0x' + [Math.round(a * 255), r, g, b].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('')
const block = (scheme, indent = '  ') => Object.entries(T.color[scheme])
  .map(([k, v]) => { const r = resolve(v); return `${indent}--g-${kebab(k)}: ${r.css}; /* ${hex(r.rgba)} */` }).join('\n')

const css = `/* GENERATED from tokens.json by gen-tokens.mjs. Do not edit by hand.
   Semantic colour tokens of m4 Gesten. Load after shared/brand/tokens.css.
   .alt-scheme marks the one frame that shows the other scheme (dark on a light page, light on a dark page). */

:root {
  color-scheme: light;
${block('light')}
  --g-ease: ${T.motion.ease};
  --g-fast: ${T.motion.fast}ms;
  --g-base: ${T.motion.base}ms;
}
:root:not([data-theme="dark"]) .alt-scheme {
  color-scheme: dark;
${block('dark')}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${block('dark', '    ')}
  }
  :root:not([data-theme="light"]) .alt-scheme {
    color-scheme: light;
${block('light', '    ')}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${block('dark')}
}
:root[data-theme="dark"] .alt-scheme {
  color-scheme: light;
${block('light')}
}
@media (prefers-reduced-motion: reduce) {
  :root { --g-fast: 0ms; --g-base: 0ms; }
}
`
fs.writeFileSync(path.join(DIR, 'tokens.css'), css)

const kt = (scheme) => Object.entries(T.color[scheme])
  .map(([k, v]) => `    val ${k} = Color(${argb(resolve(v).rgba)})`).join('\n')
const s = T.size
const kotlin = `// GENERATED from tokens.json by gen-tokens.mjs. Do not edit by hand.
package com.agenticreach.runway.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object GestenLight {
${kt('light')}
}

object GestenDark {
${kt('dark')}
}

object GestenSize {
    val touch = ${s.touch}.dp
    val row = ${s.row}.dp
    val ring = ${s.ring}.dp
    val tabs = ${s.tabs}.dp
    val field = ${s.field}.dp
    val swipeMin = ${s.swipeMinDp}.dp
    const val SWIPE_FRACTION = ${s.swipeFraction}f
    const val LONG_PRESS_MS = ${s.longPressMs}L
    val pullRefresh = ${s.pullRefreshDp}.dp
    val pullCapture = ${s.pullCaptureDp}.dp
}

object GestenMotion {
    const val FAST_MS = ${T.motion.fast}
    const val BASE_MS = ${T.motion.base}
    const val MAX_MS = ${T.motion.max}
    const val UNDO_HOLD_MS = ${T.motion.undoHold}L
}
`
fs.writeFileSync(path.join(DIR, 'GestenTokens.kt'), kotlin)
console.log('wrote tokens.css and GestenTokens.kt')
