// Startbahn: Android prototype. The phone app (Compose in the real build), its header
// (AGSL shader + Compose Canvas trails) and the Android-only surfaces, all on one model.
import {
  store, sel, act, dueLabel, followUpLabel, contextsOf, nowLabel, tierOf,
  isOverdue, followUpDue, listOf, isOpen, hhmm, ddmm, day, CONTEXTS,
} from './model.js'
import { makeLayout, cameraFor, targetsFor, laneLights, contrailPoints, liftoffAt, projector, TIERS } from './world.js'
import { createHeaderShader } from './header-shader.js'
import { createFallback } from './fallback.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const easeOut = (k) => 1 - Math.pow(1 - k, 3)

const screen = $('#screen')
const ui = { tab: 'next', more: null, kb: false, editId: null, widgetCtx: null, widgetNote: null }

// =====================================================================
// Header: AGSL-equivalent shader + Compose-Canvas-equivalent SVG layer
// 176 dp tall (status bar 40 + caption + field); the sheet overlaps its last 18 dp.
// =====================================================================
const HW = 412, HH = 176, TOKEN_Y = 140
const LAYOUT = { horizon: 0.4, safeTop: 88 } // rings stay 24 dp clear of the caption (ends at 64)
const L = makeLayout(HW, HH, null, TOKEN_Y, LAYOUT)
let shader = null
try { if (!reduced) shader = createHeaderShader($('#gl')) } catch (e) { console.info('header: static', e.message) }
// Static header (remove animations, or no shader): the same flat drawing as the web fallback,
// from the same world.js layout (Compose Canvas in the real build).
const flat = shader ? null : createFallback($('#hstatic'), LAYOUT)
if (flat) flat.relayout(null, TOKEN_Y)

function readPalette() {
  const probe = document.createElement('span'); probe.style.display = 'none'; document.body.appendChild(probe)
  const get = (n) => {
    probe.style.color = `var(${n})`
    const s = getComputedStyle(probe).color
    let m = s.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/)
    if (m) return [+m[1], +m[2], +m[3]]
    m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
    return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [1, 0, 1]
  }
  const p = { cSky: get('--rw-field-sky'), cGround: get('--rw-field-ground'), cStrip: get('--rw-field-strip'), cMark: get('--rw-field-marking'),
    cCoral: get('--ar-coral'), cPlum: get('--rw-wait'), cYellow: get('--ar-yellow'), cPaper: get('--rw-surface-raised'), cWarm: get('--ar-bg') }
  const s = get('--rw-surface')
  p.uDark = (s[0] + s[1] + s[2]) / 3 < 0.3 ? 1 : 0
  if (!p.uDark) p.cStrip = p.cStrip.map((v) => v * 0.84)
  probe.remove()
  return p
}
let PAL = readPalette()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { PAL = readPalette(); kick() })

const cam = { pos: cameraFor('next', L).pos.slice(), target: cameraFor('next', L).target.slice() }
const toks = new Map() // id -> { pos, scale, level, mix, ring, alpha, kind }
const lanes = [0, 1, 2].map(() => ({ cur: 0, target: 0, code: 0 }))
let trail = null // { pts: [[x,y,z]], alpha }
let contrailN = 0, pendingContrails = 0

const anims = new Set()
let raf = 0
function tween(dur, fn, e = easeInOut) { return new Promise((res) => { if (reduced) { fn(1, 1); res(); return } anims.add({ t0: performance.now(), dur, fn, e, res }); kick() }) }
function kick() { if (!raf && shader) raf = requestAnimationFrame(frame) }
function frame(now) {
  raf = 0
  for (const a of [...anims]) { const k = clamp((now - a.t0) / a.dur); a.fn(a.e(k), k); if (k >= 1) { anims.delete(a); a.res() } }
  let moving = false
  for (const l of lanes) { if (Math.abs(l.cur - l.target) > 0.004) { l.cur = lerp(l.cur, l.target, 0.18); moving = true } else l.cur = l.target }
  for (const t of toks.values()) if (Math.abs(t.level - t.levelTarget) > 0.01) { t.level = lerp(t.level, t.levelTarget, 0.2); moving = true }
  drawHeader()
  if (anims.size || moving) kick()
}

