// "Leere Seite": the only WebGL surface in proposal 03. When the last Inbox item is clarified, a
// drop of ink lands on the empty page and diffuses through the paper fibres: coral pigment stays in
// the core, plum travels to the tide line (paper chromatography). The wet ink glistens under a
// raking key light and RoomEnvironment reflections (clearcoat driven by wetness), then dries and
// sinks in completely, so the moment ends on a clean page under "Inbox ist leer." The DOM is the
// paper; WebGL draws only the ink layer (transparent canvas), so there is no seam with the page.
//
// Rules from our Three.js notes, applied: physical material (MeshPhysicalMaterial with clearcoat),
// a light rig (hemisphere, raking key, fill) plus RoomEnvironment, neutral tone mapping, values
// clamped before pow(). No bloom: on paper a glow reads as a screen artefact, and nothing here is
// brighter than the page. No camera move: the page is the camera.
//
// Lifecycle (rule 5.1, the effect explains one state change and nothing else):
//   preloadInk()  fetches the modules only (Inbox at 1 or 2 items, idle time). No WebGL context.
//   inkBloom()    only on the step from >= 1 item to 0: creates the one canvas and context, compiles
//                 asynchronously, renders ~3.4 s of frames, then removes the canvas and releases the
//                 context. A revisit of the empty Inbox never calls it.
// The caller never calls it under prefers-reduced-motion; any failure leaves the typographic state.

const T_END = 3.4
let modules = null
let gl = null // { THREE, renderer, scene, camera, mesh, uniforms, canvas }
let job = null // { host, raf, ro, onEnd }
export const stats = { frames: 0, created: 0, released: 0, active: false }

export function preloadInk() {
  if (!modules) {
    modules = Promise.all([import('three'), import('three/addons/environments/RoomEnvironment.js')])
      .then(([THREE, env]) => ({ THREE, RoomEnvironment: env.RoomEnvironment }))
      .catch((err) => { console.info('ink: modules unavailable, typographic fallback', err?.message); modules = null; return null })
  }
  return modules
}

function probeColor(cssVar) {
  const el = document.createElement('i')
  el.style.cssText = `position:absolute;visibility:hidden;color:var(${cssVar})`
  document.body.append(el)
  const c = getComputedStyle(el).color
  el.remove()
  const n = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0]
  return c.startsWith('color(') ? n.slice(0, 3) : n.slice(0, 3).map((v) => v / 255)
}

const FRAG_HEAD = /* glsl */`
uniform float uT; uniform vec2 uRes; uniform vec2 uO; uniform vec3 uInkA; uniform vec3 uInkB;
uniform float uSeed; uniform float uScale; uniform float uDpr; uniform float uDark;
varying vec2 vInkPx;
float ihash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float inoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ihash(i), ihash(i + vec2(1.0, 0.0)), u.x), mix(ihash(i + vec2(0.0, 1.0)), ihash(i + vec2(1.0, 1.0)), u.x), u.y); }
float ifbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * inoise(p); p = p * 2.03 + 17.17; a *= 0.5; } return s; }
// paper fibres: thin ridges in five golden-angle directions on a warped domain (no lattice)
float ifibres(vec2 p){
  p += vec2(inoise(p * 0.012 + 1.3), inoise(p * 0.012 + 8.1)) * 26.0;
  float f = 0.0;
  for (int k = 0; k < 5; k++){
    float an = float(k) * 2.39996 + 0.5;
    vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an)) * p;
    q *= vec2(0.02, 0.24);
    float n = inoise(q + vec2(float(k) * 17.3, float(k) * 5.1));
    float ridge = clamp(1.0 - abs(n * 2.0 - 1.0), 0.0, 1.0);
    f += pow(ridge, 6.0) * (0.55 + 0.45 * inoise(p * 0.03 + float(k) * 3.3));
  }
  return clamp(f * 0.62, 0.0, 1.0);
}
// one drop: normalised distance (1.0 = its current rim), already wobbled by paper and fibres
vec2 idist(vec2 p, vec2 c, float R, float t0, float speed, float wobble, float fib){
  float t = max(uT - t0, 0.0);
  float g = 1.0 - exp(-t * speed);
  if (g <= 0.0001) return vec2(99.0);
  float r = R * (0.04 + 0.96 * sqrt(g));
  float n = ifbm(p * 0.0062 / uScale + c * 0.002 + uSeed);
  float n2 = ifbm(p * 0.021 / uScale + 7.3);
  float nl = inoise(p * 0.0062 / uScale + c * 0.002 + uSeed) * 0.65 + inoise(p * 0.0124 / uScale + 3.7) * 0.35;
  float d = length(p - c) / max(r, 1.0);
  // x: the rim as the paper shapes it; y: the smooth body of the wet drop (for its meniscus)
  return vec2(d + (n - 0.5) * wobble * g + (n2 - 0.5) * 0.12 * g - fib * 0.03 * g, d + (nl - 0.5) * wobble * g);
}
// wet-in-wet: drops that touch run into one shape (smooth minimum), so there is one tide line
float ismin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
`

