#!/usr/bin/env node
// Generates the web and Android token files from tokens.json, so both platforms read one source.
//   node tokens/gen-tokens.mjs      (run from the proposal folder)
// Output: tokens/tokens.css (CSS custom properties, light + dark) and tokens/RunwayTokens.kt (Compose).
// No dependencies. Brand colours are referenced as var(--ar-*) in CSS and resolved to ARGB for Kotlin.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'tokens.json'), 'utf8'))

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const BRAND_VAR = { coral: '--ar-coral', plum: '--ar-plum', yellow: '--ar-yellow', ink: '--ar-ink', bg: '--ar-bg', bgAlt: '--ar-bg-alt', bgCool: '--ar-bg-cool', paper: '--ar-paper' }

function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16))
}
// Resolve a token value to { css, argb } (argb as 0xAARRGGBB string for Kotlin).
function resolve(value) {
  if (typeof value === 'string') {
    if (!T.brand[value]) throw new Error(`unknown brand colour ${value}`)
    const [r, g, b] = hexToRgb(T.brand[value])
    return { css: `var(${BRAND_VAR[value]})`, rgba: [r, g, b, 1] }
  }
  const [a, pct, b] = value.mix
  const A = resolve(a)
  const p = pct / 100
  if (b === 'transparent') {
    return { css: `color-mix(in srgb, ${A.css} ${pct}%, transparent)`, rgba: [A.rgba[0], A.rgba[1], A.rgba[2], p] }
  }
  const B = resolve(b)
  const mix = [0, 1, 2].map((i) => Math.round(A.rgba[i] * p + B.rgba[i] * (1 - p)))
  return { css: `color-mix(in srgb, ${A.css} ${pct}%, ${B.css})`, rgba: [...mix, 1] }
}
const argb = ([r, g, b, a]) => '0x' + [Math.round(a * 255), r, g, b].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('')
const hex = ([r, g, b, a]) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('') + (a < 1 ? ` @ ${Math.round(a * 100)}%` : '')

// ---------- CSS ----------
const colourBlock = (scheme) => Object.entries(T.color[scheme])
  .map(([k, v]) => { const r = resolve(v); return `  --rw-${kebab(k)}: ${r.css}; /* ${hex(r.rgba)} */` }).join('\n')

const m = T.motion
const typeVars = Object.entries(T.type).filter(([, v]) => v.web).map(([k, v]) => [
  `  --rw-type-${k}-size: ${v.web};`,
  `  --rw-type-${k}-line: ${v.line};`,
  `  --rw-type-${k}-weight: ${v.weight};`,
  `  --rw-type-${k}-tracking: ${v.tracking}em;`,
].join('\n')).join('\n')

const css = `/* GENERATED from tokens.json by gen-tokens.mjs. Do not edit by hand.
   Semantic tokens of proposal 03 "Papier & Tinte". Load after shared/brand/tokens.css. */

:root {
  color-scheme: light;
${colourBlock('light')}

  /* type */
  --rw-font-sans: var(--ar-font-sans);
  --rw-font-serif: var(--ar-font-serif);
  --rw-font-mono: var(--ar-font-mono);
${typeVars}

  /* shape */
${Object.entries(T.radius).map(([k, v]) => `  --rw-radius-${k}: ${v}px;`).join('\n')}

  /* size */
${Object.entries(T.size).map(([k, v]) => `  --rw-size-${kebab(k)}: ${v}px;`).join('\n')}

  /* motion */
  --rw-ease: cubic-bezier(${m.ease.join(', ')});
${['fast', 'base', 'slow', 'strike', 'strikeHold', 'collapse', 'undo', 'bloom', 'settle'].map((k) => `  --rw-dur-${kebab(k)}: ${m[k]}ms;`).join('\n')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colourBlock('dark').replace(/^/gm, '  ')}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${colourBlock('dark')}
}
`
fs.writeFileSync(path.join(DIR, 'tokens.css'), css)

// ---------- Kotlin ----------
const ktColours = (scheme) => Object.entries(T.color[scheme])
  .map(([k, v]) => { const r = resolve(v); return `        val ${k} = Color(${argb(r.rgba)}) // ${hex(r.rgba)}` }).join('\n')
const ktType = Object.entries(T.type).filter(([, v]) => v.android).map(([k, v]) =>
  `        val ${k} = TypeToken(Font.${v.font.toUpperCase()}, ${v.weight}, ${v.android}.sp, ${v.line}f, ${v.tracking}f)`).join('\n')

const kt = `// GENERATED from tokens.json by gen-tokens.mjs. Do not edit by hand.
// Proposal 03 "Papier & Tinte": the same semantic tokens as tokens.css, for Jetpack Compose,
// Glance (widget) and the View-based capture overlay (through colors.xml generated the same way).
package com.agenticreach.runway.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class Font { SANS, SERIF, MONO } // res/font: space_grotesk, fraunces_italic, jetbrains_mono

data class TypeToken(val font: Font, val weight: Int, val size: TextUnit, val lineHeight: Float, val trackingEm: Float)

object RunwayTokens {
    object Light {
${ktColours('light')}
    }

    object Dark {
${ktColours('dark')}
    }

    object Type {
${ktType}
    }

    object Radius {
${Object.entries(T.radius).filter(([k]) => k !== 'pill').map(([k, v]) => `        val ${k} = ${v}.dp`).join('\n')}
        // pill = RoundedCornerShape(percent = 50)
    }

    object Size {
        val row = ${T.size.rowAndroid}.dp
        val touch = ${T.size.touch}.dp
        val ring = ${T.size.ringAndroid}.dp
    }

    object Motion {
        val ease = CubicBezierEasing(${m.ease.map((n) => n + 'f').join(', ')})
${['fast', 'base', 'slow', 'strike', 'strikeHold', 'collapse', 'undo', 'bloom', 'settle'].map((k) => `        const val ${k.replace(/[A-Z]/g, (x) => '_' + x).toUpperCase()}_MS = ${m[k]}`).join('\n')}
    }
}
`
fs.writeFileSync(path.join(DIR, 'RunwayTokens.kt'), kt)
console.log('wrote tokens/tokens.css and tokens/RunwayTokens.kt')