// Urgency tiers (world.js TIERS) as shader inputs: mix 1 = coral core, 2 = warm paper core,
// ring flags +1 started (yellow), +2 overdue (coral ring).
function tokenStyle(t) {
  const tier = TIERS[t.tier] ? t.tier : 'calm'
  const hot = TIERS[tier].coral
  const D = PAL.uDark
  if (t.kind === 'cleared') {
    const level = tier === 'over' ? (D ? 3.2 : 1.6) : tier === 'soon' ? (D ? 1.8 : 1.2) : (D ? 0.5 : 0.9)
    return { level, mix: hot ? 1 : 2, ring: (t.started ? 1 : 0) + (tier === 'over' ? 2 : 0), scale: 1 }
  }
  if (t.kind === 'queue') return { level: hot ? (D ? 1.0 : 0.8) : (D ? 0.3 : 0.8), mix: hot ? 1 : 2, ring: 0, scale: 0.74 }
  if (t.kind === 'hold') return { level: t.due ? (D ? 2.2 : 1.3) : 0.6, mix: t.due ? 1 : 0, ring: 0, scale: t.scale }
  return { level: 0, mix: -1, ring: t.fresh ? 1 : 0, scale: 1 }
}

function headerSnapshot() {
  const rw = sel.runway()
  return {
    cleared: rw.cleared.map((t) => ({ id: t.id, tier: tierOf(t), started: !!t.start })),
    queue: rw.queue.map((t) => ({ id: t.id, tier: tierOf(t) })),
    inbox: sel.inbox().slice().reverse().map((t) => ({ id: t.id, fresh: !!t.fresh })),
    waiting: sel.waiting().map((t) => ({ id: t.id, due: followUpDue(t) })),
    done: sel.doneToday().length,
  }
}
function syncHeader(animate = true) {
  const snap = headerSnapshot()
  if (flat) { flat.sync(snap); return }
  const T = targetsFor(snap, L)
  for (const [id, tk] of [...toks]) {
    if (T.has(id) || tk.departing || tk.ghost) continue
    toks.delete(id)
    if (animate) { tk.ghost = true; const g = `g${id}`; toks.set(g, tk); tween(260, (k) => { tk.alpha = 1 - k }).then(() => toks.delete(g)) }
  }
  let i = 0
  for (const [id, t] of T) {
    const st = tokenStyle(t)
    let tk = toks.get(id)
    if (!tk) {
      tk = { pos: t.pos.slice(), scale: st.scale, level: st.level, levelTarget: st.level, mix: st.mix, ring: st.ring, alpha: animate ? 0 : 1, kind: t.kind }
      toks.set(id, tk)
      if (animate) tween(320, (k) => { tk.alpha = k })
      continue
    }
    if (tk.departing) continue
    const from = tk.pos.slice(), s0 = tk.scale
    const to = t.pos
    const viaQueue = tk.kind === 'queue' && t.kind === 'cleared'
    const swap = (tk.kind === 'puck') !== (t.kind === 'puck')
    const prevKind = tk.kind
    tk.kind = t.kind; tk.levelTarget = st.level; tk.ring = st.ring
    if (!swap) tk.mix = st.mix
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
    if (dist < 0.001 && Math.abs(s0 - st.scale) < 0.001) continue
    if (!animate) { tk.pos = to.slice(); tk.scale = st.scale; tk.mix = st.mix; continue }
    const ctrl = viaQueue ? [from[0], 0, to[2]] : prevKind === 'puck' ? [(from[0] + to[0]) / 2, Math.max(1.8, dist * 0.25), (from[2] + to[2]) / 2] : null
    tween(Math.min(900, 420 + dist * 22) + Math.min(i++, 6) * 45, (k) => {
      for (let d = 0; d < 3; d++) tk.pos[d] = ctrl ? (1 - k) * (1 - k) * from[d] + 2 * (1 - k) * k * ctrl[d] + k * k * to[d] : lerp(from[d], to[d], k)
      tk.scale = lerp(s0, st.scale, k) * (swap ? 1 - Math.sin(k * Math.PI) * 0.5 : 1)
      if (swap && k > 0.5) tk.mix = st.mix
    })
  }
  laneLights(snap).forEach((l, k) => { lanes[k].target = l.level; lanes[k].code = l.code; if (!animate) lanes[k].cur = l.level })
  contrailN = snap.done
  kick()
}

function setCamera(view, animate = true) {
  if (flat) { flat.setView(view); return }
  const c = cameraFor(view, L)
  if (!animate || reduced) { cam.pos = c.pos.slice(); cam.target = c.target.slice(); kick(); return }
  const p0 = cam.pos.slice(), t0 = cam.target.slice()
  tween(720, (k) => { for (let d = 0; d < 3; d++) { cam.pos[d] = lerp(p0[d], c.pos[d], k); cam.target[d] = lerp(t0[d], c.target[d], k) } })
}

