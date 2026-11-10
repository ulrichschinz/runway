/**
 * The card stack's physical card (port of `06-kombination/card.js`, plan M10, brief 0057): real DOM
 * text on a paper surface, moved by springs that write one CSS transform (the perspective sits on
 * the stack's wrapper). Lift, tilt, flight into a tray and the next card's rise are springs or a
 * timed curve; the shadow cross-fades between `--ar-shadow-lg` and `--ar-shadow-xl` by lift
 * height. Frames run only while something moves and stop while the page is hidden; at rest the
 * transform is removed, so the text renders on whole pixels. No WebGL.
 *
 * Unlike 06, a card that leaves is a copy (`ghost`) with its own spring: the store is written when
 * the tray is chosen and the next card rises at once, while the copy flies (brief 0057, "write
 * first, then fly"). The physics are 06's, unchanged.
 */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const easeOutCubic = (k) => 1 - (1 - clamp(k)) ** 3
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'f']
const REST = Object.freeze({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, f: 1 })
/** The `perspective` of `.stack-wrap`, in px. */
export const PERSPECTIVE = 1400

/** A spring integrated in fixed 1/240 s substeps; k = stiffness, c = damping. */
class Spring {
  constructor(x = 0) {
    this.x = x
    this.v = 0
    this.t = x
    this.k = 260
    this.c = 22
  }

  set(x) {
    this.x = x
    this.t = x
    this.v = 0
  }

  to(t, k, c) {
    this.t = t
    if (k) this.k = k
    if (c) this.c = c
  }

  /** @returns {boolean} still moving */
  step(dt) {
    let n = Math.max(1, Math.round(dt * 240))
    const h = dt / n
    while (n--) {
      const a = -this.k * (this.x - this.t) - this.c * this.v
      this.v += a * h
      this.x += this.v * h
    }
    if (Math.abs(this.x - this.t) < 0.0015 && Math.abs(this.v) < 0.01) {
      this.x = this.t
      this.v = 0
      return false
    }
    return true
  }
}

/** Frames drawn by every card since the page loaded (the "0 frames at rest" check). */
let framesDrawn = 0
export const cardFrames = () => framesDrawn

/**
 * @param {object} parts
 * @param {HTMLElement} parts.slot the card's place on the stack (its rest rect)
 * @param {HTMLElement} parts.face the card that moves
 * @param {HTMLElement} [parts.nextFace] the next card's text on the first card below: shown only
 *   where the moving card has uncovered it, never while a step holds the card
 */
