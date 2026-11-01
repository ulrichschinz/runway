// runway · Greifbar — Android prototype. Same store, rows, stack and WebGL layer as the web;
// layout, sizes and behaviour follow Android (bottom navigation, field above the keyboard,
// swipe right to check off, bottom sheets, notice bar with Rückgängig).
import { createStore } from './store.js'
import { VIEWS, MARK_SVG, icon, esc, rowHTML, sectionHTML, wdm, dm, contextsOf, dateOptions, berlinMorning, dayText } from './ui.js'
import { createStack } from './stack.js'

const store = createStore()
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const html = document.documentElement
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const darkMq = matchMedia('(prefers-color-scheme: dark)')
const phone = $('#screen')
const st = { tab: 'next', ctx: null, klaeren: false, kbd: false, sheet: null, askNext: null, wctx: 0, wNotice: null }
let gl = null, glReady = null
const STAND = 'Stand 09:12'
const CAPTURED = 'In Inbox ✓' // the same string on every surface (pinned by the Android contract)

// ---------------------------------------------------------------- notice bar (Android contract strings)
let nTimer = 0
function notice(text, undo = true) {
  const n = $('#a-notice')
  n.querySelector('span').textContent = text
  n.querySelector('button')?.remove()
  if (undo) {
    const b = document.createElement('button'); b.textContent = 'Rückgängig'
    b.addEventListener('click', () => { n.classList.remove('on'); doUndo() })
    n.insertBefore(b, n.querySelector('.drain'))
  }
  n.classList.remove('on'); void n.offsetWidth; n.classList.add('on')
  clearTimeout(nTimer); nTimer = setTimeout(() => n.classList.remove('on'), 6000)
  $('#live').textContent = text
}
function doUndo() {
  if (st.klaeren && stack.undo()) return
  if (store.undoLast()) notice('Rückgängig gemacht', false)
}

// ---------------------------------------------------------------- Klären stage (shared stack controller)
const stageEl = document.createElement('div')
stageEl.className = 'stage'
stageEl.innerHTML = `<div class="stage-main">
  <div class="stage-q"><h2>Wohin <em>gehört</em> das?</h2></div>
  <p class="sr-only stack-sr" aria-live="polite"></p>
  <div class="stack-wrap"><div class="stack-slot"></div></div>
  <div class="trays" role="group" aria-label="Einsortieren"></div>
  <p class="stack-hint"></p>
  <div class="stage-empty"><p class="big">Kopf frei.</p><p>Inbox ist leer.</p><button class="btn btn-ink" data-a="k-done">Zu Nächste ${icon('forward')}</button></div>
</div><span class="stack-progress" style="display:none"></span>`
$('#a-klaeren').appendChild(stageEl)
const stack = createStack({
  store, root: stageEl, motion: () => !reduced.matches, compact: true, menuHost: phone,
  onOpen: (id) => openSheet(id), toast: (m, u) => notice(m, u),
  announce: (m) => { $('#live').textContent = m },
  onChange: (n) => { $('#a-kprog').innerHTML = n ? `<span>${store.counts().inbox}</span> in der Inbox` : 'geklärt' },
})