function depart(id) {
  const tk = toks.get(id)
  if (!tk || reduced || !shader) return Promise.resolve()
  tk.departing = true
  const from = tk.pos.slice(), lvl0 = tk.level
  tk.mix = 1; tk.ring = 0 // the departing token burns coral: the completion moment
  if (tk.kind === 'puck') tk.kind = 'cleared'
  pendingContrails += 1
  trail = { pts: [], alpha: 1 }
  return tween(1150, (k) => {
    const s = liftoffAt(k, from)
    tk.pos = s.pos
    tk.level = tk.levelTarget = lvl0 + (4.5 - lvl0) * Math.min(1, k * 1.8)
    tk.scale = 1 - Math.max(0, k - 0.8) * 2.5
    trail.pts.push([s.pos[0], s.pos[1] + 0.33, s.pos[2]])
    if (trail.pts.length > 40) trail.pts.shift()
  }, (k) => k).then(() => {
    toks.delete(id)
    return tween(700, (k) => { trail.alpha = 1 - k }, easeOut)
  }).then(() => { trail = null; pendingContrails = Math.max(0, pendingContrails - 1); kick() })
}

function basis() {
  const f = [cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1], cam.target[2] - cam.pos[2]]
  const fl = Math.hypot(...f); const F = f.map((v) => v / fl)
  let R = [-F[2], 0, F[0]]
  const rl = Math.hypot(...R); R = R.map((v) => v / rl)
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]]
  return { F, R, U }
}

function drawHeader() {
  if (!shader) return
  const P = projector(cam, L)
  const { F, R, U } = basis()
  const A = new Float32Array(96), B = new Float32Array(96)
  let n = 0
  const want = { next: ['cleared', 'queue'], waiting: ['hold'], inbox: ['puck'] }[ui.tab] || []
  const list = [...toks.values()].filter((t) => t.alpha > 0.01)
    .sort((x, y) => (want.includes(y.kind) || y.departing) - (want.includes(x.kind) || x.departing)).slice(0, 24)
  for (const t of list) {
    const puck = t.mix < -0.5
    A.set([t.pos[0], puck ? 0.12 : t.pos[1] + (t.kind === 'hold' ? 0 : 0.33 * t.scale), t.pos[2], (puck ? 0.38 : 0.3) * Math.max(0.001, t.scale)], n * 4)
    B.set([t.level, t.mix, t.ring, t.alpha], n * 4)
    n++
  }
  shader.draw({
    uCamPos: cam.pos, uCamF: F, uCamR: R, uCamU: U, uF: L.f, uCx: L.cx, uCy: L.cy,
    uMid: L.mid, uHalf: L.half, uZTok: L.zTok, uTaxiX: L.taxi.x, uTaxiHalf: L.taxi.half,
    uApron: [L.apron.x0, L.apron.x1, L.apron.z0, L.apron.z1],
    uLanes: L.lanes, uLaneLvl: lanes.map((l) => l.cur), uLaneTier: lanes.map((l) => l.code),
    uHold: [L.hold.c[0], L.hold.c[1], L.hold.c[2], L.hold.rx], uHoldRz: L.hold.rz,
    ...PAL, uTokA: A, uTokB: B, uTokN: n,
  })
  // Compose Canvas layer: contrails (done today, neutral) and the liftoff light trail (coral)
  const out = []
  const poly = (pts) => pts.map((p) => P.project(p)).filter((s) => s[2] > 0.3).map((s) => `${s[0].toFixed(1)},${s[1].toFixed(1)}`)
  const shown = Math.max(0, Math.min(8, contrailN - pendingContrails))
  for (let i = 0; i < shown; i++) {
    const pts = poly(contrailPoints(i, L))
    if (pts.length > 1) out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="var(--rw-text-soft)" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>`)
  }
  if (trail && trail.pts.length > 2) {
    const pts = trail.pts.map((p) => P.project(p)).filter((s) => s[2] > 0.3)
    for (let i = 1; i < pts.length; i++) {
      const u = i / (pts.length - 1)
      out.push(`<line x1="${pts[i - 1][0].toFixed(1)}" y1="${pts[i - 1][1].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y2="${pts[i][1].toFixed(1)}" stroke="var(--ar-coral)" stroke-width="${(1 + 3.2 * u).toFixed(2)}" stroke-linecap="round" opacity="${(trail.alpha * u * 0.95).toFixed(2)}"/>`)
    }
  }
  $('#trails').setAttribute('viewBox', `0 0 ${HW} ${HH}`)
  $('#trails').innerHTML = out.join('')
}

