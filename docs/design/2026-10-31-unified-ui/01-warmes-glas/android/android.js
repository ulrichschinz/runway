// runway Android preview, proposal 01 "Warmes Glas". Same store and rules as the web prototype.
import * as S from '../store.js'
import { glyph, brandMark } from '../glyphs.js'
import { flatLens, flatPebbles, levelToHeight } from '../lens-flat.js'
import { createLensShader } from './android-fx.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const darkMq = matchMedia('(prefers-color-scheme: dark)')
const st = S.state
const phone = $('#phone')
const TABS = [['inbox', 'Inbox', 'inbox'], ['next', 'Nächste', 'next'], ['waiting', 'Warten auf', 'waiting'], ['projects', 'Projekte', 'projects'], ['someday', 'Irgendwann', 'someday']]
const ui = { view: 'next', kb: false, ctx: null, fx: null, fxReady: null, shown: S.progress(), flights: 0, noticeKey: null, timer: 0, sheet: null, clarifyOpen: null, widgetCtx: 0, focusKey: null }

// ------------------------------------------------------------ lens (AGSL preview)
const canvas = document.createElement('canvas')
canvas.setAttribute('aria-hidden', 'true')
function groundHex() { return darkMq.matches ? '#1B1428' : '#FBF6EE' }
async function initFx() {
  if (reduced.matches) return null
  try {
    const fx = await createLensShader(canvas)
    if (!fx) return null
    fx.setTheme({ dark: darkMq.matches, ground: groundHex() })
    fx.setLevel(ui.shown.level, false)
    fx.setPebbles(S.counts().inbox, false)
    ui.fx = fx
    renderTop()
    return fx
  } catch (e) { return null }
}
ui.fxReady = initFx()

function slotHtml() { return '<div class="t-slot" id="t-slot"></div>' }
function fillSlot() {
  const slot = $('#t-slot')
  if (!slot) return
  const size = ui.view === 'inbox' ? 46 : 56
  if (ui.fx) {
    slot.appendChild(canvas)
    ui.fx.resize(size)
    ui.fx.setMode(ui.view === 'inbox' ? 'pebbles' : 'lens')
  } else slot.innerHTML = ui.view === 'inbox' ? flatPebbles(S.counts().inbox, { size }) : flatLens(ui.shown.level, { size })
}