// ---------------------------------------------------------------- rendering
const TITLES = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', projects: 'Projekte', someday: 'Irgendwann' }
function renderTop() {
  // the static brand mark leads the top bar; the companion lives on the Klären screen only,
  // so nothing 3D or AGSL sits on the icon-to-Inbox start path
  $('#a-top').innerHTML = `<span class="a-mark" aria-hidden="true">${MARK_SVG}</span><h1>${TITLES[st.tab]}</h1>
    <button class="a-icon" data-a="search" aria-label="Suchen">${icon('search')}</button>
    <button class="a-icon" data-a="more" aria-label="Mehr">${icon('more')}</button>`
}
function renderNav() {
  const c = store.counts()
  $('#a-nav').innerHTML = VIEWS.map((v) => `<button class="bn${st.tab === v.id ? ' on' : ''}" data-tab="${v.id}" aria-label="${v.label}"><span class="bn-ind">${icon(v.icon)}</span>${v.label}${v.id === 'inbox' && c.inbox ? `<span class="bn-badge">${c.inbox}</span>` : ''}</button>`).join('')
}
const rows = (ts, view) => ts.map((t) => rowHTML(t, { view, android: true }))
function viewInbox() {
  const l = store.lists()
  return `<div class="a-stand"><span>${STAND}</span>${l.inbox.length ? `<button class="chip" data-a="klaeren" style="height:36px">${icon('stack')}Klären · ${l.inbox.length}</button>` : ''}</div>` +
    (l.inbox.length ? `<ul class="sheet rows" role="list">${rows(l.inbox, 'inbox').join('')}</ul>` : '<p class="sheet empty">Inbox ist leer</p>')
}
function viewNext() {
  const l = store.lists(st.ctx), c = store.counts()
  const chips = [`<button class="chip mono-chip${!st.ctx ? ' on' : ''}" data-ctx="">Alle</button>`, ...store.state.contexts.map((x) => `<button class="chip mono-chip${st.ctx === x ? ' on' : ''}" data-ctx="${x}">${x}</button>`)].join('')
  const dueRows = l.due.map((t) => rowHTML(t, { view: 'next', android: true, other: !!st.ctx && !store.inContext(t, st.ctx) }))
  return `<div class="a-stand"><span>${STAND}</span><span>${c.doneToday} heute erledigt</span></div><div class="a-chips" role="group" aria-label="Kontext">${chips}</div>` +
    sectionHTML(st.ctx ? 'Fällig · alle Kontexte' : 'Fällig', l.due.length, dueRows, { empty: 'Nichts fällig' }) +
    sectionHTML('Nächste Aktionen', l.next.length, rows(l.next, 'next'), { empty: 'Keine nächsten Aktionen' })
}
function viewWaiting() {
  const l = store.lists()
  const due = l.waiting.filter((t) => store.followUp(t).due), rest = l.waiting.filter((t) => !store.followUp(t).due)
  return `<div class="a-stand"><span>${STAND}</span></div>` + (due.length ? sectionHTML('Nachhaken', due.length, rows(due, 'waiting')) : '') +
    sectionHTML('Wartet', rest.length, rows(rest, 'waiting'), { empty: 'Du wartest auf nichts' })
}
function viewSomeday() {
  const l = store.lists()
  return `<div class="a-stand"><span>${STAND}</span></div>` + sectionHTML('Vielleicht', l.someday.length, rows(l.someday, 'someday')) +
    (l.tickler.length ? sectionHTML('Zurückgestellt', l.tickler.length, rows(l.tickler, 'someday')) : '')
}
function viewProjects() {
  const ps = store.projects().filter((p) => p.status === 'active')
  const card = (p) => p.stalled
    ? `<div class="a-proj sheet proj stalled"><span class="proj-name">${esc(p.name)}</span><span class="stall"><i></i>Steht still · keine nächste Aktion</span>
        <form class="stall-add" data-add="${esc(p.name)}"><input class="field" name="d" placeholder="Nächste Aktion" aria-label="Nächste Aktion für ${esc(p.name)}"><select class="field" name="c" aria-label="Kontext">${store.state.contexts.map((x) => `<option>${x}</option>`).join('')}</select></form></div>`
    : `<div class="a-proj sheet"><span class="proj-name">${esc(p.name)}</span><span class="proj-out">${esc(p.outcome)}</span><span class="proj-meta">${p.next.length} nächste · ${p.waiting.length} wartet</span>
        ${p.next.length ? `<ul class="rows" role="list" style="margin:6px -14px -10px -4px">${rows(p.next.slice(0, 2), 'project').join('')}</ul>` : ''}</div>`
  const stalled = ps.filter((p) => p.stalled), rest = ps.filter((p) => !p.stalled)
  return `<div class="a-stand"><span>${STAND}</span><span>Rückblick zuletzt ${wdm(store.state.lastReview)}</span></div>` +
    (stalled.length ? `<section class="sec"><h3 class="eyebrow"><span class="slash">//</span> Steht still <span class="sec-n">${stalled.length}</span></h3>${stalled.map(card).join('')}</section>` : '') +
    `<section class="sec"><h3 class="eyebrow"><span class="slash">//</span> Aktiv <span class="sec-n">${rest.length}</span></h3>${rest.map(card).join('')}</section>`
}
function renderView() {
  const map = { inbox: viewInbox, next: viewNext, waiting: viewWaiting, projects: viewProjects, someday: viewSomeday }
  $('#a-view').innerHTML = map[st.tab]()
  phone.classList.toggle('has-field', st.tab === 'inbox' || st.kbd)
  $('#a-field').style.display = st.tab === 'inbox' || st.kbd ? '' : 'none'
  $('#a-fab').style.display = st.tab === 'inbox' || st.kbd || st.klaeren ? 'none' : ''
}
function renderAll() {
  renderTop(); renderNav(); renderView(); renderWidget()
  phone.classList.toggle('kbd-open', st.kbd && !st.klaeren)
  phone.classList.toggle('klaeren', st.klaeren)
  if (st.sheet) renderSheet()
  if (gl) { const c = store.counts(); gl.companion.set(c.inbox, c.cleared); placeCompanion() }
}
let quiet = 0, pend = 0
store.on(() => { if (!quiet && !pend) pend = requestAnimationFrame(() => { pend = 0; renderAll() }) })

