// Startbahn: the airfield in Three.js (web). One canvas, created lazily by field.js,
// rendering on demand only: a frame is drawn when the state changes or while a tween runs.
// Rules from motion-graphics-claude-threejs.md: physical materials (glass via transmission
// and thickness, clay via sheen), light rig plus RoomEnvironment reflections, bloom only on
// the brightest highlights (threshold 1.0 in HDR), neutral tone mapping, clamped shader math.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { makeLayout, cameraFor, targetsFor, laneLights, contrailPoints, liftoffAt, LANE_N, TIERS } from './world.js'

// Neutral tone mapping with a higher knee (as in motion-graphics/01): values below ~0.9 pass
// almost unchanged, so the brand neutrals survive; only highlights compress.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment
  .replace('const float StartCompression = 0.8 - 0.04;', 'const float StartCompression = 0.9;')
  .replace('float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;', 'float offset = x < 0.04 ? x - 12.5 * x * x : 0.02;')

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const ease = {
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  outBack: (k) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2) },
  linear: (k) => k,
}

// Colours come from the CSS tokens, resolved by the browser (color-mix included).
export function readPalette() {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const get = (name) => {
    probe.style.color = `var(${name})`
    const s = getComputedStyle(probe).color
    let m = s.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/)
    if (m) return new THREE.Color().setRGB(+m[1], +m[2], +m[3], THREE.SRGBColorSpace)
    m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
    return m ? new THREE.Color().setRGB(m[1] / 255, m[2] / 255, m[3] / 255, THREE.SRGBColorSpace) : new THREE.Color(1, 0, 1)
  }
  const p = {
    sky: get('--rw-field-sky'), ground: get('--rw-field-ground'), strip: get('--rw-field-strip'), marking: get('--rw-field-marking'),
    coral: get('--ar-coral'), plum: get('--ar-plum'), yellow: get('--ar-yellow'), ink: get('--ar-ink'), bg: get('--ar-bg'), paper: get('--ar-paper'),
    wait: get('--rw-wait'), surface: get('--rw-surface'),
  }
  p.dark = p.surface.getHSL({}).l < 0.3
  probe.remove()
  return p
}

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,0.45)'); r.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = r; g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace
  return t
}

// Camera-facing ribbon for light trails and contrails (alpha fades towards the tail).
class Ribbon {
  constructor(max, width, color, intensity, additive) {
    this.max = max; this.width = width
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3))
    g.setAttribute('a', new THREE.BufferAttribute(new Float32Array(max * 2), 1))
    const idx = []
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    g.setIndex(idx)
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uColor: { value: color.clone().multiplyScalar(intensity) }, uOpacity: { value: 1 } },
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ float a = clamp(vA, 0.0, 1.0) * clamp(uOpacity, 0.0, 1.0); gl_FragColor = vec4(max(uColor, vec3(0.0)), a); }',
    })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.frustumCulled = false
    this.count = 0
  }
  set(points, camPos, alphaHead = 1, alphaTail = 0) {
    const n = Math.min(points.length, this.max)
    const pos = this.mesh.geometry.attributes.position.array, al = this.mesh.geometry.attributes.a.array
    const t = new THREE.Vector3(), v = new THREE.Vector3(), s = new THREE.Vector3(), p = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)]
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
      p.set(...points[i]); v.copy(camPos).sub(p).normalize()
      s.crossVectors(t, v).normalize()
      const u = n > 1 ? i / (n - 1) : 1
      const w = this.width * (0.35 + 0.65 * u)
      pos.set([p.x + s.x * w, p.y + s.y * w, p.z + s.z * w, p.x - s.x * w, p.y - s.y * w, p.z - s.z * w], i * 6)
      const alpha = lerp(alphaTail, alphaHead, u * u)
      al[i * 2] = alpha; al[i * 2 + 1] = alpha
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6))
    this.mesh.geometry.attributes.position.needsUpdate = true
    this.mesh.geometry.attributes.a.needsUpdate = true
    this.count = n
  }
}

