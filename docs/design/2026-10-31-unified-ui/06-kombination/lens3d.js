// The Tageslinse: the one WebGL canvas of proposal 06, taken from 01's fx3d.js (the lens scene only;
// 01's Inbox stones are not grafted). Loaded with import() after first paint, only when WebGL works and
// the user has not asked for reduced motion. It knows numbers, never tasks: setLevel(0..1) and
// dropBead(). No text is ever drawn in here; the caption is DOM.
//
// Rendering is on demand: a frame is drawn when a value changes and while a short animation
// (bead, wobble, level) runs. When nothing moves, nothing renders. Hidden tab = paused.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { levelToHeight } from './lens-flat.js'

const CORAL = new THREE.Color('#FF7A6B')
const BG = new THREE.Color('#FBF6EE')
const PLUM_LIGHT = new THREE.Color('#A69BAC') // plum 45 % + bg, the dark theme's structure colour
const ACTION_INK = new THREE.Color('#A85352') // coral 62 % + ink: the lens rim on light ground
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(([o, col]) => grd.addColorStop(o, col))
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Fresnel rim: the thin bright-or-tinted edge that makes a sphere read as glass.
function rimMaterial(color, strength, power) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uPower: { value: power } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength; uniform float uPower;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = clamp(1.0 - dot(normalize(vN), normalize(vV)), 0.0, 1.0); // clamp before pow()
        gl_FragColor = vec4(uColor, clamp(pow(f, uPower) * uStrength, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  })
}

// A critically-ish damped spring, integrated with a fixed small step (stable at any dt).
class Spring {
  constructor(value, { stiffness, damping }) { this.x = value; this.v = 0; this.target = value; this.k = stiffness; this.c = damping }
  step(dt) {
    let t = dt
    while (t > 0) {
      const h = Math.min(t, 1 / 240)
      const a = -this.k * (this.x - this.target) - this.c * this.v
      this.v += a * h; this.x += this.v * h; t -= h
    }
    return Math.abs(this.x - this.target) > 0.002 || Math.abs(this.v) > 0.02
  }
}