function setTab(tab) {
  st.tab = tab; st.klaeren = false
  st.kbd = tab === 'inbox'
  stack.setVisible(false)
  $('#a-scroll').scrollTop = 0
  renderAll()
  if (st.kbd) setTimeout(() => $('#a-input').focus({ preventScroll: true }), 30)
}
function openKlaeren() {
  st.klaeren = true; st.kbd = false
  $('#a-input').blur()
  renderAll()
  stack.setVisible(true)
  requestAnimationFrame(() => { stack.layout(); placeCompanion() })
}

// ---------------------------------------------------------------- complete (pill squish, then the row leaves within 1 s)
async function complete(id, rowEl) {
  const t = store.get(id)
  if (!t || t.status !== 'pending') return
  rowEl = rowEl || $(`#a-view .row[data-id="${t.id}"]`)
  quiet++
  try {
    if (rowEl) {
      if (gl && !reduced.matches) {
        rowEl.classList.add('hide3d')
        await gl.squish(rowEl.querySelector('.pill').getBoundingClientRect(), () => { rowEl.classList.add('done', 'instant'); rowEl.classList.remove('hide3d') })
      }
      rowEl.classList.add('done')
      await sleep(gl ? 120 : 260)
      $$(`#a-view .row[data-id="${t.id}"]`).forEach((r) => r.classList.add('leave'))
      await sleep(140)
    }
  } finally { quiet-- }
  const before = t.project ? store.projects().find((p) => p.name === t.project) : null
  store.complete(t.id)
  const after = before ? store.projects().find((p) => p.name === before.name) : null
  notice(after && after.stalled && !before.stalled ? `Erledigt · ${after.name} steht still` : 'Erledigt')
}

