// Startbahn: decides how the airfield is drawn and hides the difference from the app.
// 1. The static SVG renders at once (poster; it carries the full information).
// 2. Unless reduced motion is requested, Three.js is imported lazily after first paint;
//    if WebGL works, the canvas fades in over the poster and the poster is removed.
// 3. Any failure keeps the static rendering. The app never waits for WebGL.
import { createFallback } from './fallback.js'

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export function createField(host, { reduced = false, layout = {} } = {}) {
  let impl = createFallback(host, layout)
  const memo = { snap: null, view: 'next', selected: null, lp: null, ty: null }
  let resolveReady
  const ready = new Promise((r) => { resolveReady = r })
  const api = {
    get kind() { return impl.kind },
    ready,
    sync(snap, opts) { memo.snap = snap; impl.sync(snap, opts) },
    setView(v, animate = true) { memo.view = v; return impl.setView(v, animate) },
    setSelected(id) { memo.selected = id; impl.setSelected(id) },
    depart(id) { return impl.depart(id) },
    relayout(lp, ty) { memo.lp = lp; memo.ty = ty; impl.relayout(lp, ty) },
    get busy() { return impl.busy },
  }
  if (reduced || !webglOk()) { resolveReady('static'); return api }

  const start = () => import('./scene.js').then(({ createScene, readPalette }) => {
    const sc = createScene(host, readPalette(), layout)
    sc.relayout(memo.lp, memo.ty)
    sc.setView(memo.view, false)
    if (memo.snap) sc.sync(memo.snap, { animate: false })
    sc.setSelected(memo.selected)
    sc.canvas.classList.add('field-canvas')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sc.canvas.classList.add('on')
      const old = impl
      impl = sc
      setTimeout(() => old.dispose(), 400)
      resolveReady('webgl')
    }))
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => sc.setPalette(readPalette()))
  }).catch((err) => {
    console.info('Startbahn: static airfield (WebGL unavailable)', err && err.message)
    resolveReady('static')
  })
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 300 }); else setTimeout(start, 60)
  return api
}