// ------------------------------------------------------------ rendering
// One "Stand hh:mm" node per screen, always its own Text (P-contract: a node exactly "Stand 09:42").
const standNode = () => `<span class="stand">Stand ${S.NOW_LABEL}</span>`
function renderTop() {
  const c = S.counts()
  const p = ui.shown
  const tb = $('#topbar')
  const more = `<button class="a-icon" data-act="more" aria-label="Mehr">${glyph('more')}</button>`
  const search = `<button class="a-icon" aria-label="Suchen">${glyph('search')}</button>`
  tb.className = 'topbar'
  // While the keyboard is up, the NavigationBar sits under the IME. The top bar becomes a 48 dp
  // text tab row, so Nächste and Warten auf stay one tap away (P08 §1, as the app does today).
  if (ui.kb) {
    tb.classList.add('tabs')
    tb.innerHTML = `<div class="ttabs" role="tablist">${TABS.slice(0, 3).map(([v, name]) => `<button role="tab" class="ttab" data-view="${v}" aria-selected="${ui.view === v}"><span>${name}</span>${v === 'inbox' && c.inbox ? `<span class="n">${c.inbox}</span>` : ''}${v === 'waiting' && c.followUps ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>${more}`
    return
  }
  if (ui.view === 'next') tb.innerHTML = `${slotHtml()}<div><div class="t-title">Nächste</div><div class="t-sub"><span class="prog">${S.progressLabel(p)}</span><span class="sep">·</span>${standNode()}</div></div>${search}${more}`
  else if (ui.view === 'inbox') { tb.classList.add('compact'); tb.innerHTML = `${slotHtml()}<div><div class="t-title">Inbox</div><div class="t-sub"><span><b>${c.inbox}</b> zu klären</span><span class="sep">·</span>${standNode()}</div></div><span></span>${more}` }
  else {
    const name = TABS.find((t) => t[0] === ui.view)[1]
    const sub = ui.view === 'waiting' ? `${c.followUps} Nachhaken fällig` : ui.view === 'projects' ? `${c.stalled} steht still` : `${S.lists().someday.length} Ideen`
    tb.innerHTML = `<span style="width:2px"></span><div><div class="t-title">${name}</div><div class="t-sub"><span>${sub}</span><span class="sep">·</span>${standNode()}</div></div>${search}${more}`
  }
  fillSlot()
}
function renderChips() {
  const el = $('#a-chips')
  if (ui.view !== 'next' || ui.kb) { el.innerHTML = ''; return }
  // chips wrap (FlowRow), the check slot is always reserved so chips never move
  el.innerHTML = [null, ...S.contexts()].map((c) => `<button class="chip" data-ctx="${c || ''}" aria-pressed="${ui.ctx === c}"><span class="ck">${ui.ctx === c ? glyph('check', { size: 14 }) : ''}</span>${c || 'Alle'}</button>`).join('')
}
function meta(t, list) {
  const m = []
  if (list === 'inbox' && S.isStale(t)) m.push(`<span class="attn"><span class="dot"></span>${S.age(t.entry)}</span>`)
  if (t.start) m.push('<span class="run"><span class="pulse"></span>läuft</span>')
  if (t.due) { const d = S.dayOf(t.due); if (d < S.TODAY) m.push('<span class="warn">überfällig</span>'); else if (d === S.TODAY) m.push('<span class="today-due">fällig heute</span>'); else m.push(`<span>fällig ${S.relDay(d)}</span>`) }
  if (list === 'next' && S.isMarkedToday(t) && !t.start) m.push(`<span class="mt">${glyph('today', { size: 13 })}für heute</span>`)
  if (list === 'waiting') { const fu = S.followUp(t); if (S.followUpDue(t)) m.push(`<span class="attn"><span class="dot"></span>Nachhaken ${fu < S.TODAY ? `seit ${S.fmtDay(fu, { weekday: false })}` : 'heute'}</span>`); else if (fu) m.push(`<span>Wiedervorlage ${S.fmtDay(fu, { weekday: false })}</span>`) }
  if (t.project) m.push(`<span class="proj">${esc(t.project)}</span>`)
  if (list === 'next' && S.ctxOf(t).length) m.push(`<span class="ctx">${S.ctxOf(t).join(' ')}</span>`)
  if (list === 'inbox' && !S.isStale(t)) m.push(`<span>${S.age(t.entry)}</span>`)
  return m.length ? `<div class="meta">${m.join('')}</div>` : ''
}
function status(t, list) {
  if (list === 'inbox') return 'Inbox'
  if (list === 'waiting') return S.followUpDue(t) ? 'Nachhaken fällig' : 'Wartet'
  if (S.isOverdue(t)) return 'überfällig'
  if (t.due && S.dayOf(t.due) === S.TODAY) return 'fällig heute'
  return 'Nächste'
}
function row(t, list, isNew, key) {
  return `<div class="row ${S.isOverdue(t) ? 'is-overdue' : ''} ${isNew ? 'is-new' : ''}" data-id="${t.id}" data-key="${key}" data-list="${list}" role="listitem" aria-label="${esc(`${t.description}, ${status(t, list)}, ID ${t.uuid.slice(-8)}`)}">
    <button class="ring" data-act="done" aria-label="Abhaken: ${esc(t.description)}"><i>${glyph('check', { size: 15 })}</i></button>
    <div class="r-body" data-act="${list === 'inbox' ? 'rowmenu' : 'open'}"><div class="r-text">${esc(t.description)}</div>${meta(t, list)}</div></div>`
}
// Section headings are written mixed case ("Fällig"): Compose has no CSS uppercase, and the
// acceptance driver looks for the literal string. Counts are their own Text node.
function sec(title, rows, list, { empty = '', always = false, extra = '', newId, key = list, groups = null } = {}) {
  if (!rows.length && !always) return ''
  const body = (arr) => arr.map((t) => row(t, list, t.id === newId, `${key}-${t.id}`)).join('')
  let inner
  if (!rows.length) inner = `<div class="empty">${empty}</div>`
  else if (groups) inner = groups.filter((g) => g.rows.length).map((g, i) => `${g.label ? `<div class="grp${i ? ' grp-gap' : ''}">${g.label}</div>` : ''}${body(g.rows)}`).join('')
  else inner = body(rows)
  return `<h2 class="sec-h"><span class="slash">//</span><span class="st">${title}</span><span class="n">${rows.length || ''}</span>${extra}</h2><div class="card">${inner}</div>`
}
function renderList({ newId } = {}) {
  const prevCtx = st.context
  st.context = ui.ctx
  const L = S.lists()
  st.context = prevCtx
  let h = ''
  if (ui.view === 'next') {
    // the shape P08 pins: "Fällig" on top, then exactly /gtd/next as "Nächste Aktionen";
    // a due next action is in both. "für heute" is a group inside, not a section.
    h += sec('Fällig', L.due, 'next', { key: 'due', always: true, empty: 'Nichts fällig' })
    h += sec('Nächste Aktionen', L.next, 'next', { key: 'next', always: true, empty: 'Keine nächsten Aktionen',
      groups: [{ label: L.today.length ? `${glyph('today', { size: 13 })}<span>für heute</span><span class="n">${L.today.length}</span>` : '', rows: L.today }, { label: L.today.length ? '<span>weitere</span>' : '', rows: L.later }] })
  } else if (ui.view === 'inbox') {
    // keyboard up: the top bar is the tab row, so "Stand" moves into the section line
    h += L.inbox.length ? sec('Zu klären', L.inbox, 'inbox', { newId, extra: ui.kb ? standNode() : '' }) : `<h2 class="sec-h"><span class="slash">//</span><span class="st">Zu klären</span>${ui.kb ? standNode() : ''}</h2><div class="card"><div class="empty">Inbox ist leer</div></div>`
  } else if (ui.view === 'waiting') {
    h += sec('Nachhaken', L.waiting.filter(S.followUpDue), 'waiting')
    h += sec('Wartet', L.waiting.filter((t) => !S.followUpDue(t)), 'waiting', { always: true, empty: 'Du wartest auf nichts' })
  } else if (ui.view === 'someday') {
    h += sec('Irgendwann / Vielleicht', L.someday, 'someday', { always: true, empty: 'Keine Ideen geparkt' })
    h += sec('Zurückgelegt', L.tickler, 'someday')
  } else if (ui.view === 'projects') {
    const ov = S.projectOverview()
    const pr = (p) => `<div class="row" data-project="${esc(p.name)}"><span class="ring" style="color:var(--rw-structure)">${glyph('projects')}</span><div class="r-body" data-act="web"><div class="r-text">${esc(p.name)}</div><div class="meta">${p.stalled ? '<span class="attn"><span class="dot"></span>steht still</span>' : ''}<span>${p.next} nächste${p.waiting ? ` · ${p.waiting} wartet` : ''}</span></div></div></div>`
    const groups = [['Steht still', ov.filter((p) => p.stalled)], ['Aktiv', ov.filter((p) => p.status === 'active' && !p.stalled)], ['Pausiert', ov.filter((p) => p.status === 'on_hold')]]
    h += groups.filter(([, l]) => l.length).map(([t, l]) => `<h2 class="sec-h"><span class="slash">//</span><span class="st">${t}</span><span class="n">${l.length}</span></h2><div class="card">${l.map(pr).join('')}</div>`).join('')
  }
  $('#a-list').innerHTML = h
}
function renderNav() {
  const c = S.counts()
  $('#navbar').hidden = ui.kb
  $('.gesture').hidden = ui.kb
  $('#navbar').innerHTML = TABS.map(([v, name, g]) => {
    const badge = v === 'inbox' && c.inbox ? `<span class="badge">${c.inbox}</span>` : (v === 'waiting' && c.followUps) || (v === 'projects' && c.stalled) ? '<span class="dot bdot"></span>' : ''
    return `<button class="nav-i" data-view="${v}" ${ui.view === v ? 'aria-current="page"' : ''}><span class="ind">${glyph(g, { size: 22 })}</span>${name}${badge}</button>`
  }).join('')
}
function renderCapture() {
  const kb = ui.kb
  phone.classList.toggle('kb', kb)
  $('#keyboard').hidden = !kb
  const f = $('#a-capture')
  const draft = $('#a-input')?.value || ''
  f.classList.toggle('focused', kb)
  f.innerHTML = `<span class="plus">${glyph('plus')}</span><input id="a-input" placeholder="Neues Todo" aria-label="Neues Todo" enterkeyhint="done">${kb ? `<button class="go" type="submit" aria-label="In die Inbox">${glyph('enter')}</button>` : ''}`
  $('#a-input').value = draft // a draft is never lost
}
function renderKeyboard() {
  const rows = ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm']
  $('#keyboard').innerHTML = rows.map((r, i) => `<div class="kb-row">${i === 2 ? '<span class="w">⇧</span>' : ''}${[...r].map((ch) => `<span>${ch}</span>`).join('')}${i === 2 ? '<span class="w">⌫</span>' : ''}</div>`).join('') + '<div class="kb-row"><span class="w">?123</span><span class="w">,</span><span class="sp"></span><span class="w">.</span><span class="w enter">↵</span></div><div class="kb-handle"><i></i></div>'
}
function renderAll(opts) {
  if (!ui.flights) ui.shown = S.progress()
  renderTop(); renderChips(); renderList(opts); renderNav(); renderSurfaces()
  if (ui.fx && !ui.flights) { ui.fx.setLevel(ui.shown.level); ui.fx.setPebbles(S.counts().inbox) }
}
function setKeyboard(on) {
  if (ui.kb === on) return
  ui.kb = on
  renderTop(); renderChips(); renderList(); renderNav(); renderCapture()
  if (on) $('#a-input').focus({ preventScroll: true })
}

// ------------------------------------------------------------ notice
// The notice sits in the bottom stack, in flow above the field (Compose: Scaffold bottomBar =
// Column(notice, field, NavigationBar), the LazyColumn gets the inner padding). It never covers
// a row: the list viewport ends above it, and the row you worked on is scrolled back into view.
function notice(text, hold) {
  const n = $('#a-notice')
  clearTimeout(ui.timer)
  ui.noticeKey = hold?.key || null
  n.innerHTML = `<span class="t">${esc(text)}</span>${hold ? '<button data-act="undo">Rückgängig</button><span class="timer"></span>' : ''}`
  n.hidden = false
  const tm = n.querySelector('.timer')
  if (tm && !reduced.matches) tm.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: S.UNDO_MS, easing: 'linear', fill: 'forwards' })
  ui.timer = setTimeout(() => { n.hidden = true }, hold ? S.UNDO_MS : 2500)
  requestAnimationFrame(keepVisible)
}
function keepVisible() {
  const r = ui.focusKey && $(`#a-list .row[data-key="${ui.focusKey}"]`)
  if (!r) return
  const box = $('#a-list').getBoundingClientRect(), rr = r.getBoundingClientRect()
  if (rr.bottom > box.bottom) $('#a-list').scrollBy({ top: rr.bottom - box.bottom + 8, behavior: reduced.matches ? 'auto' : 'smooth' })
}