// ---------------------------------------------------------------- native detail sheet (replaces the Custom Tab)
const LISTS = [['inbox', 'Inbox'], ['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann']]
function openSheet(id) { if (st.sheet !== id) st.askNext = null; st.sheet = id; st.kbd = false; $('#a-input').blur(); phone.classList.add('sheet-open'); renderAll() }
function closeSheet() { st.sheet = null; st.askNext = null; phone.classList.remove('sheet-open') }
function renderSheet() {
  const t = store.get(st.sheet)
  if (!t || t.status !== 'pending') { closeSheet(); return }
  const w = store.where(t), ctxs = contextsOf(t), f = store.followUp(t)
  const asking = st.askNext === t.id
  $('#a-sheet').innerHTML = `<span class="a-grab"></span>
    <p class="eyebrow"><span class="slash">//</span> ${LISTS.find(([k]) => k === w)?.[1] || 'Projekt'}${t.project ? ` · ${esc(t.project)}` : ''}</p>
    <textarea class="d-title" rows="2" aria-label="Beschreibung">${esc(t.description)}</textarea>
    <div class="seg" role="group" aria-label="Liste">${LISTS.map(([k, l]) => `<button class="${(asking ? k === 'next' : w === k) ? 'on' : ''}${asking && k === 'next' ? ' asking' : ''}" data-move="${k}">${l}</button>`).join('')}</div>
    <div class="d-block${asking ? ' ask' : ''}"><p class="eyebrow"><span class="slash">//</span> ${asking ? 'Kontext · <span class="ask-q">wo erledigst du das?</span>' : 'Kontext'}</p><div class="d-chips">${store.state.contexts.map((c) => `<button class="chip mono-chip${ctxs.includes(c) ? ' on' : ''}" data-tctx="${c}" style="height:40px">${c}</button>`).join('')}</div></div>
    ${w === 'waiting' && !t.scheduled ? `<div class="d-quick"><span class="k">Nachhaken</span>${dateOptions('follow').slice(0, 3).map((o) => `<button class="chip mono-chip" data-follow="${o.day}" style="height:40px">${o.label}</button>`).join('')}</div>` : ''}
    <div class="d-grid">
      <div class="d-field"><span class="k">Fällig</span><span class="v${t.due ? '' : ' none'}">${t.due ? wdm(t.due) : 'kein Datum'}</span></div>
      <div class="d-field"><span class="k">Nachhaken</span><span class="v${f.day ? '' : ' none'}">${f.day ? wdm(t.scheduled || t.wait) : 'kein Datum'}</span></div>
    </div>
    ${t.annotations.length ? `<ul class="notes">${t.annotations.map((a) => `<li><span class="when">${dm(a.entry)}</span>${esc(a.description)}</li>`).join('')}</ul>` : ''}
    <div class="d-actions"><button class="btn btn-ghost" data-s="web">Im Web öffnen</button><span class="grow"></span><button class="btn btn-coral" data-s="done">${icon('check')}Abhaken</button></div>`
}
$('#a-sheet').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return
  const id = st.sheet
  if (b.dataset.move) {
    const t = store.get(id), to = b.dataset.move, ctx = contextsOf(t)[0]
    if (to === 'next' && !ctx) { st.askNext = id; renderSheet(); return }
    st.askNext = null
    store.clarify(id, to === 'next' ? `next:${ctx}` : to)
    notice(`Verschoben: ${LISTS.find(([k]) => k === to)[1]}${to === 'next' ? ` · ${ctx}` : ''}`)
  }
  if (b.dataset.tctx) {
    if (st.askNext === id) { st.askNext = null; store.clarify(id, `next:${b.dataset.tctx}`); notice(`Verschoben: Nächste · ${b.dataset.tctx}`) } else store.toggleContext(id, b.dataset.tctx)
  }
  if (b.dataset.follow) { store.update(id, { scheduled: berlinMorning(b.dataset.follow) }); notice(`Nachhaken ${dayText(b.dataset.follow)}`, false) }
  if (b.dataset.s === 'done') { closeSheet(); complete(id) }
  if (b.dataset.s === 'web') notice('Öffnet /next?task=… im Custom Tab', false)
})
$('#a-scrim').addEventListener('click', () => closeSheet())

// ---------------------------------------------------------------- inbox row menu
let menu = null
function openMenu(row) {
  menu?.remove()
  const id = Number(row.dataset.id)
  menu = document.createElement('div'); menu.className = 'a-menu'; menu.setAttribute('role', 'menu')
  menu.innerHTML = `<button data-m="klaeren">Klären</button><button data-m="edit">Bearbeiten</button><button data-m="delete">Löschen</button>`
  const r = row.getBoundingClientRect(), p = phone.getBoundingClientRect()
  menu.style.top = `${Math.min(r.bottom - p.top - 8, p.height - 300)}px`
  phone.appendChild(menu)
  menu.addEventListener('click', (e) => {
    const m = e.target.closest('[data-m]')?.dataset.m
    menu.remove(); menu = null
    if (m === 'klaeren') { openKlaeren(); stack.pin(id) }
    if (m === 'edit') openSheet(id)
    if (m === 'delete') { store.remove(id); notice('Gelöscht') }
  })
}