export class Fx {
  constructor({ onLost, timeScale = () => 1 } = {}) {
    this.timeScale = timeScale // proto.signature() slows the moment down for its screenshot
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'fx-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'low-power' })
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    r.outputColorSpace = THREE.SRGBColorSpace
    r.toneMapping = THREE.NeutralToneMapping // neutral, so brand colours stay true
    r.toneMappingExposure = 1
    r.localClippingEnabled = true
    this.renderer = r
    const pm = new THREE.PMREMGenerator(r)
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
    this.size = 120
    this.anims = new Set()
    this.raf = 0
    this.last = 0
    this.frames = 0 // counted, so the idle state can be verified (no frames when nothing moves)
    this.lens = this.buildLens()
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost && onLost() })
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick() })
  }

  // ---------------------------------------------------------------- lens
  buildLens() {
    const scene = new THREE.Scene()
    scene.environment = this.env
    scene.environmentIntensity = 0.95
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 50)
    camera.position.set(0, 0.62, 5.7)
    camera.lookAt(0, -0.1, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xf4ece0, 0.55))
    const key = new THREE.DirectionalLight(0xfff4e6, 2.1); key.position.set(-3, 4.2, 4); scene.add(key)
    const rim = new THREE.DirectionalLight(0xffe7de, 1.3); rim.position.set(3.2, 2.2, -3.4); scene.add(rim)
    const fill = new THREE.DirectionalLight(0xe9e6ff, 0.35); fill.position.set(4, -1, 3); scene.add(fill)

    // contact shadow (soft blob, plum-tinted), so the lens sits on the page
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(61,43,92,0.32)'], [0.55, 'rgba(61,43,92,0.10)'], [1, 'rgba(61,43,92,0)']]), transparent: true, depthWrite: false, toneMapped: false })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), shadowMat)
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.02
    scene.add(shadow)

    // frosted coral glass: transmission + thickness, tinted by attenuation (Beer's law)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.1, transmission: 1, thickness: 1.1, ior: 1.45,
      attenuationColor: new THREE.Color('#FFC9BF'), attenuationDistance: 3.2,
      clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.0,
      iridescence: 0.12, iridescenceIOR: 1.3,
      sheen: 0, sheenColor: CORAL.clone(), sheenRoughness: 0.35,
    })
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), glassMat)
    scene.add(glass)
    const rimMat = rimMaterial(ACTION_INK, 0.85, 3.2)
    const rimMesh = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 64), rimMat)
    rimMesh.renderOrder = 3
    scene.add(rimMesh)

    // liquid: a sphere clipped by the surface plane, plus a cap disc for the surface
    const RL = 0.86
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
    const liquidMat = new THREE.MeshPhysicalMaterial({
      color: CORAL.clone(), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1,
      sheen: 0.8, sheenColor: new THREE.Color('#FFB4A8'), sheenRoughness: 0.4,
      emissive: CORAL.clone(), emissiveIntensity: 0.1, clippingPlanes: [plane],
    })
    const liquid = new THREE.Mesh(new THREE.SphereGeometry(RL, 96, 64), liquidMat)
    scene.add(liquid)
    const surface = new THREE.Group()
    const capMat = new THREE.MeshPhysicalMaterial({
      color: CORAL.clone().lerp(new THREE.Color('#FBF6EE'), 0.3), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03,
      emissive: CORAL.clone(), emissiveIntensity: 0.14, side: THREE.DoubleSide,
    })
    const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 96), capMat)
    cap.rotation.x = -Math.PI / 2
    surface.add(cap)
    scene.add(surface)
    // No ripple, no flare: the bead, the rising level and one wobble already say "received".
    // The only bright highlight is the key light's specular on the clearcoat.

    const bead = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshPhysicalMaterial({ color: CORAL.clone(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: CORAL.clone(), emissiveIntensity: 0.25 }))
    bead.visible = false
    scene.add(bead)

    const st = {
      scene, camera, glass, glassMat, rimMat, liquid, liquidMat, plane, surface, cap, bead, shadowMat, RL,
      level: new Spring(0, { stiffness: 180, damping: 16.6 }),
      // one visible swing, settled in about 0.6 s (damping ratio 0.4)
      tiltX: new Spring(0, { stiffness: 260, damping: 13 }),
      tiltZ: new Spring(0, { stiffness: 260, damping: 13 }),
    }
    this.applyLevel(st)
    return st
  }

  applyLevel(st) {
    const lv = clamp(st.level.x, 0, 1)
    const h = (levelToHeight(lv) * 2 - 1) * st.RL // surface height in lens space
    const n = new THREE.Vector3(Math.sin(st.tiltZ.x), Math.cos(st.tiltX.x) * Math.cos(st.tiltZ.x), Math.sin(st.tiltX.x)).normalize()
    const p = new THREE.Vector3(0, h, 0)
    st.plane.setFromNormalAndCoplanarPoint(n.clone().negate(), p)
    const d = n.dot(p)
    const capR = Math.sqrt(Math.max(0, st.RL * st.RL - d * d))
    st.surface.position.copy(n.clone().multiplyScalar(d))
    st.surface.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
    st.surface.scale.setScalar(Math.max(0.0001, capR * 0.995))
    const visible = lv > 0.002
    st.liquid.visible = visible
    st.surface.visible = visible && lv < 0.998
  }

  setLevel(level, { animate = true } = {}) {
    const st = this.lens
    st.level.target = clamp(level)
    if (!animate) { st.level.x = st.level.target; st.level.v = 0; this.applyLevel(st); this.requestRender(); return }
    this.run('level', (dt) => { const alive = st.level.step(dt); this.applyLevel(st); return alive })
  }

  // Where the bead enters, in canvas CSS pixels (the DOM bead hands over exactly here).
  beadEntry() {
    const st = this.lens
    const p = new THREE.Vector3(0, 1.2, 0)
    const v = p.clone().project(st.camera)
    const unit = new THREE.Vector3(0.075, 1.2, 0).project(st.camera)
    return { x: (v.x * 0.5 + 0.5) * this.size, y: (-v.y * 0.5 + 0.5) * this.size, r: Math.abs(unit.x - v.x) * 0.5 * this.size }
  }

  // The bead falls through the glass into the liquid. Resolves when it lands.
  dropBead({ nextLevel, beadPx = 6 } = {}) {
    const st = this.lens
    const entry = this.beadEntry()
    const scale = 0.075 * (beadPx / Math.max(1, entry.r))
    st.bead.scale.setScalar(scale)
    st.bead.position.set(0, 1.2, 0)
    st.bead.visible = true
    const h = (levelToHeight(clamp(st.level.x)) * 2 - 1) * st.RL
    let t = 0
    const FALL = 0.26
    return new Promise((resolve) => {
      this.run('bead', (dt) => {
        t += dt
        const k = clamp(t / FALL)
        st.bead.position.y = 1.2 + (h - 1.2) * (k * k) // gravity: ease-in
        if (k >= 1) {
          st.bead.visible = false
          // impact: one tilt impulse, then the level rises
          const a = Math.random() * Math.PI * 2
          st.tiltX.v += Math.cos(a) * 1.25; st.tiltZ.v += Math.sin(a) * 1.25
          this.run('wobble', (dt2) => {
            const a1 = st.tiltX.step(dt2), a2 = st.tiltZ.step(dt2)
            this.applyLevel(st)
            return a1 || a2
          })
          if (nextLevel != null) this.setLevel(nextLevel)
          resolve()
          return false
        }
        return true
      })
    })
  }

  // ---------------------------------------------------------------- frame
  // Moving the canvas between slots draws one frame; staying in place draws nothing (0 frames idle).
  mount(slot, size) {
    const moved = this.canvas.parentElement !== slot
    if (moved) slot.appendChild(this.canvas)
    if (size !== this.size || !this.sized) this.resize(size)
    else if (moved) this.requestRender()
  }
  resize(size) {
    this.size = size
    this.sized = true
    this.renderer.setSize(size, size, false)
    this.canvas.style.width = this.canvas.style.height = `${size}px`
    this.requestRender()
  }
  setBackground(css) {
    const c = new THREE.Color(css)
    this.lens.scene.background = c
    const dark = c.r + c.g + c.b < 0.6
    this.lens.shadowMat.opacity = dark ? 0.0 : 1
    this.dark = dark
    // Dark glass (after review): the same frosted glass as on paper, not a grey metal ball. A light
    // plum-light body tinted toward coral, softer and weaker reflections (the environment and the
    // clearcoat made it read as chrome on ink), coral attenuation so the body glows warm.
    const g = this.lens.glassMat
    this.lens.liquidMat.emissiveIntensity = dark ? 0.5 : 0.1
    g.sheen = dark ? 0.7 : 0
    g.sheenColor.copy(dark ? PLUM_LIGHT.clone().lerp(CORAL, 0.35) : CORAL)
    // on ink, full transmission shows the ink through the glass (a dark hole); part of the light
    // comes back from a frosted plum-light body instead
    g.transmission = dark ? 0.62 : 1
    g.roughness = dark ? 0.38 : 0.1
    g.color.copy(dark ? PLUM_LIGHT.clone().lerp(BG, 0.5).lerp(CORAL, 0.12) : new THREE.Color(0xffffff))
    g.attenuationColor.copy(dark ? new THREE.Color('#FFB3A8') : new THREE.Color('#FFC9BF'))
    g.attenuationDistance = dark ? 1.6 : 3.2
    g.clearcoat = dark ? 0.55 : 1
    g.clearcoatRoughness = dark ? 0.12 : 0.04
    g.envMapIntensity = dark ? 0.45 : 1.0
    g.iridescence = dark ? 0 : 0.12
    g.needsUpdate = true
    this.lens.rimMat.uniforms.uColor.value.copy(dark ? PLUM_LIGHT.clone().lerp(BG, 0.3) : ACTION_INK)
    this.lens.rimMat.uniforms.uStrength.value = dark ? 0.9 : 0.85
    this.lens.rimMat.uniforms.uPower.value = dark ? 2.6 : 3.2
    this.lens.scene.environmentIntensity = dark ? 0.5 : 0.95
    this.requestRender()
  }
  run(name, fn) {
    for (const a of this.anims) if (a.name === name) this.anims.delete(a)
    this.anims.add({ name, fn }); this.kick()
  }
  requestRender() { this.dirty = true; this.kick() }
  kick() {
    if (this.raf || document.hidden) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }
  tick = (now) => {
    // -1 while ticking: an animation that starts another one (the bead lands, the level rises)
    // must not open a second requestAnimationFrame loop
    this.raf = -1
    if (document.hidden) { this.raf = 0; return }
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale()
    this.last = now
    for (const a of [...this.anims]) { if (!a.fn(dt)) this.anims.delete(a) }
    this.draw()
    this.raf = this.anims.size ? requestAnimationFrame(this.tick) : 0
  }
  draw() {
    this.dirty = false
    this.frames += 1
    this.renderer.render(this.lens.scene, this.lens.camera)
  }
}