// =====================================================================
// Phone app (Compose in the real build)
// =====================================================================
// Rank 01–03 marks the cleared three (no colour). The coral bar is reserved for overdue rows
// and for follow-up-due rows in Warten auf (pinned pixel-hue test). A 1 dp yellow threshold
// line runs under the third cleared row.
function nextRow(t, rank, last, offCtx) {
  const d = dueLabel(t)
  const bits = []
  if (rank) bits.push(`<span class="num">0${rank}</span>`)
  if (d && (d.tone === 'over' || d.tone === 'today')) bits.push(`<span class="now">${esc(d.text)}</span>`)
  else if (t.start) bits.push(`<span class="run">läuft seit ${hhmm(t.start)}</span>`)
  else if (d) bits.push(`<span>${esc(d.text)}</span>`)
  if (t.project) bits.push(`<span>${esc(t.project)}</span>`)
  if (offCtx && contextsOf(t).length) bits.push(`<span class="ctx">${esc(contextsOf(t).join(' '))}</span>`)
  const status = isOverdue(t) ? 'überfällig' : d && d.tone === 'today' ? 'fällig heute' : 'Nächste'
  const cls = [isOverdue(t) ? 'over' : '', last ? 'thr' : ''].join(' ')
  return rowHtml(t, `${t.description}, ${status}, ID ${t.uuid.slice(-8)}`, bits.join(''), cls)
}
function rowHtml(t, aria, stat, cls = '', trail = '') {
  return `<div class="arow ${cls}" data-id="${t.id}" role="button" aria-label="${esc(aria)}">
    <div class="swipe-bg">Abhaken</div>
    <button class="aring ${isOverdue(t) ? 'over' : ''}" data-check="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><i></i></button>
    <div class="abody"><div class="adesc">${esc(t.description)}</div>${stat ? `<div class="astat">${stat}</div>` : ''}</div>${trail}
  </div>`
}

