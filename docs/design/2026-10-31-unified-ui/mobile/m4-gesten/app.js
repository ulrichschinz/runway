// m4 Gesten: the board. Mounts the interactive phone, the still frames (same renderer, inert),
// the widget, the tile overlay and the share card, and exposes window.proto on the interactive phone.

import { Phone } from './phone.js'
import { Store, CHIPS, NOW, mapContext, day, TODAY } from './store.js'

const $ = (s, r = document) => r.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const idOf = (store, text) => store.byText(text).id

const PRESETS = {
  'next-filter': { state: { tab: 'next', filter: '@computer' } },
  waiting: { state: { tab: 'waiting' } },
  tick: {
    state: { tab: 'next' },
    setup(p) {
      p.store.holdWrite('done', [idOf(p.store, 'Release-Notes')])
      p.s.notice = { text: 'Erledigt', sub: 'Release-Notes für Version 0.9 schreiben', undo: true }
      p.s.swipe = { id: idOf(p.store, 'Startseiten-Text'), dx: 236 }
    },
  },
  actions: { state: { tab: 'inbox' }, setup(p) { p.s.open = idOf(p.store, 'Rechnung Druckerei') } },
  select: {
    state: { tab: 'inbox' },
    setup(p) { p.s.selected = new Set(['Idee: Kundenstimmen', 'Artikel über', 'Winterreifen'].map((x) => idOf(p.store, x))) },
  },
  'big-inbox': {
    state: { tab: 'inbox', kb: true },
    setup(p) {
      p.s.draft = 'Steuerordner ins Auto'
      p.s.notice = { text: 'In Inbox ✓', undo: true }
    },
  },
  banners: {
    state: { tab: 'inbox', banners: ['setup', { old: 2 }], stand: '08:55' },
    setup(p) {
      p.store.capture('Paket für Nora abholen', 'wartet auf Setup')
      p.store.capture('Termin Zahnarzt verschieben', 'wartet auf Setup')
    },
  },
  offline: {
    state: { tab: 'inbox', offline: true, stand: '09:12' },
    setup(p) {
      p.store.capture('Rückruf Druckerei wegen Proof', 'wartet auf Netz')
      p.store.capture('Ordner Belege 2025 anlegen', 'wartet auf Netz')
      const f = p.store.capture('Folien an Nora schicken', 'Nicht gesendet')
      p.s.menu = { id: f.id } // swipe left or tap on a failed row: the pinned menu, as a sheet
    },
  },
  connected: {
    state: { tab: 'inbox', kb: false },
    setup(p) {
      // pinned (P03 §2): "Verbunden als <user>", the tile hint containing "Zieh die Kachel + Todo in die erste Reihe" + OK
      const d = document.createElement('div')
      d.className = 'tsheet'
      d.innerHTML = `<div class="eb"><span class="l"><span class="slash">//</span><span>Verbunden als uli</span></span></div>
        <h3>Festhalten von <em>überall</em></h3>
        <div class="tdemo" aria-hidden="true"><span class="t0"></span><span class="t1">+ Todo</span><span class="t0"></span><span class="t0"></span></div>
        <p>Zieh die Kachel + Todo in die erste Reihe der Schnelleinstellungen. Dann reicht ein Wisch von oben und ein Tipp, auch gesperrt.</p>
        <button class="pill action wide">OK</button>`
      p.el.querySelector('.scrim').classList.add('force')
      p.el.appendChild(d)
    },
  },
  dark: { state: { tab: 'next' } },
  hint: { state: { tab: 'next', hint: true, filter: '@home' } },
  big: { state: { tab: 'next' } },
  clarify: { state: { tab: 'inbox' }, setup(p) { p.s.clarify = { id: idOf(p.store, 'Rechnung Druckerei'), to: 'Nächste' } } },
}

// ── the interactive phone ──
const main = new Phone($('#live'), { live: true, state: { tab: 'inbox', kb: true } })

// ── stills: same renderer, inert ──
document.querySelectorAll('.scr-still[data-preset]').forEach((el) => {
  const p = PRESETS[el.dataset.preset]
  new Phone(el, { state: { ...p.state }, setup: p.setup })
})

