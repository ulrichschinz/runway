// Greifbar: the physical Inbox card, in the DOM with CSS 3D (after review: no WebGL card).
// The card is real DOM text on a paper surface. Lift, tilt, flight and settle are springs that
// write one CSS transform (perspective on .stack-wrap); the shadow cross-fades between the
// brand's --ar-shadow-lg and --ar-shadow-xl by lift height. Frames run only while something
// moves, the same way Compose's Animatable does on Android. At rest the transform is removed,
// so the text renders on whole pixels.

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const easeOutCubic = (k) => 1 - Math.pow(1 - clamp(k), 3)
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'f']
const PERSPECTIVE = 1400

/** Spring integrated in fixed 1/240 s substeps; k = stiffness, c = damping (tokens.json). */
class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; this.t = x; this.k = 260; this.c = 22 }
  set(x) { this.x = x; this.t = x; this.v = 0 }
  to(t, k, c) { this.t = t; if (k) this.k = k; if (c) this.c = c }
  step(dt) {
    let n = Math.max(1, Math.round(dt * 240)); const h = dt / n
    while (n--) { const a = -this.k * (this.x - this.t) - this.c * this.v; this.v += a * h; this.x += this.v * h }
    if (Math.abs(this.x - this.t) < 0.0015 && Math.abs(this.v) < 0.01) { this.x = this.t; this.v = 0; return false }
    return true
  }
}