function renderTabs() {
  const c = sel.counts()
  const tab = (k, l, n) => `<button class="tab" data-tab="${k}" role="tab" aria-selected="${!ui.more && ui.tab === k}">${l}<span class="n">${n}</span></button>`
  $('#tabs').innerHTML = tab('inbox', 'Inbox', c.inbox) + tab('next', 'Nächste', c.next) + tab('waiting', 'Warten auf', c.waiting) +
    `<button class="tab more" data-more aria-label="Mehr" ${ui.more ? 'aria-selected="true"' : ''}>⋮</button>`
}
function renderList() {
  const stand = `<span class="stand">Stand ${nowLabel()}</span>`
  let h = ''
  if (ui.more === 'projects') {
    h = `<div class="meta-line"><p class="eyebrow">Projekte · nur lesen</p>${stand}</div>` + sel.projects().map((p) => {
      const ts = sel.projectTasks(p.name)
      const marks = [...ts.filter((t) => listOf(t) === 'next').map(() => '<i class="n"></i>'), ...ts.filter((t) => listOf(t) === 'waiting').map(() => '<i class="w"></i>'), ...ts.filter((t) => !['next', 'waiting'].includes(listOf(t))).map(() => '<i class="o"></i>')]
      return `<div class="prow"><b>${esc(p.name)}</b><span>${esc(p.outcome)}</span><div class="mini ${p.next ? '' : 'dark'}">${marks.join('') || '<i class="o"></i>'}</div>${p.stalled ? '<span class="stalled">kein nächster Schritt</span>' : p.status === 'on_hold' ? '<span class="eyebrow">pausiert</span>' : ''}</div>`
    }).join('')
  } else if (ui.more === 'someday') {
    h = `<div class="meta-line"><p class="eyebrow">Irgendwann</p>${stand}</div>` + sel.someday().map((t) => rowHtml(t, `${t.description}, Irgendwann, ID ${t.uuid.slice(-8)}`, t.project ? esc(t.project) : '')).join('')
  } else if (ui.tab === 'next') {
    const { rest } = sel.next()
    const rw = sel.runway()
    const rank = new Map(rw.cleared.map((t, i) => [t.id, i + 1]))
    const lastId = rw.cleared.length ? rw.cleared[rw.cleared.length - 1].id : null
    const dueAll = sel.due() // pinned: "Fällig" at the top is never filtered
    const row = (t) => nextRow(t, rank.get(t.id), t.id === lastId && rw.queue.length > 0, store.filter && !rank.has(t.id) && !contextsOf(t).includes(store.filter))
    const chip = (c, l) => `<button class="chip ${c ? '' : 'sans'}" data-filter="${c || ''}" aria-pressed="${(store.filter || '') === (c || '')}">${l}</button>`
    h = `<div class="meta-line">${stand}<span class="stand">${sel.doneToday().length} heute erledigt</span></div><div class="chips">${chip(null, 'Alle')}${CONTEXTS.map((c) => chip(c, c)).join('')}</div>`
    h += `<h2 class="shead">Fällig <span class="n">${dueAll.length}</span></h2>` + (dueAll.length ? dueAll.map(row).join('') : '<p class="empty">Nichts fällig</p>')
    h += `<h2 class="shead">Nächste Aktionen <span class="n">${rest.length}</span></h2>` + (rest.length ? rest.map(row).join('') : '<p class="empty">Keine nächsten Aktionen</p>')
  } else if (ui.tab === 'waiting') {
    const items = sel.waiting()
    h = `<div class="meta-line">${stand}<span class="stand">${items.filter(followUpDue).length} zum Nachhaken</span></div>` + (items.length ? items.map((t) => {
      const f = followUpLabel(t)
      const due = f.tone === 'due'
      return rowHtml(t, `${t.description}, ${due ? 'Nachhaken fällig' : 'Wartet'}, ID ${t.uuid.slice(-8)}`, `<span class="${due ? 'now' : ''}">${esc(f.text)}</span>${t.project ? `<span>${esc(t.project)}</span>` : ''}`,
        due ? 'over' : '', due ? `<button class="followed" data-followed="${t.id}">Nachgehakt</button>` : '')
    }).join('') : '<p class="empty">Du wartest auf nichts</p>')
  } else {
    const items = sel.inbox()
    h = `<div class="meta-line">${stand}</div>` + (items.length ? items.map((t) => rowHtml(t, `${t.description}, Inbox, ID ${t.uuid.slice(-8)}`, t.fresh ? '<span>gerade erfasst</span>' : '')).join('') : '<p class="empty">Inbox ist leer. <em>Kopf frei.</em></p>')
  }
  $('#list').innerHTML = h
}
function renderCap() {
  $('#hdr-cap').innerHTML = `<span class="slash">//</span> ${{ next: 'startbahn', waiting: 'warteschleife', inbox: 'vorfeld' }[ui.tab]}`
}
function render(animate = true) {
  screen.dataset.tab = ui.more ? 'more' : ui.tab
  screen.classList.toggle('kb', ui.kb)
  renderTabs(); renderList(); renderCap(); renderWidget()
  syncHeader(animate)
}

function setTab(tab) {
  $('#ctab').hidden = true; closeMenu()
  ui.more = null
  ui.tab = tab
  ui.kb = tab === 'inbox' // pinned: Inbox opens with the field focused and the keyboard up
  render()
  setCamera(tab)
  $('#list').scrollTop = 0
  if (ui.kb) setTimeout(() => $('#afield-in').focus({ preventScroll: true }), 0)
}

// ---------- notices (6 s undo) ----------
let noticeTimer = 0
function notice(text, undo = true) {
  const n = $('#notice')
  n.innerHTML = `<span>${esc(text)}</span>${undo ? '<button data-undo>Rückgängig</button>' : ''}`
  n.classList.add('on')
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => n.classList.remove('on'), undo ? 6000 : 4000)
}

async function complete(id) {
  const t = sel.byId(id)
  if (!t || !isOpen(t)) return
  $$(`[data-check="${t.id}"]`).forEach((b) => b.classList.add('on'))
  const dep = depart(t.id)
  if (!reduced) await wait(140)
  const evt = act.complete(t.id)
  ui.widgetNote = 'Erledigt'
  render()
  notice(evt.stalled ? `Erledigt. ${evt.stalled} hat keinen nächsten Schritt.` : 'Erledigt')
  setTimeout(() => { ui.widgetNote = null; renderWidget() }, 5500)
  return dep
}
function capture(text, note) {
  const evt = act.capture(text)
  if (!evt) return null
  if (note) evt.task.annotations.push({ entry: '20261031T084100Z', description: note })
  render()
  notice('In Inbox ✓')
  return evt
}
function clarify(id, to) {
  const evt = to === 'delete' ? act.remove(id, 'clarify') : act.clarify(id, to)
  if (!evt) return
  render()
  notice(evt.type === 'delete' ? 'Gelöscht' : { next: 'Nach Nächste', waiting: 'Nach Warten auf', someday: 'Nach Irgendwann' }[evt.to] || 'Eingeordnet')
}

