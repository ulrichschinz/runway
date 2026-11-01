/**
 * The token generator: `tokens.json` in, the three files both clients read out.
 *
 * WHY THIS LIVES HERE. The generator is pure (an object in, strings out), so the test that
 * holds the committed outputs to the source (`frontend/tests/tokens.test.js`) can run it in
 * memory; tests may import `fe/shared`, which `frontend/tokens/` belongs to. Writing the files
 * is the job of the thin command `tools/gen-tokens.mjs`. Ported from the design's
 * `06-kombination/tokens/gen-tokens.mjs`; what differs is listed in brief 0047.
 *
 * Outputs, keyed by their path relative to `frontend/`:
 * - `src/assets/tokens.css`: the brand and semantic custom properties. Light values sit on
 *   `:root`; the dark ones and `color-scheme` apply only under `:root[data-theme]`, which only
 *   the new UI's `useTheme` sets, so the old UI's page never changes with them.
 * - `tokens/tailwind-tokens.js`: the Tailwind `theme.extend` (every name prefixed `rw`, so no
 *   utility the old UI uses changes) and the `theme-color` per scheme.
 * - `tokens/RunwayTokens.kt`: the same tokens for Jetpack Compose; the Android app copies it.
 */

const HEADER = 'GENERATED from frontend/tokens/tokens.json by tools/gen-tokens.mjs. Do not edit by hand.'

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

function hexToRgb(hex) {
  const v = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16))
}

/**
 * Resolve a colour token to its CSS expression and its sRGB value.
 *
 * A token is a brand colour's name, or `{ mix: [a, percent, b] }` where `a` is a token and `b`
 * is a token or `transparent`. The value is what `color-mix(in srgb, a p%, b)` draws: the
 * alphas mix linearly and the channels are mixed premultiplied, then divided back. So mixing an
 * opaque `a` with `transparent` keeps `a`'s channels at alpha p, and a translucent operand
 * carries its own alpha into the result instead of being treated as opaque.
 *
 * @param {object} tokens  the parsed tokens.json
 * @param {string|{mix: Array}} value
 * @returns {{css: string, rgba: number[]}}  rgba as [r, g, b] in 0-255 and alpha in 0-1
 */
export function resolveColour(tokens, value) {
  if (typeof value === 'string') {
    if (!Object.hasOwn(tokens.brand, value)) throw new Error(`unknown brand colour ${value}`)
    return { css: `var(--ar-${kebab(value)})`, rgba: [...hexToRgb(tokens.brand[value]), 1] }
  }
  const [a, pct, b] = value.mix
  const A = resolveColour(tokens, a)
  const B = b === 'transparent' ? { css: 'transparent', rgba: [0, 0, 0, 0] } : resolveColour(tokens, b)
  const p = pct / 100
  const [wA, wB] = [A.rgba[3] * p, B.rgba[3] * (1 - p)]
  // Rounded to 6 places so that p + (1 - p) is exactly 1 for two opaque operands.
  const alpha = Math.round((wA + wB) * 1e6) / 1e6
  const rgb = [0, 1, 2].map((i) => (alpha === 0 ? 0 : Math.round((A.rgba[i] * wA + B.rgba[i] * wB) / (wA + wB))))
  return { css: `color-mix(in srgb, ${A.css} ${pct}%, ${B.css})`, rgba: [...rgb, alpha] }
}

const toHex = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('')
const describe = ([r, g, b, a]) => toHex([r, g, b]) + (a < 1 ? ` @ ${Math.round(a * 100)}%` : '')
const argb = ([r, g, b, a]) =>
  '0x' + [Math.round(a * 255), r, g, b].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('')

const motionSteps = (tokens) => Object.keys(tokens.motion).filter((k) => k !== 'ease')
const fontStack = (tokens, role) => `'${tokens.font[role]}', ${tokens.fontFallback[role]}`

