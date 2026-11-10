// Preview of the Android Tageslinse: compiles tageslinse.agsl in WebGL after a mechanical
// type rename (half4 -> vec4, float2 -> vec2 ...), so the preview runs the same shader text the
// Compose app would load into a RuntimeShader. One canvas, drawn only when a uniform changes.
import { levelToHeight } from '../lens-flat.js'

const RENAME = [[/\bhalf4\b/g, 'vec4'], [/\bhalf3\b/g, 'vec3'], [/\bhalf2\b/g, 'vec2'], [/\bhalf\b/g, 'float'],
  [/\bfloat4\b/g, 'vec4'], [/\bfloat3\b/g, 'vec3'], [/\bfloat2\b/g, 'vec2']]

function toGlsl(agsl) {
  let s = agsl
  s = s.replace(/layout\(color\)\s+/g, '') // WebGL has no colour-space conversion; the preview passes sRGB
  RENAME.forEach(([a, b]) => { s = s.replace(a, b) })
  s = s.replace('vec4 main(vec2 fragCoord)', 'vec4 mainImage(vec2 fragCoord)')
  return `precision highp float;\n${s}\nvoid main() { gl_FragColor = mainImage(vec2(gl_FragCoord.x, size.y - gl_FragCoord.y)); }`
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

export async function createLensShader(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
  if (!gl) return null
  const src = await (await fetch(new URL('./tageslinse.agsl', import.meta.url))).text()
  const vs = gl.createShader(gl.VERTEX_SHADER)
  gl.shaderSource(vs, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }')
  gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  gl.shaderSource(fs, toGlsl(src))
  gl.compileShader(fs)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs))
  const prog = gl.createProgram()
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = (n) => gl.getUniformLocation(prog, n)
  const u = { size: U('size'), mode: U('mode'), surface: U('surface'), tilt: U('tilt'), dark: U('dark'), coral: U('coral'), plum: U('plum'), light: U('light'), ground: U('ground'), pebbles: U('pebbles'), count: U('count') }
  gl.uniform4f(u.coral, ...hex('#FF7A6B'), 1)
  gl.uniform4f(u.plum, ...hex('#3D2B5C'), 1)
  gl.uniform4f(u.light, ...hex('#FBF6EE'), 1)

  const state = { mode: 0, level: 0, shownLevel: 0, vel: 0, tilt: 0, tv: 0, dark: 0, ground: '#FBF6EE', pebbles: [], frames: 0 }
  let raf = 0, last = 0

  function draw() {
    const w = canvas.width, h = canvas.height
    gl.viewport(0, 0, w, h)
    gl.uniform2f(u.size, w, h)
    gl.uniform1f(u.mode, state.mode)
    gl.uniform1f(u.surface, (levelToHeight(state.shownLevel) * 2 - 1) * 0.84 * 0.86)
    gl.uniform1f(u.tilt, state.tilt)
    gl.uniform1f(u.dark, state.dark)
    gl.uniform4f(u.ground, ...hex(state.ground), 1)
    const arr = new Float32Array(36)
    state.pebbles.slice(0, 9).forEach((p, i) => arr.set([p.x, p.y, p.r, p.a], i * 4))
    gl.uniform4fv(u.pebbles, arr)
    gl.uniform1f(u.count, Math.min(9, state.pebbles.length))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    state.frames += 1
  }
  // springs, same constants as the web lens (tokens.json motion.spring)
  function tick(now) {
    raf = 0
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    let alive = false
    for (let t = dt; t > 0; t -= 1 / 240) {
      const h = Math.min(t, 1 / 240)
      const a = -180 * (state.shownLevel - state.level) - 16.6 * state.vel
      state.vel += a * h; state.shownLevel += state.vel * h
      const b = -260 * state.tilt - 13 * state.tv
      state.tv += b * h; state.tilt += state.tv * h
    }
    if (Math.abs(state.shownLevel - state.level) > 0.002 || Math.abs(state.vel) > 0.02) alive = true
    if (Math.abs(state.tilt) > 0.002 || Math.abs(state.tv) > 0.02) alive = true
    state.pebbles.forEach((p) => { if (p.a !== p.ta) { p.a += Math.sign(p.ta - p.a) * Math.min(Math.abs(p.ta - p.a), dt / 0.3); alive = true } })
    state.pebbles = state.pebbles.filter((p) => p.ta > 0 || p.a > 0.001)
    draw()
    if (alive) raf = requestAnimationFrame(tick)
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick) } }

  return {
    canvas,
    get frames() { return state.frames },
    resize(css) {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(css * dpr); canvas.height = Math.round(css * dpr)
      canvas.style.width = canvas.style.height = `${css}px`
      draw()
    },
    setMode(m) { state.mode = m === 'pebbles' ? 1 : 0; draw() },
    setTheme({ dark, ground }) { state.dark = dark ? 1 : 0; state.ground = ground; draw() },
    setLevel(level, animate = true) { state.level = level; if (!animate) { state.shownLevel = level; state.vel = 0; draw() } else kick() },
    impact(nextLevel) { state.tv += 1.4; if (nextLevel != null) state.level = nextLevel; kick() },
    setPebbles(n, animate = true) {
      const SLOTS = [[0, -0.05, 0.36], [-0.5, 0.05, 0.3], [0.5, 0.08, 0.31], [-0.22, -0.45, 0.28], [0.3, -0.42, 0.29], [-0.78, -0.3, 0.24], [0.8, -0.28, 0.25], [-0.05, 0.42, 0.25], [0.02, -0.75, 0.22]]
      const want = Math.min(9, n)
      while (state.pebbles.filter((p) => p.ta > 0).length > want) { const p = [...state.pebbles].reverse().find((x) => x.ta > 0); p.ta = 0 }
      for (let i = state.pebbles.filter((p) => p.ta > 0).length; i < want; i++) {
        const used = new Set(state.pebbles.filter((p) => p.ta > 0).map((p) => p.slot))
        const slot = SLOTS.findIndex((_, j) => !used.has(j))
        const [x, y, r] = SLOTS[slot]
        state.pebbles.push({ slot, x, y, r, a: animate ? 0 : 1, ta: 1 })
      }
      state.pebbles.sort((a, b) => b.y - a.y)
      if (animate) kick(); else draw()
    },
  }
}