// ---------- menus and the Custom Tab ----------
function openMenu(html, anchor) {
  const m = $('#menu')
  m.innerHTML = html
  m.hidden = false
  const s = screen.getBoundingClientRect(), a = anchor.getBoundingClientRect()
  m.style.top = `${Math.min(a.bottom - s.top - 6, 915 - 360)}px`
  m.style.right = '10px'
}
function closeMenu() { $('#menu').hidden = true }
function openDetails(id) {
  const t = sel.byId(id)
  if (!t) return
  const l = listOf(t)
  const path = { next: 'next', waiting: 'waiting', inbox: 'inbox', someday: 'someday' }[l] || 'projects'
  const d = dueLabel(t)
  $('#ctab').innerHTML = `<div class="ctab-sheet" role="dialog" aria-label="Details">
    <div class="ctab-bar"><button data-ctclose aria-label="Schließen">×</button><div class="url"><b>runway</b><small>runway.agentic-reach.com/${path}?task=${t.uuid.slice(-8)}</small></div></div>
    <div class="ctab-body">
      <p class="eyebrow"><span class="slash">//</span> details · ${{ next: 'Nächste', waiting: 'Warten auf', inbox: 'Inbox', someday: 'Irgendwann' }[l] || 'Projekt'}</p>
      <h2>${esc(t.description)}</h2>
      <div class="row-btns"><button class="pill primary" data-check="${t.id}" data-ctclose>Abhaken</button><button class="pill" data-ctstart="${t.id}">${t.start ? 'Pausieren' : 'Starten'}</button></div>
      <dl>
        <dt>Projekt</dt><dd>${esc(t.project || 'ohne Projekt')}</dd>
        <dt>Kontext</dt><dd>${esc(contextsOf(t).join(' ') || 'überall')}</dd>
        <dt>Fällig</dt><dd>${d ? esc(d.text) : 'kein Datum'}</dd>
        <dt>${l === 'waiting' ? 'Nachhaken' : 'Beginnt'}</dt><dd>${t.scheduled ? ddmm(day(t.scheduled)) : 'kein Datum'}</dd>
        <dt>Priorität</dt><dd>${{ H: 'Hoch', M: 'Mittel', L: 'Niedrig' }[t.priority] || 'keine'}</dd>
        <dt>Notizen</dt><dd>${t.annotations.map((a) => esc(a.description)).join('<br>') || 'keine'}</dd>
      </dl>
      <p class="eyebrow">Gleiche Detailansicht wie im Web, Deep Link ?task= wird gelesen.</p>
    </div></div>`
  $('#ctab').hidden = false
}

// ---------- keyboard mock ----------
$('#kbd').innerHTML = ['qwertzuiop', 'asdfghjklö', 'yxcvbnm'].map((r, i) => `<div class="kr">${i === 2 ? '<span class="k w">⇧</span>' : ''}${[...r].map((k) => `<span class="k">${k}</span>`).join('')}${i === 2 ? '<span class="k w">⌫</span>' : ''}</div>`).join('') +
  '<div class="kr"><span class="k w">?123</span><span class="k w">,</span><span class="k w" style="flex:4 1 auto">Deutsch</span><span class="k w">.</span><span class="k go">↵</span></div>'

// ---------- swipe right to check off (35 % of the width, as today) ----------
let drag = null
$('#list').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.arow'); if (!row || e.target.closest('.aring, .followed')) return
  drag = { row, x0: e.clientX, y0: e.clientY, dx: 0, active: false }
})
window.addEventListener('pointermove', (e) => {
  if (!drag) return
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0
  if (!drag.active && Math.abs(dy) > 10) { drag = null; return }
  if (!drag.active && dx > 8) drag.active = true
  if (!drag.active) return
  drag.dx = Math.max(0, dx)
  drag.row.querySelector('.swipe-bg').style.opacity = clamp(drag.dx / 120)
  for (const el of drag.row.children) if (!el.classList.contains('swipe-bg')) el.style.transform = `translateX(${drag.dx}px)`
})
window.addEventListener('pointerup', () => {
  if (!drag) return
  const { row, dx, active } = drag
  drag = null
  if (!active) return
  if (dx > Math.max(96, row.offsetWidth * 0.35)) { complete(Number(row.dataset.id)); return }
  for (const el of row.children) { el.style.transition = 'transform 180ms'; el.style.transform = '' }
  row.querySelector('.swipe-bg').style.opacity = 0
  row.dataset.swiped = '1'; setTimeout(() => delete row.dataset.swiped, 50)
})