// ------------------------------------------------------------ signature: bead into the lens (Compose: Animatable along PathMeasure)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const f = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-6) break; t -= f / d } t = clamp(t); return ((ay * t + by) * t + cy) * t }
}
const pull = bezier(0.55, 0, 0.25, 1)
function fly(rowEl, after) {
  const pr = phone.getBoundingClientRect()
  const ring = rowEl.querySelector('.ring i').getBoundingClientRect()
  const slot = $('#t-slot').getBoundingClientRect()
  const P0 = { x: ring.left + ring.width / 2 - pr.left, y: ring.top + ring.height / 2 - pr.top }
  const sl = { x: slot.left - pr.left, y: slot.top - pr.top, w: slot.width }
  const E = { x: sl.x + sl.w / 2, y: sl.y + sl.w * 0.08 }
  const gx = 6
  const d = `M${P0.x},${P0.y} C${P0.x - 6},${P0.y - 18} ${gx},${P0.y - 6} ${gx},${P0.y - 34} L${gx},${sl.y + sl.w * 0.7} C${gx},${sl.y - 6} ${E.x - sl.w * 0.45},${E.y - 16} ${E.x},${E.y}`
  const svg = $('#a-flight')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d); svg.appendChild(path)
  const L = path.getTotalLength()
  const bead = document.createElement('div'); bead.className = 'a-bead'; phone.appendChild(bead)
  ui.flights += 1
  const t0 = performance.now()
  const frame = (now) => {
    const t = now - t0
    const drawn = (1 - (1 - clamp(t / 240)) ** 3) * L
    const k = pull(clamp((t - 110) / 560))
    const s = k * L
    path.style.strokeDasharray = `${Math.max(0, drawn - s)} ${L * 2}`
    path.style.strokeDashoffset = `${-s}`
    const p = path.getPointAtLength(s)
    bead.style.transform = `translate(${p.x}px, ${p.y}px)`
    bead.style.opacity = t > 90 ? 1 : 0
    if (k < 1) return requestAnimationFrame(frame)
    bead.remove(); path.remove()
    if (ui.fx) ui.fx.impact(after.level)
    ui.flights -= 1
    if (!ui.flights) { ui.shown = S.progress(); renderTop(); renderSurfaces() }
  }
  requestAnimationFrame(frame)
}
// Only a todo planned for today (Fällig or für heute) sends the bead; anything else fills the
// ring, shows the notice and is counted as "zusätzlich" next to the lens.
function complete(id, srcRow = null) {
  const t = S.find(id)
  if (!t || t.status !== 'pending') return null
  const rowEls = $$(`#a-list .row[data-id="${t.id}"]`) // a due next action is listed twice
  const rowEl = srcRow && srcRow.isConnected ? srcRow : rowEls[0]
  const planned = S.countsForToday(t)
  const doFly = rowEl && ui.view === 'next' && planned && !reduced.matches
  if (doFly) ui.flights += 1
  // the neighbour below takes over, so keepVisible() can hold it above the notice
  if (rowEl) { const all = $$('#a-list .row[data-id]'); const nb = all.slice(all.indexOf(rowEl) + 1).find((r) => r.dataset.id !== String(t.id)); ui.focusKey = nb?.dataset.key || null }
  const h = S.complete(t.id)
  const after = S.progress()
  rowEls.forEach((r) => {
    r.classList.add('is-done')
    setTimeout(() => {
      r.style.height = `${r.offsetHeight}px`; r.classList.add('is-leaving')
      requestAnimationFrame(() => Object.assign(r.style, { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0' }))
      // gone from the tree well within 1 s (contract); then counts and groups are redrawn
      setTimeout(() => { r.remove(); if (!$('#a-list .row.is-leaving')) renderList() }, 190)
    }, reduced.matches ? 150 : 420)
  })
  if (doFly) { fly(rowEl, after); ui.flights -= 1 } else { ui.shown = after; renderTop(); if (ui.fx && planned) ui.fx.setLevel(after.level, !reduced.matches) }
  notice('Erledigt', h) // the notice must not repeat the row's accessibility string (contract)
  renderNav(); renderSurfaces()
  return h
}

// ------------------------------------------------------------ sheets
function openSheet(id) {
  const t = S.find(id)
  if (!t) return
  ui.sheet = t.id
  const lk = S.isInbox(t) ? 'inbox' : S.isWaiting(t) ? 'waiting' : S.isSomeday(t) ? 'someday' : 'next'
  $('#a-sheet').innerHTML = `<div class="grab"></div><div class="sh-eyebrow"><span class="slash">//</span> ${S.listOf(t)}</div><div class="sh-title">${esc(t.description)}</div>
    <div class="seg">${[['inbox', 'Inbox'], ['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann']].map(([k, l]) => `<button aria-pressed="${lk === k}" data-act="move" data-v="${k}">${l}</button>`).join('')}</div>
    <dl class="sh-fields"><dt>Projekt</dt><dd>${esc(t.project || 'Kein Projekt')}</dd><dt>Kontext</dt><dd>${S.contexts().map((c) => `<button class="chip" data-act="sctx" data-v="${c}" aria-pressed="${S.ctxOf(t).includes(c)}">${c}</button>`).join('')}</dd>
    <dt>Fällig</dt><dd>${t.due ? `${S.fmtDay(S.dayOf(t.due))} ${S.isOverdue(t) ? '<span class="meta" style="margin:0"><span class="warn">überfällig</span></span>' : ''}` : '–'}</dd><dt>Für heute</dt><dd>${S.isMarkedToday(t) || t.start ? 'zählt in die Tageslinse' : 'nein'}</dd>
    ${(t.annotations || []).length ? `<dt>Notiz</dt><dd>${esc(t.annotations.at(-1).description)}</dd>` : ''}</dl>
    <div class="sh-acts"><button class="pill coral" data-act="sdone">${glyph('check', { size: 18 })}Abhaken</button><button class="pill">Bearbeiten</button><button class="pill quiet">Im Web öffnen</button></div>`
  $('#a-sheet').hidden = false; $('#a-scrim').hidden = false
}
function openClarify(id) {
  const t = S.find(id)
  ui.sheet = t.id; ui.clarifyOpen = ui.clarifyOpen || 'next'
  const o = (k, g, title, desc, extra = '') => `<button class="opt" data-act="copt" data-v="${k}"><span>${glyph(g)}</span><span><div class="ot">${title}</div><div class="od">${desc}</div></span></button>${ui.clarifyOpen === k ? extra : ''}`
  $('#a-sheet').innerHTML = `<div class="grab"></div><div class="sh-eyebrow"><span class="slash">//</span> Klären</div><div class="sh-title">${esc(t.description)}</div>
    ${o('next', 'next', 'Nächste Aktion', 'Kontext wählen, fertig.', `<div class="opt-chips">${S.contexts().map((c) => `<button class="chip" data-act="capply" data-v="next:${c}">${c}</button>`).join('')}</div>`)}
    ${o('waiting', 'waiting', 'Warten auf', 'Nachhaken in drei Tagen.')}${o('someday', 'someday', 'Irgendwann', 'Nicht jetzt.')}${o('done', 'check', 'Sofort erledigt', 'Unter zwei Minuten.')}`
  $('#a-sheet').hidden = false; $('#a-scrim').hidden = false
}
function closeSheet() { $('#a-sheet').hidden = true; $('#a-scrim').hidden = true; $('#a-menu').hidden = true; ui.sheet = null; ui.clarifyOpen = null }
function rowMenu(rowEl) {
  const r = rowEl.getBoundingClientRect(), pr = phone.getBoundingClientRect()
  const m = $('#a-menu')
  m.dataset.id = rowEl.dataset.id
  m.innerHTML = '<button data-act="mclarify">Klären</button><button data-act="medit">Bearbeiten</button><button data-act="mdelete">Löschen</button>'
  m.style.top = `${r.bottom - pr.top - 8}px`
  m.hidden = false
}
function moreMenu() {
  const m = $('#a-menu')
  m.innerHTML = '<div class="mi">Angemeldet als uli</div><button>Widget hinzufügen</button><button>Kontexte</button><button>Protokoll exportieren</button><button>Abmelden</button>'
  m.style.top = '80px'
  m.hidden = false
}

// ------------------------------------------------------------ Android-only surfaces
function widgetLens(level) {
  // Glance cannot run shaders and must not carry bitmaps: nine vector drawables lens_level_0..8,
  // each with a night variant (drawable-night) for the dark widget
  const q = Math.round(clamp(level) * 8) / 8
  const h = levelToHeight(q) * 24
  return `<svg class="wlens" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><clipPath id="wl"><circle cx="15" cy="15" r="12"/></clipPath><rect class="liq" x="0" y="${27 - h}" width="30" height="${h}" clip-path="url(#wl)"/><circle class="rim" cx="15" cy="15" r="12.75" fill="none" stroke-width="1.5"/><ellipse class="hl" cx="10.5" cy="9.5" rx="3.2" ry="1.8" transform="rotate(-30 10.5 9.5)"/></svg>`
}
function renderSurfaces() {
  const c = S.counts()
  const p = ui.shown
  const ctxs = [null, '@computer', '@anrufe', '@zuhause', '@unterwegs', '@buero']
  const wctx = ctxs[ui.widgetCtx]
  const prev = st.context; st.context = wctx
  const L = S.lists(); st.context = prev
  const dueIds = new Set(L.due.map((t) => t.id))
  const rows = [...L.due, ...L.next.filter((t) => !dueIds.has(t.id))]
  const shown = rows.slice(0, 5)
  $('#w-screen').innerHTML = `<div class="w-time">9:42</div><div class="w-date">Samstag, 31. Oktober</div>
    <div class="widget" role="group" aria-label="runway Widget">
      <div class="w-head"><span>${widgetLens(p.level)}</span><div><div class="w-h1">Inbox ${c.inbox} · fällig ${L.due.length}</div><div class="w-h2">${S.progressLabel(p)}</div></div><button class="w-chip" data-act="wchip">${wctx || 'Alle'}</button><button class="w-plus" data-act="wplus" aria-label="+ Todo">${glyph('plus', { size: 18 })}</button></div>
      ${shown.map((t) => `<div class="w-row ${S.isOverdue(t) ? 'od' : ''}"><button class="wr" data-act="wdone" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"></button><span class="wd">${esc(t.description)}</span><span class="wm">${S.isOverdue(t) ? 'überfällig' : t.due && S.dayOf(t.due) === S.TODAY ? 'heute' : ''}</span></div>`).join('')}
      <div class="w-foot"><span class="more">${rows.length > 5 ? `+${rows.length - 5} weitere` : ''}</span><span class="st">Stand ${S.NOW_LABEL}</span></div>
    </div>
    <div class="dock-icons"><span class="app-ic"><i>${glyph('calendar', { size: 22 })}</i>Kalender</span><span class="app-ic"><i class="rw">${brandMark(36)}</i>runway</span><span class="app-ic"><i>${glyph('note', { size: 22 })}</i>Notizen</span><span class="app-ic"><i>${glyph('share', { size: 22 })}</i>Dateien</span></div>`
}
// The capture overlay (tile, shortcut "Neues Todo", widget "+"): only the field, the notice with
// Rückgängig, and Schließen (P05). Plain Views in the app, for the cold-start budget.
function overlayCard({ text = '', caret = false, notice = false, live = false } = {}) {
  return `<div class="ov-card"><div class="ov-field">${live ? '<input class="ov-input" placeholder="Neues Todo" aria-label="Neues Todo" enterkeyhint="done">' : `<span>${text}${caret ? '<i class="caret"></i>' : ''}</span>`}<span class="ov-go" aria-hidden="true">${glyph('enter', { size: 18 })}</span></div>
    <div class="ov-row">${notice ? '<div class="ov-notice"><span>In Inbox ✓</span><button data-act="ovundo">Rückgängig</button></div>' : '<span class="ov-notice-slot"></span>'}<button class="ov-close" data-act="ovclose">Schließen</button></div></div>`
}
const miniKb = () => `<div class="mini-kb"><div>${'<span></span>'.repeat(10)}</div><div>${'<span></span>'.repeat(9)}</div><div>${'<span></span>'.repeat(7)}</div><div><span></span><span class="sp"></span><span></span></div></div>`
function openWidgetOverlay() {
  const ov = $('#w-ov')
  ov.innerHTML = overlayCard({ live: true }) + miniKb()
  ov.hidden = false
  ov.querySelector('.ov-input').focus({ preventScroll: true })
}
function renderStatic() {
  $('#lockup').innerHTML = `${brandMark(30)}runway<small>by Agentic Reach</small>`
  $('#widget-home').innerHTML = '<div id="w-screen"></div><div class="ov w-ov" id="w-ov" hidden></div>'
  const tile = (label, sub, on = false, g = 'settings') => `<div class="tile ${on ? 'on' : ''}"><span>${glyph(g)}</span><span>${label}<small>${sub}</small></span></div>`
  $('#qs').innerHTML = `<div class="qs-panel"><div class="qs-grid">${tile('Internet', 'WLAN', false, 'share')}${tile('Bluetooth', 'An', false, 'settings')}${tile('+ Todo', 'runway', true, 'plus')}${tile('Hotspot', 'Aus', false, 'today')}</div></div>
    <span class="tap" style="left:30px;top:96px"></span>
    <div class="ov">${overlayCard({ text: 'Angebot an Nora schicken', caret: true, notice: true })}${miniKb()}</div>`
  $('#share').innerHTML = `<div class="share-sheet"><div class="ss-title">Teilen</div><div class="ss-text">Agenten-Evaluation: Was wirklich zählt</div>
    <div class="ss-row"><span class="rw"><i>${brandMark(34)}</i>runway</span><span><i>${glyph('note', { size: 20 })}</i>Notizen</span><span><i>${glyph('share', { size: 20 })}</i>Nearby</span><span><i>${glyph('all', { size: 20 })}</i>Kopieren</span></div></div>
    <div class="arrow-down">↓<br>ein Tipp</div>
    <div class="share-card"><div class="grab"></div><div class="sc-eyebrow"><span class="slash">//</span> In die Inbox</div><div class="sc-title">Agenten-Evaluation: Was wirklich zählt</div><div class="sc-note">example.org/newsletter/agenten-evaluation<small>wird als Notiz gespeichert</small></div><button class="sc-btn" data-act="share">In Inbox</button></div>`
  $('#natives').innerHTML = [
    ['Tageslinse', 'AGSL RuntimeShader im ShaderBrush; Füllstand und eine Neigung beim Aufprall. Kein 3D, keine Bitmap.'],
    ['Perle', 'Compose Animatable entlang PathMeasure, in einem Overlay über der Liste; Haptik CONFIRM. Nur für Todos, die für heute zählen.'],
    ['Widget und Overlay', 'Glance mit neun Vektor-Füllständen (hell und dunkel); Overlay und Teilen als schnelle Views.'],
  ].map(([k, v]) => `<div><dt><span class="slash">//</span> ${k}</dt><dd>${v}</dd></div>`).join('')
}

// ------------------------------------------------------------ events
function setView(v) {
  if (!TABS.find((t) => t[0] === v)) return
  ui.view = v
  ui.kb = v === 'inbox' // contract: Inbox opens with the field focused and the keyboard up; others without
  closeSheet()
  $('#a-list').scrollTop = 0
  renderAll()
  renderCapture()
  if (ui.kb) setTimeout(() => $('#a-input')?.focus({ preventScroll: true }), 0)
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-view], [data-ctx]')
  if (!el) {
    if (e.target.id === 'a-scrim') closeSheet()
    else if (!e.target.closest('#a-menu')) $('#a-menu').hidden = true
    // tap beside the field closes the keyboard and keeps the draft
    if (ui.kb && e.target.closest('#a-list') && !e.target.closest('#a-capture')) setKeyboard(false)
    if (e.target.closest('#w-ov') && !e.target.closest('.ov-card') && !e.target.closest('.mini-kb')) $('#w-ov').hidden = true
    return
  }
  if (el.dataset.view) { setView(el.dataset.view); return }
  if (el.dataset.ctx != null && !el.dataset.act) { ui.ctx = el.dataset.ctx || null; renderChips(); renderList(); return }
  const rowEl = el.closest('.row')
  const id = rowEl?.dataset.id
  if (rowEl) ui.focusKey = rowEl.dataset.key
  switch (el.dataset.act) {
    case 'done': complete(id, rowEl); break
    case 'open': openSheet(id); break
    case 'rowmenu': rowMenu(rowEl); break
    case 'more': moreMenu(); break
    case 'mclarify': { const mid = $('#a-menu').dataset.id; $('#a-menu').hidden = true; openClarify(mid); break }
    case 'mdelete': { const mid = $('#a-menu').dataset.id; $('#a-menu').hidden = true; const h = S.remove(mid); notice('Gelöscht', h); break }
    case 'medit': $('#a-menu').hidden = true; break
    case 'copt': { const v = el.dataset.v; if (v === 'next') { ui.clarifyOpen = 'next'; openClarify(ui.sheet); } else { const sid = ui.sheet; closeSheet(); if (v === 'done') complete(sid); else notice(v === 'waiting' ? 'Nach Warten auf' : 'Nach Irgendwann', S.clarify(sid, v)) } break }
    case 'capply': { const sid = ui.sheet; closeSheet(); notice(`Nach Nächste · ${el.dataset.v.split(':')[1]}`, S.clarify(sid, el.dataset.v)); break }
    case 'move': S.moveTo(ui.sheet, el.dataset.v); openSheet(ui.sheet); break
    case 'sctx': S.setContext(ui.sheet, el.dataset.v); openSheet(ui.sheet); break
    case 'sdone': { const sid = ui.sheet; closeSheet(); complete(sid); break }
    case 'undo': S.undo(ui.noticeKey); $('#a-notice').hidden = true; break
    case 'wchip': ui.widgetCtx = (ui.widgetCtx + 1) % 6; renderSurfaces(); break
    case 'wdone': S.complete(el.dataset.id); notice('Erledigt', st.holds.at(-1)); break
    case 'wplus': openWidgetOverlay(); break // the capture overlay, not the app (as today)
    case 'ovclose': el.closest('.ov').hidden = true; break
    case 'ovundo': if (el.closest('#w-ov')) { S.undo(); el.closest('.ov-notice').remove() } break
    case 'share': { S.capture('Agenten-Evaluation: Was wirklich zählt', 'https://example.org/newsletter/agenten-evaluation'); el.textContent = 'In Inbox ✓'; break }
  }
})
document.addEventListener('focusin', (e) => { if (e.target.id === 'a-input' && !ui.kb) setKeyboard(true) })
// scrolling the list closes the keyboard and keeps the draft (as the app does today)
// (user gestures only: a programmatic scroll must not close it)
for (const ev of ['wheel', 'touchmove']) $('#a-list').addEventListener(ev, () => { if (ui.kb) setKeyboard(false) }, { passive: true })
document.addEventListener('submit', (e) => {
  e.preventDefault()
  const inp = $('#a-input')
  const t = S.capture(inp.value)
  if (t) { inp.value = ''; notice('In Inbox ✓', st.holds.at(-1)); inp.focus({ preventScroll: true }) }
})
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('ov-input')) return
  e.preventDefault()
  const v = e.target.value
  if (!S.capture(v)) return
  e.target.value = ''
  const row = e.target.closest('.ov-card').querySelector('.ov-row')
  row.querySelector('.ov-notice, .ov-notice-slot')?.replaceWith(Object.assign(document.createElement('div'), { className: 'ov-notice', innerHTML: '<span>In Inbox ✓</span><button data-act="ovundo">Rückgängig</button>' }))
})
// swipe right = abhaken
let sw = null
document.addEventListener('pointerdown', (e) => {
  const r = e.target.closest('#a-list .row[data-id]')
  if (!r || e.target.closest('button')) return
  sw = { r, x: e.clientX, y: e.clientY, dx: 0, live: false }
})
document.addEventListener('pointermove', (e) => {
  if (!sw) return
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y
  if (!sw.live && Math.abs(dy) > 10) { sw = null; return }
  if (dx > 8) sw.live = true
  if (sw.live) { sw.dx = Math.max(0, dx); sw.r.style.transform = `translateX(${sw.dx}px)`; sw.r.style.background = sw.dx > Math.max(96, sw.r.offsetWidth * 0.35) ? 'var(--rw-action-tint)' : '' }
})
document.addEventListener('pointerup', () => {
  if (!sw) return
  const { r, dx, live } = sw; sw = null
  r.style.transform = ''; r.style.background = ''
  if (live && dx > Math.max(96, r.offsetWidth * 0.35)) { ui.focusKey = r.dataset.key; complete(r.dataset.id, r) }
})
S.subscribe((type, d) => {
  if (type === 'sent' || type === 'completed') return
  if (type === 'captured') { renderAll({ newId: d.id }); return }
  renderAll()
})
darkMq.addEventListener('change', () => { if (ui.fx) ui.fx.setTheme({ dark: darkMq.matches, ground: groundHex() }) })

