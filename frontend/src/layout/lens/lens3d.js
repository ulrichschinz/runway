// The Tageslinse in WebGL (plan M11, brief 0058): the one canvas of the new UI, ported from
// `06-kombination/lens3d.js` (01's `fx3d.js`, the lens scene only). It is the ONLY file that imports
// `three`, and it is reached only through `import()` in `lensController.js`
// (`tests/threeIsolation.test.js`), so Three.js stays in a lazy chunk.
//
// It knows numbers, never tasks: setLevel(0..1) and dropBead(). No text is drawn in here; the
// caption is DOM. Rendering is on demand: a frame is drawn when a value changes and while a short
// animation (bead, wobble, level) runs. When nothing moves, nothing renders. Hidden tab = paused.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { clampLevel as clamp, hairlineColour, landingBook, levelToHeight } from '../../shared/lensMath.js'

const CORAL = new THREE.Color('#FF7A6B')
const BG = new THREE.Color('#FBF6EE')
const PLUM_LIGHT = new THREE.Color('#A69BAC') // plum 45 % + bg, the dark theme's structure colour
const ACTION_INK = new THREE.Color('#A85352') // coral 62 % + ink: the lens rim on light ground

/**
 * The light lens (judge weak point 4: it read as a "peach ball"). Three looks; the plan asks Uli to
 * pick one from three stills (build/m11/lens-light-{current,a,b}.png). Until he has (open in brief
 * 0058), `LIGHT` is tuned A, per the plan's guidance: less coral attenuation, so the body reads
 * lighter than 06's peach and the liquid carries the coral; more transmission and thickness contrast; a crisp specular
 * highlight and fresnel rim; faint paper hairlines behind the sphere for the glass to refract.
 * Switching later is changing `LIGHT` to another key.
 */
export const LIGHT_LOOKS = {
  // 06 as approved on 31.10.
  current: {
    roughness: 0.1, thickness: 1.1, ior: 1.45, attenuation: '#FFC9BF', attenuationDistance: 3.2,
    clearcoatRoughness: 0.04, iridescence: 0.12, env: 0.95, rim: 0.85, rimPower: 3.2, spec: 0, hairlines: 0,
  },
  // tuned A: a clear body, a sharp highlight, a fine rim, hairlines refracted through it
  a: {
    roughness: 0.03, thickness: 1.7, ior: 1.5, attenuation: '#FFF3EF', attenuationDistance: 9,
    clearcoatRoughness: 0.015, iridescence: 0.06, env: 0.7, rim: 1, rimPower: 4.2, spec: 1, hairlines: 1,
  },
  // tuned B: as A, but a warmer, thinner body and a stronger coral rim
  b: {
    roughness: 0.05, thickness: 0.9, ior: 1.42, attenuation: '#FFE0D8', attenuationDistance: 5,
    clearcoatRoughness: 0.03, iridescence: 0.18, env: 1, rim: 1.15, rimPower: 3, spec: 0.7, hairlines: 0.6,
  },
}
export const LIGHT = 'a'

function radialTexture(stops) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  stops.forEach(([o, col]) => grd.addColorStop(o, col))
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Paper hairlines (the page's rule colour on its ground) behind the sphere, fading into the ground
// towards the edge, so the canvas never shows a ruled square. Opaque: the transmission pass sees only
// opaque objects.
function hairlineTexture(ground, rule, strength) {
  const n = 256
  const c = document.createElement('canvas')
  c.width = c.height = n
  const g = c.getContext('2d')
  g.fillStyle = ground
  g.fillRect(0, 0, n, n)
  // the rule colour is ink at 10 %: through the glass it needs about 2.4 times that to be seen at
  // all, scaled by the look's strength (A 1 → 24 %, B 0.6 → 14 %). Into the colour's own alpha: a
  // globalAlpha would only multiply the 10 % down, never up.
  g.strokeStyle = hairlineColour(rule, strength * 2.4)
  g.lineWidth = 2
  for (let y = 10; y < n; y += 22) {
    g.beginPath()
    g.moveTo(0, y + 0.5)
    g.lineTo(n, y + 0.5)
    g.stroke()
  }
  const fade = g.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n * 0.3)
  // from the ground made transparent, not from transparent black: a canvas gradient interpolates
  // unpremultiplied, and black would grey the paper on the way
  const [r, gg, b] = (ground.match(/\d+(\.\d+)?/g) || [251, 246, 238]).map(Number)
  fade.addColorStop(0, `rgba(${r},${gg},${b},0)`)
  fade.addColorStop(1, ground)
  g.fillStyle = fade
  g.fillRect(0, 0, n, n)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Fresnel rim: the thin bright-or-tinted edge that makes a sphere read as glass.
function rimMaterial(color, strength, power) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uPower: { value: power } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength; uniform float uPower;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = clamp(1.0 - dot(normalize(vN), normalize(vV)), 0.0, 1.0); // clamp before pow()
        gl_FragColor = vec4(uColor, clamp(pow(f, uPower) * uStrength, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  })
}

