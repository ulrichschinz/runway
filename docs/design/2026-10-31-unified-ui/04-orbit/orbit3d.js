// Fokus-Orbit, Three.js renderer (web). Loaded lazily by app.js on Nächste and in the review; one
// canvas, renders on demand. Every effect explains state: ring = urgency, sector = context (sized
// by how much waits there), glazed bead = clarified next action, raw clay = inbox, hollow bead =
// follow-up due, yellow ring = needs you today, coral core = running, the focus thread = your
// keyboard cursor, the flight into the hub = done. All text stays in the DOM (labels layer).

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GEO, RING_NAMES, layoutOrbit, polar } from './model.js'

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const easeOut = (k) => 1 - Math.pow(1 - clamp(k), 3)
const easeOutBack = (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2) }

const WEDGE_TOP = 0.105
const HUB_TOP = 0.18
const BEAD_Y = WEDGE_TOP + GEO.bead
const EL = 1.16 // camera elevation (rad): steep enough that rings and sectors read like the map
const RECENT_MS = 1500 // a just-clarified bead stays emphasised this long after landing

export async function createOrbit3D({ stage, labels, colors, onHover, onOpen, onSector, onMore, onLost, tipFor }) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('no webgl')
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.className = 'orbit-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost && onLost() })
  stage.prepend(canvas)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

  // ---------- light rig: hemisphere, warm key with soft shadows, cool fill, rim ----------
  const hemi = new THREE.HemisphereLight(0xffffff, 0xf4ece0, 0.8)
  const key = new THREE.DirectionalLight(0xfff4e6, 2.0)
  key.position.set(3.5, 9, 5.5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 22 })
  key.shadow.radius = 5
  key.shadow.bias = -0.0005
  const fill = new THREE.DirectionalLight(0xe8e6ff, 0.45)
  fill.position.set(-6, 4, 3)
  const rim = new THREE.DirectionalLight(0xfff1ea, 1.1)
  rim.position.set(-3, 5, -7)
  scene.add(hemi, key, fill, rim)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.07 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.22
  ground.receiveShadow = true
  scene.add(ground)

  const world = new THREE.Group()
  scene.add(world)

  // ---------- materials: physical clay (sheen) and glaze (clearcoat); no transmission pass ----------
  const C = {}
  const col = (k) => C[k] || (C[k] = new THREE.Color())
  const M = {
    hub: new THREE.MeshPhysicalMaterial({ roughness: 0.7, sheen: 0.6, sheenRoughness: 0.6, clearcoat: 0.1 }),
    you: new THREE.MeshPhysicalMaterial({ roughness: 0.42, sheen: 0.8, sheenRoughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    base: new THREE.MeshPhysicalMaterial({ roughness: 0.9, sheen: 0.3 }),
    tray: new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.6, sheenRoughness: 0.6 }),
    ring: [0, 1, 2].map(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
    groove: new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }),
    waitRing: new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.07, transparent: true }),
    // clarified next action: glazed ceramic (clearcoat over a matte body)
    glaze: new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.14, sheen: 0.25, sheenRoughness: 0.5, envMapIntensity: 0.9 }),
    live: new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.1 }),
    hollow: new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
    clay: new THREE.MeshPhysicalMaterial({ roughness: 0.92, sheen: 0.35, sheenRoughness: 0.7 }),
    dim: new THREE.MeshPhysicalMaterial({ roughness: 0.8, sheen: 0.5, sheenRoughness: 0.6 }),
    attention: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0, emissiveIntensity: 0.45 }),
    core: new THREE.MeshBasicMaterial({ toneMapped: false }),
    slot: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }),
    thread: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
    threadLive: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
    ripple: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    hoverRing: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  }

  // Halo: "bloom only on the brightest highlights", done as one additive sprite per highlight
  // (running bead, completion flash). Gradient clamped before pow(), so no NaN.
  const haloTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    for (let i = 0; i <= 10; i++) { const d = i / 10; grd.addColorStop(d, `rgba(255,255,255,${Math.pow(clamp(1 - d), 2.2).toFixed(4)})`) }
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true
    return t
  })()
  const haloMat = () => new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, toneMapped: false, premultipliedAlpha: true })

  // ---------- geometry ----------
  const G = {
    bead: new THREE.SphereGeometry(GEO.bead, 40, 20),
    hit: new THREE.SphereGeometry(GEO.bead * 2.1, 8, 6),
    hollow: new THREE.TorusGeometry(GEO.bead * 0.72, GEO.bead * 0.3, 16, 40),
    raw: new THREE.SphereGeometry(GEO.bead * 0.82, 28, 14),
    attention: new THREE.TorusGeometry(GEO.bead * 1.5, 0.014, 10, 64),
    hover: new THREE.TorusGeometry(GEO.bead * 2.05, 0.008, 8, 64),
    slot: new THREE.TorusGeometry(GEO.bead * 1.15, 0.006, 6, 48),
    core: new THREE.SphereGeometry(0.038, 16, 8),
  }

  function wedgeGeo(a0, a1, r0, r1) {
    // annulus sector with constant-width grooves (offset angles by gap / 2r at each radius)
    const gap = GEO.groove
    const o0 = gap / (2 * r0), o1 = gap / (2 * r1)
    const s = new THREE.Shape()
    const P = (a, r) => [r * Math.sin(a), -r * Math.cos(a)]
    const N = Math.max(10, Math.ceil(Math.abs(a0 - a1) * 16))
    s.moveTo(...P(a0 - o1, r1))
    for (let i = 1; i <= N; i++) s.lineTo(...P(lerp(a0 - o1, a1 + o1, i / N), r1))
    for (let i = 0; i <= N; i++) s.lineTo(...P(lerp(a1 + o0, a0 - o0, i / N), r0))
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 6 })
    g.rotateX(-Math.PI / 2)
    g.computeVertexNormals()
    return g
  }

  // ---------- static world: base, hub (you), rings (urgency), waiting ring, tray ----------
  const base = new THREE.Mesh(new THREE.CylinderGeometry(GEO.rimOut + 0.03, GEO.rimOut + 0.05, 0.06, 128), M.base)
  base.position.y = -0.005
  base.receiveShadow = true
  world.add(base)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(GEO.hub, GEO.hub + 0.02, HUB_TOP + 0.02, 72), M.hub)
  hub.position.y = HUB_TOP / 2 - 0.01
  hub.receiveShadow = true; hub.castShadow = true
  hub.userData.hub = true
  world.add(hub)
  const you = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 24), M.you)
  you.position.y = HUB_TOP + 0.12
  you.castShadow = true
  you.userData.hub = true
  world.add(you)
  const youHalo = new THREE.Sprite(haloMat())
  youHalo.position.copy(you.position); youHalo.scale.setScalar(0.001)
  world.add(youHalo)

  GEO.rings.forEach((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007 - i * 0.0012, 6, 180), M.ring[i])
    m.rotation.x = Math.PI / 2
    m.position.y = WEDGE_TOP + 0.003
    world.add(m)
  })
  const waitPts = Array.from({ length: 241 }, (_, i) => { const a = (i / 240) * Math.PI * 2; return new THREE.Vector3(GEO.wait * Math.sin(a), 0.02, GEO.wait * Math.cos(a)) })
  const waitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(waitPts), M.waitRing)
  waitLine.computeLineDistances()
  world.add(waitLine)

  // the inbox tray: a shallow clay dish at the front rim where raw captures wait
  const trayArc = GEO.trayArc * 2 + 0.1
  const tray = new THREE.Mesh(new THREE.TorusGeometry(GEO.tray, 0.2, 16, 64, trayArc), M.tray)
  tray.rotation.set(Math.PI / 2, 0, Math.PI / 2 - trayArc / 2)
  tray.scale.set(1, 1, 0.22)
  tray.position.y = -0.02
  tray.receiveShadow = true
  world.add(tray)

  // ---------- sectors: built from the model, only for contexts with open next actions ----------
  const wedges = new Map() // ctx -> { mesh, a0, a1, liftTo }
  let sectorsNow = []
  const grooves = new THREE.LineSegments(new THREE.BufferGeometry(), M.groove)
  grooves.position.y = 0.03 // on the groove floor: a channel between slabs, not a spoke on top
  world.add(grooves)
  function setWedgeAngles(w, a0, a1) {
    w.a0 = a0; w.a1 = a1
    if (w.mesh.geometry) w.mesh.geometry.dispose()
    w.mesh.geometry = wedgeGeo(a0, a1, GEO.rimIn, GEO.rimOut)
  }
  function buildGrooves() {
    const pts = []
    if (wedges.size > 1) for (const w of wedges.values()) {
      const a = w.a0
      pts.push(GEO.rimIn * Math.sin(a), 0, GEO.rimIn * Math.cos(a), (GEO.rimOut + 0.02) * Math.sin(a), 0, (GEO.rimOut + 0.02) * Math.cos(a))
    }
    grooves.geometry.dispose()
    grooves.geometry = new THREE.BufferGeometry()
    grooves.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  }
  function syncSectors(secs) {
    sectorsNow = secs
    const seen = new Set()
    for (const s of secs) {
      seen.add(s.ctx)
      let w = wedges.get(s.ctx)
      if (!w) {
        const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.82, sheen: 0.55, sheenRoughness: 0.7, clearcoat: 0.06 })
        const mesh = new THREE.Mesh(undefined, mat)
        mesh.receiveShadow = true; mesh.castShadow = true
        mesh.userData.ctx = s.ctx
        w = { mesh, a0: s.a0, a1: s.a1, liftTo: 0 }
        setWedgeAngles(w, s.a0, s.a1)
        world.add(mesh)
        wedges.set(s.ctx, w)
      } else if (Math.abs(w.a0 - s.a0) > 0.002 || Math.abs(w.a1 - s.a1) > 0.002) {
        // a sector grew or shrank: ease the edges, rebuilding the slab while it moves
        const f0 = w.a0, f1 = w.a1, t0 = s.a0, t1 = s.a1
        if (w.anim) { const j = tweens.indexOf(w.anim); if (j >= 0) tweens.splice(j, 1) }
        w.anim = tween({ dur: 320, ease: easeOut, step: (k) => { if (wedges.get(s.ctx) === w) { setWedgeAngles(w, lerp(f0, t0, k), lerp(f1, t1, k)); buildGrooves() } } })
      }
    }
    for (const [ctx, w] of wedges) {
      if (seen.has(ctx)) continue
      wedges.delete(ctx)
      tween({ dur: 220, ease: easeOut, step: (k) => w.mesh.scale.setScalar(Math.max(0.001, 1 - k * 0.15)), done: () => { world.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose() } })
    }
    buildGrooves()
    paintWedges()
  }

  // ---------- focus thread + hover ring ----------
  let thread = null
  let threadCurve = null
  const threadEnd = new THREE.Vector3(1e9, 0, 0)
  const hoverRing = new THREE.Mesh(G.hover, M.hoverRing)
  hoverRing.rotation.x = Math.PI / 2
  hoverRing.visible = false
  world.add(hoverRing)
  // raw inbox beads are not in the orbit yet: the cursor marks them with a ring, not a thread
  const cursorRing = new THREE.Mesh(G.hover, M.hoverRing)
  cursorRing.rotation.x = Math.PI / 2
  cursorRing.visible = false
  world.add(cursorRing)

  function curveTo(pos, lift = 1) {
    const start = new THREE.Vector3(0, you.position.y + 0.12, 0)
    const ctrl = new THREE.Vector3(pos.x * 0.5, (0.85 + pos.length() * 0.12) * lift, pos.z * 0.5)
    return new THREE.QuadraticBezierCurve3(start, ctrl, pos.clone())
  }
  function buildThread(pos) {
    if (thread) { world.remove(thread); thread.geometry.dispose() }
    threadCurve = curveTo(pos)
    threadEnd.copy(pos)
    thread = new THREE.Mesh(new THREE.TubeGeometry(threadCurve, 64, 0.016, 6, false), M.thread)
    thread.renderOrder = 2
    world.add(thread)
    return thread
  }
  const threadCount = (s) => Math.floor(clamp(s) * 64) * 6 * 6
  function clearThread() { if (thread) { world.remove(thread); thread.geometry.dispose(); thread = null; threadCurve = null } }

  // ---------- beads ----------
  const beads = new Map() // id -> { group, body, core, halo, ring, hit, info, pos }
  let model = { beads: [], more: [], sectors: [], ghosts: [] }
  let state = { ctx: null, ring: null, emph: 'next', project: null, hoverId: null, focusId: null, ghosts: [] }
  const restoring = new Set()
  const expecting = new Map() // id -> 'capture'
  const recent = new Map() // id -> time until which a just-clarified bead stays emphasised

  const bodyFor = (kind) => (kind === 'waiting' ? G.hollow : kind === 'inbox' ? G.raw : G.bead)
  function matFor(info) {
    if (!isEmph(info)) return M.dim
    if (info.kind === 'inbox') return M.clay
    if (info.kind === 'waiting') return M.hollow
    return info.live ? M.live : M.glaze
  }
  function isEmph(info) {
    if ((recent.get(info.id) || 0) > performance.now()) return true
    if (state.project) return info.project === state.project
    if (state.emph === 'inbox') return info.kind === 'inbox'
    if (state.emph === 'waiting') return info.kind === 'waiting'
    if (state.emph === 'none') return false
    if (state.ctx && info.kind !== 'inbox') {
      if (info.attention) return true // Fällig and due follow-ups stay visible under any filter
      if (state.ctx === '∅') return !(info.ctxs || []).length && !info.ctx
      if (info.kind === 'waiting') return !info.ctx || info.ctx === state.ctx
      return (info.ctxs || []).includes(state.ctx) || !(info.ctxs || []).length
    }
    return true
  }

  function makeBead(info) {
    const group = new THREE.Group()
    const body = new THREE.Mesh(bodyFor(info.kind), M.glaze)
    body.castShadow = true
    const hit = new THREE.Mesh(G.hit, M.hit)
    hit.userData.beadId = info.id
    group.add(body, hit)
    world.add(group)
    const b = { group, body, hit, core: null, halo: null, ring: null, info, pos: new THREE.Vector3() }
    beads.set(info.id, b)
    return b
  }
  function dress(b) {
    const info = b.info
    b.body.geometry = bodyFor(info.kind)
    b.body.rotation.x = info.kind === 'waiting' ? Math.PI / 2 : 0
    b.body.material = matFor(info)
    const emph = isEmph(info)
    const wantCore = info.kind === 'next' && info.live && emph
    if (wantCore && !b.core) {
      b.core = new THREE.Mesh(G.core, M.core); b.group.add(b.core)
      b.halo = new THREE.Sprite(haloMat()); b.halo.scale.setScalar(0.78); b.halo.material.opacity = 0.55; b.group.add(b.halo)
      applyHaloColor(b.halo)
    } else if (!wantCore && b.core) { b.group.remove(b.core, b.halo); b.core = b.halo = null }
    const wantRing = info.attention && (emph || info.kind === 'next')
    if (wantRing && !b.ring) {
      b.ring = new THREE.Mesh(G.attention, M.attention); b.ring.rotation.x = Math.PI / 2
      b.group.add(b.ring)
    } else if (!wantRing && b.ring) { b.group.remove(b.ring); b.ring = null }
    if (b.ring) b.ring.position.y = -(yFor(info) - floorFor(info)) + 0.008
  }
  const floorFor = (info) => (info.hub ? HUB_TOP : info.kind === 'next' ? WEDGE_TOP : 0.02)
  const yFor = (info) => (info.hub ? HUB_TOP + GEO.bead * 0.9 : info.kind === 'next' ? BEAD_Y : info.kind === 'waiting' ? 0.06 : 0.07)
  const liftOf = (ctx) => (ctx && wedges.get(ctx) ? wedges.get(ctx).liftTo : 0)
  function targetPos(info) {
    const p = polar(info.a, info.r)
    const lift = info.kind === 'next' && !info.hub ? liftOf(info.ctx) : 0
    return new THREE.Vector3(p.x, yFor(info) + lift, p.z)
  }

  // "+N" markers: a thin ring on the slot, the number as a DOM button (labels layer)
  const moreMeshes = []
  let moreEls = []

  // ---------- tweens and the on-demand loop ----------
  const tweens = []
  let raf = 0, paused = false
  function tween(o) {
    const tw = { t0: performance.now() + (o.delay || 0), dur: o.dur, ease: o.ease || easeInOut, step: o.step, done: o.done, hold: o.hold, held: 0, holdUntil: 0 }
    tweens.push(tw)
    requestRender()
    return tw
  }
  function requestRender() { if (!raf && !paused) raf = requestAnimationFrame(frame) }
  function frame(now) {
    raf = 0
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]
      if (now < tw.t0) continue
      if (tw.holdUntil) { if (now < tw.holdUntil) continue; tw.t0 += now - tw.holdStart; tw.holdUntil = 0 }
      let k = clamp((now - tw.t0) / tw.dur)
      if (tw.hold && !tw.held && k >= tw.hold.at) { tw.held = 1; k = tw.hold.at; tw.holdStart = now; tw.holdUntil = now + tw.hold.ms; tw.hold.onHold && tw.hold.onHold() }
      tw.step(tw.ease(k), k)
      if (k >= 1 && !tw.holdUntil) { tweens.splice(i, 1); tw.done && tw.done() }
    }
    stepCamera(now)
    render()
    if (tweens.length || cam.active) {
      if (!cam.active && tweens.every((t) => t.holdUntil || now < t.t0)) {
        const wake = Math.min(...tweens.map((t) => t.holdUntil || t.t0))
        setTimeout(requestRender, Math.max(16, wake - performance.now()))
      } else requestRender()
    }
  }

  // ---------- camera with purpose ----------
  const cam = { target: new THREE.Vector3(0, 0, 0.2), dist: 13, el: EL, az: 0, from: null, to: null, t0: 0, dur: 700, active: false }
  let size = { w: 1, h: 1 }
  let inset = { top: 0, bottom: 0 }
  // Fit a world radius into the free part of the stage (labels and the suggestion card are DOM
  // overlays), then shift the target so the disc centres in that free part.
  function fit(el, Rv, Rh, target) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const hAvail = Math.max(80, size.h - inset.top - inset.bottom)
    const dist = Math.max((Rv * size.h) / (t * hAvail), (Rh * size.h) / (t * size.w))
    const ppu = size.h / (2 * t * dist)
    target.z += (inset.bottom - inset.top) / 2 / (ppu * Math.sin(el))
    return { target, dist }
  }
  // a short stage (phone header) looks at the disc more from the side, so it fills the width
  const compact = () => size.h < 300
  const elFor = () => (compact() ? 0.74 : EL)
  function framePts(pts, el = elFor() + 0.02) {
    const c = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length)
    const spread = Math.max(0.8, ...pts.map((p) => p.distanceTo(c)))
    const R = Math.min(3.5, Math.max(2.3, spread + 0.9))
    const f = fit(el, R * 0.95, R + 0.35, new THREE.Vector3(c.x, 0, c.z + 0.05))
    return { ...f, el, az: clamp(Math.atan2(c.x, c.z + 0.001) * 0.1, -0.25, 0.25) }
  }
  function framing(mode) {
    if (!mode || mode.kind === 'overview') {
      if (compact()) {
        // phone header: the disc and the waiting ring, no tray (the Inbox tab carries its count)
        const el = elFor()
        const f = fit(el, GEO.wait * Math.sin(el) + 0.3, GEO.wait + 0.12, new THREE.Vector3(0, 0, 0.12))
        return { ...f, el, az: 0 }
      }
      const f = fit(EL, GEO.tray * Math.sin(EL) + 0.36, GEO.wait + 0.22, new THREE.Vector3(0, 0, 0.42))
      return { ...f, el: EL, az: 0 }
    }
    if (mode.kind === 'sector') {
      // the whole sector, its label included, centred in the free stage
      const s = sectorsNow.find((x) => x.ctx === mode.ctx)
      if (!s || s.span > Math.PI * 1.15) return framing(null)
      const pts = []
      for (let i = 0; i <= 8; i++) { const a = lerp(s.a0, s.a1, i / 8); for (const r of [GEO.rimIn, GEO.rimOut]) { const p = polar(a, r); pts.push(new THREE.Vector3(p.x, 0, p.z)) } }
      const l = polar(s.labelA, GEO.label + 0.2); pts.push(new THREE.Vector3(l.x, 0, l.z))
      pts.push(new THREE.Vector3(0, 0, 0))
      return framePts(pts)
    }
    if (mode.kind === 'points') return mode.points.length ? framePts(mode.points) : framing(null)
    return framing(null)
  }
  let mode = { kind: 'overview' }
  function setFrame(m, dur = 700, instant = false) {
    mode = m || { kind: 'overview' }
    const to = framing(mode)
    if (instant || dur <= 0) { Object.assign(cam, to, { active: false }); applyCamera(); requestRender(); return }
    cam.from = { target: cam.target.clone(), dist: cam.dist, el: cam.el, az: cam.az }
    cam.to = to; cam.t0 = performance.now(); cam.dur = dur; cam.active = true
    requestRender()
  }
  function stepCamera(now) {
    if (!cam.active) return
    const k = easeInOut(clamp((now - cam.t0) / cam.dur))
    cam.target.lerpVectors(cam.from.target, cam.to.target, k)
    cam.dist = lerp(cam.from.dist, cam.to.dist, k)
    cam.el = lerp(cam.from.el, cam.to.el, k)
    cam.az = lerp(cam.from.az, cam.to.az, k)
    if (k >= 1) cam.active = false
    applyCamera()
  }
  function applyCamera() {
    const { target, dist, el, az } = cam
    camera.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az))
    camera.lookAt(target)
  }

  // ---------- DOM labels pinned by projection ----------
  labels.innerHTML = ''
  const mk = (cls, html, tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; labels.append(e); return e }
  const secEls = new Map() // ctx -> button
  const ringEls = RING_NAMES.map((n) => mk('o-ringlabel', n))
  const waitEl = mk('o-ringlabel o-waitlabel', '')
  const trayEl = mk('o-tray', '')
  const hubEl = mk('o-hublabel', '')
  const tipEl = mk('o-tip', '')
  let ghostEls = []
  const v3 = new THREE.Vector3()
  function project(x, y, z) {
    v3.set(x, y, z).project(camera)
    return { x: (v3.x * 0.5 + 0.5) * size.w, y: (-v3.y * 0.5 + 0.5) * size.h }
  }
  const place = (el, p, dx = 0, dy = 0) => {
    // hide a label whose anchor left the free part of the stage instead of piling it up at an edge
    const out = p.x < -20 || p.x > size.w + 20 || p.y < 0 || p.y > size.h - inset.bottom + 6
    el.style.visibility = out ? 'hidden' : ''
    el.style.transform = `translate(${Math.round(p.x + dx)}px, ${Math.round(p.y + dy)}px) translate(-50%, -50%)`
  }
  function syncSectorLabels() {
    const seen = new Set()
    for (const s of model.sectors) {
      seen.add(s.ctx)
      let e = secEls.get(s.ctx)
      if (!e) {
        e = mk('o-sector', '', 'button'); e.type = 'button'; e.dataset.ctx = s.ctx
        e.addEventListener('click', (ev) => { ev.stopPropagation(); onSector(state.ctx === s.ctx ? null : s.ctx) })
        secEls.set(s.ctx, e)
      }
      e.innerHTML = `<span>${s.ctx}</span><b>${s.count}</b>`
      e.classList.toggle('on', state.ctx === s.ctx)
      e.classList.toggle('off', !!state.ctx && state.ctx !== s.ctx)
      e.setAttribute('aria-pressed', String(state.ctx === s.ctx))
      e.setAttribute('aria-label', `Kontext ${s.ctx}, ${s.count} Aufgaben${state.ctx === s.ctx ? ', Filter aktiv' : ''}`)
    }
    for (const [ctx, e] of secEls) if (!seen.has(ctx)) { e.remove(); secEls.delete(ctx) }
  }
  function placeLabels() {
    for (const s of sectorsNow) {
      const e = secEls.get(s.ctx); if (!e) continue
      const p = polar(s.labelA, GEO.label)
      const pt = project(p.x, 0.05, p.z)
      if (pt.x > -40 && pt.x < size.w + 40) pt.x = Math.max(56, Math.min(size.w - 56, pt.x))
      if (pt.y > 0 && pt.y < size.h - inset.bottom) pt.y = Math.max(18, pt.y)
      place(e, pt)
    }
    GEO.rings.forEach((r, i) => place(ringEls[i], project(0, WEDGE_TOP, r)))
    place(waitEl, project(0, 0.02, GEO.wait))
    place(trayEl, project(0, 0, GEO.tray + 0.44))
    place(hubEl, project(0, WEDGE_TOP, GEO.rimIn + 0.08))
    ghostEls.forEach(({ el, pos }) => place(el, project(pos.x, 0.05, pos.z), 0, 22))
    moreEls.forEach(({ el, pos }) => place(el, project(pos.x, pos.y, pos.z)))
    if (state.hoverId != null) {
      const b = beads.get(state.hoverId)
      const m = !b && moreEls.find((x) => x.m.ids.includes(state.hoverId))
      const p = b ? b.group.position : m ? m.pos : null
      if (p) place(tipEl, project(p.x, p.y + 0.12, p.z), 0, -30)
    }
  }

  function render() {
    renderer.render(scene, camera)
    placeLabels()
  }

  // ---------- colours from the DOM tokens ----------
  function applyHaloColor(sprite) {
    sprite.material.color.copy(col('live'))
    sprite.material.blending = C._dark ? THREE.AdditiveBlending : THREE.NormalBlending
  }
  function setColors(c) {
    C._dark = c.dark
    for (const k of Object.keys(c)) if (k !== 'dark') col(k).set(c[k])
    scene.background = col('space').clone()
    scene.environmentIntensity = c.dark ? 0.45 : 0.95
    hemi.intensity = c.dark ? 0.35 : 0.8
    hemi.groundColor.copy(c.dark ? col('disc') : col('hub'))
    key.intensity = c.dark ? 1.4 : 2.0
    rim.intensity = c.dark ? 1.6 : 1.1
    ground.material.opacity = c.dark ? 0.14 : 0.07
    M.hub.color.copy(col('hub')); M.hub.sheenColor.copy(col('canvas'))
    M.you.color.copy(col('youColor')); M.you.sheenColor.copy(col('focus'))
    M.ring.forEach((m, i) => { m.color.copy(col('ringLine')); m.opacity = [0.6, 0.42, 0.28][i] * (c.dark ? 1.1 : 1) })
    M.groove.color.copy(col('ringLine')); M.groove.opacity = c.dark ? 0.5 : 0.4
    M.waitRing.color.copy(col('ringLine')); M.waitRing.opacity = 0.34
    M.glaze.color.copy(col('beadNext')); M.glaze.sheenColor.copy(col('focus'))
    M.live.color.copy(col('live')); M.live.emissive.copy(col('live')).multiplyScalar(0.18)
    M.hollow.color.copy(col('beadWaiting'))
    M.clay.color.copy(col('beadInbox')); M.clay.sheenColor.copy(col('canvas'))
    M.tray.color.copy(col('disc')); M.tray.sheenColor.copy(col('canvas'))
    M.base.color.copy(col('disc')).lerp(col('ringLine'), c.dark ? 0.12 : 0.2) // the groove floor: darker than the slabs, so sectors read as separate pieces
    M.dim.color.copy(col('beadDim')); M.dim.sheenColor.copy(col('canvas'))
    M.attention.color.copy(col('attention')); M.attention.emissive.copy(col('attention'))
    M.core.color.copy(col('live'))
    M.slot.color.copy(col('ringLine'))
    M.thread.color.copy(col('focus'))
    M.threadLive.color.copy(col('live'))
    M.ripple.color.copy(col('live'))
    M.hoverRing.color.copy(col('focus'))
    youHalo.material.color.copy(col('live'))
    youHalo.material.blending = c.dark ? THREE.AdditiveBlending : THREE.NormalBlending
    beads.forEach((b) => b.halo && applyHaloColor(b.halo))
    paintWedges()
    requestRender()
  }
  function paintWedges() {
    if (!C.disc) return
    const sel = state.ctx && state.ctx !== '∅' && wedges.has(state.ctx) ? state.ctx : null
    for (const [ctx, w] of wedges) {
      const m = w.mesh.material
      m.color.copy(!sel ? col('disc') : ctx === sel ? col('discSelected') : col('discDim'))
      m.sheenColor.copy(col('canvas'))
    }
  }

  // ---------- sync with the app state ----------
  function update(tasks, s = {}) {
    const prevCtx = state.ctx
    state = { ...state, ...s }
    model = layoutOrbit(tasks, state.ghosts || [], state.order)
    syncSectors(model.sectors)
    for (const [ctx, w] of wedges) {
      const to = ctx === state.ctx ? 0.05 : 0
      if (w.liftTo !== to) {
        const from = w.mesh.position.y
        w.liftTo = to
        tween({ dur: 260, ease: easeOut, step: (k) => { w.mesh.position.y = lerp(from, to, k) } })
      }
    }
    if (prevCtx !== state.ctx) paintWedges()
    const seen = new Set()
    const now = performance.now()
    for (const info of model.beads) {
      seen.add(info.id)
      let b = beads.get(info.id)
      const to = targetPos(info)
      if (!b) {
        b = makeBead(info)
        dress(b)
        if (restoring.has(info.id)) {
          restoring.delete(info.id)
          const curve = curveTo(to, 0.9)
          b.group.position.copy(curve.getPoint(0)); b.group.scale.setScalar(0.4)
          tween({ dur: 760, step: (k) => { b.group.position.copy(curve.getPoint(k)); b.group.scale.setScalar(lerp(0.4, 1, k)) } })
        } else if (expecting.get(info.id) === 'capture') {
          expecting.delete(info.id)
          b.group.position.set(to.x, to.y + 1.6, to.z); b.group.scale.setScalar(0.5)
          tween({ dur: 620, ease: (k) => k, step: (k) => { b.group.position.y = lerp(to.y + 1.6, to.y, easeOut(k)); b.group.scale.setScalar(lerp(0.5, 1, easeOutBack(k))) } })
        } else {
          b.group.position.copy(to); b.group.scale.setScalar(0.01)
          tween({ dur: 360, ease: easeOutBack, step: (k) => b.group.scale.setScalar(Math.max(0.01, k)) })
        }
        b.pos.copy(to)
        continue
      }
      const kindChanged = b.info.kind !== info.kind
      const moved = b.pos.distanceTo(to) > 0.001
      const oldInfo = b.info
      b.info = info
      if (kindChanged || (moved && oldInfo.cell !== info.cell)) {
        // clarify / re-context: an arc flight; raw clay turns into a glazed bead halfway, and the
        // bead stays emphasised for a moment after landing so you see where it went
        const from = b.group.position.clone()
        const ctrl = from.clone().lerp(to, 0.5); ctrl.y = 1.25
        const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to.clone())
        let swapped = false
        recent.set(info.id, now + 980 + RECENT_MS)
        setTimeout(() => { const x = beads.get(info.id); if (x) { recent.delete(info.id); dress(x); requestRender() } }, 980 + RECENT_MS + 20)
        if (kindChanged) { b.info = { ...oldInfo }; dress(b); b.info = info }
        tween({ dur: 980, step: (k) => {
          b.group.position.copy(curve.getPoint(k))
          b.group.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35)
          if (!swapped && k > 0.5) { swapped = true; dress(b) }
        } })
      } else {
        dress(b)
        if (moved) {
          const from = b.group.position.clone()
          tween({ dur: 480, step: (k) => b.group.position.lerpVectors(from, to, k) })
        }
      }
      b.pos.copy(to)
    }
    for (const [id, b] of beads) {
      if (seen.has(id)) continue
      beads.delete(id)
      const g = b.group
      tween({ dur: 240, ease: easeOut, step: (k) => g.scale.setScalar(Math.max(0.001, 1 - k)), done: () => world.remove(g) })
    }
    syncSectorLabels()
    syncMore()
    const nIn = model.lists.inbox.length
    trayEl.innerHTML = nIn ? `Inbox <b>${nIn}</b>` : 'Inbox leer'
    trayEl.classList.toggle('on', state.emph === 'inbox')
    waitEl.innerHTML = model.waitingCount ? `Warten auf ${model.waitingCount}${model.waitingDue ? ` · ${model.waitingDue} nachhaken` : ''}` : ''
    waitEl.classList.toggle('on', state.emph === 'waiting')
    const nHub = model.beads.filter((b) => b.hub).length + (model.more.find((m) => m.cell === 'hub')?.n || 0)
    hubEl.innerHTML = nHub ? `<span class="pre">Mitte · </span>ohne Kontext <b>${nHub}</b>` : ''
    hubEl.style.display = nHub ? '' : 'none'
    syncGhosts()
    applyCompact()
    hover(state.hoverId, true)
    focus(state.focusId, true)
    requestRender()
  }

  function syncMore() {
    moreMeshes.forEach((m) => world.remove(m)); moreMeshes.length = 0
    moreEls.forEach(({ el }) => el.remove()); moreEls = []
    for (const m of model.more) {
      const p = polar(m.a, m.r)
      const y = m.tray ? 0.07 : m.hub ? HUB_TOP + 0.01 : m.ring === 3 ? 0.03 : WEDGE_TOP + 0.006 + liftOf(m.ctx)
      const ring = new THREE.Mesh(G.slot, M.slot)
      ring.userData.tray = !!m.tray
      ring.rotation.x = Math.PI / 2
      ring.position.set(p.x, y, p.z)
      world.add(ring); moreMeshes.push(ring)
      const where = m.tray ? 'in der Inbox' : m.hub ? 'ohne Kontext' : m.ring === 3 ? `zum Nachhaken in ${m.ctx}` : `in ${m.ctx}, ${RING_NAMES[m.ring]}`
      const el = mk('o-more', `+${m.n}`, 'button')
      el.type = 'button'
      el.setAttribute('aria-label', `${m.n} weitere ${where} zeigen`)
      el.addEventListener('click', (ev) => { ev.stopPropagation(); onMore && onMore(m) })
      el.addEventListener('pointerenter', () => { onHover(null) })
      moreEls.push({ el, m, pos: new THREE.Vector3(p.x, y + 0.03, p.z) })
    }
  }

  const ghostMeshes = []
  function syncGhosts() {
    ghostMeshes.forEach((m) => world.remove(m)); ghostMeshes.length = 0
    ghostEls.forEach(({ el }) => el.remove()); ghostEls = []
    for (const g of model.ghosts || []) {
      const p = polar(g.a, g.r)
      const m = new THREE.Mesh(G.attention, M.attention)
      m.rotation.x = Math.PI / 2
      m.position.set(p.x, (g.hub ? HUB_TOP : WEDGE_TOP) + 0.008 + liftOf(g.ctx), p.z)
      m.scale.setScalar(0.92)
      world.add(m); ghostMeshes.push(m)
      const el = mk('o-ghost', `${g.project}<span>kein nächster Schritt</span>`)
      ghostEls.push({ el, pos: new THREE.Vector3(p.x, 0, p.z) })
    }
  }

  function hover(id, quiet = false) {
    state.hoverId = id
    const b = id != null ? beads.get(id) : null
    beads.forEach((x) => { if (!x.flying) x.body.scale.setScalar(x === b ? 1.28 : 1) })
    // a row whose bead sits inside a "+N" marker lights up that marker instead
    const m = !b && id != null ? moreEls.find((x) => x.m.ids.includes(id)) : null
    moreEls.forEach((x) => x.el.classList.toggle('hl', x === m))
    if (b) {
      hoverRing.visible = true
      hoverRing.position.set(b.pos.x, floorFor(b.info) + 0.01, b.pos.z)
    } else hoverRing.visible = false
    const html = (b || m) && tipFor ? tipFor(b ? b.info : { id, kind: 'more', more: m.m }) : ''
    tipEl.innerHTML = html
    tipEl.classList.toggle('show', !!html)
    if (!quiet) requestRender()
  }

  let flights = 0
  function focus(id, quiet = false) {
    if (flights > 0) { state.focusId = id; clearThread(); return }
    const changed = state.focusId !== id
    state.focusId = id
    const b = id != null ? beads.get(id) : null
    const m = !b && id != null ? moreEls.find((x) => x.m.ids.includes(id)) : null
    cursorRing.visible = false
    if (b && b.info.kind === 'inbox') {
      clearThread()
      cursorRing.visible = true
      cursorRing.position.set(b.pos.x, 0.035, b.pos.z)
      if (!quiet) requestRender()
      return
    }
    const target = b && !b.flying ? b.pos : m && !m.m.tray ? m.pos : null
    if (!target) { clearThread(); if (!quiet) requestRender(); return }
    if (changed || !thread) {
      const th = buildThread(target)
      const full = th.geometry.index.count
      th.geometry.setDrawRange(0, 0)
      tween({ dur: 320, ease: easeOut, step: (k) => { if (thread === th) th.geometry.setDrawRange(0, Math.floor(full * k / 36) * 36) } })
    } else if (threadEnd.distanceTo(target) > 0.001) buildThread(target)
    if (!quiet) requestRender()
  }

  // ---------- the signature: done = the bead travels the focus thread into you ----------
  function pulseHub(done) {
    tween({ dur: 620, ease: (k) => k, step: (k) => {
      const pulse = Math.sin(clamp(k) * Math.PI)
      youHalo.scale.setScalar(0.001 + pulse * 1.25)
      youHalo.material.opacity = pulse * 0.9
      M.you.emissive.copy(col('live')).multiplyScalar(pulse * 0.55)
    }, done: () => { M.you.emissive.setRGB(0, 0, 0); youHalo.scale.setScalar(0.001); done && done() } })
  }
  function complete(id, { hold } = {}) {
    const b = beads.get(id)
    if (!b) return new Promise((resolve) => pulseHub(resolve)) // hidden in a "+N": the hub still answers
    beads.delete(id)
    b.flying = true
    const start = b.group.position.clone()
    if (state.focusId !== id || !threadCurve) buildThread(start)
    const th = thread
    const curve = threadCurve
    thread = null; threadCurve = null
    state.focusId = null
    hoverRing.visible = false
    tipEl.classList.remove('show')
    // the bead ignites coral for the trip
    b.body.material = M.live
    if (!b.core) { b.core = new THREE.Mesh(G.core, M.core); b.group.add(b.core) }
    if (!b.halo) { b.halo = new THREE.Sprite(haloMat()); applyHaloColor(b.halo); b.group.add(b.halo) }
    if (b.ring) { const r = b.ring; r.material = r.material.clone(); r.material.transparent = true; tween({ dur: 260, step: (k) => { r.scale.setScalar(Math.max(0.001, 1 + k * 0.8)); r.material.opacity = 1 - k }, done: () => b.group.remove(r) }) }
    flights += 1
    th.material = M.threadLive
    // a ripple where the bead left its place
    const ripple = new THREE.Mesh(G.hover, M.ripple.clone())
    ripple.rotation.x = Math.PI / 2
    ripple.position.set(start.x, floorFor(b.info) + 0.012, start.z)
    world.add(ripple)
    return new Promise((resolve) => {
      let holdResolved = false
      tween({ dur: 160, ease: easeOut, step: (k) => {
        b.group.position.y = start.y + k * 0.12
        b.halo.scale.setScalar(lerp(0.3, 1.0, k)); b.halo.material.opacity = k
      } })
      tween({
        delay: 140, dur: 780, ease: easeInOut,
        hold: hold ? { at: hold.at ?? 0.5, ms: hold.ms ?? 4000, onHold: () => { holdResolved = true; resolve() } } : null,
        step: (k) => {
          const s = 1 - k
          b.group.position.copy(curve.getPoint(s))
          b.group.scale.setScalar(lerp(1.2, 0.6, k))
          b.halo.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.5)
          th.geometry.setDrawRange(0, Math.max(0, threadCount(s)))
          ripple.scale.setScalar(1 + k * 2.2)
          ripple.material.opacity = (1 - k) * 0.85
        },
        done: () => {
          world.remove(b.group); world.remove(th); th.geometry.dispose(); world.remove(ripple)
          flights -= 1
          if (!flights && state.focusId != null) { const f = state.focusId; state.focusId = null; focus(f) }
          // arrival: the hub glows once (the count of finished tasks lives in the DOM)
          pulseHub(() => { if (!holdResolved) resolve() })
        },
      })
    })
  }
  function restore(id) { restoring.add(id) }
  function expect(id, what) { expecting.set(id, what) }
  function positionOf(id) {
    const b = beads.get(id)
    if (b) return { a: b.info.a, r: b.info.r, sector: b.info.sector, ring: b.info.ring, ctx: b.info.ctx }
    const m = model.more.find((x) => x.ids.includes(id))
    return m ? { a: m.a, r: m.r, sector: m.sector, ring: m.ring, ctx: m.ctx, hidden: true } : null
  }

  // compact (phone header): the tray and its beads stay off stage; the Inbox tab shows the count
  function applyCompact() {
    const c = compact()
    tray.visible = !c
    trayEl.style.display = c ? 'none' : ''
    beads.forEach((b) => { if (b.info.kind === 'inbox') b.group.visible = !c })
    moreEls.forEach((x) => { if (x.m.tray) x.el.style.display = c ? 'none' : '' })
    moreMeshes.forEach((m) => { if (m.userData.tray) m.visible = !c })
  }

  // ---------- pointer: hover sync, click to open, click a sector to filter ----------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function pick(ev) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects([...[...beads.values()].map((b) => b.hit), ...[...wedges.values()].map((w) => w.mesh), hub, you], false)
    return hits[0]?.object || null
  }
  let lastHover = null
  canvas.addEventListener('pointermove', (ev) => {
    const o = pick(ev)
    const id = o?.userData.beadId ?? null
    canvas.style.cursor = o ? 'pointer' : 'default'
    if (id !== lastHover) { lastHover = id; hover(id); onHover(id) }
  })
  canvas.addEventListener('pointerleave', () => { if (lastHover != null) { lastHover = null; hover(null); onHover(null) } })
  canvas.addEventListener('click', (ev) => {
    const o = pick(ev)
    if (!o) return
    if (o.userData.beadId != null) onOpen(o.userData.beadId)
    else if (o.userData.hub) onSector(null)
    else if (o.userData.ctx) onSector(state.ctx === o.userData.ctx ? null : o.userData.ctx)
  })

  // ---------- size, visibility ----------
  function resize() {
    const r = stage.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    size = { w: r.width, h: r.height }
    renderer.setSize(size.w, size.h, false)
    canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px'
    camera.aspect = size.w / size.h
    camera.updateProjectionMatrix()
    applyCompact()
    const to = framing(mode)
    if (!cam.active) { Object.assign(cam, to); applyCamera() } else cam.to = to
    requestRender()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting))
  io.observe(stage)
  const onVis = () => setPaused(document.hidden)
  document.addEventListener('visibilitychange', onVis)
  function setPaused(p) { paused = p; if (p && raf) { cancelAnimationFrame(raf); raf = 0 } if (!p) requestRender() }

  setColors(colors)
  resize()
  setFrame(null, 0, true)

  return {
    kind: '3d',
    update, hover, focus, complete, restore, expect, positionOf, setColors,
    setTicks() {}, // the day count lives in the DOM (orbit footer), not on the hub
    frame: (m, dur) => setFrame(m, dur),
    setInsets: (i) => { const prev = inset.bottom; inset = { ...inset, ...i }; if (Math.abs(prev - inset.bottom) > 4) setFrame(mode, 520); else { const to = framing(mode); if (cam.active) cam.to = to; else { Object.assign(cam, to); applyCamera(); requestRender() } } },
    framePoints: (ids, extra = [], dur = 1100) => {
      const pts = ids.map((id) => beads.get(id)?.pos.clone() || (() => { const p = positionOf(id); if (!p) return null; const q = polar(p.a, p.r); return new THREE.Vector3(q.x, 0, q.z) })()).filter(Boolean)
      extra.forEach((g) => { const m = (model.ghosts || []).find((x) => x.project === g.project); if (m) { const p = polar(m.a, m.r); pts.push(new THREE.Vector3(p.x, 0, p.z)) } })
      setFrame({ kind: 'points', points: pts }, dur)
    },
    resize,
    dispose() {
      ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis)
      if (raf) cancelAnimationFrame(raf)
      renderer.dispose(); canvas.remove(); labels.innerHTML = ''
    },
  }
}