// ---------- clicks ----------
document.addEventListener('click', (e) => {
  if (e.target.id === 'ctab') { $('#ctab').hidden = true; return }
  const t = e.target.closest('button, [data-id], .w-head b, .w-foot a')
  const inMenu = e.target.closest('#menu')
  if (!inMenu && !e.target.closest('[data-more]') && !e.target.closest('.arow')) closeMenu()
  if (!t) {
    if (ui.kb && e.target.closest('#screen') && !e.target.closest('.afield')) { ui.kb = false; $('#afield-in').blur(); render(false) }
    return
  }
  const d = t.dataset
  if (d.check) { e.stopPropagation(); if (d.ctclose != null) $('#ctab').hidden = true; complete(Number(d.check)); return }
  if (d.followed) { e.stopPropagation(); const x = act.followedUp(Number(d.followed)); if (x) { render(); notice(`Wiedervorlage ${ddmm(day(x.scheduled))}`) } return }
  if (d.tab) { setTab(d.tab); return }
  if (d.filter != null) { act.setFilter(d.filter || null); render(); return }
  if (d.more != null) {
    openMenu('<button data-go="projects">Projekte</button><button data-go="someday">Irgendwann</button><hr><button>Widget hinzufügen</button><button>Protokoll exportieren</button><hr><span class="mi">Angemeldet als uli</span><button>Abmelden</button>', t); return
  }
  if (d.go) { ui.more = d.go; ui.kb = false; closeMenu(); render(); return }
  if (d.undo != null) { act.undo(); render(); $('#notice').classList.remove('on'); $('#ovl-note').textContent = ''; return }
  if (d.ctclose != null) { $('#ctab').hidden = true; return }
  if (d.ctstart) { act.toggleStart(Number(d.ctstart)); openDetails(Number(d.ctstart)); render(false); return }
  if (d.mcl) { closeMenu(); clarify(Number(d.mcl), d.to); return }
  if (d.mnext) { $('#menu .mchips').hidden = !$('#menu .mchips').hidden; return }
  if (d.medit) { closeMenu(); ui.editId = Number(d.medit); ui.kb = true; render(false); const i = $('#afield-in'); i.value = sel.byId(ui.editId).description; i.focus(); return }
  if (d.wchip != null) { const all = [null, ...CONTEXTS]; ui.widgetCtx = all[(all.indexOf(ui.widgetCtx) + 1) % all.length]; renderWidget(); return }
  if (d.wcheck) { complete(Number(d.wcheck)); return }
  if (d.wplus != null) { $('#ovl-in').focus(); return }
  if (t.matches('.w-head b')) { renderWidget(true); return }
  if (t.matches('.w-foot a')) { act.setFilter(ui.widgetCtx); setTab('next'); return }
  if (t.id === 'fab') { ui.kb = true; render(false); $('#afield-in').focus(); return }
  if (t.id === 'tile') { $('#ovl-in').focus(); return }
  if (t.id === 'ovl-close') { $('#ovl-in').blur(); $('#ovl-note').textContent = ''; return }
  if (t.id === 'share-btn') { capture($('#share-title').textContent, 'https://beispiel.de/blog/agenten-evaluation'); t.textContent = 'In Inbox ✓'; setTimeout(() => { t.textContent = 'In Inbox' }, 1600); return }
  if (d.id && !t.dataset.swiped) {
    const id = Number(d.id)
    const task = sel.byId(id)
    if (!task) return
    if (listOf(task) === 'inbox') {
      openMenu(`<button data-medit="${id}">Bearbeiten</button><button data-mnext="${id}">Nach Nächste …</button><div class="mchips" hidden>${CONTEXTS.map((c) => `<button class="chip" data-mcl="${id}" data-to="next:${c}">${c}</button>`).join('')}</div><button data-mcl="${id}" data-to="waiting">Nach Warten auf</button><button data-mcl="${id}" data-to="someday">Nach Irgendwann</button><hr><button data-mcl="${id}" data-to="delete">Löschen</button>`, t)
    } else openDetails(id)
  }
})
$('#afield').addEventListener('submit', (e) => {
  e.preventDefault()
  const i = $('#afield-in')
  if (ui.editId != null) { act.update(ui.editId, { description: i.value.trim() || sel.byId(ui.editId).description }); ui.editId = null; i.value = ''; render(false); notice('Gespeichert', false); return }
  if (capture(i.value)) i.value = ''
  i.focus()
})
// Capture overlay (pinned contract): only the field, the notice slot, Rückgängig and Schließen.
$('#ovl-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const i = $('#ovl-in')
  if (!capture(i.value)) return
  i.value = ''
  $('#ovl-note').innerHTML = '<span class="ok">In Inbox ✓</span><button type="button" class="link" data-undo>Rückgängig</button>'
})

