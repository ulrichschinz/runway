// Fokus-Orbit, flat map (prefers-reduced-motion, WebGL missing or lost, or chosen in Einstellungen).
// Same model, same labels, same interactions, drawn top-down as SVG. No animation at all:
// every change is a single redraw. Colours come straight from the CSS tokens.

import { GEO, RING_NAMES, layoutOrbit, polar } from './model.js'

const NS = 'http://www.w3.org/2000/svg'
const VB = 3.95

export function createOrbit2D({ stage, labels, onHover, onOpen, onSector, onMore, tipFor }) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'orbit-svg')
  svg.setAttribute('viewBox', `${-VB} ${-VB} ${VB * 2} ${VB * 2}`)
  svg.setAttribute('aria-hidden', 'true')
  stage.prepend(svg)
  labels.innerHTML = ''

  let state = { ctx: null, emph: 'next', project: null, hoverId: null, focusId: null, ghosts: [] }
  let model = { beads: [], more: [], sectors: [], ghosts: [], lists: { inbox: [] } }

  const mk = (cls, html, tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; labels.append(e); return e }
  const secEls = new Map()
  const ringEls = RING_NAMES.map((n) => mk('o-ringlabel', n))
  const waitEl = mk('o-ringlabel o-waitlabel', '')
  const trayEl = mk('o-tray', '')
  const hubEl = mk('o-hublabel', '')
  const tipEl = mk('o-tip', '')
  let ghostEls = []
  let moreEls = []

  const P = (a, r) => polar(a, r)
  const f = (n) => n.toFixed(3)
  function wedgePath(a0, a1, r0, r1) {
    const gap = GEO.groove, o0 = gap / (2 * r0), o1 = gap / (2 * r1)
    const p = (a, r) => { const q = P(a, r); return `${f(q.x)} ${f(q.z)}` }
    const large = Math.abs(a0 - a1) > Math.PI ? 1 : 0
    return `M${p(a0 - o1, r1)} A${r1} ${r1} 0 ${large} 1 ${p(a1 + o1, r1)} L${p(a1 + o0, r0)} A${r0} ${r0} 0 ${large} 0 ${p(a0 - o0, r0)} Z`
  }
  function isEmph(b) {
    if (state.project) return b.project === state.project
    if (state.emph === 'inbox') return b.kind === 'inbox'
    if (state.emph === 'waiting') return b.kind === 'waiting'
    if (state.emph === 'none') return false
    if (state.ctx && b.kind !== 'inbox') {
      if (b.attention) return true
      if (state.ctx === '∅') return !(b.ctxs || []).length && !b.ctx
      if (b.kind === 'waiting') return !b.ctx || b.ctx === state.ctx
      return (b.ctxs || []).includes(state.ctx) || !(b.ctxs || []).length
    }
    return true
  }

  function draw() {
    const sel = state.ctx && model.sectors.some((s) => s.ctx === state.ctx) ? state.ctx : null
    let h = `<circle class="discbase" r="${GEO.rimOut + 0.03}"/>`
    model.sectors.forEach((s) => {
      h += `<path class="w ${!sel ? '' : s.ctx === sel ? 'sel' : 'dim'}" data-ctx="${s.ctx}" d="${wedgePath(s.a0, s.a1, GEO.rimIn, GEO.rimOut)}"/>`
    })
    if (model.sectors.length > 1) model.sectors.forEach((s) => { const a = P(s.a0, GEO.rimIn), b = P(s.a0, GEO.rimOut + 0.02); h += `<line class="groove" x1="${f(a.x)}" y1="${f(a.z)}" x2="${f(b.x)}" y2="${f(b.z)}"/>` })
    GEO.rings.forEach((r, i) => { h += `<circle class="ring r${i}" r="${r}"/>` })
    h += `<circle class="waitring" r="${GEO.wait}"/>`
    const t0 = P(-GEO.trayArc - 0.05, GEO.tray), t1 = P(GEO.trayArc + 0.05, GEO.tray)
    h += `<path class="traybed" d="M${f(t0.x)} ${f(t0.z)} A${GEO.tray} ${GEO.tray} 0 0 0 ${f(t1.x)} ${f(t1.z)}"/>`
    h += `<circle class="hub" r="${GEO.hub}" data-hub="1"/>`
    h += `<circle class="you" r="0.17" data-hub="1"/>`
    for (const g of model.ghosts || []) { const q = P(g.a, g.r); h += `<circle class="attn ghost" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 1.4}"/>` }
    for (const m of model.more) { const q = P(m.a, m.r); h += `<circle class="moreslot" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 1.15}"/>` }
    const focus = model.beads.find((b) => b.id === state.focusId)
    const focusMore = !focus && state.focusId != null ? model.more.find((m) => m.ids.includes(state.focusId) && !m.tray) : null
    if (focus && focus.kind === 'inbox') { const q = P(focus.a, focus.r); h += `<circle class="hovring" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 2}"/>` }
    else if (focus || focusMore) {
      const q = P((focus || focusMore).a, (focus || focusMore).r)
      h += `<path class="thread" d="M0 0 Q${f(q.x * 0.5 + q.z * 0.18)} ${f(q.z * 0.5 - q.x * 0.18)} ${f(q.x)} ${f(q.z)}"/>`
    }
    for (const b of model.beads) {
      const q = P(b.a, b.r)
      const e = isEmph(b)
      const cls = `bead ${b.kind}${b.live ? ' live' : ''}${e ? '' : ' dim'}${b.id === state.hoverId ? ' hov' : ''}`
      const r = b.kind === 'next' ? GEO.bead : GEO.bead * 0.82
      if (b.id === state.hoverId) h += `<circle class="hovring" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 2}"/>`
      if (b.attention && (e || b.kind === 'next')) h += `<circle class="attn" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 1.5}"/>`
      if (b.live && e) h += `<circle class="livehalo" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 2.4}"/>`
      h += `<circle class="${cls}" data-id="${b.id}" cx="${f(q.x)}" cy="${f(q.z)}" r="${r * (b.id === state.hoverId ? 1.25 : 1)}"/>`
      h += `<circle class="hit" data-id="${b.id}" cx="${f(q.x)}" cy="${f(q.z)}" r="${GEO.bead * 2}"/>`
    }
    svg.innerHTML = h
    placeLabels()
  }

  let inset = { top: 0, bottom: 0 }
  // a short stage (phone header) crops to the disc and the waiting ring; the tray stays off
  const vbFor = (h) => (h < 300 ? 3.08 : VB)
  function toPx(x, z) {
    const r = stage.getBoundingClientRect()
    const h = r.height - inset.top - inset.bottom
    const vb = vbFor(r.height)
    const s = Math.min(r.width, h) / (vb * 2)
    return { x: r.width / 2 + x * s, y: inset.top + h / 2 + z * s }
  }
  function fitBox() {
    const r = stage.getBoundingClientRect()
    const vb = vbFor(r.height)
    svg.setAttribute('viewBox', `${-vb} ${-vb} ${vb * 2} ${vb * 2}`)
    const compact = r.height < 300
    trayEl.style.display = compact ? 'none' : ''
    moreEls.forEach((x) => { if (x.m.tray) x.el.style.display = compact ? 'none' : '' })
  }
  const place = (el, p, dx = 0, dy = 0) => { el.style.transform = `translate(${Math.round(p.x + dx)}px, ${Math.round(p.y + dy)}px) translate(-50%, -50%)` }
  function placeLabels() {
    fitBox()
    const r = stage.getBoundingClientRect()
    for (const s of model.sectors) {
      const e = secEls.get(s.ctx); if (!e) continue
      const q = P(s.labelA, GEO.label)
      const p = toPx(q.x, q.z)
      p.x = Math.max(56, Math.min(r.width - 56, p.x)); p.y = Math.max(16, Math.min(r.height - 16, p.y))
      place(e, p)
    }
    GEO.rings.forEach((rr, i) => place(ringEls[i], toPx(0, rr)))
    place(waitEl, toPx(0, GEO.wait))
    place(trayEl, toPx(0, GEO.tray + 0.42))
    place(hubEl, toPx(0, GEO.rimIn + 0.08))
    ghostEls.forEach(({ el, q }) => place(el, toPx(q.x, q.z), 0, 22))
    moreEls.forEach(({ el, q }) => place(el, toPx(q.x, q.z)))
    const hb = model.beads.find((b) => b.id === state.hoverId)
    const hm = !hb && state.hoverId != null ? moreEls.find((x) => x.m.ids.includes(state.hoverId)) : null
    if (hb) { const q = P(hb.a, hb.r); place(tipEl, toPx(q.x, q.z), 0, -30) } else if (hm) place(tipEl, toPx(hm.q.x, hm.q.z), 0, -30)
  }

  function update(tasks, s = {}) {
    state = { ...state, ...s }
    model = layoutOrbit(tasks, state.ghosts || [], state.order)
    const seen = new Set()
    for (const sc of model.sectors) {
      seen.add(sc.ctx)
      let e = secEls.get(sc.ctx)
      if (!e) {
        e = mk('o-sector', '', 'button'); e.type = 'button'
        e.addEventListener('click', (ev) => { ev.stopPropagation(); onSector(state.ctx === sc.ctx ? null : sc.ctx) })
        secEls.set(sc.ctx, e)
      }
      e.innerHTML = `<span>${sc.ctx}</span><b>${sc.count}</b>`
      e.classList.toggle('on', state.ctx === sc.ctx)
      e.classList.toggle('off', !!state.ctx && state.ctx !== sc.ctx)
      e.setAttribute('aria-pressed', String(state.ctx === sc.ctx))
      e.setAttribute('aria-label', `Kontext ${sc.ctx}, ${sc.count} Aufgaben`)
    }
    for (const [ctx, e] of secEls) if (!seen.has(ctx)) { e.remove(); secEls.delete(ctx) }
    const nIn = model.lists.inbox.length
    trayEl.innerHTML = nIn ? `Inbox <b>${nIn}</b>` : 'Inbox leer'
    trayEl.classList.toggle('on', state.emph === 'inbox')
    waitEl.innerHTML = model.waitingCount ? `Warten auf ${model.waitingCount}${model.waitingDue ? ` · ${model.waitingDue} nachhaken` : ''}` : ''
    const nHub = model.beads.filter((b) => b.hub).length + (model.more.find((m) => m.cell === 'hub')?.n || 0)
    hubEl.innerHTML = nHub ? `<span class="pre">Mitte · </span>ohne Kontext <b>${nHub}</b>` : ''
    hubEl.style.display = nHub ? '' : 'none'
    ghostEls.forEach(({ el }) => el.remove())
    ghostEls = (model.ghosts || []).map((g) => ({ el: mk('o-ghost', `${g.project}<span>kein nächster Schritt</span>`), q: P(g.a, g.r) }))
    moreEls.forEach(({ el }) => el.remove())
    moreEls = model.more.map((m) => {
      const el = mk('o-more', `+${m.n}`, 'button'); el.type = 'button'
      const where = m.tray ? 'in der Inbox' : m.hub ? 'ohne Kontext' : m.ring === 3 ? `zum Nachhaken in ${m.ctx}` : `in ${m.ctx}, ${RING_NAMES[m.ring]}`
      el.setAttribute('aria-label', `${m.n} weitere ${where} zeigen`)
      el.addEventListener('click', (ev) => { ev.stopPropagation(); onMore && onMore(m) })
      return { el, m, q: P(m.a, m.r) }
    })
    draw()
    hover(state.hoverId)
  }
  function hover(id) {
    state.hoverId = id
    const b = model.beads.find((x) => x.id === id)
    const m = !b && id != null ? moreEls.find((x) => x.m.ids.includes(id)) : null
    moreEls.forEach((x) => x.el.classList.toggle('hl', x === m))
    const html = (b || m) && tipFor ? tipFor(b || { id, kind: 'more', more: m.m }) : ''
    tipEl.innerHTML = html
    tipEl.classList.toggle('show', !!html)
    draw()
  }
  function focus(id) { state.focusId = id; draw() }

  let lastHover = null
  svg.addEventListener('pointermove', (ev) => {
    const id = ev.target.dataset?.id ? Number(ev.target.dataset.id) : null
    svg.style.cursor = ev.target.dataset?.id || ev.target.dataset?.ctx || ev.target.dataset?.hub ? 'pointer' : 'default'
    if (id !== lastHover) { lastHover = id; hover(id); onHover(id) }
  })
  svg.addEventListener('pointerleave', () => { if (lastHover != null) { lastHover = null; hover(null); onHover(null) } })
  svg.addEventListener('click', (ev) => {
    const d = ev.target.dataset || {}
    if (d.id) onOpen(Number(d.id))
    else if (d.hub) onSector(null)
    else if (d.ctx) onSector(state.ctx === d.ctx ? null : d.ctx)
  })
  const ro = new ResizeObserver(() => placeLabels())
  ro.observe(stage)

  return {
    kind: '2d',
    update, hover, focus,
    complete(id) { model.beads = model.beads.filter((b) => b.id !== id); if (state.focusId === id) state.focusId = null; draw(); return Promise.resolve() },
    restore() {},
    expect() {},
    setTicks() {},
    positionOf(id) {
      const b = model.beads.find((x) => x.id === id)
      if (b) return { a: b.a, r: b.r, sector: b.sector, ring: b.ring, ctx: b.ctx }
      const m = model.more.find((x) => x.ids.includes(id))
      return m ? { a: m.a, r: m.r, sector: m.sector, ring: m.ring, ctx: m.ctx, hidden: true } : null
    },
    setColors() { draw() },
    frame() {}, framePoints() {},
    setInsets(i) { inset = { ...inset, ...i }; svg.style.top = inset.top + 'px'; svg.style.height = `calc(100% - ${inset.top + inset.bottom}px)`; placeLabels() },
    resize: placeLabels,
    dispose() { ro.disconnect(); svg.remove(); labels.innerHTML = '' },
  }
}