export function createScene(host, initialPalette, layoutOpts = {}) {
  let P = initialPalette
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false })
  if (!renderer.getContext()) throw new Error('no webgl')
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 400)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.5

  // ---- light rig: hemisphere, warm key, cool fill, rim for glass edges ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.35)
  const key = new THREE.DirectionalLight(0xfff1e2, 0.9); key.position.set(-8, 12, 9)
  const fill = new THREE.DirectionalLight(0xe8e6ff, 0.25); fill.position.set(10, 5, 6)
  const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(2, 6, -24)
  scene.add(hemi, key, fill, rim)

  // ---- post: HDR target + MSAA, bloom on highlights only, neutral tone mapping ----
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, rt)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.3, 0.32, 1.05)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const shadowTex = radialTexture()
  const field = new THREE.Group(); scene.add(field)
  const tokenRoot = new THREE.Group(); scene.add(tokenRoot)
  const trailRoot = new THREE.Group(); scene.add(trailRoot)
  const contrailRoot = new THREE.Group(); scene.add(contrailRoot)

  // ---- materials ----
  const M = {}
  function buildMaterials() {
    M.ground = new THREE.MeshBasicMaterial({ color: P.ground })
    M.strip = new THREE.MeshPhysicalMaterial({ color: P.dark ? P.strip : P.strip.clone().multiplyScalar(0.8), roughness: 0.92, metalness: 0, sheen: 0.25, sheenRoughness: 0.8, sheenColor: P.dark ? P.plum : P.bg, envMapIntensity: 0.6 })
    M.taxi = new THREE.MeshPhysicalMaterial({ color: P.strip.clone().lerp(P.ground, 0.45).multiplyScalar(P.dark ? 1 : 0.86), roughness: 0.95, sheen: 0.3, sheenRoughness: 0.8, sheenColor: P.bg })
    M.apron = new THREE.MeshPhysicalMaterial({ color: P.strip.clone().lerp(P.ground, 0.62), roughness: 0.95 })
    M.marking = new THREE.MeshStandardMaterial({ color: P.marking, roughness: 0.6 })
    M.yellow = new THREE.MeshBasicMaterial({ color: P.yellow.clone().multiplyScalar(P.dark ? 1.05 : 0.95) })
    M.edge = new THREE.MeshBasicMaterial({ color: P.bg.clone().multiplyScalar(P.dark ? 1.25 : 0.92) })
    M.holdDot = new THREE.MeshBasicMaterial({ color: P.wait.clone().multiplyScalar(P.dark ? 1.0 : 1.0), transparent: true, opacity: P.dark ? 0.7 : 0.45 })
    M.holdDotDue = new THREE.MeshBasicMaterial({ color: P.coral.clone().multiplyScalar(0.9), transparent: true, opacity: 0.6 })
    M.puck = new THREE.MeshPhysicalMaterial({ color: P.dark ? P.bg.clone().lerp(P.ink, 0.35) : P.paper, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.5, sheenColor: P.dark ? P.plum : P.bg, clearcoat: 0.3, clearcoatRoughness: 0.4 })
    M.shadow = new THREE.MeshBasicMaterial({ map: shadowTex, color: P.ink, transparent: true, depthWrite: false, opacity: P.dark ? 0.55 : 0.26 })
    scene.background = P.sky.clone()
    scene.fog = new THREE.Fog(P.sky.clone(), 26, 120)
    hemi.color.set(0xffffff); hemi.groundColor.copy(P.ground)
    hemi.intensity = P.dark ? 0.3 : 0.35
    key.intensity = P.dark ? 0.55 : 0.9
    // bloom only in dark mode, only on the brightest highlights (overdue lights and cores)
    bloom.enabled = P.dark
    bloom.strength = 0.55
    bloom.radius = 0.45
  }
  const glassFor = (tint, dist = 0.9) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.4, ior: 1.45,
    attenuationColor: tint.clone(), attenuationDistance: dist, clearcoat: 1, clearcoatRoughness: 0.06,
    specularIntensity: 1, envMapIntensity: P.dark ? 0.9 : 1.1,
  })

  // ---- geometry ----
  const G = {
    capsule: new THREE.SphereGeometry(0.3, 48, 32),
    core: new THREE.SphereGeometry(0.105, 24, 16),
    ring: new THREE.TorusGeometry(0.5, 0.02, 8, 72).rotateX(Math.PI / 2),
    focus: new THREE.TorusGeometry(0.62, 0.016, 8, 72).rotateX(Math.PI / 2),
    alarm: new THREE.TorusGeometry(0.56, 0.026, 8, 72).rotateX(Math.PI / 2),
    shadow: new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2),
    puck: new THREE.LatheGeometry([[0, 0], [0.33, 0], [0.38, 0.03], [0.39, 0.09], [0.36, 0.15], [0.3, 0.17], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y)), 48),
    dot: new THREE.SphereGeometry(1, 12, 8),
  }

  let L = makeLayout(800, 300, null, null, layoutOpts)
  let laneMesh = null, laneState = [0, 0, 0].map(() => ({ level: 0, tier: 'calm', cur: 0 }))

  function buildField() {
    for (const c of [...field.children]) { field.remove(c); c.geometry?.dispose?.() }
    const s = L.strip
    const len = s.z0 - s.z1
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), M.ground)
    ground.position.set(L.mid, -0.002, -200)
    field.add(ground)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(s.half * 2, 0.05, len), M.strip)
    strip.position.set(s.x, 0.025, (s.z0 + s.z1) / 2)
    field.add(strip)
    // threshold piano keys (six each side of the centre line)
    const kw = (s.half - 0.9) / 6
    for (let side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(kw * 0.62, 0.012, L.keys.z0 - L.keys.z1), M.marking)
      k.position.set(s.x + side * (0.75 + kw * (i + 0.5)), 0.056, (L.keys.z0 + L.keys.z1) / 2)
      field.add(k)
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(s.half * 2 - 0.3, 0.012, 0.16), M.marking)
    bar.position.set(s.x, 0.056, L.zTok - 0.62)
    field.add(bar)
    // centre-line dashes
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.012, 2.6), M.marking, 32)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 32; i++) { m.makeTranslation(s.x, 0.056, L.keys.z1 - 3 - i * 5.2); dashes.setMatrixAt(i, m) }
    field.add(dashes)
    // edge lights
    const edges = new THREE.InstancedMesh(G.dot, M.edge, 2 * 46)
    let e = 0
    for (let i = 0; i < 46; i++) for (const side of [-1, 1]) {
      m.compose(new THREE.Vector3(s.x + side * (s.half - 0.12), 0.07, s.z0 - 1 - i * 3.2), new THREE.Quaternion(), new THREE.Vector3(0.055, 0.055, 0.055))
      edges.setMatrixAt(e++, m)
    }
    field.add(edges)
    // lane lights: three rows; brightness follows the urgency of the token in that lane
    laneMesh = new THREE.InstancedMesh(G.dot, new THREE.MeshBasicMaterial({ color: 0xffffff }), 3 * LANE_N)
    let li = 0
    for (let lane = 0; lane < 3; lane++) for (let i = 0; i < LANE_N; i++) {
      m.compose(new THREE.Vector3(L.lanes[lane], 0.06, L.zTok - 1.35 - i * 1.6), new THREE.Quaternion(), new THREE.Vector3(0.085, 0.035, 0.16))
      laneMesh.setMatrixAt(li, m); laneMesh.setColorAt(li, new THREE.Color(0, 0, 0)); li++
    }
    field.add(laneMesh)
    // taxiway, connector and the yellow lead-in line (taxiway centre lines are yellow in life too)
    const t = L.taxi
    const taxi = new THREE.Mesh(new THREE.BoxGeometry(t.half * 2, 0.04, t.z0 - t.z1), M.taxi)
    taxi.position.set(t.x, 0.02, (t.z0 + t.z1) / 2)
    field.add(taxi)
    const conX0 = s.x + s.half - 0.05, conX1 = t.x
    const con = new THREE.Mesh(new THREE.BoxGeometry(conX1 - conX0, 0.04, 1.9), M.taxi)
    con.position.set((conX0 + conX1) / 2, 0.02, L.zTok)
    field.add(con)
    const lead = new THREE.CurvePath()
    lead.add(new THREE.LineCurve3(new THREE.Vector3(t.x, 0.045, -60), new THREE.Vector3(t.x, 0.045, L.zTok - 1.4)))
    lead.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(t.x, 0.045, L.zTok - 1.4), new THREE.Vector3(t.x, 0.045, L.zTok), new THREE.Vector3(t.x - 1.4, 0.045, L.zTok)))
    lead.add(new THREE.LineCurve3(new THREE.Vector3(t.x - 1.4, 0.045, L.zTok), new THREE.Vector3(L.lanes[2] + 0.75, 0.06, L.zTok)))
    field.add(new THREE.Mesh(new THREE.TubeGeometry(lead, 120, 0.028, 6, false), M.yellow))
    // apron
    const a = L.apron
    const apron = new THREE.Mesh(new THREE.BoxGeometry(a.x1 - a.x0, 0.03, a.z0 - a.z1), M.apron)
    apron.position.set((a.x0 + a.x1) / 2, 0.015, (a.z0 + a.z1) / 2)
    field.add(apron)
    // holding pattern: dotted ovals in the sky (outer: waiting, inner: follow-up due)
    const [hx, hy, hz] = L.hold.c
    for (const [ring, mat, n] of [[false, M.holdDot, 64], [true, M.holdDotDue, 40]]) {
      const dots = new THREE.InstancedMesh(G.dot, mat, n)
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2
        const rx = L.hold.rx * (ring ? 0.56 : 1), rz = L.hold.rz * (ring ? 0.56 : 1)
        m.compose(new THREE.Vector3(hx + Math.cos(ang) * rx, hy - (ring ? 0.85 : 0) + Math.sin(ang * 2) * 0.12, hz + Math.sin(ang) * rz + (ring ? 2.4 : 0)),
          new THREE.Quaternion(), new THREE.Vector3(0.045, 0.045, 0.045))
        dots.setMatrixAt(i, m)
      }
      dots.userData.ring = ring
      field.add(dots)
    }
  }

  // ---- tokens ----
  const tokens = new Map()
  let selectedId = null
  function createToken(id) {
    const group = new THREE.Group()
    const glass = glassFor(P.bg)
    const body = new THREE.Mesh(G.capsule, glass); body.position.y = 0.33
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const core = new THREE.Mesh(G.core, coreMat); core.position.y = 0.33
    const puck = new THREE.Mesh(G.puck, M.puck); puck.position.y = 0.03
    const fresh = new THREE.Mesh(G.dot, new THREE.MeshBasicMaterial({ color: P.yellow })); fresh.scale.setScalar(0.07); fresh.position.y = 0.26
    const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ color: P.yellow.clone().multiplyScalar(P.dark ? 1.15 : 1.0) })); ring.position.y = 0.07
    const alarm = new THREE.Mesh(G.alarm, new THREE.MeshBasicMaterial({ color: P.coral.clone().multiplyScalar(P.dark ? 1.6 : 1.0) })); alarm.position.y = 0.065; alarm.visible = false
    const focus = new THREE.Mesh(G.focus, new THREE.MeshBasicMaterial({ color: P.dark ? P.bg : P.ink })); focus.position.y = 0.075; focus.visible = false
    const shadow = new THREE.Mesh(G.shadow, M.shadow); shadow.position.y = 0.058
    const pivot = new THREE.Group() // pitch and bank happen here
    pivot.add(body, core, puck, fresh, ring, alarm, focus)
    group.add(shadow, pivot)
    tokenRoot.add(group)
    const tok = { id, group, pivot, body, glass, core, coreMat, puck, fresh, ring, alarm, focus, shadow, kind: null, level: 0, levelTarget: 0, coreColor: P.coral.clone(), scale: 0 }
    group.scale.setScalar(0.0001)
    return tok
  }
  function setFamily(tok, kind) {
    const isPuck = kind === 'puck'
    tok.puck.visible = isPuck
    tok.body.visible = !isPuck
    tok.core.visible = !isPuck
    tok.shadow.visible = kind !== 'hold'
    tok.shadow.scale.set(isPuck ? 0.8 : 1, 1, isPuck ? 0.8 : 1)
  }
  // Urgency tiers: overdue = coral core (bright) + coral ring, soon = coral core, calm = paper core.
  function styleToken(tok, t) {
    setFamily(tok, t.kind)
    const tier = TIERS[t.tier] ? t.tier : 'calm'
    const hot = (t.kind === 'cleared' || t.kind === 'queue') && TIERS[tier].coral
    const tint = hot ? P.coral : t.kind === 'hold' ? P.wait : P.dark ? P.bg : P.paper
    tok.glass.attenuationColor.copy(tint).lerp(P.paper, hot ? 0.45 : t.kind === 'hold' ? 0.35 : 0.6)
    tok.glass.attenuationDistance = hot ? 1.6 : 2.4
    if (t.kind === 'cleared') {
      tok.coreColor.copy(hot ? P.coral : P.dark ? P.bg : P.paper)
      tok.levelTarget = tier === 'over' ? (P.dark ? 3.6 : 1.6) : tier === 'soon' ? (P.dark ? 2.0 : 1.2) : (P.dark ? 0.55 : 0.95)
    } else if (t.kind === 'queue') {
      tok.coreColor.copy(hot ? P.coral : P.dark ? P.bg : P.paper)
      tok.levelTarget = hot ? (P.dark ? 1.2 : 0.9) : (P.dark ? 0.3 : 0.9)
    } else if (t.kind === 'hold') { tok.coreColor.copy(t.due ? P.coral : P.wait); tok.levelTarget = t.due ? (P.dark ? 2.6 : 1.3) : (P.dark ? 0.9 : 0.75) }
    else tok.levelTarget = 0
    tok.ring.visible = !!t.started && t.kind === 'cleared'
    tok.alarm.visible = t.kind === 'cleared' && TIERS[tier].ring
    tok.fresh.visible = !!t.fresh && t.kind === 'puck'
    tok.targetScale = t.scale
    tok.kind = t.kind
  }
  function applyLevel(tok) {
    tok.coreMat.color.copy(tok.coreColor).multiplyScalar(tok.level)
  }

  // ---- tween loop (on demand) ----
  const anims = new Set()
  let raf = 0, visible = true, disposed = false
  function tween(dur, fn, e = ease.inOut) {
    return new Promise((res) => { anims.add({ t0: performance.now(), dur, fn, e, res }); kick() })
  }
  function kick() { if (!raf && visible && !disposed) raf = requestAnimationFrame(frame) }
  function frame(now) {
    raf = 0
    for (const a of [...anims]) {
      const k = clamp((now - a.t0) / a.dur)
      a.fn(a.e(k), k)
      if (k >= 1) { anims.delete(a); a.res() }
    }
    for (const tok of tokens.values()) {
      if (Math.abs(tok.level - tok.levelTarget) > 0.001 && !tok.departing) {
        tok.level = lerp(tok.level, tok.levelTarget, 0.18)
        if (Math.abs(tok.level - tok.levelTarget) < 0.01) tok.level = tok.levelTarget
        applyLevel(tok)
        anims.size || kick()
      }
    }
    stepLanes()
    composer.render()
    if (anims.size) kick()
  }

  function stepLanes() {
    if (!laneMesh) return
    let moving = false
    const c = new THREE.Color()
    laneState.forEach((ls, lane) => {
      const target = ls.level
      ls.cur = Math.abs(ls.cur - target) < 0.01 ? target : lerp(ls.cur, target, 0.2)
      if (ls.cur !== target) moving = true
      // the urgency tier sets how far the lane is lit and in which colour:
      // overdue = full lane in coral, soon = half lane in coral, calm = three paper lights
      const reach = ls.cur * LANE_N
      const tier = ls.tier
      const base = tier === 'calm' ? (P.dark ? P.bg : P.paper) : P.coral
      for (let i = 0; i < LANE_N; i++) {
        const lit = clamp(reach - i)
        const fall = 1 - (i / LANE_N) * 0.45
        const on = P.dark ? (tier === 'over' ? 3.0 : tier === 'soon' ? 1.6 : 0.9) * fall : (tier === 'over' ? 1.05 : tier === 'soon' ? 0.92 : 1.0)
        c.copy(P.dark ? P.strip.clone().multiplyScalar(1.6) : P.strip.clone().multiplyScalar(0.86)).lerp(base.clone().multiplyScalar(on), lit)
        laneMesh.setColorAt(lane * LANE_N + i, c)
      }
    })
    laneMesh.instanceColor.needsUpdate = true
    if (moving) kick()
  }

  // ---- camera with a lens shift: horizon sits at L.cy, verticals stay vertical ----
  const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3() }
  let view = 'next'
  function applyLens() {
    const n = camera.near, far = camera.far
    camera.projectionMatrix.makePerspective(-L.cx * n / L.f, (L.W - L.cx) * n / L.f, L.cy * n / L.f, -(L.H - L.cy) * n / L.f, n, far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  }
  function placeCamera() { camera.position.copy(cam.pos); camera.lookAt(cam.target); camera.updateMatrixWorld() }
  function setView(v, animate = true) {
    const c = cameraFor(v, L)
    const to = { pos: new THREE.Vector3(...c.pos), target: new THREE.Vector3(...c.target) }
    view = v
    if (!animate) { cam.pos.copy(to.pos); cam.target.copy(to.target); placeCamera(); kick(); return Promise.resolve() }
    const from = { pos: cam.pos.clone(), target: cam.target.clone() }
    return tween(720, (k) => { cam.pos.lerpVectors(from.pos, to.pos, k); cam.target.lerpVectors(from.target, to.target, k); placeCamera() })
  }

  // ---- size ----
  let lanesPx = null, tokenYpx = null, lastSnap = null
  function resize() {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return false
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.resolution.set(w, h)
    L = makeLayout(w, h, lanesPx, tokenYpx, layoutOpts)
    applyLens()
    buildField()
    const c = cameraFor(view, L)
    cam.pos.set(...c.pos); cam.target.set(...c.target); placeCamera()
    if (lastSnap) sync(lastSnap, { animate: false })
    rebuildContrails(lastSnap ? lastSnap.done : 0)
    kick()
    return true
  }

  // ---- sync tokens with a snapshot ----
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2])
  function sync(snap, { animate = true } = {}) {
    lastSnap = snap
    const T = targetsFor(snap, L)
    for (const [id, tok] of tokens) {
      if (T.has(id) || tok.departing) continue
      tokens.delete(id)
      if (!animate) { disposeToken(tok); continue }
      tween(260, (k) => tok.group.scale.setScalar(Math.max(0.0001, tok.scale * (1 - k))), ease.out).then(() => disposeToken(tok))
    }
    let n = 0
    for (const [id, t] of T) {
      let tok = tokens.get(id)
      const fresh = !tok
      if (fresh) { tok = createToken(id); tokens.set(id, tok) }
      if (tok.departing) continue
      const prevKind = tok.kind
      styleToken(tok, t)
      const to = v3(t.pos)
      if (fresh || !animate) {
        tok.group.position.copy(to); tok.group.rotation.y = t.yaw || 0
        tok.pivot.rotation.z = t.bank || 0
        if (fresh && animate && snap.dropId === id) {
          tok.group.position.y = 2.2
          tween(620, (k) => { tok.group.position.y = 2.2 * (1 - k); tok.group.scale.setScalar(Math.max(0.0001, t.scale * Math.min(1, k * 1.6))); tok.scale = t.scale }, ease.out)
        } else if (fresh && animate) {
          tween(340, (k) => { tok.scale = t.scale * k; tok.group.scale.setScalar(Math.max(0.0001, tok.scale)) }, ease.outBack)
        } else { tok.scale = t.scale; tok.group.scale.setScalar(t.scale) }
        tok.level = tok.levelTarget; applyLevel(tok)
        continue
      }
      moveToken(tok, prevKind, t, to, n++)
    }
    const lights = laneLights(snap)
    lights.forEach((l, i) => { laneState[i].level = l.level; laneState[i].tier = l.tier })
    if (!animate) laneState.forEach((ls) => { ls.cur = ls.level })
    updateFocus()
    kick()
  }

  function moveToken(tok, prevKind, t, to, i) {
    const from = tok.group.position.clone()
    const dist = from.distanceTo(to)
    const s0 = tok.scale, s1 = t.scale
    const yaw0 = tok.group.rotation.y, yaw1 = t.yaw || 0
    const bank0 = tok.pivot.rotation.z, bank1 = t.bank || 0
    if (dist < 0.001 && Math.abs(s0 - s1) < 0.001) { tok.group.rotation.y = yaw1; return }
    let ctrl
    if (prevKind === 'queue' && t.kind === 'cleared') ctrl = new THREE.Vector3(from.x, 0, to.z)
    else if (prevKind === 'puck' && t.kind !== 'puck') ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, Math.max(1.8, dist * 0.25), 0))
    const curve = ctrl ? new THREE.QuadraticBezierCurve3(from, ctrl, to) : new THREE.LineCurve3(from, to)
    const dur = Math.min(900, 420 + dist * 22) + Math.min(i, 6) * 45
    const familySwap = (prevKind === 'puck') !== (t.kind === 'puck')
    if (familySwap) setFamily(tok, prevKind)
    tween(dur, (k) => {
      curve.getPoint(k, tok.group.position)
      if (familySwap && k > 0.5) setFamily(tok, t.kind)
      const dip = familySwap ? 1 - Math.sin(k * Math.PI) * 0.55 : 1
      tok.scale = lerp(s0, s1, k) * dip
      tok.group.scale.setScalar(Math.max(0.0001, tok.scale))
      if (ctrl && prevKind === 'queue') {
        const tan = curve.getTangent(Math.min(0.999, k))
        tok.group.rotation.y = Math.atan2(-tan.x, -tan.z) * (1 - k * k)
      } else tok.group.rotation.y = lerp(yaw0, yaw1, k)
      tok.pivot.rotation.z = lerp(bank0, bank1, k)
    }, familySwap ? ease.inOut : ease.inOut)
  }

  function disposeToken(tok) {
    tokenRoot.remove(tok.group)
    tok.glass.dispose(); tok.coreMat.dispose()
  }

  function updateFocus() {
    for (const tok of tokens.values()) {
      const on = tok.id === selectedId && !tok.departing
      tok.focus.visible = on
      tok.pivot.position.y = on && tok.kind === 'puck' ? 0.12 : 0
    }
  }
  function setSelected(id) { selectedId = id; updateFocus(); kick() }

  // ---- signature: complete = accelerate along the strip, lift off with a light trail ----
  let pendingContrails = 0
  function depart(id) {
    const tok = tokens.get(id)
    if (!tok) return Promise.resolve()
    tok.departing = true
    tok.focus.visible = false
    const from = tok.group.position.toArray()
    const fromKind = tok.kind
    if (fromKind === 'puck') { setFamily(tok, 'cleared'); styleToken(tok, { kind: 'cleared', tier: 'soon', scale: 1 }) }
    tok.alarm.visible = false
    tok.coreColor.copy(P.coral)
    tok.group.rotation.y = 0
    pendingContrails += 1
    const trail = new Ribbon(48, 0.11, P.coral, P.dark ? 3.2 : 1.6, P.dark)
    trailRoot.add(trail.mesh)
    const hist = []
    const lvl0 = tok.level
    return tween(1150, (k) => {
      const s = liftoffAt(k, from)
      tok.group.position.set(...s.pos)
      tok.pivot.rotation.x = s.pitch
      tok.shadow.visible = s.pos[1] < 0.8
      tok.level = lvl0 + (5.5 - lvl0) * Math.min(1, k * 1.8)
      applyLevel(tok)
      const scale = 1 - Math.max(0, k - 0.8) * 2.5
      tok.group.scale.setScalar(Math.max(0.0001, scale))
      hist.push([s.pos[0], s.pos[1] + 0.36, s.pos[2]])
      if (hist.length > 48) hist.shift()
      if (k > 0.18) trail.set(hist, camera.position, 1, 0)
    }, ease.linear).then(() => {
      tokens.delete(id); disposeToken(tok)
      const pts = hist.slice()
      return tween(700, (k) => { trail.mat.uniforms.uOpacity.value = 1 - k; trail.set(pts, camera.position, 1, 0) }, ease.out)
    }).then(() => {
      trailRoot.remove(trail.mesh); trail.mesh.geometry.dispose(); trail.mat.dispose()
      pendingContrails = Math.max(0, pendingContrails - 1)
      rebuildContrails(lastSnap ? lastSnap.done : 0, true)
    })
  }

  // ---- contrails: one per completion today ----
  let contrails = []
  function rebuildContrails(done, fadeLast = false) {
    const n = Math.max(0, Math.min(10, done - pendingContrails))
    while (contrails.length > n) { const c = contrails.pop(); contrailRoot.remove(c.mesh); c.mesh.geometry.dispose(); c.mat.dispose() }
    while (contrails.length < n) {
      const i = contrails.length
      // contrails are neutral (ink on light, warm white on dark): the coral belongs to the
      // moment of completion only, then the trail settles into a plain contrail
      const c = new Ribbon(29, 0.05, P.dark ? P.bg : P.ink, P.dark ? 0.8 : 1.0, false)
      c.set(contrailPoints(i, L), new THREE.Vector3(L.mid, CAM_Y, 0), P.dark ? 0.42 : 0.22, 0.0)
      c.mat.uniforms.uOpacity.value = fadeLast ? 0 : 1
      contrailRoot.add(c.mesh)
      contrails.push(c)
      if (fadeLast) tween(600, (k) => { c.mat.uniforms.uOpacity.value = k }, ease.out)
    }
    kick()
  }
  const CAM_Y = 1.25

  // ---- theme ----
  function setPalette(p) {
    P = p
    buildMaterials()
    for (const tok of tokens.values()) {
      tok.puck.material = M.puck; tok.shadow.material = M.shadow
      tok.focus.material.color.copy(P.dark ? P.bg : P.ink)
      tok.alarm.material.color.copy(P.coral).multiplyScalar(P.dark ? 1.6 : 1.0)
    }
    buildField()
    rebuildContrails(lastSnap ? lastSnap.done : 0)
    if (lastSnap) sync(lastSnap, { animate: false })
    kick()
  }

  // ---- visibility: pause when the tab or the stage is hidden ----
  const onVis = () => { visible = !document.hidden; kick() }
  document.addEventListener('visibilitychange', onVis)
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting && !document.hidden; kick() })
  io.observe(host)
  const ro = new ResizeObserver(() => resize())
  ro.observe(host)

  buildMaterials()
  resize()
  renderer.compile(scene, camera)

  return {
    kind: 'webgl',
    canvas,
    sync, setView, setSelected, depart, setPalette,
    relayout(lp, ty) {
      const sameLanes = (!lanesPx && !lp) || (lanesPx && lp && lp.every((v, i) => Math.abs(v - lanesPx[i]) < 1))
      const same = sameLanes && Math.abs((ty || 0) - (tokenYpx || 0)) < 1
      lanesPx = lp; tokenYpx = ty
      if (!same) resize()
    },
    get busy() { return anims.size > 0 },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      renderer.dispose(); canvas.remove()
    },
  }
}