const FRAG_INK = /* glsl */`
  vec2 ip = vInkPx;
  float S = uScale;
  float fib = ifibres(ip / S);
  // the first drop plus three lobes that run into it
  vec2 e0 = idist(ip, uO, 190.0 * S, 0.0, 1.5, 0.42, fib);
  vec2 e1 = idist(ip, uO + vec2(150.0, -22.0) * S, 128.0 * S, 0.22, 1.9, 0.48, fib);
  vec2 e2 = idist(ip, uO + vec2(-58.0, -96.0) * S, 96.0 * S, 0.38, 2.1, 0.5, fib);
  vec2 e3 = idist(ip, uO + vec2(236.0, 62.0) * S, 72.0 * S, 0.55, 2.4, 0.55, fib);
  float d0 = e0.x;
  float D = ismin(ismin(ismin(e0.x, e1.x, 0.32), e2.x, 0.32), e3.x, 0.3);
  float Ds = ismin(ismin(ismin(e0.y, e1.y, 0.32), e2.y, 0.32), e3.y, 0.3);
  float inside = 1.0 - smoothstep(0.955, 1.0, D);
  float tide = exp(-pow(clamp(abs(0.972 - D) / 0.026, 0.0, 6.0), 2.0)) * (1.0 - smoothstep(0.985, 1.01, D));
  // chromatography: coral pigment stays in the core of the first drop, plum travels to the rim
  float core = 1.0 - smoothstep(0.05, 0.86, d0);
  float body = inside * (0.34 + 0.26 * clamp(1.0 - D, 0.0, 1.0) + 0.22 * core) + tide * 0.62 * smoothstep(0.0, 0.5, uT);
  float coralW = body * core;
  float plumW = body * (1.0 - core);
  float grain = inoise(ip * 0.24) * 0.5 + inoise(ip * 0.085) * 0.5;
  float mottle = ifbm(ip * 0.018 / S + 3.1);
  float pool = (0.88 + 0.14 * fib * inside + 0.08 * (grain - 0.5)) * (0.76 + 0.48 * mottle);
  float inkA = clamp(body, 0.0, 1.0) * pool;
  float inkWet = 1.0 - smoothstep(0.4, 2.4, uT);
  // dries and sinks in completely: the moment ends on a clean page
  float sinkIn = 1.0 - smoothstep(1.7, 3.3, uT);
  // no hard canvas edge, ever
  vec2 e = min(ip, uRes - ip);
  float edge = smoothstep(0.0, 48.0, e.x) * smoothstep(0.0, 48.0, e.y);
  vec3 inkCol = mix(uInkB, uInkA, core);
  inkCol *= 1.0 - 0.12 * core * (1.0 - core) * 4.0;
  inkCol *= mix(1.0, 1.45, uDark);
  diffuseColor.rgb = inkCol;
  diffuseColor.a = clamp(inkA * sinkIn * edge, 0.0, 0.92);
`