// ------------------------------------------------------------ boot + test hook
renderKeyboard(); renderStatic(); renderAll(); renderCapture()
window.proto = {
  show(view) { setView(view) },
  filter(context) { if (ui.view !== 'next') setView('next'); ui.ctx = context || null; renderChips(); renderList() },
  capture(text) { const t = S.capture(text); if (t) notice('In Inbox ✓', st.holds.at(-1)); return t },
  open(id) { const t = S.find(id); if (!t) return; if (S.isInbox(t)) { if (ui.view !== 'inbox') setView('inbox'); openClarify(t.id) } else openSheet(t.id) },
  complete(id) { return complete(S.find(id)?.id) },
  clarify(id, to) { const t = S.find(id); if (!t) return; notice('Geklärt', S.clarify(t.id, to)) },
  async signature() {
    if (ui.view !== 'next') setView('next')
    await document.fonts.ready; await ui.fxReady
    await new Promise((r) => setTimeout(r, 100))
    // a todo planned for today: 3 von 7 becomes 4 von 7
    const t = S.find('Steuerberatung zurückrufen')
    ui.focusKey = `next-${t.id}`
    complete(t.id, $(`#a-list .row[data-key="next-${t.id}"]`))
  },
  keyboard(on) { setKeyboard(!!on) },
  widgetPlus() { openWidgetOverlay() },
  // P04: one-line rows fully visible between the top of the list and the capture field
  measure() {
    const list = $('#a-list').getBoundingClientRect(), field = $('#a-capture').getBoundingClientRect()
    const rows = $$('#a-list .row').map((r) => r.getBoundingClientRect())
    const visible = rows.filter((r) => r.top >= list.top - 0.5 && r.bottom <= Math.min(list.bottom, field.top) + 0.5)
    return { visible: visible.length, listTop: Math.round(list.top - phone.getBoundingClientRect().top), fieldTop: Math.round(field.top - phone.getBoundingClientRect().top), rowHeights: visible.map((r) => Math.round(r.height)), kb: ui.kb }
  },
  get state() { return { view: ui.view, kb: ui.kb, progress: S.progress(), label: S.progressLabel(S.progress()), frames: ui.fx?.frames ?? 0 } },
}