function css(tokens) {
  const colours = (scheme, indent) =>
    Object.entries(tokens.color[scheme])
      .map(([k, v]) => {
        const r = resolveColour(tokens, v)
        return `${indent}--rw-${kebab(k)}: ${r.css}; /* ${describe(r.rgba)} */`
      })
      .join('\n')
  const lines = (entries) => entries.map((l) => `  ${l}`).join('\n')
  const m = tokens.motion

  return `/* ${HEADER}
   Brand values (--ar-*) are the Agentic Reach kit's; semantic tokens (--rw-*) only reference
   or mix them. The light scheme is the default on :root. The dark scheme and color-scheme
   apply only under :root[data-theme], which the new UI's useTheme sets and the old UI never
   does, so loading this file changes nothing the old UI shows. */

:root {
  /* brand */
${lines(Object.entries(tokens.brand).map(([k, v]) => `--ar-${kebab(k)}: ${v};`))}
${lines(Object.entries(tokens.tracking).map(([k, v]) => `--ar-tracking-${k}: ${v}em;`))}
${lines(Object.entries(tokens.shadow).map(([k, v]) => `--ar-shadow-${k}: ${v};`))}

  /* colour (light) */
${colours('light', '  ')}

  /* type */
${lines(Object.keys(tokens.font).map((role) => `--rw-font-${role}: ${fontStack(tokens, role)};`))}
${lines(
  Object.entries(tokens.type)
    .filter(([, v]) => v.web)
    .flatMap(([k, v]) => [
      `--rw-type-${k}-size: ${v.web};`,
      `--rw-type-${k}-line: ${v.line};`,
      `--rw-type-${k}-weight: ${v.weight};`,
      `--rw-type-${k}-tracking: ${v.tracking}em;`,
    ]),
)}

  /* shape */
${lines(Object.entries(tokens.radius).map(([k, v]) => `--rw-radius-${k}: ${v}px;`))}

  /* size */
${lines(Object.entries(tokens.size).map(([k, v]) => `--rw-size-${kebab(k)}: ${v}px;`))}

  /* motion */
  --rw-ease: cubic-bezier(${m.ease.join(', ')});
${lines(motionSteps(tokens).map((k) => `--rw-dur-${kebab(k)}: ${m[k]}ms;`))}
}

:root[data-theme="light"] {
  color-scheme: light;
}

:root[data-theme="dark"] {
  color-scheme: dark;
${colours('dark', '  ')}
}
`
}

function tailwind(tokens) {
  const vars = (entries, prefix, cssPrefix) =>
    Object.fromEntries(entries.map((k) => [`${prefix}${kebab(k)}`, `var(${cssPrefix}${kebab(k)})`]))
  const theme = {
    colors: { rw: vars(Object.keys(tokens.color.light), '', '--rw-') },
    fontFamily: Object.fromEntries(Object.keys(tokens.font).map((role) => [`rw-${role}`, [`var(--rw-font-${role})`]])),
    borderRadius: vars(Object.keys(tokens.radius), 'rw-', '--rw-radius-'),
    boxShadow: vars(Object.keys(tokens.shadow), 'rw-', '--ar-shadow-'),
    transitionTimingFunction: { rw: 'var(--rw-ease)' },
    transitionDuration: vars(motionSteps(tokens), 'rw-', '--rw-dur-'),
  }
  const themeColor = Object.fromEntries(
    Object.keys(tokens.color).map((scheme) => [
      scheme,
      toHex(resolveColour(tokens, tokens.color[scheme].bg).rgba.slice(0, 3)),
    ]),
  )
  return `// ${HEADER}
// The Tailwind theme extension: every utility is prefixed rw (bg-rw-bg, font-rw-serif,
// rounded-rw-pill, duration-rw-fast), so none the old UI uses changes. The values are the
// custom properties of src/assets/tokens.css, which switch with the theme.

/** The browser chrome colour (meta theme-color) per scheme: the page background. */
export const themeColor = ${JSON.stringify(themeColor, null, 2)}

export default ${JSON.stringify(theme, null, 2)}
`
}

function kotlin(tokens) {
  const colours = (scheme) =>
    Object.entries(tokens.color[scheme])
      .map(([k, v]) => {
        const r = resolveColour(tokens, v)
        return `        val ${k} = Color(${argb(r.rgba)}) // ${describe(r.rgba)}`
      })
      .join('\n')
  const type = Object.entries(tokens.type)
    .filter(([, v]) => v.android)
    .map(
      ([k, v]) =>
        `        val ${k} = TypeToken(Font.${v.font.toUpperCase()}, ${v.weight}, ${v.android}.sp, ${v.line}f, ${v.tracking}f)`,
    )
    .join('\n')
  const m = tokens.motion
  return `// ${HEADER}
// The same semantic tokens as frontend/src/assets/tokens.css, for Jetpack Compose, Glance (widget)
// and the View-based capture overlay. The Android app copies this file unchanged.
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
${colours('light')}
    }

    object Dark {
${colours('dark')}
    }

    object Type {
${type}
    }

    object Radius {
${Object.entries(tokens.radius)
  .filter(([k]) => k !== 'pill')
  .map(([k, v]) => `        val ${k} = ${v}.dp`)
  .join('\n')}
        // pill = RoundedCornerShape(percent = 50)
    }

    object Size {
        val row = ${tokens.size.rowAndroid}.dp
        val touch = ${tokens.size.touch}.dp
        val ring = ${tokens.size.ringAndroid}.dp
    }

    object Motion {
        val ease = CubicBezierEasing(${m.ease.map((n) => n + 'f').join(', ')})
${motionSteps(tokens)
  .map((k) => `        const val ${k.replace(/[A-Z]/g, (x) => '_' + x).toUpperCase()}_MS = ${m[k]}`)
  .join('\n')}
    }
}
`
}

/**
 * Every generated file, keyed by its path relative to `frontend/`.
 *
 * @param {object} tokens  the parsed tokens.json
 * @returns {Record<string, string>}
 */
export function generateTokens(tokens) {
  return {
    'src/assets/tokens.css': css(tokens),
    'tokens/tailwind-tokens.js': tailwind(tokens),
    'tokens/RunwayTokens.kt': kotlin(tokens),
  }
}
