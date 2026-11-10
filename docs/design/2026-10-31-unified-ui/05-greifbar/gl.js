// Greifbar: the one WebGL layer per screen (after review: the pill and the companion only).
// A transparent canvas over the app (pointer-events: none) with one camera, so 1 world unit =
// 1 CSS pixel on the z = 0 plane. It holds two things: the clay check pill while it squishes and
// the companion. Frames run only while something moves, and each frame draws only the rects of
// the objects that are on screen (scissor), so a 650 ms squish on a 30 px pill touches a few
// thousand pixels, not the whole viewport. Text never enters WebGL.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const easeOutCubic = (k) => 1 - Math.pow(1 - clamp(k), 3)
const easeInOutSine = (k) => -(Math.cos(Math.PI * clamp(k)) - 1) / 2

const BRAND = { coral: '#FF7A6B', plum: '#3D2B5C', yellow: '#F4C84A', ink: '#1B1428', bg: '#FBF6EE', bgAlt: '#F4ECE0', bgCool: '#F1EEF4', paper: '#FFFFFF' }
const col = (hex) => new THREE.Color(hex)
/** color-mix(in srgb, a k, b) on sRGB-encoded values, as CSS does it */
const mix = (a, b, k) => { const x = col(a).convertLinearToSRGB(), y = col(b).convertLinearToSRGB(); return x.lerp(y, 1 - k).convertSRGBToLinear() }

/** Spring integrated in fixed 1/240 s substeps. */
class Spring {
  constructor(x = 0, k = 260, c = 22) { this.x = x; this.v = 0; this.t = x; this.k = k; this.c = c }
  to(t, k, c) { this.t = t; if (k) this.k = k; if (c) this.c = c }
  step(dt) {
    let n = Math.max(1, Math.round(dt * 240)); const h = dt / n
    while (n--) { const a = -this.k * (this.x - this.t) - this.c * this.v; this.v += a * h; this.x += this.v * h }
    if (Math.abs(this.x - this.t) < 0.002 && Math.abs(this.v) < 0.01) { this.x = this.t; this.v = 0; return false }
    return true
  }
}

/** Blurred rounded-rect alpha texture for contact shadows (drawn once, no text). */
function shadowTex(w, h, r, blur) {
  const pad = blur * 3, cv = document.createElement('canvas')
  cv.width = Math.ceil(w + pad * 2); cv.height = Math.ceil(h + pad * 2)
  const ctx = cv.getContext('2d')
  ctx.filter = `blur(${blur}px)`
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.roundRect(pad, pad, w, h, r); ctx.fill()
  return { tex: new THREE.CanvasTexture(cv), w: cv.width, h: cv.height }
}