/** System Back and predictive back (OnBackPressedCallback in ClarifyScreen): an open step or menu is
 *  answered with "Zurück" first; only then Back leaves Klären. setVisible(false) also resets the step. */
function back() {
  if (st.sheet) { closeSheet(); return }
  if (st.klaeren && stack.menuOpen) { stack.closeMenu(); return }
  if (st.klaeren && stack.mode === 'choosing') { stack.cancel(); return }
  if (st.klaeren) { st.klaeren = false; stack.setVisible(false); renderAll() }
}

// ---------------------------------------------------------------- events in the phone
phone.addEventListener('click', (e) => {
  const t = e.target
  if (menu && !t.closest('.a-menu')) { menu.remove(); menu = null; if (!t.closest('.row')) return }
  const tab = t.closest('[data-tab]'); if (tab) { setTab(tab.dataset.tab); return }
  const c = t.closest('[data-ctx]'); if (c) { st.ctx = c.dataset.ctx || null; renderAll(); return }
  const a = t.closest('[data-a]')?.dataset.a
  if (a === 'klaeren') { openKlaeren(); return }
  if (a === 'k-back') { back(); return }
  if (a === 'k-done') { setTab('next'); return }
  if (a === 'search' || a === 'more') { notice(a === 'search' ? 'Suche: Tippen filtert alle Listen' : 'Mehr: Alle Aufgaben, Einstellungen, Abmelden', false); return }
  const row = t.closest('#a-view .row')
  if (row && !row.dataset.swiped) {
    const id = Number(row.dataset.id)
    if (t.closest('[data-act="check"]')) { complete(id, row); return }
    if (st.tab === 'inbox') openMenu(row); else openSheet(id)
    return
  }
  if (t.closest('#a-scroll') && st.kbd && st.tab === 'inbox') { st.kbd = false; $('#a-input').blur(); renderAll() }
})
phone.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-add]')
  if (!f) return
  e.preventDefault()
  if (f.d.value.trim()) { store.addNextAction(f.dataset.add, f.d.value.trim(), f.c.value); notice(`${f.dataset.add} bewegt sich wieder`, false) }
})
$('#a-field').addEventListener('submit', (e) => {
  e.preventDefault()
  const t = store.capture($('#a-input').value)
  if (!t) return
  $('#a-input').value = ''
  notice(CAPTURED)
})
$('#a-input').addEventListener('focus', () => { if (!st.kbd) { st.kbd = true; renderAll(); $('#a-input').focus({ preventScroll: true }) } })
$('#a-fab').addEventListener('click', () => { st.kbd = true; renderAll(); $('#a-input').focus({ preventScroll: true }) })

