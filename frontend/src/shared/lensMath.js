/**
 * The Tageslinse's rules (plan M11, brief 0058; ported from `06-kombination/lens-flat.js`,
 * `lens.js` and `web.js flyToLens`): the volume-true liquid level, the flat lens's shape, when
 * the WebGL canvas and the bead's flight are allowed, and the bead's route. Pure: the lens
 * components and the controller only ask these.
 */

/** The phone's width: at or below it the lens is always the flat SVG (plan D5). */
export const PHONE_MAX = 760

export const clampLevel = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0))

/**
 * Fill height for a volume fraction. The liquid is a spherical cap, so half the volume sits
 * exactly at the middle and the level reads like a real vessel.
 *
 * @param {number} level the volume fraction, 0..1 (clamped)
 * @returns {number} the surface height from the bottom as a fraction of the diameter, 0..1
 */
export function levelToHeight(level) {
  const f = clampLevel(level)
  let lo = 0
  let hi = 2
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2
    const v = (d * d * (3 - d)) / 4 // the cap's volume over the sphere's, radius 1
    if (v < f) lo = d
    else hi = d
  }
  return (lo + hi) / 4
}

/** The cap's volume fraction for a surface height (the inverse of `levelToHeight`). */
export function heightToLevel(height) {
  const d = 2 * Math.min(1, Math.max(0, height))
  return (d * d * (3 - d)) / 4
}

/**
 * The flat lens's shape in a `size` × `size` box (06 `flatLens`).
 *
 * @param {number} level 0..1
 * @param {number} size px
 * @returns {{c: number, cy: number, r: number, rl: number, top: number, chord: number, surface: boolean, liquid: boolean}}
 *   `r` the glass, `rl` the liquid's sphere, `top` the surface's y, `chord` its half width
 */
export function flatLensShape(level, size) {
  const c = size / 2
  const r = size * 0.39
  const cy = c - size * 0.02
  const rl = r * 0.86
  const lv = clampLevel(level)
  const top = cy + rl - levelToHeight(lv) * 2 * rl
  const chord = Math.sqrt(Math.max(0, rl * rl - (top - cy) ** 2))
  return { c, cy, r, rl, top, chord, liquid: lv > 0.001, surface: lv > 0.001 && lv < 0.999 }
}

/**
 * Whether the one WebGL canvas may be used: a desktop width, motion allowed, WebGL present,
 * and no context lost before.
 *
 * @param {{width: number, reduced: boolean, webgl: boolean, lost?: boolean}} env
 */
export const canvasAllowed = ({ width, reduced, webgl, lost = false }) =>
  width > PHONE_MAX && !reduced && webgl && !lost

/**
 * Whether ticking off a todo sends the bead (plan M11): only when the todo counts for today,
 * a lens is on screen, motion is allowed, and the ring it starts from is on screen.
 *
 * @param {{counts: boolean, slot: boolean, reduced: boolean, ring: boolean}} at
 */
export const flightAllowed = ({ counts, slot, reduced, ring }) => !!(counts && slot && !reduced && ring)

/**
 * The bead's thread (06 `flyToLens`): out of the ring into the left gutter, up beside the rows,
 * along the free band above the head, and a short hook down into the glass. It never crosses
 * a row's words.
 *
 * @param {{x: number, y: number}} from the ring's centre
 * @param {{x: number, y: number}} to where the bead enters the lens
 * @param {number|null} [bandTop] the head's top edge; the band runs 14 px above it
 * @returns {string} an SVG path
 */
export function beadRoute(from, to, bandTop = null) {
  const gx = from.x - 28
  const yc = Math.min(to.y - 18, bandTop == null ? to.y - 18 : bandTop - 14)
  const r1 = 14
  const f = (n) => Math.round(n * 10) / 10
  return `M${f(from.x)},${f(from.y)} C${f(from.x - 8)},${f(from.y - 12)} ${f(gx)},${f(from.y - 4)} ${f(gx)},${f(from.y - 26)}`
    + ` L${f(gx)},${f(yc + r1)} Q${f(gx)},${f(yc)} ${f(gx + r1)},${f(yc)}`
    + ` L${f(to.x - 34)},${f(yc)} Q${f(to.x - 4)},${f(yc)} ${f(to.x)},${f(to.y)}`
}

/** Ease out (cubic): the thread draws fast, then settles. */
export const easeOut = (k) => 1 - (1 - clampLevel(k)) ** 3

/**
 * A cubic-bezier easing like CSS's, solved by Newton's method.
 *
 * @returns {(x: number) => number}
 */
export function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  return (x) => {
    let k = x
    for (let i = 0; i < 6; i++) {
      const f = ((ax * k + bx) * k + cx) * k - x
      const d = (3 * ax * k + 2 * bx) * k + cx
      if (Math.abs(d) < 1e-6) break
      k -= f / d
    }
    k = clampLevel(k)
    return ((ay * k + by) * k + cy) * k
  }
}

/** The bead's pull along the thread: a slow start, then a firm arrival (06 `easePull`). */
export const easePull = bezierEase(0.55, 0, 0.25, 1)

/** The flight's timing in ms (06): the thread draws, the bead starts, the bead flies. */
export const FLIGHT_MS = { draw: 260, start: 120, fly: 600 }

/**
 * The longest the lens may take to take a bead in: after it, the flight counts as landed anyway,
 * so a landing the lens never reports (a lost context, a replaced animation) cannot hold the caption.
 * The fall itself is 260 ms.
 */
export const LAND_MAX_MS = 1000

/**
 * Settle when `promise` settles or after `ms`, whichever comes first. Never rejects.
 *
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function settleWithin(promise, ms) {
  return new Promise((resolve) => {
    const done = () => resolve()
    const timer = setTimeout(done, ms)
    Promise.resolve(promise).then(done, done).finally(() => clearTimeout(timer))
  })
}

/**
 * The lens's pending landings: each `add`ed resolver runs exactly once, when its bead lands, or
 * when `settleAll` runs (a newer bead replaces it, a hidden tab drops the animations, the context
 * is lost), whichever comes first.
 *
 * @returns {{add: (resolve: () => void) => (() => void), settleAll: () => void, readonly size: number}}
 */
export function landingBook() {
  const open = new Set()
  return {
    add(resolve) {
      const once = () => {
        if (open.delete(once)) resolve()
      }
      open.add(once)
      return once
    },
    settleAll() {
      for (const once of [...open]) once()
    },
    get size() {
      return open.size
    },
  }
}

/**
 * The light lens's paper hairlines: the page's rule colour (a CSS rgb()/rgba() string) with its alpha
 * multiplied by `k`, capped at 1. Any other string is returned as it is.
 *
 * @param {string} rule
 * @param {number} k
 * @returns {string}
 */
export function hairlineColour(rule, k) {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(rule)
  if (!m) return rule
  const a = Math.min(1, (m[4] === undefined ? 1 : Number(m[4])) * k)
  return `rgba(${m[1]},${m[2]},${m[3]},${Math.round(a * 1000) / 1000})`
}