// ---------- home-screen widget (Glance: text and boxes only, no bitmaps) ----------
// The cleared three sit on a mini runway (lane with a tier dot), a 1 dp yellow threshold line
// follows, then plain rows fill the 4 × 3 height (48 dp each, as many as fit, here five).
const WIDGET_ROWS = 5
function renderWidget(flash = false) {
  const c = sel.counts()
  const rw = sel.runway(ui.widgetCtx)
  const all = [...rw.cleared, ...rw.queue]
  const shown = all.slice(0, WIDGET_ROWS)
  const rows = shown.map((t, i) => {
    const d = dueLabel(t)
    const mark = d && d.tone === 'over' ? 'überfällig' : d && d.tone === 'today' ? 'heute' : ''
    const lane = i < rw.cleared.length ? `<span class="w-lane"><i class="${tierOf(t)}"></i></span>` : '<span class="w-lane plain"></span>'
    const thr = i === rw.cleared.length - 1 && shown.length > rw.cleared.length ? '<div class="w-thr" aria-hidden="true"></div>' : ''
    return `<div class="w-row">${lane}<button class="w-ring ${isOverdue(t) ? 'over' : ''}" data-wcheck="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><i></i></button><span class="w-text">${esc(t.description)}</span><span class="w-mark">${mark}</span></div>${thr}`
  }).join('')
  const more = all.length - shown.length
  const foot = ui.widgetNote ? `<span>${ui.widgetNote} · <a data-undo>Rückgängig</a></span>` : more > 0 ? `<a>+${more} weitere</a>` : '<span></span>'
  $('#widget').innerHTML = `<div class="w-head"><b title="Neu laden">Inbox ${c.inbox} · fällig ${c.due}</b><button class="w-chip" data-wchip>${ui.widgetCtx || 'Alle'}</button><button class="w-plus" data-wplus aria-label="+ Todo">+</button></div>
    <div class="w-rows">${rows || '<div class="w-row"><span></span><span></span><span class="w-text">Keine nächsten Aktionen</span></div>'}</div>
    <div class="w-foot">${foot}<span>${flash ? 'lädt …' : `Stand ${nowLabel()}`}</span></div>`
  if (flash) setTimeout(() => renderWidget(false), 600)
}

store.on((evt) => { if (['update', 'commit', 'project'].includes(evt.type)) render(false) })

// ---------- start ----------
render(false)
setCamera('next', false)
drawHeader()

window.proto = {
  show(view) {
    if (['inbox', 'next', 'waiting'].includes(view)) setTab(view)
    else { $('#ctab').hidden = true; ui.more = view === 'projects' ? 'projects' : 'someday'; ui.kb = false; render() }
  },
  filter(context) { if (ui.tab !== 'next' || ui.more) setTab('next'); act.setFilter(context || null); render() },
  capture(text) { return capture(text) },
  open(id) { openDetails(Number(id)) },
  complete(id) { return complete(Number(id)) },
  clarify(id, to) { if (ui.tab !== 'inbox') setTab('inbox'); clarify(Number(id), to) },
  async signature() {
    if (ui.tab !== 'next' || ui.more || ui.kb) { ui.kb = false; setTab('next') }
    $('#ctab').hidden = true
    await wait(400)
    const first = sel.runway().cleared[0]
    if (first) complete(first.id)
    await wait(reduced ? 50 : 520)
  },
  // test helpers beyond the shared hook
  keyboard(on) { ui.kb = !!on; render(false) },
  get state() { return { tab: ui.tab, more: ui.more, kb: ui.kb, header: shader ? 'shader' : 'static', counts: sel.counts() } },
}