// swipe right on a row checks it off (past 35 % of the width, at least 96 dp)
let sw = null
phone.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('#a-view .row')
  if (!row || e.target.closest('.check')) return
  sw = { row, x: e.clientX, y: e.clientY, dx: 0, on: false }
})
phone.addEventListener('pointermove', (e) => {
  if (!sw) return
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y
  if (!sw.on && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return }
  if (!sw.on && dx > 10) {
    sw.on = true; sw.row.classList.add('swiping')
    const bg = document.createElement('span'); bg.className = 'swipe-bg'; bg.innerHTML = icon('check'); sw.row.prepend(bg); sw.bg = bg
  }
  if (sw.on) {
    sw.dx = Math.max(0, dx)
    sw.row.querySelectorAll(':scope > :not(.swipe-bg)').forEach((el) => { el.style.transform = `translateX(${sw.dx}px)` })
    sw.bg.style.opacity = String(Math.min(1, sw.dx / 120))
  }
})
const swEnd = () => {
  if (!sw) return
  const s = sw; sw = null
  if (!s.on) return
  s.row.dataset.swiped = '1'
  setTimeout(() => { delete s.row.dataset.swiped }, 50)
  const w = s.row.getBoundingClientRect().width
  s.row.querySelectorAll(':scope > :not(.swipe-bg)').forEach((el) => { el.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)'; el.style.transform = '' })
  if (s.dx > Math.max(96, w * 0.35)) complete(Number(s.row.dataset.id), s.row)
  else setTimeout(() => s.bg?.remove(), 200)
}
phone.addEventListener('pointerup', swEnd)
phone.addEventListener('pointercancel', swEnd)

// ---------------------------------------------------------------- keyboard mock (only to prove the field sits above it)
$('#a-kbd').innerHTML = ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'].map((r, i) => `<div class="krow">${i === 2 ? '<span class="w">⇧</span>' : ''}${[...r].map((k) => `<span>${k}</span>`).join('')}${i === 2 ? '<span class="w">⌫</span>' : ''}</div>`).join('') +
  `<div class="krow"><span class="w">?123</span><span class="w">,</span><span class="sp"></span><span class="w">.</span><span class="w">↵</span></div>`

// ---------------------------------------------------------------- Android-only surfaces
function renderWidget() {
  const ctxs = [null, ...store.state.contexts]
  const ctx = ctxs[st.wctx % ctxs.length]
  const l = store.lists(ctx), c = store.counts()
  const seen = new Set(), items = []
  for (const t of [...l.due, ...l.next]) if (!seen.has(t.id)) { seen.add(t.id); items.push(t) }
  const show = items.slice(0, 4), more = items.length - show.length
  const foot = st.wNotice ? `<span>${st.wNotice}</span><button data-w="undo">Rückgängig</button>` : `${more > 0 ? `<span class="more">+${more} weitere</span>` : '<span></span>'}<span class="stand">${STAND}</span>`
  $('#wgt').innerHTML = `<div class="wgt-h"><b>Inbox ${c.inbox} · fällig ${c.due}</b><button class="wgt-chip" data-w="chip">${ctx || 'Alle'}</button><button class="wgt-plus" data-w="plus" aria-label="+ Todo">${icon('plus')}</button></div>
    ${show.map((t) => { const urgent = t.due && store.lists().due.includes(t); return `<div class="wgt-row${urgent ? ' urgent' : ''}"><button class="check" data-w="check" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><span class="pill"></span></button><span class="t">${esc(t.description)}</span>${urgent ? '<span class="m">überfällig</span>' : ''}</div>` }).join('')}
    <div class="wgt-f">${foot}</div>`
}
let wTimer = 0
$('#wgt').addEventListener('click', (e) => {
  const b = e.target.closest('[data-w]'); if (!b) return
  if (b.dataset.w === 'chip') st.wctx += 1
  if (b.dataset.w === 'plus') $('#ov-input').focus()
  if (b.dataset.w === 'check') { store.complete(Number(b.dataset.id)); st.wNotice = 'Erledigt'; clearTimeout(wTimer); wTimer = setTimeout(() => { st.wNotice = null; renderWidget() }, 5500) }
  if (b.dataset.w === 'undo') { store.undoLast(); st.wNotice = null }
  renderWidget()
})
const qs = (el, ic, l, s) => { $(el).innerHTML = `${icon(ic)}<span>${l}${s ? `<small>${s}</small>` : ''}</span>` }
qs('#qs-wifi', 'wifi', 'Internet', 'WLAN'); qs('#qs-bt', 'bt', 'Bluetooth', 'Aus'); qs('#qs-todo', 'plus', '+ Todo', 'runway'); qs('#qs-torch', 'bolt', 'Taschenlampe', '')
$('#qs-todo').addEventListener('click', () => $('#ov-input').focus())
$('#ov-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const t = store.capture($('#ov-input').value)
  if (!t) return
  $('#ov-input').value = ''
  $('#ov-notice').classList.add('on'); setTimeout(() => $('#ov-notice').classList.remove('on'), 6000)
})
$('#ov').addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a
  if (a === 'ov-undo') { store.undoLast(); $('#ov-notice').classList.remove('on') }
  if (a === 'ov-close') $('#ov-input').blur()
})
$('#share-btn').addEventListener('click', () => {
  const b = $('#share-btn')
  if (b.dataset.done) return
  store.capture('Agenten richtig evaluieren: was im Alltag zählt', 'https://example.com/agenten-evaluation')
  b.dataset.done = '1'; b.textContent = CAPTURED
  setTimeout(() => { delete b.dataset.done; b.textContent = 'In Inbox' }, 2200)
})
$('#ic-color').innerHTML = MARK_SVG.replace('class="mark"', 'class="mark keep"'); $('#ic-mono').innerHTML = MARK_SVG.replace('class="mark"', 'class="mark keep"')
// launcher icon at real size: the unchanged mark, and the icon-layer variant (strokes 2.6/64, full opacity; deviation 8)
$('#ic-48a').innerHTML = MARK_SVG.replace('class="mark"', 'class="mark keep"')
$('#ic-48b').innerHTML = MARK_SVG.replace('class="mark"', 'class="mark keep"').replace('stroke-width="1.4" fill="none" opacity="0.55"', 'stroke-width="2.6" fill="none" opacity="0.9"')
$('#sc-menu').innerHTML = `<button data-sc="new">${icon('plus')}Neues Todo</button><button data-sc="inbox">${icon('inbox')}Inbox</button>`
$('#sc-menu').addEventListener('click', (e) => {
  const s = e.target.closest('[data-sc]')?.dataset.sc
  if (s === 'new') { st.kbd = true; renderAll(); $('#a-input').focus({ preventScroll: true }) }
  if (s === 'inbox') setTab('inbox')
})
$('#a-fab').innerHTML = `${icon('plus')}Neues Todo`
$('.a-send').innerHTML = icon('forward')
$('[data-a="k-back"]').innerHTML = icon('back')
$('#a-kbuddy').innerHTML = MARK_SVG
$('#sys').innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 16h2v-3H3zm4 0h2v-6H7zm4 0h2V7h-2zm4 0h2V4h-2z"/></svg><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 16.5 2.5 8a10.6 10.6 0 0 1 15 0z"/></svg><svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="18" height="10" rx="3"/><rect x="4" y="7" width="12" height="6" rx="1.5" fill="currentColor" stroke="none"/><path d="M22 9v2"/></svg>`

// ---------------------------------------------------------------- WebGL layer (stand-in for the native AGSL rendering)
function placeCompanion() {
  if (!gl) return
  const slot = $$('#screen [data-buddy]').find((el) => el.offsetParent && el.getBoundingClientRect().width > 0)
  if (slot) gl.companion.place(slot.getBoundingClientRect()); else gl.companion.hide()
}
async function initGL() {
  if (reduced.matches || gl) return null
  try {
    const mod = await import('./gl.js')
    const layer = mod.createLayer($('#a-gl'), { dark: darkMq.matches, onContextLost: () => { gl = null; html.classList.remove('gl-on') } })
    if (!layer) return null
    gl = layer
    html.classList.add('gl-on')
    const c = store.counts()
    gl.companion.set(c.inbox, c.cleared, { react: false })
    placeCompanion()
    return gl
  } catch { return null }
}
darkMq.addEventListener('change', () => gl && gl.setDark(darkMq.matches))
addEventListener('resize', () => { placeCompanion(); if (st.klaeren) stack.layout() })

const params = new URLSearchParams(location.search)
if (params.get('tab')) st.tab = params.get('tab')
renderAll()
glReady = new Promise((res) => {
  const go = () => initGL().then(res)
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 500 }); else setTimeout(go, 120)
})

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
window.proto = {
  show(view) { setTab(view) },
  filter(context) { st.ctx = context || null; setTab('next') },
  capture(text) { const t = store.capture(text); if (t) notice(CAPTURED); return t },
  open(id) { openSheet(Number(id) || id) },
  complete(id) { return complete(Number(id) || id) },
  clarify(id, to) {
    const t = store.get(id); if (!t) return
    if (!st.klaeren) openKlaeren()
    return stack.clarify(t.id, to)
  },
  async signature(opts) {
    await Promise.race([glReady, sleep(2500)])
    st.tab = 'inbox'
    openKlaeren()
    await frame(); stack.layout(); await frame()
    return stack.signature(opts)
  },
  back,
  frames() { return { card: stack.frames, gl: gl ? gl.frames : 0 } },
  store, stack,
}