// ── widget "runway Übersicht" (Glance: text and vectors only, no swipe on RemoteViews) ──
const wStore = new Store()
const W = { chip: CHIPS.indexOf('Alle'), notice: false }
function widgetHTML(store, w, opts = {}) {
  const c = store.counts()
  const ctx = mapContext(CHIPS[w.chip])
  const L = store.lists(ctx)
  const rows = [...L.due, ...L.next]
  const max = opts.rows || 5
  const show = rows.slice(0, max)
  const more = rows.length - show.length
  // pinned badge: "Nicht gesendet" (one) or "N nicht gesendet"; a yellow ring, never a fill
  const badge = opts.unsent ? `<div class="wbadge"><i class="bang"></i>${opts.unsent === 1 ? 'Nicht gesendet' : `${opts.unsent} nicht gesendet`}</div>` : ''
  return `
    <div class="wh"><button class="wtitle" data-w="reload" aria-label="Neu laden">Inbox ${c.inbox} · fällig ${c.due}</button>
      <button class="wchip" data-w="chip">${CHIPS[w.chip]}</button><button class="wplus" data-w="plus" aria-label="+ Todo">+</button></div>
    ${badge}
    ${show.map((t) => {
      const od = t.due && day(t.due) < TODAY
      return `<div class="wrow${od ? ' od' : ''}"><span class="wd">${esc(t.description)}</span>${od ? '<span class="wm">überfällig</span>' : ''}<button class="wring" data-w="tick" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"></button></div>`
    }).join('')}
    <div class="wf">${w.notice ? '<span>Erledigt</span><button data-w="undo">Rückgängig</button>' : `<button class="wmore" data-w="more">+${more} weitere</button><span class="stand">Stand ${opts.stand || NOW}</span>`}</div>`
}
function renderWidget() { $('#widget').innerHTML = widgetHTML(wStore, W) }

// still widget states (pinned in P09): the unsent badge, and the fallback when the widget cannot load
const sStore = new Store()
sStore.capture('Folien an Nora schicken', 'Nicht gesendet'); sStore.capture('Belege scannen', 'Nicht gesendet')
if ($('#widget-badge')) $('#widget-badge').innerHTML = widgetHTML(sStore, { chip: CHIPS.indexOf('@business') }, { unsent: 2, rows: 3, stand: '08:12' })
if ($('#widget-fallback')) $('#widget-fallback').innerHTML = `<div class="wfall"><span class="eb2"><span class="slash">//</span> runway Übersicht</span><p>Die Übersicht konnte nicht geladen werden.</p><button class="pill">Widget neu laden</button></div>`

$('#widget').addEventListener('click', (e) => {
  const b = e.target.closest('[data-w]')
  if (!b) return
  const a = b.dataset.w
  if (a === 'chip') W.chip = (W.chip + 1) % CHIPS.length
  if (a === 'tick') { wStore.holdWrite('done', [Number(b.dataset.id)]); W.notice = true; clearTimeout(W.t); W.t = setTimeout(() => { wStore.flush(); W.notice = false; renderWidget() }, 5500) }
  if (a === 'undo') { wStore.undo(); W.notice = false; clearTimeout(W.t) }
  if (a === 'plus') { $('#ofield').focus({ preventScroll: true }) }
  renderWidget()
})
renderWidget()

// ── tile "+ Todo" overlay: only the field, notice, Rückgängig, Schließen ──
let oLast = null
$('#ocapture').addEventListener('submit', (e) => {
  e.preventDefault()
  const f = $('#ofield')
  const t = wStore.capture(f.value)
  if (!t) return
  f.value = ''
  oLast = t.id
  $('#onotice').innerHTML = '<div class="nl"><span class="nt">In Inbox ✓</span><button class="undo" type="button" id="oundo">Rückgängig</button></div><i class="line"></i>'
  $('#onotice').classList.add('on')
  renderWidget()
  setTimeout(() => $('#onotice').classList.remove('on'), 6000)
})
$('#onotice').addEventListener('click', (e) => {
  if (e.target.id !== 'oundo') return
  wStore.undoCapture(oLast)
  $('#onotice').classList.remove('on')
  renderWidget()
})

// ── share card: one tap ──
$('#sharego').addEventListener('click', (e) => {
  e.currentTarget.textContent = 'In Inbox ✓'
  e.currentTarget.setAttribute('aria-disabled', 'true')
})

// ── test hook (acts on the interactive phone) ──
window.proto = {
  show(view) {
    if (['inbox', 'next', 'waiting'].includes(view)) return main.setTab(view)
    // Projekte and Irgendwann stay on the web (scope decision 24.10.2026)
    main.s.ctab = { path: `/${view}`, title: view === 'projects' ? 'Projekte' : 'Irgendwann' }
    main.render()
  },
  filter(context) {
    if (main.s.tab !== 'next') main.setTab('next')
    main.s.filter = mapContext(context)
    main.render()
  },
  capture(text) {
    main.field.value = text
    main.submit()
  },
  open(id) {
    const t = main.store.get(id)
    if (!t) return
    const L = main.store.lists(null)
    if (L.inbox.includes(t)) {
      if (main.s.tab !== 'inbox') main.setTab('inbox')
      main.openMenu(t.id)
    } else main.openDetails(t, t.kind === 'waiting' ? 'waiting' : 'next')
  },
  complete(id) { main.complete([Number(id)]) },
  // Option only (needs Uli's decision); the base app does not clarify
  clarify(id, to) {
    const r = main.store.clarify(Number(id), to)
    if (!r) return
    if (r === 'Gelöscht') main.notify({ text: 'Gelöscht', undo: true })
    else main.notify({ text: 'Geklärt', sub: `${r.label} · Option` }, 3000)
  },
  // signature: the swipe right at the moment it arms (coral, "Abhaken")
  signature() {
    main.setTab('next')
    main.s.swipe = { id: main.store.byText('Startseiten-Text').id, dx: 236 }
    main.render()
  },
  get calls() { return main.store.calls.slice() },
}
