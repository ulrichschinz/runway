// The Tageslinse controller (Vue: TagesLinse.vue + useLens). The page renders lens slots
// (<div class="lens-slot" data-size="104">) with the static SVG inside; sync() moves the one WebGL
// canvas into the first slot that is on screen and leaves every other slot static. One canvas per
// screen, created lazily after first paint, never for reduced motion, and dropped for the SVG on
// context loss. The canvas renders only while something moves (0 frames idle).

import { flatLens } from './lens-flat.js'

export function createLens({ reduced, timeScale = () => 1 }) {
  let fx = null
  let state = 'idle' // idle | loading | ready | off
  let level = 0
  let wait = null

  const webglOk = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } }
  const ground = () => getComputedStyle(document.body).backgroundColor
  const onScreen = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight
  }
  const slots = () => [...document.querySelectorAll('.lens-slot')]
  const host = () => slots().find(onScreen) || null

  function load() {
    if (state !== 'idle') return wait
    if (reduced() || !webglOk()) { state = 'off'; return null }
    state = 'loading'
    wait = (async () => {
      try {
        const mod = await import('./lens3d.js')
        fx = new mod.Fx({ timeScale, onLost: () => { state = 'off'; fx?.canvas.remove(); fx = null; sync() } })
        fx.setBackground(ground())
        fx.setLevel(level, { animate: false })
        state = 'ready'
        sync()
        return fx
      } catch {
        state = 'off'
        sync()
        return null
      }
    })()
    return wait
  }

  // Put the canvas into the visible slot; every other slot shows the SVG with the same level.
  function sync() {
    const h = host()
    for (const s of slots()) {
      const live = state === 'ready' && fx && !reduced() && s === h
      if (live) {
        s.querySelector('.lens-flat')?.remove()
        fx.mount(s, Number(s.dataset.size))
      } else if (!s.querySelector('.lens-flat') || s.dataset.level !== level.toFixed(4)) {
        s.querySelector('.lens-flat')?.remove()
        s.insertAdjacentHTML('afterbegin', flatLens(level, { size: Number(s.dataset.size) }))
      }
      s.dataset.level = level.toFixed(4)
    }
    if (fx && (!h || reduced() || !h.contains(fx.canvas))) fx.canvas.remove()
    if (h && state === 'idle') (window.requestIdleCallback || setTimeout)(() => load())
  }

  return {
    sync,
    load,
    get state() { return state },
    get frames() { return fx ? fx.frames : 0 },
    get level() { return level },
    host,
    setLevel(l, { animate = true } = {}) {
      level = Math.max(0, Math.min(1, l))
      if (fx && state === 'ready') fx.setLevel(level, { animate: animate && !reduced() })
      sync()
    },
    setBackground() { if (fx) fx.setBackground(ground()) },
    /** Page coordinates where a bead enters the visible lens, or null when no lens is on screen. */
    entry() {
      const h = host()
      if (!h) return null
      const r = h.getBoundingClientRect()
      if (fx && state === 'ready' && h.contains(fx.canvas)) {
        const e = fx.beadEntry()
        const k = r.width / fx.size
        return { x: r.left + e.x * k, y: r.top + e.y * k, live: true, size: r.width }
      }
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.14, live: false, size: r.width }
    },
    /** The bead falls through the glass into the liquid; the level then rises to nextLevel. */
    drop(nextLevel, beadPx = 6) {
      level = nextLevel
      if (fx && state === 'ready' && host()?.contains(fx.canvas)) return fx.dropBead({ nextLevel, beadPx })
      sync()
      return Promise.resolve()
    },
  }
}
