// Startbahn: static rendering of the airfield as flat SVG. Same layout and the same
// information as the WebGL scene (world.js), no motion. Used for prefers-reduced-motion,
// when WebGL fails, and as the poster that shows at once while Three.js loads.
import { makeLayout, cameraFor, targetsFor, laneLights, contrailPoints, projector, holdPoint, LANE_N, TIERS } from './world.js'

const NS = 'http://www.w3.org/2000/svg'
const r1 = (n) => Math.round(n * 10) / 10

export function createFallback(host, layoutOpts = {}) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('field-svg')
  host.appendChild(svg)
  let snap = null, view = 'next', lanesPx = null, tokenYpx = null, selected = null

  function draw() {
    const W = host.clientWidth, H = host.clientHeight
    if (!W || !H) return
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    const L = makeLayout(W, H, lanesPx, tokenYpx, layoutOpts)
    const cam = cameraFor(view, L)
    const P = projector(cam, L)
    const out = []
    const NEAR = 0.35
    // near-plane clip of a ground polygon in camera space, then project
    const poly = (pts, style) => {
      const c = pts.map(P.toCam)
      const res = []
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length]
        const ina = a[2] > NEAR, inb = b[2] > NEAR
        if (ina) res.push(a)
        if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]) }
      }
      if (res.length < 3) return
      out.push(`<path d="M${res.map((p) => P.toScreen(p).slice(0, 2).map(r1).join(' ')).join('L')}Z" style="${style}"/>`)
    }
    const rect = (x0, x1, z0, z1, style, y = 0) => poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], style)
    const pt = (p) => { const s = P.project(p); return s[2] > NEAR ? s : null }

    // sky and ground split at the horizon of this camera; a camera that looks down from the
    // holding pattern has its horizon above the frame and sees ground only (no wedge)
    const fx = cam.target[0] - cam.pos[0], fz = cam.target[2] - cam.pos[2], fl = Math.hypot(fx, fz) || 1
    const hz = P.project([cam.pos[0] + (fx / fl) * 1e5, 0, cam.pos[2] + (fz / fl) * 1e5])
    out.push(`<rect width="${W}" height="${H}" style="fill:var(--rw-field-sky)"/>`)
    const hy = hz[2] > 0 ? Math.max(0, hz[1]) : 0
    if (hy < H) out.push(`<rect y="${r1(hy)}" width="${W}" height="${r1(H - hy + 2)}" style="fill:var(--rw-field-ground)"/>`)

    const s = L.strip
    rect(s.x - s.half, s.x + s.half, s.z0, -90, 'fill:var(--rw-field-strip)')
    const a = L.apron
    rect(a.x0, a.x1, a.z0, a.z1, 'fill:color-mix(in srgb, var(--rw-field-strip) 40%, var(--rw-field-ground))')
    const t = L.taxi
    rect(t.x - t.half, t.x + t.half, t.z0, -80, 'fill:color-mix(in srgb, var(--rw-field-strip) 55%, var(--rw-field-ground))')
    rect(s.x + s.half - 0.05, t.x, L.zTok + 0.95, L.zTok - 0.95, 'fill:color-mix(in srgb, var(--rw-field-strip) 55%, var(--rw-field-ground))')
    // markings
    const kw = (s.half - 0.9) / 6
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const cx = s.x + side * (0.75 + kw * (i + 0.5))
      rect(cx - kw * 0.31, cx + kw * 0.31, L.keys.z0, L.keys.z1, 'fill:var(--rw-field-marking)')
    }
    rect(s.x - s.half + 0.15, s.x + s.half - 0.15, L.zTok - 0.54, L.zTok - 0.7, 'fill:var(--rw-field-marking)')
    for (let i = 0; i < 14; i++) { const z = L.keys.z1 - 3 - i * 5.2; rect(s.x - 0.07, s.x + 0.07, z + 1.3, z - 1.3, 'fill:var(--rw-field-marking)') }
    // yellow lead-in line from the taxiway onto the threshold
    const lead = [[t.x, 0, -60], [t.x, 0, L.zTok - 1.4], [t.x - 0.4, 0, L.zTok - 0.4], [t.x - 1.4, 0, L.zTok], [L.lanes[2] + 0.75, 0, L.zTok]]
      .map((p) => P.toCam(p)).filter((c) => c[2] > NEAR).map((c) => P.toScreen(c).slice(0, 2).map(r1).join(','))
    if (lead.length > 1) out.push(`<polyline points="${lead.join(' ')}" style="fill:none;stroke:var(--ar-yellow);stroke-width:1.5"/>`)
    // edge lights
    for (let i = 0; i < 30; i++) for (const side of [-1, 1]) {
      const p = pt([s.x + side * (s.half - 0.12), 0.07, s.z0 - 1 - i * 3.2])
      if (p) out.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(Math.max(0.6, (0.06 * L.f) / p[2]))}" style="fill:var(--rw-field-marking)"/>`)
    }
    // lane lights: the urgency tier sets how far the lane is lit and in which colour
    // (overdue: full lane coral, soon: half lane coral, calm: three paper lights)
    if (snap) laneLights(snap).forEach((l, lane) => {
      for (let i = 0; i < LANE_N; i++) {
        const p = pt([L.lanes[lane], 0.06, L.zTok - 1.35 - i * 1.6])
        if (!p) continue
        const lit = i < Math.round(l.level * LANE_N)
        const col = !lit ? 'var(--rw-line-strong)' : l.tier === 'calm' ? 'var(--rw-field-marking)' : 'var(--ar-coral)'
        const op = !lit ? 0.6 : l.tier === 'calm' ? 1 : 1 - (i / LANE_N) * 0.35
        const stroke = lit && l.tier === 'calm' ? ';stroke:var(--rw-line-strong);stroke-width:.6' : ''
        out.push(`<ellipse cx="${r1(p[0])}" cy="${r1(p[1])}" rx="${r1(Math.max(0.9, (0.1 * L.f) / p[2]))}" ry="${r1(Math.max(0.6, (0.05 * L.f) / p[2]))}" style="fill:${col};opacity:${op.toFixed(2)}${stroke}"/>`)
      }
    })
    // holding pattern (outer: waiting, inner: follow-up due)
    for (const ring of [false, true]) {
      const pts = []
      for (let i = 0; i <= 72; i++) {
        const p = pt(holdPoint(L, ring, (i / 72) * Math.PI * 2))
        if (p) pts.push(`${r1(p[0])},${r1(p[1])}`)
      }
      if (pts.length > 2) out.push(`<polyline points="${pts.join(' ')}" style="fill:none;stroke:${ring ? 'var(--ar-coral)' : 'var(--rw-wait)'};stroke-width:1.2;stroke-dasharray:1.5 5;stroke-linecap:round;opacity:${ring ? 0.6 : 0.55}"/>`)
    }
    // contrails: one per completion today
    if (snap) for (let i = 0; i < Math.min(10, snap.done); i++) {
      const pts = contrailPoints(i, L).map((p) => pt(p)).filter(Boolean).map((p) => `${r1(p[0])},${r1(p[1])}`)
      if (pts.length > 1) out.push(`<polyline points="${pts.join(' ')}" style="fill:none;stroke:var(--rw-text-soft);stroke-width:1.4;stroke-linecap:round;opacity:0.7"/>`)
    }
    // tokens
    if (snap) {
      const T = [...targetsFor(snap, L).values()].sort((x, y) => P.toCam(y.pos)[2] - P.toCam(x.pos)[2])
      for (const tk of T) {
        const lift = tk.kind === 'hold' ? 0 : 0.33
        const c = pt([tk.pos[0], tk.pos[1] + lift, tk.pos[2]])
        if (!c || c[0] < -60 || c[0] > W + 60 || c[1] < -60 || c[1] > H + 60) continue
        const sc = tk.scale || 1
        const w = Math.max(3, (0.6 * sc * L.f) / c[2])
        const sel = tk.id === selected
        if (tk.kind === 'puck') {
          const g = pt([tk.pos[0], 0.02, tk.pos[2]])
          const rx = (0.38 * L.f) / g[2], ry = rx * Math.max(0.25, Math.abs((P.project([tk.pos[0], 0, tk.pos[2] - 0.38])[1] - g[1]) / rx))
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1] + ry * 0.2)}" rx="${r1(rx * 1.05)}" ry="${r1(ry * 1.05)}" style="fill:var(--ar-ink);opacity:.08"/>`)
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1] - ry * 0.35)}" rx="${r1(rx)}" ry="${r1(ry)}" style="fill:var(--rw-surface-raised);stroke:var(--rw-line-strong);stroke-width:1"/>`)
          if (tk.fresh) out.push(`<circle cx="${r1(g[0])}" cy="${r1(g[1] - ry * 0.35)}" r="${r1(Math.max(1.5, rx * 0.18))}" style="fill:var(--ar-yellow)"/>`)
          if (sel) out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1])}" rx="${r1(rx * 1.6)}" ry="${r1(ry * 1.6)}" style="fill:none;stroke:var(--rw-text);stroke-width:1.4"/>`)
          continue
        }
        if (tk.kind !== 'hold') {
          const g = pt([tk.pos[0], 0.05, tk.pos[2]])
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1])}" rx="${r1(w * 0.62)}" ry="${r1(w * 0.18)}" style="fill:var(--ar-ink);opacity:.1"/>`)
        }
        const tier = TIERS[tk.tier] ? tk.tier : 'calm'
        const hot = (tk.kind === 'cleared' || tk.kind === 'queue') && TIERS[tier].coral
        const coreCol = hot || (tk.kind === 'hold' && tk.due) ? 'var(--ar-coral)' : tk.kind === 'hold' ? 'var(--rw-wait)' : 'var(--rw-surface-raised)'
        const coreOp = tk.kind === 'hold' ? (tk.due ? 0.95 : 0.55) : hot ? (tier === 'over' ? 1 : 0.85) : 1
        const coreStroke = !hot && tk.kind !== 'hold' ? ';stroke:var(--rw-line-strong);stroke-width:.8' : ''
        if (tk.kind === 'cleared' && TIERS[tier].ring) {
          const g = pt([tk.pos[0], 0.065, tk.pos[2]])
          const ry = Math.abs(P.project([tk.pos[0], 0.065, tk.pos[2] - 0.56])[1] - g[1])
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1])}" rx="${r1((0.56 * L.f) / g[2])}" ry="${r1(Math.max(3, ry))}" style="fill:none;stroke:var(--ar-coral);stroke-width:2"/>`)
        }
        out.push(`<circle cx="${r1(c[0])}" cy="${r1(c[1])}" r="${r1(w / 2)}" style="fill:var(--rw-surface-raised);stroke:var(--rw-line-strong);stroke-width:1"/>`)
        out.push(`<circle cx="${r1(c[0])}" cy="${r1(c[1])}" r="${r1(Math.max(1.4, w * 0.2))}" style="fill:${coreCol};opacity:${coreOp.toFixed(2)}${coreStroke}"/>`)
        if (tk.started && tk.kind === 'cleared') {
          const g = pt([tk.pos[0], 0.07, tk.pos[2]])
          const ry = Math.abs(P.project([tk.pos[0], 0.07, tk.pos[2] - 0.66])[1] - g[1])
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1])}" rx="${r1((0.5 * L.f) / g[2])}" ry="${r1(Math.max(3, ry * 0.76))}" style="fill:none;stroke:var(--ar-yellow);stroke-width:1.6"/>`)
        }
        if (sel) {
          const g = pt([tk.pos[0], tk.kind === 'hold' ? tk.pos[1] : 0.07, tk.pos[2]])
          out.push(`<ellipse cx="${r1(g[0])}" cy="${r1(g[1])}" rx="${r1((0.8 * L.f) / g[2])}" ry="${r1((0.3 * L.f) / g[2])}" style="fill:none;stroke:var(--rw-text);stroke-width:1.4"/>`)
        }
      }
    }
    svg.innerHTML = out.join('')
  }

  const ro = new ResizeObserver(() => draw())
  ro.observe(host)
  return {
    kind: 'static',
    el: svg,
    sync(s) { snap = s; draw() },
    setView(v) { view = v; draw(); return Promise.resolve() },
    setSelected(id) { selected = id; draw() },
    depart() { return Promise.resolve() },
    relayout(lp, ty) { lanesPx = lp; tokenYpx = ty; draw() },
    setPalette() { draw() },
    get busy() { return false },
    dispose() { ro.disconnect(); svg.remove() },
  }
}