export function createCardSpring({ slot, face, nextFace = null }) {
  const P = Object.fromEntries(KEYS.map((k) => [k, new Spring(REST[k])]))
  let raf = 0
  let last = 0
  let flight = null
  let dragging = false
  let held = false
  let depth = 0
  let rest = null
  let grabOff = { x: 0, y: 0 }
  let disposed = false

  const restRect = () => (rest = slot.getBoundingClientRect())
  const atRest = () => !dragging && !flight && KEYS.every((k) => P[k].x === REST[k])

  function apply() {
    const still = atRest()
    face.style.transform = still
      ? ''
      : `translate3d(${P.x.x.toFixed(2)}px, ${P.y.x.toFixed(2)}px, ${P.z.x.toFixed(2)}px) rotateX(${P.rx.x.toFixed(4)}rad) `
        + `rotateY(${P.ry.x.toFixed(4)}rad) rotateZ(${P.rz.x.toFixed(4)}rad) scale(${P.s.x.toFixed(4)})`
    face.style.opacity = P.f.x >= 0.999 ? '' : String(clamp(P.f.x))
    face.style.setProperty('--lift', clamp(Math.max(P.z.x / 90, held ? 0.3 : 0)).toFixed(3))
    face.classList.toggle('lifted', !still)
    if (!nextFace) return
    // The next card's text shows only where this card has uncovered it; never while a step holds it.
    let show = 0
    if (!held && depth > 0 && rest && !still) {
      const k = P.s.x * (PERSPECTIVE / Math.max(200, PERSPECTIVE - P.z.x))
      const w = rest.width * k
      const h = rest.height * k
      const cx = rest.width / 2 + P.x.x
      const cy = rest.height / 2 + P.y.x
      const ix = Math.max(0, Math.min(rest.width, cx + w / 2) - Math.max(0, cx - w / 2))
      const iy = Math.max(0, Math.min(rest.height, cy + h / 2) - Math.max(0, cy - h / 2))
      const covered = ((ix * iy) / (rest.width * rest.height)) * clamp(P.f.x * 1.4)
      show = clamp(1 - covered * 1.15) ** 3
    }
    nextFace.style.opacity = show ? show.toFixed(3) : ''
  }

  function tick(now) {
    raf = 0
    if (disposed) return
    const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000))
    last = now
    framesDrawn += 1
    let moving = false
    if (flight) {
      flight.t += dt / flight.dur
      const k = easeOutCubic(flight.t)
      const { from: a, to: b, ctrl: c } = flight
      const q = (u, v, w) => (1 - k) * (1 - k) * u + 2 * (1 - k) * k * v + k * k * w
      P.x.set(q(a.x, c.x, b.x))
      P.y.set(q(a.y, c.y, b.y))
      P.z.set(q(a.z, c.z, b.z))
      for (const key of ['rx', 'ry', 'rz', 's', 'f']) P[key].set(lerp(a[key], b[key], k))
      moving = true
      if (flight.t >= 1) {
        const done = flight.done
        flight = null
        apply()
        done?.()
        kick()
        return
      }
    } else {
      for (const k of KEYS) if (P[k].step(dt)) moving = true
    }
    apply()
    if (moving || dragging) kick()
  }

  function kick() {
    if (raf || disposed || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }

  const onVisibility = () => {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!document.hidden) kick()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function settle(target, k = 260, c = 22) {
    for (const key of KEYS) if (target[key] !== undefined) P[key].to(target[key], k, c)
    kick()
  }

  const pose = () => Object.fromEntries(KEYS.map((k) => [k, P[k].x]))

  function fly(target, { dur, lift = 150, vel, done } = {}) {
    const vx = vel?.vx || 0
    const vy = vel?.vy || 0
    const from = pose()
    const to = { ...REST, z: 0, ...target }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const ctrl = {
      x: lerp(from.x, to.x, 0.5) + clamp(vx * 0.05, -120, 120),
      y: lerp(from.y, to.y, 0.5) + clamp(vy * 0.05, -120, 120) - Math.min(90, dist * 0.18),
      z: Math.max(from.z, to.z) + lift,
    }
    flight = { from, to, ctrl, t: 0, dur: dur || clamp(0.26 + dist / 2400, 0.26, 0.46), done }
    kick()
  }

  /** The pose that puts the card into a target rect (a tray): small and faded, relative to the stack. */
  function into(r) {
    restRect()
    return {
      x: r.left + r.width / 2 - (rest.left + rest.width / 2),
      y: r.top + r.height / 2 - (rest.top + rest.height / 2) - 4,
      z: 8, s: clamp((r.width * 0.62) / rest.width, 0.18, 0.6), f: 0, rx: 0.25, ry: 0, rz: (Math.random() - 0.5) * 0.3,
    }
  }

  return {
    layout() {
      restRect()
      apply()
    },
    /** How many cards lie below (the next card's text shows only when there is one). */
    setDepth(n) {
      depth = n
      apply()
    },
    pose,
    /** Take over another card's pose at once (the leaving copy starts where the card was). */
    setPose(p) {
      for (const k of KEYS) P[k].set(p[k] ?? REST[k])
      restRect()
      apply()
    },
    grab(cx, cy) {
      this.finishNow()
      restRect()
      dragging = true
      grabOff = { x: cx - (rest.left + rest.width / 2) - P.x.x, y: cy - (rest.top + rest.height / 2) - P.y.x }
      P.z.to(46, 420, 30)
      P.s.to(1.02, 420, 30)
      kick()
    },
    drag(cx, cy, velocity) {
      const { vx = 0, vy = 0 } = velocity || {}
      P.x.to(cx - (rest.left + rest.width / 2) - grabOff.x, 900, 60)
      P.y.to(cy - (rest.top + rest.height / 2) - grabOff.y, 900, 60)
      // Tilt from velocity: the leading edge dips away, the way a held card lags behind the hand.
      P.rz.to(clamp(vx * 0.00022, -0.32, 0.32), 320, 24)
      P.ry.to(clamp(vx * 0.00028, -0.4, 0.4), 320, 24)
      P.rx.to(clamp(-vy * 0.00028, -0.4, 0.4), 320, 24)
      kick()
    },
    release() {
      dragging = false
      kick()
    },
    /** Back onto the stack (no tray). */
    back() {
      dragging = false
      held = false
      settle(REST)
    },
    /** A step needs one more answer: the card stays, lifted by its shadow and 10 px, flat and unscaled. */
    hold() {
      dragging = false
      held = true
      settle({ ...REST, y: -10 }, 300, 24)
    },
    /** Fly into a tray's rect; `onLand` when it is in (invisible then). */
    throwTo(rect, vel, onLand) {
      dragging = false
      held = false
      fly(into(rect), { vel, done: onLand })
    },
    /** The next card rises from the stack into the top position. */
    rise() {
      flight = null
      held = false
      dragging = false
      P.x.set(0)
      P.y.set(13)
      P.z.set(-8)
      P.s.set(0.966)
      P.f.set(1)
      P.rx.set(0.05)
      P.ry.set(0)
      P.rz.set(0)
      apply()
      settle({ y: 0, z: 0, s: 1, rx: 0 }, 300, 17)
    },
    /** Rückgängig: the card comes back out of its tray onto the stack. */
    returnFrom(rect) {
      held = false
      dragging = false
      const p = into(rect)
      for (const k of KEYS) P[k].set(p[k])
      fly(REST, { lift: 170 })
    },
    finishNow() {
      if (!flight) return
      const f = flight
      flight = null
      for (const k of KEYS) P[k].set(f.to[k])
      apply()
      f.done?.()
    },
    reset() {
      flight = null
      dragging = false
      held = false
      for (const k of KEYS) P[k].set(REST[k])
      apply()
    },
    dispose() {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