// A damped spring, integrated with a fixed small step (stable at any dt).
class Spring {
  constructor(value, { stiffness, damping }) {
    this.x = value
    this.v = 0
    this.target = value
    this.k = stiffness
    this.c = damping
  }

  step(dt) {
    let t = dt
    while (t > 0) {
      const h = Math.min(t, 1 / 240)
      const a = -this.k * (this.x - this.target) - this.c * this.v
      this.v += a * h
      this.x += this.v * h
      t -= h
    }
    return Math.abs(this.x - this.target) > 0.002 || Math.abs(this.v) > 0.02
  }
}

export class Fx {
  /** @param {{onLost?: () => void}} [options] */
  constructor({ onLost } = {}) {
    this.look = LIGHT
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
    this.size = 104
    this.sized = false
    this.anims = new Set()
    // every dropBead() promise settles: on landing, or when a newer bead, a hidden tab or a lost
    // context takes its animation away (else a held caption would wait for it forever)
    this.landings = landingBook()
    this.raf = 0
    this.last = 0
    this.frames = 0 // counted, so the idle state can be verified (no frames when nothing moves)
    this.frameMs = [] // intervals between the frames of an animation, ms
    this.syncTiming = false
    this.warm = false
    this.renderMs = [] // the time renderer.render() takes in those frames, ms (the WebKit budget, plan M11)
    this.ticking = false
    this.ground = '#FBF6EE'
    this.rule = 'rgba(27,20,40,0.10)'
    this.lens = this.buildLens()
    // compile every program now (the bead's too), so the first bead does not stall on a shader compile
    this.lens.bead.visible = true
    r.compile(this.lens.scene, this.lens.camera)
    this.lens.bead.visible = false
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
      cancelAnimationFrame(this.raf)
      this.raf = 0
      this.anims.clear()
      this.landings.settleAll()
      onLost?.()
    })
    this.onVisible = () => {
      if (!document.hidden) this.kick()
    }
    document.addEventListener('visibilitychange', this.onVisible)
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
    const key = new THREE.DirectionalLight(0xfff4e6, 2.1)
    key.position.set(-3, 4.2, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffe7de, 1.3)
    rim.position.set(3.2, 2.2, -3.4)
    scene.add(rim)
    const fill = new THREE.DirectionalLight(0xe9e6ff, 0.35)
    fill.position.set(4, -1, 3)
    scene.add(fill)
    // tuned A's crisp highlight: a small, hard light whose clearcoat reflection is one bright point
    const spec = new THREE.PointLight(0xffffff, 0, 0, 2)
    spec.position.set(-1.4, 1.9, 3.2)
    scene.add(spec)

    // paper hairlines behind the sphere, for the glass to refract (light only)
    const hairMat = new THREE.MeshBasicMaterial({ toneMapped: false })
    const hair = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), hairMat)
    hair.position.set(0, -0.22, -1.6) // the camera looks down a little: centred behind the sphere as seen
    hair.visible = false
    scene.add(hair)

    // contact shadow (soft blob, plum-tinted), so the lens sits on the page
    const shadowMat = new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(61,43,92,0.32)'], [0.55, 'rgba(61,43,92,0.10)'], [1, 'rgba(61,43,92,0)']]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -1.02
    scene.add(shadow)

    // frosted glass: transmission + thickness, tinted by attenuation (Beer's law)
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.1, transmission: 1, thickness: 1.1, ior: 1.45,
      attenuationColor: new THREE.Color('#FFC9BF'), attenuationDistance: 3.2,
      clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.0,
      iridescence: 0.12, iridescenceIOR: 1.3, sheen: 0, sheenColor: CORAL.clone(), sheenRoughness: 0.35,
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
      color: CORAL.clone().lerp(BG, 0.3), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03,
      emissive: CORAL.clone(), emissiveIntensity: 0.14, side: THREE.DoubleSide,
    })
    const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 96), capMat)
    cap.rotation.x = -Math.PI / 2
    surface.add(cap)
    scene.add(surface)

    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshPhysicalMaterial({ color: CORAL.clone(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: CORAL.clone(), emissiveIntensity: 0.25 }),
    )
    bead.visible = false
    scene.add(bead)

    const st = {
      scene, camera, glass, glassMat, rimMat, liquid, liquidMat, plane, surface, cap, bead, shadowMat, hair, hairMat, spec, RL,
      level: new Spring(0, { stiffness: 180, damping: 16.6 }),
      // one visible swing, settled in about 0.6 s (damping ratio 0.4)
      tiltX: new Spring(0, { stiffness: 260, damping: 13 }),
      tiltZ: new Spring(0, { stiffness: 260, damping: 13 }),
    }
    this.applyLevel(st)
    return st
  }

  applyLevel(st) {
    const lv = clamp(st.level.x)
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
    if (!animate) {
      st.level.x = st.level.target
      st.level.v = 0
      this.applyLevel(st)
      this.requestRender()
      return
    }
    this.run('level', (dt) => {
      const alive = st.level.step(dt)
      this.applyLevel(st)
      return alive
    })
  }

  // Where the bead enters, in canvas CSS pixels (the DOM bead hands over exactly here).
  beadEntry() {
    const st = this.lens
    const v = new THREE.Vector3(0, 1.2, 0).project(st.camera)
    const unit = new THREE.Vector3(0.075, 1.2, 0).project(st.camera)
    return { x: (v.x * 0.5 + 0.5) * this.size, y: (-v.y * 0.5 + 0.5) * this.size, r: Math.abs(unit.x - v.x) * 0.5 * this.size }
  }

  // The bead falls through the glass into the liquid. Resolves when it lands, or at once when a
  // newer bead, a hidden tab or a lost context takes its fall away.
  dropBead({ nextLevel, beadPx = 6 } = {}) {
    const st = this.lens
    // one bead mesh: a bead still falling lands now, and the newer one (a higher level) falls
    this.landings.settleAll()
    const entry = this.beadEntry()
    st.bead.scale.setScalar(0.075 * (beadPx / Math.max(1, entry.r)))
    st.bead.position.set(0, 1.2, 0)
    st.bead.visible = true
    const h = (levelToHeight(clamp(st.level.x)) * 2 - 1) * st.RL
    let t = 0
    const FALL = 0.26
    return new Promise((resolve) => {
      const landed = this.landings.add(resolve)
      this.run('bead', (dt) => {
        t += dt
        const k = clamp(t / FALL)
        st.bead.position.y = 1.2 + (h - 1.2) * (k * k) // gravity: ease-in
        if (k < 1) return true
        st.bead.visible = false
        // impact: one tilt impulse, then the level rises
        const a = Math.random() * Math.PI * 2
        st.tiltX.v += Math.cos(a) * 1.25
        st.tiltZ.v += Math.sin(a) * 1.25
        this.run('wobble', (dt2) => {
          const a1 = st.tiltX.step(dt2)
          const a2 = st.tiltZ.step(dt2)
          this.applyLevel(st)
          return a1 || a2
        })
        if (nextLevel != null) this.setLevel(nextLevel)
        landed()
        return false
      })
      // a hidden tab never runs the fall: land at once
      if (document.hidden) {
        this.anims.clear()
        st.bead.visible = false
        this.setLevel(nextLevel ?? st.level.target, { animate: false })
        this.landings.settleAll()
      }
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

  /** The page's ground and rule colours (CSS colour strings): the scene's background and hairlines. */
  setGround(ground, rule) {
    this.ground = ground
    this.rule = rule || this.rule
    const c = new THREE.Color().setStyle(ground)
    this.lens.scene.background = c
    this.dark = c.r + c.g + c.b < 0.6
    this.applyLook()
  }

  /** Switch the light look (dev only: the three stills). */
  setLook(name) {
    if (!LIGHT_LOOKS[name]) return
    this.look = name
    this.applyLook()
  }

  applyLook() {
    const dark = this.dark
    const L = LIGHT_LOOKS[this.look]
    const st = this.lens
    const g = st.glassMat
    st.shadowMat.opacity = dark ? 0 : 1
    st.liquidMat.emissiveIntensity = dark ? 0.5 : 0.1
    // Dark glass (06, after review): a frosted plum-light body tinted toward coral, softer and weaker
    // reflections (environment and clearcoat made it read as chrome on ink), coral attenuation.
    g.sheen = dark ? 0.7 : 0
    g.sheenColor.copy(dark ? PLUM_LIGHT.clone().lerp(CORAL, 0.35) : CORAL)
    // on ink, full transmission shows the ink through the glass (a dark hole)
    g.transmission = dark ? 0.62 : 1
    g.roughness = dark ? 0.38 : L.roughness
    g.thickness = dark ? 1.1 : L.thickness
    g.ior = dark ? 1.45 : L.ior
    g.color.copy(dark ? PLUM_LIGHT.clone().lerp(BG, 0.5).lerp(CORAL, 0.12) : new THREE.Color(0xffffff))
    g.attenuationColor.copy(new THREE.Color(dark ? '#FFB3A8' : L.attenuation))
    g.attenuationDistance = dark ? 1.6 : L.attenuationDistance
    g.clearcoat = dark ? 0.55 : 1
    g.clearcoatRoughness = dark ? 0.12 : L.clearcoatRoughness
    g.envMapIntensity = dark ? 0.45 : 1.0
    g.iridescence = dark ? 0 : L.iridescence
    g.needsUpdate = true
    st.rimMat.uniforms.uColor.value.copy(dark ? PLUM_LIGHT.clone().lerp(BG, 0.3) : ACTION_INK)
    st.rimMat.uniforms.uStrength.value = dark ? 0.9 : L.rim
    st.rimMat.uniforms.uPower.value = dark ? 2.6 : L.rimPower
    st.scene.environmentIntensity = dark ? 0.5 : L.env
    st.spec.intensity = dark ? 0 : L.spec * 9
    const lines = !dark && L.hairlines > 0
    st.hair.visible = lines
    if (lines) {
      st.hairMat.map?.dispose()
      st.hairMat.map = hairlineTexture(this.ground, this.rule, L.hairlines)
      st.hairMat.needsUpdate = true
    }
    this.requestRender()
  }

  run(name, fn) {
    for (const a of this.anims) if (a.name === name) this.anims.delete(a)
    this.anims.add({ name, fn })
    this.kick()
  }

  requestRender() {
    this.kick()
  }

  kick() {
    if (this.raf || document.hidden || this.lost) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  tick = (now) => {
    // -1 while ticking: an animation that starts another one (the bead lands, the level rises)
    // must not open a second requestAnimationFrame loop
    this.raf = -1
    if (document.hidden || this.lost) {
      this.raf = 0
      return
    }
    const interval = now - this.last
    const dt = Math.min(0.05, interval / 1000)
    this.last = now
    // the time between two frames of one animation (the display's pace; render cost: renderMs)
    if (this.anims.size && this.ticking) this.frameMs.push(interval)
    if (this.frameMs.length > 240) this.frameMs.shift()
    this.ticking = true
    for (const a of [...this.anims]) if (!a.fn(dt)) this.anims.delete(a)
    this.draw()
    this.raf = this.anims.size ? requestAnimationFrame(this.tick) : 0
    if (!this.raf) this.ticking = false
  }

  draw() {
    this.frames += 1
    if (!this.warm) {
      // the first frame also draws the bead once, out of sight inside the glass, so its buffers are
      // on the GPU before it first falls (compiling alone left 37-52 ms in the fall's first frames)
      this.warm = true
      const bead = this.lens.bead
      bead.position.set(0, 0, 0)
      bead.scale.setScalar(0.001)
      bead.visible = true
      this.renderer.render(this.lens.scene, this.lens.camera)
      bead.visible = false
    }
    const t0 = performance.now()
    this.renderer.render(this.lens.scene, this.lens.camera)
    // the frame's own cost (the plan's WebKit budget is on this, not on the display's interval).
    // With `syncTiming` (dev only, for measuring) it waits for the GPU too (gl.finish).
    if (this.syncTiming) this.renderer.getContext().finish()
    if (this.ticking) {
      this.renderMs.push(performance.now() - t0)
      if (this.renderMs.length > 240) this.renderMs.shift()
    }
  }

  /** Lose the context on purpose (dev only: the plan's `WEBGL_lose_context` check). */
  loseContext() {
    this.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext()
  }
}
