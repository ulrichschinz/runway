// Fokus-Orbit for Android, drawn the way Compose would draw it: a fixed 2.5D projection on a
// plain Canvas (drawPath, drawOval, Brush.radialGradient), the glow as a RuntimeShader stand-in
// (radial gradient, additive on Plum-Nacht), animations only while something moves (Animatable).
// No WebGL, no rotation: the disc stays put like the web's, a chosen sector lifts instead.
// Labels are Compose Text placed with the same projection; they are not touch targets (the chips
// below the header filter). Taps on the canvas: a bead opens its sheet, a "+N" filters, a sector
// filters, the hub clears the filter. This file is the reference for OrbitCanvas.kt.

import { GEO, RING_NAMES, layoutOrbit } from './model.js'

const TILT = 0.5
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

export function createCanvasOrbit(host, { colors, onSector, onBead, onMore, labels }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'oc-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.prepend(canvas)
  const g = canvas.getContext('2d')
  let C = colors
  let W = 1, H = 1, dpr = 2
  let st = { ctx: null, emph: 'next', focusId: null, project: null, ghosts: [], showTray: false }
  let model = { beads: [], more: [], sectors: [], ghosts: [] }
  let half = 0 // 0 = full disc, 1 = collapsed half-disc header (Nächste, scrolled)
  const lift = new Map() // ctx -> current lift (eases to 0.06 for the chosen sector)
  const anims = []
  let raf = 0

  // ---------- projection (fixed) ----------
  function frame() {
    const outer = st.showTray ? GEO.tray + 0.3 : GEO.wait + 0.12
    const sFull = Math.min(W / (2 * (GEO.wait + 0.25)), (H - 16) / (2 * outer * TILT + 0.5))
    const sHalf = W / (2 * (GEO.wait + 0.4))
    const s = lerp(sFull, sHalf, half)
    const cy = lerp(H * 0.5 + (st.showTray ? -s * 0.25 : 4), H + 6, half)
    return { cx: W / 2, cy, s }
  }
  function P(a, r, up = 0) {
    const { cx, cy, s } = frame()
    const depth = Math.cos(a)
    return { x: cx + s * r * Math.sin(a), y: cy + s * r * depth * TILT - up * s, d: depth, k: 1 + 0.06 * depth * (r / 3) }
  }
  const css = (k, a = 1) => { const c = C[k] || '#888'; if (a === 1) return c; const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c); return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : c }

  // ---------- drawing ----------
  function ellipse(r, up = 0) { const { cx, cy, s } = frame(); g.beginPath(); g.ellipse(cx, cy - up * s, s * r, s * r * TILT, 0, 0, Math.PI * 2) }
  function wedgePath(a0, a1, r0, r1, up = 0) {
    const gap = GEO.groove, o0 = gap / (2 * r0), o1 = gap / (2 * r1), N = Math.max(10, Math.ceil(Math.abs(a0 - a1) * 12))
    g.beginPath()
    for (let i = 0; i <= N; i++) { const p = P(lerp(a0 - o1, a1 + o1, i / N), r1, up); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
    for (let i = 0; i <= N; i++) { const p = P(lerp(a1 + o0, a0 - o0, i / N), r0, up); g.lineTo(p.x, p.y) }
    g.closePath()
  }
  function sphere(x, y, r, base, opts = {}) {
    // shaded bead: a radial gradient with an off-centre highlight (AGSL in the app)
    const grd = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r * 1.05)
    grd.addColorStop(0, opts.hi || 'rgba(255,255,255,0.85)')
    grd.addColorStop(0.3, base)
    grd.addColorStop(0.78, base)
    grd.addColorStop(1, opts.rim || css('rim'))
    g.fillStyle = grd
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  function glow(x, y, r, color, a = 0.55) {
    g.save()
    g.globalCompositeOperation = C.dark ? 'lighter' : 'source-over'
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, css(color, a)); grd.addColorStop(1, css(color, 0))
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    g.restore()
  }
  function isEmph(b) {
    if (st.project) return b.project === st.project
    if (st.emph === 'inbox') return b.kind === 'inbox'
    if (st.emph === 'waiting') return b.kind === 'waiting'
    if (st.emph === 'none') return false
    if (st.ctx && b.kind !== 'inbox') {
      if (b.attention) return true
      if (b.kind === 'waiting') return !b.ctx || b.ctx === st.ctx
      return (b.ctxs || []).includes(st.ctx) || !(b.ctxs || []).length
    }
    return true
  }
  const upOf = (ctx) => lift.get(ctx) || 0

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    if (W < 40 || H < 40) return // hidden header (Inbox, Warten auf): nothing to draw
    const { s, cx, cy } = frame()
    const side = Math.max(3, s * 0.07)
    // ground shadow
    const sh = g.createRadialGradient(cx, cy + side * 2, s * 0.5, cx, cy + side * 2, s * (GEO.rimOut + 0.4))
    sh.addColorStop(0, css('ink', C.dark ? 0.35 : 0.1)); sh.addColorStop(1, css('ink', 0))
    g.fillStyle = sh; g.beginPath(); g.ellipse(cx, cy + side * 2, s * (GEO.rimOut + 0.45), s * (GEO.rimOut + 0.45) * TILT, 0, 0, Math.PI * 2); g.fill()
    // disc body: side wall, the groove floor (darker), then one slab per context
    g.fillStyle = css('discSide'); ellipse(GEO.rimOut + 0.03, -side / s); g.fill()
    g.fillStyle = css('base'); ellipse(GEO.rimOut + 0.03); g.fill()
    const sel = st.ctx && model.sectors.some((x) => x.ctx === st.ctx) ? st.ctx : null
    for (const sec of model.sectors) {
      const up = upOf(sec.ctx)
      if (up > 0.001) { g.fillStyle = css('discSide'); wedgePath(sec.a0, sec.a1, GEO.rimIn, GEO.rimOut, 0); g.fill() }
      g.fillStyle = css(!sel ? 'disc' : sec.ctx === sel ? 'discSelected' : 'discDim')
      wedgePath(sec.a0, sec.a1, GEO.rimIn, GEO.rimOut, up); g.fill()
    }
    // urgency rings and the waiting ring
    GEO.rings.forEach((r, i) => { g.strokeStyle = css('ringLine', [0.6, 0.42, 0.28][i]); g.lineWidth = 1; ellipse(r); g.stroke() })
    g.setLineDash([4, 4]); g.strokeStyle = css('ringLine', 0.32); ellipse(GEO.wait); g.stroke(); g.setLineDash([])
    // inbox tray (only in the review's Inbox step; the Inbox tab carries its own count)
    if (st.showTray) {
      const ta = GEO.trayArc + 0.05
      g.fillStyle = css('disc'); g.beginPath()
      for (let i = 0; i <= 16; i++) { const p = P(lerp(-ta, ta, i / 16), GEO.tray + 0.2); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y) }
      for (let i = 0; i <= 16; i++) { const p = P(lerp(ta, -ta, i / 16), GEO.tray - 0.2); g.lineTo(p.x, p.y) }
      g.closePath(); g.fill(); g.strokeStyle = css('ringLine', 0.18); g.stroke()
    }
    // hub (you)
    g.fillStyle = css('discSide'); ellipse(GEO.hub, -side * 1.6 / s); g.fill()
    g.fillStyle = css('hub'); ellipse(GEO.hub, side * 0.4 / s); g.fill()
    const you = P(0, 0, 0.3)
    const pulse = anims.reduce((m, a) => Math.max(m, a.hubPulse || 0), 0)
    if (pulse) glow(you.x, you.y, s * 0.9, 'live', 0.5 * pulse)
    sphere(you.x, you.y, s * 0.15, css('you'), { rim: css('youRim') })
    // ghosts: stalled projects keep an empty yellow ring
    for (const gh of model.ghosts || []) { const p = P(gh.a, gh.r, upOf(gh.ctx)); g.strokeStyle = css('attention'); g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, s * GEO.bead * 1.3, s * GEO.bead * 1.3 * TILT * 1.3, 0, 0, Math.PI * 2); g.stroke() }
    // "+N" slots: a thin ring; the number is Compose Text on top
    for (const m of model.more) { if (m.tray && !st.showTray) continue; const p = P(m.a, m.r, m.hub ? 0.18 : upOf(m.ctx)); g.strokeStyle = css('ringLine', 0.45); g.lineWidth = 1; g.beginPath(); g.ellipse(p.x, p.y, s * GEO.bead * 1.2, s * GEO.bead * 1.2 * TILT * 1.2, 0, 0, Math.PI * 2); g.stroke() }
    // beads, back to front
    const flying = new Set(anims.filter((a) => a.id != null).map((a) => a.id))
    const list = model.beads.filter((b) => !flying.has(b.id) && (b.kind !== 'inbox' || st.showTray)).map((b) => ({ b, p: P(b.a, b.r, b.hub ? 0.18 : b.kind === 'next' ? upOf(b.ctx) : 0) })).sort((x, y) => x.p.y - y.p.y)
    for (const { b, p } of list) drawBead(b, p, s)
    const focus = model.beads.find((b) => b.id === st.focusId && b.kind !== 'inbox')
    if (focus && !flying.size) drawThread(P(focus.a, focus.r, GEO.bead * 1.2), you, 'focus')
    for (const a of anims) a.draw && a.draw(s, you)
    placeLabels()
  }
  function drawBead(b, p, s, over = {}) {
    const e = isEmph(b)
    const r = s * GEO.bead * (b.kind === 'next' ? 1.08 : 0.92) * p.k * (over.scale || 1)
    const y = p.y - r * 0.9
    g.fillStyle = css('ink', C.dark ? 0.4 : 0.16); g.beginPath(); g.ellipse(p.x + r * 0.15, p.y + 1, r * 1.05, r * 0.42, 0, 0, Math.PI * 2); g.fill()
    if (b.attention && (e || b.kind === 'next')) { g.strokeStyle = css('attention'); g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, r * 1.45, r * 1.45 * TILT * 1.25, 0, 0, Math.PI * 2); g.stroke() }
    if (b.kind === 'waiting') {
      g.strokeStyle = css(e ? 'beadWaiting' : 'beadDim'); g.lineWidth = r * 0.55
      g.beginPath(); g.ellipse(p.x, y + r * 0.3, r * 0.8, r * 0.5, 0, 0, Math.PI * 2); g.stroke()
      return
    }
    if (over.live || (b.live && e)) glow(p.x, y, r * 3.2, 'live', 0.5)
    const base = over.live ? css('live') : !e ? css('beadDim') : b.kind === 'inbox' ? css('beadInbox') : b.live ? css('live') : css('beadNext')
    sphere(p.x, y, r, base, { rim: !e ? css('beadDim') : b.kind === 'inbox' ? css('beadInbox') : css(b.live || over.live ? 'liveRim' : 'beadRim') })
  }
  function drawThread(from, to, color) {
    const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 40
    g.strokeStyle = css(color); g.lineWidth = 2; g.lineCap = 'round'
    g.beginPath(); g.moveTo(to.x, to.y)
    for (let i = 1; i <= 30; i++) { const t = i / 30; g.lineTo((1 - t) * (1 - t) * to.x + 2 * (1 - t) * t * cx + t * t * from.x, (1 - t) * (1 - t) * to.y + 2 * (1 - t) * t * cy + t * t * from.y) }
    g.stroke()
  }

  // ---------- labels (Compose Text placed from the same projection; not touch targets) ----------
  const secEls = new Map()
  const ringEls = RING_NAMES.map((n) => { const e = document.createElement('div'); e.className = 'oc-ring'; e.textContent = n; labels.append(e); return e })
  const hubEl = document.createElement('div'); hubEl.className = 'oc-ring oc-hub'; labels.append(hubEl)
  let moreEls = []
  const ghostEls = []
  const at = (e, x, y) => { e.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)` }
  function syncLabels() {
    const seen = new Set()
    for (const sec of model.sectors) {
      seen.add(sec.ctx)
      let e = secEls.get(sec.ctx)
      if (!e) { e = document.createElement('div'); e.className = 'oc-sector'; labels.append(e); secEls.set(sec.ctx, e) }
      e.innerHTML = `${sec.ctx}<b>${sec.count}</b>`
      e.classList.toggle('on', st.ctx === sec.ctx)
      e.classList.toggle('off', !!st.ctx && st.ctx !== sec.ctx)
    }
    for (const [ctx, e] of secEls) if (!seen.has(ctx)) { e.remove(); secEls.delete(ctx) }
    moreEls.forEach(({ el }) => el.remove())
    moreEls = model.more.filter((m) => !m.tray || st.showTray).map((m) => { const el = document.createElement('div'); el.className = 'oc-more'; el.textContent = `+${m.n}`; labels.append(el); return { el, m } })
    const nHub = model.beads.filter((b) => b.hub).length + (model.more.find((m) => m.cell === 'hub')?.n || 0)
    hubEl.innerHTML = nHub ? `Mitte · ohne Kontext <b>${nHub}</b>` : ''
  }
  function placeLabels() {
    const collapsed = half > 0.5
    for (const sec of model.sectors) {
      const e = secEls.get(sec.ctx); if (!e) continue
      const p = P(sec.labelA, GEO.label - 0.05)
      e.style.visibility = collapsed && (p.y > H - 8 || p.d > 0.2) ? 'hidden' : ''
      at(e, Math.max(44, Math.min(W - 44, p.x)), Math.max(14, Math.min(H - 12, p.y)))
    }
    GEO.rings.forEach((r, i) => { const p = P(0, r); ringEls[i].style.visibility = collapsed ? 'hidden' : ''; at(ringEls[i], p.x, p.y) })
    // too little room between hub and "Jetzt" on a phone: the key sits in the header's corner
    hubEl.style.visibility = collapsed || !hubEl.textContent ? 'hidden' : ''
    moreEls.forEach(({ el, m }) => { const p = P(m.a, m.r, m.hub ? 0.18 : upOf(m.ctx)); el.style.visibility = collapsed && p.d > 0.2 ? 'hidden' : ''; at(el, p.x, p.y - 2) })
    while (ghostEls.length > (model.ghosts || []).length) ghostEls.pop().remove()
    ;(model.ghosts || []).forEach((gh, i) => {
      if (!ghostEls[i]) { const e = document.createElement('div'); e.className = 'oc-ghost'; labels.append(e); ghostEls[i] = e }
      const p = P(gh.a, gh.r)
      ghostEls[i].textContent = gh.project
      ghostEls[i].style.visibility = collapsed ? 'hidden' : ''
      at(ghostEls[i], p.x, p.y - 22)
    })
  }

  // ---------- loop: only while something moves ----------
  function tick(now) {
    raf = 0
    let moving = false
    for (const sec of model.sectors) {
      const to = sec.ctx === st.ctx ? 0.06 : 0
      const cur = upOf(sec.ctx)
      const nx = cur + (to - cur) * 0.25
      lift.set(sec.ctx, Math.abs(to - nx) < 0.001 ? to : nx)
      if (Math.abs(to - nx) >= 0.001) moving = true
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i]
      if (a.holdUntil && now < a.holdUntil) continue
      if (a.holdUntil) { a.t0 += now - a.holdStart; a.holdUntil = 0 }
      const k = clamp((now - a.t0) / a.dur)
      if (a.hold && !a.held && k >= a.hold.at) { a.held = 1; a.holdStart = now; a.holdUntil = now + a.hold.ms; a.k = a.hold.at; a.step(a.hold.at); a.hold.onHold && a.hold.onHold(); continue }
      a.k = k; a.step(k)
      if (k >= 1) { anims.splice(i, 1); a.done && a.done() }
    }
    draw()
    if (anims.length || moving) {
      if (anims.length && !moving && anims.every((a) => a.holdUntil && now < a.holdUntil)) setTimeout(request, Math.max(16, Math.min(...anims.map((a) => a.holdUntil)) - performance.now()))
      else request()
    }
  }
  function request() { if (!raf) raf = requestAnimationFrame(tick) }

  // ---------- input: tap only (no drag: the disc does not turn) ----------
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    // beads and "+N" markers: 24 dp radius, so every target is at least 48 dp
    let best = null, bd = 24
    for (const b of model.beads) { if (b.kind === 'inbox' && !st.showTray) continue; const p = P(b.a, b.r, b.hub ? 0.18 : 0); const dd = Math.hypot(p.x - x, p.y - 8 - y); if (dd < bd) { bd = dd; best = { b } } }
    for (const m of model.more) { if (m.tray && !st.showTray) continue; const p = P(m.a, m.r); const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = { m } } }
    if (best?.b) return onBead(best.b.id)
    if (best?.m) return onMore && onMore(best.m)
    const { cx, cy, s } = frame()
    const dx = (x - cx) / s, dz = (y - cy) / (s * TILT)
    const rr = Math.hypot(dx, dz)
    if (rr < GEO.hub) return onSector(null)
    if (rr > GEO.rimIn && rr < GEO.rimOut + 0.1) {
      const a = Math.atan2(dx, dz)
      const sec = model.sectors.find((q) => { let t = a; while (t > q.a0) t -= 2 * Math.PI; while (t < q.a1) t += 2 * Math.PI; return t <= q.a0 && t >= q.a1 })
      if (sec) onSector(st.ctx === sec.ctx ? null : sec.ctx)
    }
  })

  // ---------- API (mirrors orbit3d) ----------
  function resize() {
    const r = host.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(3, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    draw()
  }
  new ResizeObserver(resize).observe(host)
  resize()

  return {
    update(tasks, s = {}) { st = { ...st, ...s }; model = layoutOrbit(tasks, st.ghosts || [], st.order); syncLabels(); draw(); request() },
    setHalf(h) { half = h; draw() },
    setColors(c) { C = c; draw() },
    positionOf(id) {
      const b = model.beads.find((x) => x.id === id)
      if (b) return { a: b.a, r: b.r, sector: b.sector, ring: b.ring, ctx: b.ctx }
      const m = model.more.find((x) => x.ids.includes(id))
      return m ? { a: m.a, r: m.r, sector: m.sector, ring: m.ring, ctx: m.ctx, hidden: true } : null
    },
    complete(id, { hold } = {}) {
      const b = model.beads.find((x) => x.id === id)
      return new Promise((resolve) => {
        const a = { id: b ? id : null, t0: performance.now(), dur: b ? 820 : 360, hold: hold && b ? { ...hold, onHold: resolve } : null, k: 0 }
        a.step = (k) => { a.hubPulse = !b ? Math.sin(k * Math.PI) : k > 0.85 ? Math.sin(((k - 0.85) / 0.15) * Math.PI) : 0 }
        if (b) a.draw = (s, you) => {
          const k = ease(a.k)
          const from = P(b.a, b.r)
          const cxm = (from.x + you.x) / 2, cym = Math.min(from.y, you.y) - s * 1.0
          const x = (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * cxm + k * k * you.x
          const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * cym + k * k * you.y
          // the coral trail ahead of the bead (AGSL glow in the app)
          g.strokeStyle = css('live', 0.85); g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y)
          for (let i = 1; i <= 20; i++) { const t = k + (1 - k) * (i / 20); g.lineTo((1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cxm + t * t * you.x, (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cym + t * t * you.y) }
          g.stroke()
          g.strokeStyle = css('live', 0.7 * (1 - a.k)); g.lineWidth = 1.5; g.beginPath(); g.ellipse(from.x, from.y, s * 0.25 * (1 + a.k * 2), s * 0.25 * (1 + a.k * 2) * TILT, 0, 0, Math.PI * 2); g.stroke()
          drawBead(b, { x, y: y + 8, k: 1 }, s, { live: true, scale: lerp(1.15, 0.6, k) })
        }
        a.done = () => { if (!a.hold) resolve(); draw() }
        anims.push(a); request()
      })
    },
    restore() { draw() },
    redraw: draw,
  }
}