export function createLayer(host, { dark = false, onContextLost } = {}) {
  let renderer
  const canvas = document.createElement('canvas')
  canvas.className = 'gl-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    if (!renderer.getContext()) throw new Error('no context')
  } catch {
    return null
  }
  host.appendChild(canvas)
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setScissorTest(true)
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onContextLost && onContextLost() })

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 10000)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.42

  // light rig: warm key from upper left, cool fill, warm rim from behind for the clay edge
  const hemi = new THREE.HemisphereLight(col(BRAND.bg), col(BRAND.bgAlt), 1.15)
  const key = new THREE.DirectionalLight(col(BRAND.bg), 2.5); key.position.set(-0.55, 0.85, 1)
  const fill = new THREE.DirectionalLight(col(BRAND.bgCool), 0.6); fill.position.set(0.9, -0.5, 0.7)
  const rim = new THREE.DirectionalLight(col(BRAND.bg), 2.2); rim.position.set(0.45, 1, -0.85)
  scene.add(hemi, key, fill, rim)

  let W = 1, H = 1, rect = host.getBoundingClientRect(), full = true
  function resize() {
    rect = host.getBoundingClientRect()
    W = Math.max(1, rect.width); H = Math.max(1, rect.height)
    renderer.setSize(W, H, false)
    camera.aspect = W / H
    camera.position.set(0, 0, (H / 2) / Math.tan(THREE.MathUtils.degToRad(15)))
    camera.near = 10; camera.far = camera.position.z * 3
    camera.updateProjectionMatrix()
    full = true
    kick()
  }
  const toWorld = (cx, cy) => ({ x: cx - rect.left - W / 2, y: -(cy - rect.top - H / 2) })
  const rectCenter = (r) => toWorld(r.left + r.width / 2, r.top + r.height / 2)

  const M = {
    pill: new THREE.MeshPhysicalMaterial({ roughness: 0.55, sheen: 0.9, sheenRoughness: 0.45, clearcoat: 0.15, transparent: true }),
    check: new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true }),
    shadow: new THREE.MeshBasicMaterial({ color: col(BRAND.ink), transparent: true, depthWrite: false }),
  }
  let isDark = dark

  // ---------------- regions and the render loop (on demand) ----------------
  // Each live object registers a function returning its screen rect; a frame clears and draws
  // only inside those rects. Outside them the canvas stays transparent.
  const regions = new Set()
  function drawRegions() {
    renderer.setViewport(0, 0, W, H)
    if (full) { renderer.setScissor(0, 0, W, H); renderer.clear(); full = false }
    for (const fn of regions) {
      const r = fn()
      if (!r) continue
      const x = Math.floor(r.left - rect.left), y = Math.floor(r.top - rect.top)
      const w = Math.ceil(r.width) + 1, h = Math.ceil(r.height) + 1
      if (x + w < 0 || y + h < 0 || x > W || y > H) continue
      renderer.setScissor(x, H - y - h, w, h)
      renderer.render(scene, camera)
    }
  }
  let raf = 0, last = 0, frames = 0
  const tickers = new Set()
  function kick() {
    if (raf || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function frame(now) {
    raf = 0
    frames++
    const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000)); last = now
    let active = false
    for (const t of [...tickers]) { if (t(dt, now)) active = true; else tickers.delete(t) }
    drawRegions()
    if (active) raf = requestAnimationFrame(frame)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0 } else if (tickers.size) kick()
  })
  const run = (fn) => { tickers.add(fn); kick() }

  // =====================================================================================
  // 1. Clay check pill: lifts off the row, squishes, settles plum (done), check draws in.
  //    `onHandover` fires just before the 3D pill fades, so the DOM pill is already in its
  //    done state underneath (no double edge).
  // =====================================================================================
  const pillShadowTex = shadowTex(30, 20, 10, 6)
  function squish(r, onHandover) {
    return new Promise((resolve) => {
      const w = r.width, h = r.height, R = h / 2
      const g = new THREE.CapsuleGeometry(R, Math.max(0.1, w - h), 10, 28)
      g.rotateZ(Math.PI / 2)
      const mat = M.pill.clone()
      mat.color.copy(isDark ? mix(BRAND.bg, BRAND.ink, 0.06) : col(BRAND.paper)); mat.opacity = 1
      const pill = new THREE.Mesh(g, mat)
      const pts = [new THREE.Vector3(-w * 0.2, 0.2, R * 0.92), new THREE.Vector3(-w * 0.05, -R * 0.36, R * 0.98), new THREE.Vector3(w * 0.21, R * 0.42, R * 0.92)]
      const path = new THREE.CurvePath(); path.add(new THREE.LineCurve3(pts[0], pts[1])); path.add(new THREE.LineCurve3(pts[1], pts[2]))
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 40, Math.max(0.9, h * 0.065), 6, false), M.check.clone())
      tube.material.color.copy(isDark ? col(BRAND.ink) : col(BRAND.bg)); tube.material.opacity = 1
      const grp = new THREE.Group(); grp.add(pill, tube)
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(pillShadowTex.w * w / 30, pillShadowTex.h * h / 20), M.shadow.clone())
      sh.material.map = pillShadowTex.tex
      const c = rectCenter(r)
      grp.position.set(c.x, c.y, 0)
      scene.add(grp, sh)
      const region = () => ({ left: r.left - 22, top: r.top - 22, width: r.width + 44, height: r.height + 48 })
      regions.add(region)
      const q = new Spring(0, 900, 40), z = new Spring(0, 600, 30)
      const fromC = mat.color.clone(), toC = isDark ? mix(BRAND.plum, BRAND.bg, 0.28) : col(BRAND.plum)
      const segs = tube.geometry.parameters.tubularSegments, radial = 6
      let t = 0, released = false, handed = false
      q.to(1); z.to(9)
      run((dt) => {
        t += dt * 1000
        if (!released && t > 95) { released = true; q.to(0, 520, 11); z.to(0, 260, 20) }
        q.step(dt); z.step(dt)
        const sq = q.x
        grp.scale.set(1.18 * (1 + 0.32 * sq), 1.18 * (1 - 0.3 * sq), 1.18 * (1 - 0.2 * sq))
        grp.position.z = z.x + R
        mat.color.copy(fromC).lerp(toC, easeOutCubic((t - 40) / 200))
        const reveal = clamp((t - 170) / 210)
        tube.geometry.setDrawRange(0, Math.floor(segs * reveal) * radial * 6)
        tube.visible = reveal > 0
        sh.position.set(c.x + z.x * 0.3, c.y - 2 - z.x * 0.5, -1)
        // contact shadow: brand-lg opacity on the table, lighter as the pill lifts (deviation 7)
        sh.material.opacity = (isDark ? 0.45 : 0.12) * (1 - z.x / 30)
        if (t > 430) { const k = easeInOutSine((t - 430) / 130); grp.scale.multiplyScalar(lerp(1, 1 / 1.18, k)) }
        if (t > 540 && !handed) { handed = true; onHandover && onHandover(); resolve() }
        if (t > 560) { const k = clamp((t - 560) / 90); mat.opacity = 1 - k; tube.material.opacity = 1 - k; sh.material.opacity *= 1 - k }
        if (t > 650) {
          scene.remove(grp, sh); regions.delete(region)
          g.dispose(); tube.geometry.dispose(); mat.dispose(); tube.material.dispose(); sh.geometry.dispose(); sh.material.dispose()
          full = true
          return false
        }
        return true
      })
    })
  }

  // =====================================================================================
  // 2. Companion: the brand mark as a small clay toy. It shows how much of today's Inbox is
  //    clarified: lit nodes = share cleared since the day's high-water mark. At zero all nodes
  //    hold warm light and the coral node glows. Brighter, never bigger; no face.
  // =====================================================================================
  const companion = (() => {
    const g = new THREE.Group(); g.visible = false; scene.add(g)
    const inner = new THREE.Group(); g.add(inner)
    const V = (x, y) => new THREE.Vector2(x - 32, -(y - 32))
    const C = V(32, 32)
    const OUT = [V(32, 50), V(16.412, 41), V(47.588, 41), V(16.412, 23), V(47.588, 23)] // light order: bottom first
    const TOP = V(32, 14), DOT = V(51.588, 19)
    const sphere = new THREE.SphereGeometry(1, 40, 24)
    const nodes = []
    const nodeMat = () => new THREE.MeshPhysicalMaterial({ roughness: 0.5, sheen: 0.8, sheenRoughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3 })
    const mkNode = (p, r, kind) => {
      const m = new THREE.Mesh(sphere, nodeMat()); m.position.set(p.x, p.y, 0); m.scale.setScalar(r)
      m.userData = { kind, lit: 0, target: 0 }; inner.add(m); nodes.push(m); return m
    }
    const center = mkNode(C, 3.6 * 1.3, 'center')
    const outs = OUT.map((p) => mkNode(p, 2.8 * 1.38, 'out'))
    const topNode = mkNode(TOP, 4.4 * 1.25, 'top')
    mkNode(DOT, 2.0 * 1.25, 'dot')
    const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 14)
    const rodMat = new THREE.MeshPhysicalMaterial({ roughness: 0.6, sheen: 0.5 })
    const ring = [V(32, 14), V(47.588, 23), V(47.588, 41), V(32, 50), V(16.412, 41), V(16.412, 23)]
    const link = (a, b) => {
      const m = new THREE.Mesh(rodGeo, rodMat)
      const d = b.clone().sub(a)
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0)
      m.scale.set(0.62, d.length(), 0.62)
      m.rotation.z = Math.atan2(d.y, d.x) - Math.PI / 2
      inner.add(m)
    }
    ring.forEach((p, i) => { link(p, ring[(i + 1) % 6]); link(C, p) })
    // bloom only on the brightest highlights: a ring-shaped halo that starts at the sphere's
    // silhouette, clamped before pow(). Coral on the top node at inbox zero; warm bg on lit
    // nodes in dark mode only. No yellow halo anywhere (the yellow dot stays a dot).
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uColor: { value: col(BRAND.coral) }, uI: { value: 0 }, uInner: { value: 0.36 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uI; uniform float uInner; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0;
          float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * smoothstep(uInner * 0.92, uInner * 1.12, d) * uI;
          gl_FragColor = vec4(uColor, a); }`,
    })
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat)
    halo.position.set(TOP.x, TOP.y, 0); halo.scale.setScalar(30); halo.renderOrder = -1; inner.add(halo)
    haloMat.uniforms.uInner.value = (topNode.scale.x * 2) / 30
    const nodeHalos = [center, ...outs].map((n) => {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat.clone())
      h.material.uniforms.uColor.value = col(BRAND.bg)
      h.position.set(n.position.x, n.position.y, 0); h.scale.setScalar(n.scale.x * 4.2); h.renderOrder = -1
      h.material.uniforms.uInner.value = 2 / 4.2; inner.add(h)
      h.userData.node = n
      return h
    })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.shadow.clone())
    const st = shadowTex(34, 7, 3.5, 4); shadow.material.map = st.tex
    shadow.scale.set(st.w, st.h, 1)
    g.add(shadow)

    let zero = 0, zeroT = 0, slotRect = null
    const wob = new Spring(0, 90, 7), tilt = new Spring(0, 120, 14)
    const region = () => (g.visible && slotRect ? { left: slotRect.left - 8, top: slotRect.top - 8, width: slotRect.width + 16, height: slotRect.height + 20 } : null)
    regions.add(region)

    function paint() {
      const plumClay = isDark ? mix(BRAND.plum, BRAND.bg, 0.62) : col(BRAND.plum)
      const lit = isDark ? col(BRAND.bg) : col(BRAND.paper)
      for (const n of nodes) {
        const m = n.material, k = n.userData.lit, kind = n.userData.kind
        if (kind === 'top') {
          m.color.copy(col(BRAND.coral)); m.emissive.copy(col(BRAND.coral)); m.emissiveIntensity = 0.06 + 0.9 * zero
          m.roughness = lerp(0.5, 0.2, zero); m.sheenColor.copy(col(BRAND.bgAlt))
        } else if (kind === 'dot') {
          m.color.copy(col(BRAND.yellow)); m.emissive.copy(col(BRAND.yellow)); m.emissiveIntensity = 0.05; m.sheenColor.copy(col(BRAND.bgAlt))
        } else {
          m.color.copy(plumClay).lerp(lit, k)
          m.emissive.copy(col(BRAND.bg)); m.emissiveIntensity = (isDark ? 0.6 : 0.3) * k
          m.roughness = lerp(0.55, 0.28, k); m.clearcoat = lerp(0.2, 0.4, k); m.envMapIntensity = lerp(1, 0.6, k)
          m.sheen = lerp(0.8, 0.0, k); m.sheenColor.copy(isDark ? mix(BRAND.plum, BRAND.bg, 0.3) : col(BRAND.bgAlt))
        }
      }
      rodMat.color.copy(isDark ? mix(BRAND.plum, BRAND.bg, 0.45) : mix(BRAND.plum, BRAND.bg, 0.58)).lerp(isDark ? mix(BRAND.bg, BRAND.plum, 0.8) : col(BRAND.bgAlt), zero * 0.5)
      rodMat.sheenColor.copy(isDark ? mix(BRAND.plum, BRAND.bg, 0.3) : col(BRAND.bgAlt))
      for (const h of nodeHalos) h.material.uniforms.uI.value = (isDark ? 0.45 : 0) * h.userData.node.userData.lit * (0.35 + 0.65 * zero)
      haloMat.uniforms.uI.value = (isDark ? 0.75 : 0.5) * zero
      shadow.material.opacity = isDark ? 0.45 : 0.12
    }
    const apply = () => { inner.rotation.set(0.22 + tilt.x * 0.2, -0.34 + wob.x, 0) }
    const tick = (dt) => {
      let moving = wob.step(dt) | tilt.step(dt)
      for (const n of nodes) {
        const u = n.userData
        if (Math.abs(u.lit - u.target) > 0.002) { u.lit += clamp(u.target - u.lit, -dt * 2.4, dt * 2.4); moving = true }
      }
      if (Math.abs(zero - zeroT) > 0.002) { zero += clamp(zeroT - zero, -dt * 1.4, dt * 1.4); moving = true }
      paint(); apply()
      return !!moving
    }
    let lastOpen = null
    return {
      theme() { paint(); kick() },
      place(r) {
        if (!r || r.width < 4) { if (g.visible) { g.visible = false; full = true; kick() } return }
        slotRect = { left: r.left, top: r.top, width: r.width, height: r.height }
        const size = Math.min(r.width, r.height)
        g.position.set(rectCenter(r).x, rectCenter(r).y, 0)
        const small = size < 56
        g.scale.setScalar(size / (small ? 50 : 46))
        shadow.position.set(2, small ? -25 : -27, -14)
        shadow.visible = !small
        g.visible = true; full = true; paint(); apply(); kick()
      },
      hide() { if (g.visible) { g.visible = false; full = true; kick() } },
      /** open = items in the Inbox; cleared = share of today's high-water mark already clarified (0..1). */
      set(open, cleared, { react = true } = {}) {
        const litN = open === 0 ? 5 : Math.min(4, Math.floor(cleared * 5 + 1e-6))
        outs.forEach((n, i) => { n.userData.target = i < litN ? 1 : 0; if (lastOpen === null) n.userData.lit = n.userData.target })
        center.userData.target = open === 0 ? 1 : 0
        if (lastOpen === null) { center.userData.lit = center.userData.target; zero = open === 0 ? 1 : 0 }
        zeroT = open === 0 ? 1 : 0
        if (react && lastOpen !== null && open !== lastOpen) {
          wob.v += open < lastOpen ? (open === 0 ? 5.5 : 2.2) : -1.6
          tilt.v += open === 0 ? 3 : 1.2
        }
        lastOpen = open
        run(tick)
      },
    }
  })()

  function setDark(d) {
    isDark = d
    M.pill.sheenColor.copy(d ? mix(BRAND.plum, BRAND.bg, 0.4) : col(BRAND.bgAlt))
    hemi.intensity = d ? 0.75 : 1.15
    hemi.color.copy(d ? mix(BRAND.bg, BRAND.plum, 0.75) : col(BRAND.bg))
    hemi.groundColor.copy(d ? col(BRAND.ink) : col(BRAND.bgAlt))
    key.intensity = d ? 1.9 : 2.5
    rim.intensity = d ? 2.6 : 2.2
    scene.environmentIntensity = d ? 0.3 : 0.42
    companion.theme()
    full = true
    kick()
  }

  setDark(dark)
  resize()
  const ro = new ResizeObserver(() => resize())
  ro.observe(host)

  return {
    squish, companion, setDark, resize, kick,
    get frames() { return frames },
    get size() { return { W, H } },
    dispose() { ro.disconnect(); renderer.dispose(); canvas.remove() },
  }
}