function setup(THREE, RoomEnvironment) {
  const canvas = document.createElement('canvas')
  canvas.className = 'ink-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' })
  } catch (err) {
    console.info('ink: no WebGL context, typographic fallback')
    return null
  }
  stats.created++
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.0
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); const j = job; gl = null; if (j) { j.host.classList.add('ink-failed'); release() } })

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.38
  pmrem.dispose()

  // light rig: soft sky, a raking key from the upper left (shows the fibres), a cool fill
  scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color('#F4ECE0'), 1.25))
  const key = new THREE.DirectionalLight(0xfff4e6, 3.4)
  key.position.set(-0.7, 0.56, 0.4)
  const fill = new THREE.DirectionalLight(0xe8e4ff, 0.6)
  fill.position.set(0.8, -0.3, 0.6)
  const sky = new THREE.DirectionalLight(0xffffff, 3.2) // a high window: its reflection is the wet glint
  sky.position.set(-0.32, 0.42, 0.85)
  scene.add(key, fill, sky)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
  camera.position.z = 10

  const uniforms = {
    uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uO: { value: new THREE.Vector2() },
    uInkA: { value: new THREE.Color() }, uInkB: { value: new THREE.Color() }, uSeed: { value: 0.37 }, uScale: { value: 1 }, uDpr: { value: 1 }, uDark: { value: 0 },
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.82, specularIntensity: 0.25,
    clearcoat: 1, clearcoatRoughness: 0.3, transparent: true, depthWrite: false, dithering: true,
  })
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uRes;\nvarying vec2 vInkPx;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vInkPx = (modelMatrix * vec4(transformed, 1.0)).xy + uRes * 0.5;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_INK)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  // wet paper swells: the fibre relief grows where the ink is, and the raking key light finds it
  float hf = fib * 0.75 + grain * 0.25;
  float amp = (0.25 + 0.9 * inkWet) * clamp(inkA * 1.5, 0.0, 1.0) * 1.6;
  // while wet, the ink stands as a shallow meniscus: flat in the middle, curved at the rim.
  // Only this smooth surface is glossy (clearcoat), so the glint is one clean crescent.
  float hd = (1.0 - smoothstep(0.45, 1.0, Ds)) * inkWet * 30.0 * uScale * uDpr;
  vec3 inkDomeN = normalize(normal + vec3(-dFdx(hd), -dFdy(hd), 0.0));
  normal = normalize(inkDomeN + vec3(-dFdx(hf) * amp, -dFdy(hf) * amp, 0.0));`)
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n  clearcoatNormal = inkDomeN;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.clearcoat *= inkWet * clamp(inkA * 1.6, 0.0, 1.0);')
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  scene.add(mesh)
  gl = { THREE, renderer, scene, camera, mesh, uniforms, canvas, pmremTex: scene.environment }
  return gl
}

function size(host) {
  const r = host.getBoundingClientRect()
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
  const { renderer, camera, mesh, uniforms } = gl
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) // the ink is soft; 1.5x halves the fill cost on 2x screens
  renderer.setPixelRatio(dpr)
  uniforms.uDpr.value = dpr
  renderer.setSize(w, h, false)
  camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2
  camera.updateProjectionMatrix()
  mesh.scale.set(w, h, 1)
  uniforms.uRes.value.set(w, h)
  uniforms.uScale.value = Math.min(1.2, Math.max(0.4, Math.min(w, h * 1.5) / 860))
  return { w, h }
}

function frame() {
  if (!gl) return
  gl.renderer.render(gl.scene, gl.camera)
  stats.frames++
}

function stop() {
  if (!job) return
  cancelAnimationFrame(job.raf)
  job.raf = 0
  stats.active = false
}

function onVisibility() {
  if (!job || !gl) return
  if (document.hidden) { stop(); return }
  release() // the moment has passed while hidden: the page is simply clean
}
document.addEventListener('visibilitychange', onVisibility)

/**
 * Play the inbox-zero moment once in `host` (any positioned element). `origin` is the drop point in
 * host pixels (top-left based; default: left third of the page column). Resolves true when the ink
 * starts, false for the typographic fallback. `onEnd` runs when the canvas is gone again.
 */
export async function inkBloom(host, { origin = null, onEnd = null } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) { onEnd?.(); return false }
  release() // a moment still running elsewhere ends first
  const m = await preloadInk()
  let g = null
  if (m && host.isConnected) {
    try { g = setup(m.THREE, m.RoomEnvironment) } catch (err) { console.info('ink: setup failed', err?.message) }
  }
  if (!g || !host.isConnected) { host.classList.add('ink-failed'); onEnd?.(); return false }
  // compile off the main thread where the driver allows it (KHR_parallel_shader_compile);
  // the typographic state is already on the page, so a short wait costs nothing
  try { await g.renderer.compileAsync(g.scene, g.camera) } catch { /* compiled on first render */ }
  if (!host.isConnected || gl !== g) { onEnd?.(); return false }
  host.append(g.canvas)
  const { w, h } = size(host)
  const o = origin || [w * 0.34, h * 0.42]
  const sc = g.uniforms.uScale.value
  const ox = Math.min(w - 360 * sc, Math.max(270 * sc, o[0])), oy = Math.min(h - 250 * sc, Math.max(250 * sc, o[1]))
  g.uniforms.uO.value.set(ox, h - oy)
  g.uniforms.uInkA.value.setRGB(...probeColor('--rw-ink-a'), g.THREE.SRGBColorSpace)
  g.uniforms.uInkB.value.setRGB(...probeColor('--rw-ink-b'), g.THREE.SRGBColorSpace)
  g.uniforms.uSeed.value = 0.37
  const bg = probeColor('--rw-bg')
  g.uniforms.uDark.value = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) < 0.35 ? 1 : 0
  job = { host, raf: 0, ro: null, onEnd }
  job.ro = new ResizeObserver(() => { if (gl && job?.host === host) { size(host); frame() } })
  job.ro.observe(host)
  host.classList.add('ink-on')
  const t0 = performance.now()
  stats.active = true
  const loop = (now) => {
    if (!gl || job?.host !== host) return
    const t = (now - t0) / 1000
    g.uniforms.uT.value = Math.min(t, T_END)
    frame()
    if (t < T_END) job.raf = requestAnimationFrame(loop)
    else release()
  }
  job.raf = requestAnimationFrame(loop)
  return true
}

/** End the moment: remove the canvas and release the WebGL context (a new one is made next time). */
export function release() {
  const j = job
  if (j) {
    stop()
    j.ro?.disconnect()
    j.host.classList.remove('ink-on')
    job = null
  }
  if (gl) {
    const g = gl
    gl = null
    g.canvas.remove()
    g.mesh.geometry.dispose()
    g.mesh.material.dispose()
    g.pmremTex?.dispose()
    g.renderer.dispose()
    g.renderer.forceContextLoss()
    stats.released++
  }
  j?.onEnd?.()
}