export function createCard({ slot, face, nextFace, unders }) {
  const P = Object.fromEntries(KEYS.map((k) => [k, new Spring(k === 's' || k === 'f' ? 1 : 0)]))
  let raf = 0, last = 0, flight = null, dragging = false, held = false, depth = 0
  let rest = null, grabOff = { x: 0, y: 0 }, samples = []
  let frames = 0 // for the "0 frames at rest" check (window.proto.frames)

  const restRect = () => (rest = slot.getBoundingClientRect())

  function apply() {
    const atRest = !dragging && !flight && KEYS.every((k) => P[k].x === (k === 's' || k === 'f' ? 1 : 0))
    face.style.transform = atRest ? '' : `translate3d(${P.x.x.toFixed(2)}px, ${P.y.x.toFixed(2)}px, ${P.z.x.toFixed(2)}px) rotateX(${P.rx.x.toFixed(4)}rad) rotateY(${P.ry.x.toFixed(4)}rad) rotateZ(${P.rz.x.toFixed(4)}rad) scale(${P.s.x.toFixed(4)})`
    face.style.opacity = P.f.x >= 0.999 ? '' : String(clamp(P.f.x))
    face.style.setProperty('--lift', clamp(Math.max(P.z.x / 90, held ? 0.3 : 0)).toFixed(3))
    face.classList.toggle('lifted', !atRest)
    // the next card's text shows only where the top card has uncovered it; never while a step holds the card
    if (nextFace) {
      let show = 0
      if (!held && depth > 0 && rest) {
        const k = P.s.x * (PERSPECTIVE / Math.max(200, PERSPECTIVE - P.z.x))
        const w = rest.width * k, h = rest.height * k
        const cx = rest.width / 2 + P.x.x, cy = rest.height / 2 + P.y.x
        const ix = Math.max(0, Math.min(rest.width, cx + w / 2) - Math.max(0, cx - w / 2))
        const iy = Math.max(0, Math.min(rest.height, cy + h / 2) - Math.max(0, cy - h / 2))
        const covered = face.style.visibility === 'hidden' ? 0 : (ix * iy) / (rest.width * rest.height) * clamp(P.f.x * 1.4)
        show = Math.pow(clamp(1 - covered * 1.15), 3)
      }
      nextFace.style.opacity = show.toFixed(3)
    }
  }

  function tick(now) {
    raf = 0
    const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000)); last = now
    frames++
    let moving = false
    if (flight) {
      flight.t += dt / flight.dur
      const k = easeOutCubic(flight.t), a = flight.from, b = flight.to, c = flight.ctrl
      const q = (u, v, w) => (1 - k) * (1 - k) * u + 2 * (1 - k) * k * v + k * k * w
      P.x.set(q(a.x, c.x, b.x)); P.y.set(q(a.y, c.y, b.y)); P.z.set(q(a.z, c.z, b.z))
      for (const key of ['rx', 'ry', 'rz', 's', 'f']) P[key].set(lerp(a[key], b[key], k))
      moving = true
      if (flight.t >= 1) { const f = flight; flight = null; apply(); f.done && f.done(); return kick() }
    } else {
      for (const k of KEYS) if (P[k].step(dt)) moving = true
    }
    apply()
    if (moving || dragging) kick()
  }
  function kick() {
    if (raf || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0 } else if (flight || dragging) kick() })

  function settle(target, k = 260, c = 22) {
    for (const key of KEYS) if (target[key] !== undefined) P[key].to(target[key], k, c)
    kick()
  }
  const pose = () => Object.fromEntries(KEYS.map((k) => [k, P[k].x]))
  function fly(target, { dur, lift = 150, vel, done } = {}) {
    const vx = vel ? vel.vx || 0 : 0, vy = vel ? vel.vy || 0 : 0
    const from = pose(), to = { rx: 0, ry: 0, rz: 0, s: 1, f: 1, z: 0, ...target }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const ctrl = {
      x: lerp(from.x, to.x, 0.5) + clamp(vx * 0.05, -120, 120),
      y: lerp(from.y, to.y, 0.5) + clamp(vy * 0.05, -120, 120) - Math.min(90, dist * 0.18),
      z: Math.max(from.z, to.z) + lift,
    }
    flight = { from, to, ctrl, t: 0, dur: dur || clamp(0.26 + dist / 2400, 0.26, 0.46), done }
    kick()
  }
  /** Pose that puts the card into a target rect (a tray), small and faded, relative to the stack. */
  function into(r) {
    restRect()
    return {
      x: r.left + r.width / 2 - (rest.left + rest.width / 2), y: r.top + r.height / 2 - (rest.top + rest.height / 2) - 4,
      z: 8, s: clamp((r.width * 0.62) / rest.width, 0.18, 0.6), f: 0, rx: 0.25, ry: 0, rz: (Math.random() - 0.5) * 0.3,
    }
  }

  return {
    get frames() { return frames },
    layout() { restRect(); apply() },
    setDepth(n) {
      depth = n
      unders.forEach((u, i) => { u.hidden = i >= Math.min(3, n) })
      apply()
    },
    grab(cx, cy) {
      this.finishNow()
      restRect()
      dragging = true
      grabOff = { x: cx - (rest.left + rest.width / 2) - P.x.x, y: cy - (rest.top + rest.height / 2) - P.y.x }
      samples = [{ x: cx, y: cy, t: performance.now() }]
      P.z.to(46, 420, 30); P.s.to(1.02, 420, 30)
      kick()
    },
    drag(cx, cy) {
      const now = performance.now()
      samples.push({ x: cx, y: cy, t: now }); while (samples.length > 2 && now - samples[0].t > 90) samples.shift()
      const s0 = samples[0], dt = Math.max(1, now - s0.t) / 1000
      const vx = (cx - s0.x) / dt, vy = (cy - s0.y) / dt
      P.x.to(cx - (rest.left + rest.width / 2) - grabOff.x, 900, 60)
      P.y.to(cy - (rest.top + rest.height / 2) - grabOff.y, 900, 60)
      // tilt from velocity: the leading edge dips away, the way a held card lags behind the hand
      P.rz.to(clamp(vx * 0.00022, -0.32, 0.32), 320, 24)
      P.ry.to(clamp(vx * 0.00028, -0.4, 0.4), 320, 24)
      P.rx.to(clamp(-vy * 0.00028, -0.4, 0.4), 320, 24)
      kick()
    },
    release() { dragging = false; kick() },
    /** Back onto the stack (cancel, no tray). */
    back() { dragging = false; held = false; settle({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, f: 1 }) },
    /** A step needs one more choice: the card stays on the stack, lifted a little, its top towards you. */
    // held for a step: lifted by shadow and 10 px, but flat and unscaled, so the text stays sharp while you decide
    hold() { dragging = false; held = true; settle({ x: 0, y: -10, z: 0, rx: 0, ry: 0, rz: 0, s: 1, f: 1 }, 300, 24) },
    get held() { return held },
    /** Fly into a tray; calls onLand when the card is in (it is invisible afterwards). */
    throwTo(trayRect, vel, onLand) {
      dragging = false; held = false
      fly(into(trayRect), { vel, done: onLand })
    },
    /** The next card rises from the stack into the top position. */
    rise() {
      flight = null; held = false
      P.x.set(0); P.y.set(13); P.z.set(-8); P.s.set(0.966); P.f.set(1); P.rx.set(0.05); P.ry.set(0); P.rz.set(0)
      apply()
      settle({ y: 0, z: 0, s: 1, rx: 0 }, 300, 17)
    },
    /** Undo: the card comes back out of its tray onto the stack. */
    returnFrom(trayRect) {
      held = false
      const p = into(trayRect)
      for (const k of KEYS) P[k].set(p[k])
      fly({ x: 0, y: 0, z: 0, s: 1, f: 1 }, { lift: 170 })
    },
    finishNow() {
      if (!flight) return
      const f = flight; flight = null
      for (const k of KEYS) P[k].set(f.to[k])
      apply(); f.done && f.done()
    },
    reset() {
      flight = null; dragging = false; held = false
      for (const k of KEYS) P[k].set(k === 's' || k === 'f' ? 1 : 0)
      apply()
    },
  }
}
