/**
 * The Tageslinse's one controller (plan M11, brief 0058; port of `06-kombination/lens.js`).
 *
 * Pages render `<LensSlot>`s; each registers here. `sync()` (on every slot mount and unmount, resize,
 * scroll, theme and motion change) moves the ONE WebGL canvas into the first slot that is on screen
 * and leaves every other slot with its flat SVG at the same level. The canvas exists only on a
 * desktop (> 760 px), with WebGL, without reduced motion (`canvasAllowed`); Three.js is loaded with
 * `import('./lens3d.js')` in idle time after first paint, and only once a slot is on screen and a
 * canvas is allowed. A lost context drops the canvas for good: the SVG takes over.
 *
 * It renders only while something moves (0 frames idle; `lens3d.js`). Module state, so a route change
 * keeps the renderer. `window.__runway.lens` (dev builds only) counts frames and canvases.
 */
import { effectScope, ref, shallowRef, watch } from 'vue'
import { useTheme } from '../../composables/useTheme.js'
import { canvasAllowed, clampLevel } from '../../shared/lensMath.js'

/** The slot that holds the canvas now, or null (every slot shows its SVG). */
export const liveSlot = shallowRef(null)
/** 'idle' | 'loading' | 'ready' | 'off' (reduced motion, no WebGL, failed load or lost context) */
export const lensState = ref('idle')

const slots = new Map() // element → size
let fx = null
let level = 0
let lost = false
let scheduled = false
let listening = false
let scope = null

const reducedQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)')
const reduced = () => reducedQuery().matches

let webglKnown = null
function webgl() {
  if (webglKnown === null) {
    try {
      const c = document.createElement('canvas')
      webglKnown = !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      webglKnown = false
    }
  }
  return webglKnown
}

const allowed = () => canvasAllowed({ width: window.innerWidth, reduced: reduced(), webgl: webgl(), lost })

function onScreen(el) {
  if (!el.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight
}

/** The first registered slot that is on screen, or null. */
export function visibleSlot() {
  for (const el of slots.keys()) if (onScreen(el)) return el
  return null
}

/** The page's ground under a slot (the first ancestor with a background) and its rule colour. */
function groundOf(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg
  }
  return getComputedStyle(document.body).backgroundColor
}
function ruleColour() {
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--ar-ink').trim() || '#1B1428'
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ink)
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.10)` : 'rgba(27,20,40,0.10)'
}

function paintGround() {
  const h = liveSlot.value
  if (fx && h) fx.setGround(groundOf(h), ruleColour())
}

function load() {
  if (lensState.value !== 'idle') return
  if (!allowed()) return
  lensState.value = 'loading'
  import('./lens3d.js')
    .then((mod) => {
      fx = new mod.Fx({
        onLost: () => {
          lost = true
          lensState.value = 'off'
          fx?.canvas.remove()
          fx = null
          liveSlot.value = null
        },
      })
      fx.setLevel(level, { animate: false })
      lensState.value = 'ready'
      sync()
    })
    .catch(() => {
      lensState.value = 'off'
      sync()
    })
}

/** Put the canvas into the visible slot, or take it out where it may not be. */
export function sync() {
  scheduled = false
  const h = visibleSlot()
  const live = lensState.value === 'ready' && fx && h && allowed() ? h : null
  if (live) {
    const groundChanged = liveSlot.value !== live
    fx.mount(live, slots.get(live))
    liveSlot.value = live
    if (groundChanged) paintGround()
  } else {
    fx?.canvas.remove()
    liveSlot.value = null
  }
  if (h && lensState.value === 'idle' && allowed()) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
    idle(load, { timeout: 2000 })
  }
}

function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(sync)
}

function listen() {
  if (listening) return
  listening = true
  window.addEventListener('resize', schedule, { passive: true })
  // the page column scrolls, not the window: catch every scroll
  document.addEventListener('scroll', schedule, { passive: true, capture: true })
  reducedQuery().addEventListener('change', schedule)
  scope = effectScope(true)
  scope.run(() => {
    watch(useTheme().theme, () => requestAnimationFrame(paintGround))
  })
  if (import.meta.env.DEV) {
    window.__runway = {
      ...window.__runway,
      lens: {
        get state() { return lensState.value },
        get frames() { return fx ? fx.frames : 0 },
        get canvases() { return document.querySelectorAll('canvas').length },
        get level() { return level },
        get frameMs() { return fx ? [...fx.frameMs] : [] },
        get renderMs() { return fx ? [...fx.renderMs] : [] },
        syncTiming: (on = true) => { if (fx) fx.syncTiming = on },
        look: (name) => fx?.setLook(name),
        loseContext: () => fx?.loseContext(),
      },
    }
  }
}

/**
 * A slot mounted: it may take the canvas.
 *
 * @param {HTMLElement} el
 * @param {number} size px
 */
export function registerSlot(el, size) {
  listen()
  slots.set(el, size)
  schedule()
}

export function unregisterSlot(el) {
  slots.delete(el)
  if (liveSlot.value === el) {
    fx?.canvas.remove()
    liveSlot.value = null
  }
  schedule()
}

/** The level every slot shows; the canvas moves to it with its spring unless `animate` is false. */
export function setLevel(next, { animate = true } = {}) {
  const l = clampLevel(next)
  if (l === level && fx?.lens.level.target === l) return
  level = l
  if (fx && lensState.value === 'ready') fx.setLevel(level, { animate: animate && !reduced() })
}

export const currentLevel = () => level

/**
 * Where a bead enters the visible lens, in viewport pixels, or null when no lens is on screen.
 *
 * @returns {null|{x: number, y: number, live: boolean, size: number}}
 */
export function entry() {
  const h = visibleSlot()
  if (!h) return null
  const r = h.getBoundingClientRect()
  if (fx && liveSlot.value === h) {
    const e = fx.beadEntry()
    const k = r.width / fx.size
    return { x: r.left + e.x * k, y: r.top + e.y * k, live: true, size: r.width }
  }
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.14, live: false, size: r.width }
}

/** The bead falls into the lens; the level then rises to `nextLevel`. Resolves when it lands. */
export function drop(nextLevel, beadPx = 6) {
  level = clampLevel(nextLevel)
  if (fx && liveSlot.value && liveSlot.value.contains(fx.canvas)) return fx.dropBead({ nextLevel: level, beadPx })
  return Promise.resolve()
}
