// runway Android, proposal 03 "Papier & Tinte". Stands in for Compose (MainScreen, rows, sheets),
// Glance (widget), the View-based capture overlay (tile) and the share card. One store feeds all.
// Below the board, three still phones show the states the acceptance contracts pin hardest:
// the Inbox with the keyboard open, failed rows with their menu and banners, and 150 % text.

import { createStore, CONTEXTS, contextsOf, parseTw, isInbox, TODAY } from './store.js'
import * as C from './common.js'
import { inkBloom, preloadInk, release as releaseInk, stats as inkStats } from './ink.js'

const store = createStore()
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const scr = $('#screen')
const ui = { tab: 'next', sub: null, ctx: null, sheet: null, menuFor: null, step: null, edit: null, wctx: 0, wdone: null, zero: { play: false, host: null }, lastInbox: null }
const params = new URLSearchParams(location.search)
if (params.get('start')) ui.tab = params.get('start')
const rowCache = new Map()
const busy = new Set()

// ───────────────────────────── rows ─────────────────────────────
// Outbox row states (inventory 3.11), with the exact pinned words
const SYNC = { net: 'wartet auf Netz', failed: 'Nicht gesendet', auth: 'wartet auf Setup' }

function meta(t, kind) {
  const due = C.dueInfo(t)
  const ctx = contextsOf(t)
  // Inbox: no second line unless the todo is not plain Inbox (keeps rows at 56 dp, >= 5 visible with the keyboard up)
  if (kind === 'inbox') return t.sync ? [[SYNC[t.sync], t.sync === 'failed' ? 'overdue' : '']] : []
  if (kind === 'waiting') { const f = C.followInfo(t); return [[f.text, f.tone, f.due], t.project ? [t.project, ''] : null].filter(Boolean) }
  return [
    t.sync === 'failed' ? ['Abhaken nicht gesendet', 'overdue'] : null,
    due ? [due.tone === 'overdue' ? `überfällig ${C.dm(parseTw(t.due))}` : due.text, due.tone] : null,
    t.project ? [t.project, ''] : null,
    [ctx.length ? ctx.join(' ') : 'überall', ''],
  ].filter(Boolean)
}
// accessibility text pinned by the Android contracts: "<description>, <status>, ID <last 8>" (or "lokal <8>")
function a11y(t, kind) {
  const due = C.dueInfo(t)
  let st = { inbox: 'Inbox', next: 'Nächste', waiting: 'Wartet' }[kind] || 'Nächste'
  if (kind === 'inbox' && t.sync) st = SYNC[t.sync]
  if (kind === 'next' && due?.status) st = due.status
  if (kind === 'waiting' && C.followInfo(t).due) st = 'Nachhaken fällig'
  return `${t.description}, ${st}, ${t.local ? 'lokal' : 'ID'} ${t.uuid.slice(-8)}`
}
function rowMarkup(t, kind) {
  const due = C.dueInfo(t)
  const cls = ['row', due?.tone === 'overdue' ? 'overdue' : '', t.fresh ? 'fresh' : '', t.sync ? `sync-${t.sync}` : ''].join(' ')
  return `<div class="${cls}" data-id="${t.id}" data-kind="${kind}" role="listitem" aria-label="${C.esc(a11y(t, kind))}">
    <button class="ring" data-act="done" aria-label="Abhaken: ${C.esc(t.description)}"></button>
    <div class="main"><span class="desc"><span class="txt">${C.esc(t.description)}</span>${C.strikeSVG(t.id)}</span>${t.start ? '<span class="live"><i class="pulse"></i>läuft</span>' : ''}</div>
    <span class="meta">${meta(t, kind).map(([x, c, mark]) => `<span class="m ${c}">${mark ? '<span class="ring-mark"></span>' : ''}${C.esc(x)}</span>`).join('')}</span>
    <span class="stamp"></span></div>`
}
function row(t, kind, sec) {
  const key = `${sec}:${t.id}`
  const sig = JSON.stringify([t.description, t.tags, t.project, t.due, t.start, t.fresh, t.sync, kind])
  const c = rowCache.get(key)
  if (c && c.sig === sig && !c.el.classList.contains('is-gone')) return c.el
  const el = C.html(rowMarkup(t, kind))
  rowCache.set(key, { el, sig })
  return el
}
const sec = (label, n) => `<div class="sec"><div class="eyebrow"><span class="slash" aria-hidden="true">//</span><span>${label}</span><span class="sep">·</span><span>${n}</span></div></div>`

// ───────────────────────────── screens ─────────────────────────────
const eyebrow = (...p) => `<div class="eyebrow"><span class="slash" aria-hidden="true">//</span>${p.filter((x) => x !== '' && x != null).map((x, i) => `${i ? '<span class="sep">·</span>' : ''}<span>${x}</span>`).join('')}</div>`

// three one-line tabs (weights 1f : 1f : 1.3f, maxLines 1) and "···" (48 dp, contentDescription "Mehr");
// the yellow dot sits under the selected label, so it costs no width at 150 % text
function tabsHTML(t, inboxN) {
  return `<nav class="atabs" role="tablist">
      <button role="tab" data-tab="inbox" aria-selected="${t === 'inbox'}"><span class="l">Inbox <span class="n">${inboxN || ''}</span></span></button>
      <button role="tab" data-tab="next" aria-selected="${t === 'next'}"><span class="l">Nächste</span></button>
      <button role="tab" data-tab="waiting" aria-selected="${t === 'waiting'}"><span class="l">Warten auf</span></button>
      <button class="more" data-act="more" aria-label="Mehr">···</button></nav>`
}
function renderTabs(L) {
  const bar = ui.sub ? `<div class="subbar"><button data-act="back">← Zurück</button></div>` : tabsHTML(ui.tab, L.inbox.length)
  const host = $('#abar')
  if (host.dataset.h !== bar) { host.innerHTML = bar; host.dataset.h = bar }
}

function renderBody(L) {
  const body = $('#abody')
  const view = ui.sub || ui.tab
  const zero = view === 'inbox' && !L.inbox.length
  if (!zero && ui.zero.host) { releaseInk(); ui.zero.host = null }
  let head = '', sections = []
  if (view === 'inbox') {
    head = zero
      ? `${eyebrow('Inbox', '0', `Stand ${store.stand}`)}<h1 class="display">${C.heading('inboxEmpty')}</h1><p class="lead">Alles geklärt. Was jetzt zählt, steht unter Nächste.</p>`
      : `${eyebrow('Inbox', L.inbox.length, `Stand ${store.stand}`)}<h1 class="display">${C.heading('inbox')}</h1>`
    sections = [{ key: 'in', tasks: L.inbox, kind: 'inbox' }]
  } else if (view === 'next') {
    const dueIds = new Set(L.due.map((t) => t.id))
    head = `${eyebrow('Nächste', `Stand ${store.stand}`)}<h1 class="display">${C.heading('next')}</h1>
      <div class="ctxbar" role="group" aria-label="Kontext">${[null, ...CONTEXTS].map((c) => `<button class="ctx" data-ctx="${c || ''}" aria-pressed="${ui.ctx === c}">${c || 'Alle'}</button>`).join('')}</div>`
    sections = [
      { key: 'due', label: 'Fällig', tasks: L.due, kind: 'next', empty: 'Nichts fällig' },
      { key: 'nx', label: 'Nächste Aktionen', tasks: L.nextIn.filter((t) => !dueIds.has(t.id)), kind: 'next', empty: 'Keine nächsten Aktionen' },
    ]
  } else if (view === 'waiting') {
    head = `${eyebrow('Warten auf', `Stand ${store.stand}`)}<h1 class="display">${C.heading('waiting')}</h1>`
    sections = [{ key: 'w', label: 'Warten auf', tasks: L.waiting, kind: 'waiting', empty: 'Du wartest auf nichts' }]
  } else if (view === 'someday') {
    head = `${eyebrow('Irgendwann', L.someday.length)}<h1 class="display">${C.heading('someday')}</h1>`
    sections = [{ key: 's', label: 'Ideen', tasks: L.someday, kind: 'next', empty: 'Keine Ideen geparkt' }]
  } else if (view === 'projects') {
    const ov = store.projectOverview()
    head = `${eyebrow('Projekte', `${ov.filter((p) => p.status === 'active').length} aktiv`)}<h1 class="display">${C.heading('projects')}</h1>`
    const h = head + `<div class="alist" style="margin-top:14px">` + ov.map((p) => `<button class="aopt proj" data-project="${C.esc(p.name)}">
        <span>${p.stalled ? '<span class="ring-mark"></span>&nbsp; ' : ''}${C.esc(p.name)}${p.outcome ? `<span class="accent">${C.esc(p.outcome)}</span>` : ''}</span>
        <span class="n">${p.stalled ? 'steckt fest' : p.status === 'active' ? `${p.next} nächste` : p.status === 'on_hold' ? 'ruht' : 'abgeschlossen'}</span></button>`).join('') + '</div>'
      + '<p class="mono mute" style="margin-top:14px">Status ändern und Projekte anlegen: im Browser, im Rückblick.</p>'
    if (body.dataset.h !== h) { body.innerHTML = h; body.dataset.h = h }
    return
  }
  const headEl = body.querySelector(':scope > .ahead') || (() => { body.innerHTML = '<div class="ahead"></div><div class="alist" role="list"></div>'; body.dataset.h = ''; return body.querySelector('.ahead') })()
  if (headEl.dataset.h !== head + view) { headEl.innerHTML = head; headEl.dataset.h = head + view }
  const list = body.querySelector(':scope > .alist')
  if (zero) {
    // plain text on every visit; the AGSL ink only on the step from >= 1 to 0, and never with reduced motion
    if (list.querySelector('.azero')) return
    const play = ui.zero.play && !C.reducedMotion()
    ui.zero.play = false
    list.replaceChildren()
    list.innerHTML = play ? '<div class="azero"><div class="ink-host" id="ainkhost" aria-hidden="true"></div></div>' : '<div class="azero"></div>'
    if (play) {
      const host = $('#ainkhost')
      ui.zero.host = host
      requestAnimationFrame(() => inkBloom(host, { origin: [206, 210], onEnd: () => { if (ui.zero.host === host) ui.zero.host = null } }))
    }
    return
  }
  if (list.querySelector('.azero')) list.replaceChildren()
  const nodes = []
  for (const s of sections) {
    if (s.label) { const k = `sec:${s.key}:${s.tasks.length}`; if (!rowCache.has(k)) rowCache.set(k, { el: C.html(sec(s.label, s.tasks.length)) }); nodes.push(rowCache.get(k).el) }
    if (!s.tasks.length && s.empty) { const k = `e:${s.key}`; if (!rowCache.has(k)) rowCache.set(k, { el: C.html(`<div class="empty-line">${s.empty}</div>`) }); nodes.push(rowCache.get(k).el) }
    s.tasks.forEach((t) => nodes.push(row(t, s.kind, s.key)))
  }
  C.patch(list, nodes)
}

function renderBottom() {
  const view = ui.sub || ui.tab
  $('#abottom').style.display = view === 'inbox' ? '' : 'none'
  $('#afloat').style.display = view === 'inbox' ? 'none' : ''
  $('#aedit').classList.toggle('on', !!ui.edit)
  $('#afieldwrap').style.display = ui.edit ? 'none' : ''
  setIme()
}
// The keyboard is up whenever the Inbox field (or the edit field) has focus: heading collapses into
// the eyebrow, the gesture bar gives way to the keyboard (WindowInsets.isImeVisible in Compose).
function setIme() {
  const a = document.activeElement
  const on = (ui.sub || ui.tab) === 'inbox' && (a === $('#afield') || a === $('#aeditfield'))
  scr.classList.toggle('ime', on)
}

// sheets
function renderSheet(L) {
  const sh = $('#asheet'), scrim = $('#ascrim'), menu = $('#amenu'), tab = $('#actab')
  scrim.classList.toggle('on', !!ui.sheet && ui.sheet !== 'tab')
  menu.classList.toggle('on', ui.sheet === 'menu')
  tab.classList.toggle('on', ui.sheet === 'tab')
  sh.classList.toggle('on', ['mehr', 'clarify'].includes(ui.sheet))
  if (ui.sheet === 'mehr') {
    const ov = store.projectOverview()
    const stalled = ov.some((p) => p.stalled)
    sh.innerHTML = `<div class="sheethead">${C.LOCKUP}<span class="mono mute">// runway</span></div>
      <div style="margin-top:12px">
      <button class="aopt" data-sub="projects"><span>Projekte</span><span class="n">${stalled ? '<span class="ring-mark"></span> steckt fest · ' : ''}${ov.filter((p) => p.status === 'active').length}</span></button>
      <button class="aopt" data-sub="someday"><span>Irgendwann</span><span class="n">${L.someday.length}</span></button>
      <button class="aopt" data-web="review"><span>Rückblick</span><span class="n">im Browser${C.daysBetween(store.lastReview, TODAY) >= 7 ? ' · fällig' : ''}</span></button>
      <button class="aopt" data-web="all"><span>Alle</span><span class="n">im Browser</span></button></div>
      <div style="margin-top:18px" class="mono mute">Angemeldet als uli</div>
      <button class="aopt small"><span>Widget hinzufügen</span></button>
      <button class="aopt small"><span>Protokoll exportieren</span></button>
      <button class="aopt small danger"><span>Abmelden</span></button>`
  }
  if (ui.sheet === 'clarify') {
    const t = store.get(ui.menuFor)
    if (!t) { ui.sheet = null; return renderSheet(L) }
    const active = store.projectOverview().filter((p) => p.status === 'active')
    sh.innerHTML = `${eyebrow('Klären', `noch ${L.inbox.length}`)}<h2 class="title">${C.esc(t.description)}</h2><div class="mono mute">erfasst ${C.entryInfo(t)}</div>
      <div style="margin-top:12px">
      <button class="aopt" data-cl="ctx"><span>Nächste Aktion</span><span class="why">Kontext wählen</span></button>
      ${ui.step === 'ctx' ? `<div class="achips">${CONTEXTS.map((c) => `<button class="ctx" data-to="next:${c}">${c}</button>`).join('')}<button class="ctx" data-to="next">überall</button></div>` : ''}
      <button class="aopt" data-to="waiting"><span>Warten auf</span><span class="why">jemand anderes ist dran</span></button>
      <button class="aopt" data-to="someday"><span>Irgendwann</span><span class="why">vielleicht später</span></button>
      <button class="aopt" data-cl="project"><span>Zu einem Projekt</span><span class="why">mehr als ein Schritt</span></button>
      ${ui.step === 'project' ? `<div class="achips">${active.map((p) => `<button class="ctx" data-to="project:${C.esc(p.name)}">${C.esc(p.name)}</button>`).join('')}</div>` : ''}
      <button class="aopt" data-to="done"><span>Gleich erledigt</span><span class="why">unter zwei Minuten</span></button>
      <button class="aopt danger" data-to="delete"><span>Löschen</span><span class="why">nicht mehr wichtig</span></button></div>`
  }
  if (ui.sheet === 'tab') {
    const t = store.get(ui.menuFor)
    if (!t) return
    const list = isInbox(t) ? 'inbox' : t.tags.includes('waiting') ? 'waiting' : 'next'
    const src = `index.html?task=${encodeURIComponent(t.uuid)}&input=touch#${list}`
    if (tab.dataset.src !== src) {
      // The Custom Tab shows the real web app at phone width: Nächste with the editable detail sheet.
      // Auth: the app fetched a one-time code (POST /auth/handoff, 60 s) and opened .../next?task=<uuid>#h=<code>;
      // the web exchanged it for a session and removed the fragment before this frame.
      tab.innerHTML = `<div class="bar"><button data-act="closetab" aria-label="Schließen">×</button><span class="url"><span class="ttl">runway</span><span><b>runway.agentic-reach.com</b>/${list}?task=${t.uuid.slice(0, 8)}…</span></span><button aria-label="Menü">⋮</button></div>
        <iframe class="webframe" title="runway im Browser" src="${src}"></iframe>`
      tab.dataset.src = src
    }
  }
}

// ───────────────────────────── render ─────────────────────────────
function render() {
  const L = store.lists(ui.ctx)
  const view = ui.sub || ui.tab
  if (ui.lastInbox > 0 && L.inbox.length === 0 && view === 'inbox') ui.zero.play = true
  ui.lastInbox = L.inbox.length
  if (view === 'inbox' && L.inbox.length && L.inbox.length <= 2 && !C.reducedMotion()) (window.requestIdleCallback || setTimeout)(preloadInk)
  renderTabs(L)
  renderBody(L)
  renderBottom()
  renderSheet(L)
  renderWidget(L)
}

// ───────────────────────────── actions ─────────────────────────────
function show(view) {
  ui.sheet = null; ui.edit = null
  if (['inbox', 'next', 'waiting'].includes(view)) { ui.tab = view; ui.sub = null } else { ui.sub = view }
  $('#abody').scrollTop = 0
  render()
  // the Inbox opens with the field focused and the keyboard up; Nächste and Warten auf without
  if (view === 'inbox') $('#afield').focus({ preventScroll: true })
  else if (document.activeElement === $('#afield')) $('#afield').blur()
  setIme()
}
const labelFor = (to) => ({ waiting: 'Warten auf', someday: 'Irgendwann' }[to] || (to.startsWith('next') ? `Nächste · ${to.split(':')[1] || 'überall'}` : to.startsWith('project:') ? `Projekt · ${to.slice(8)}` : to))
async function complete(id, mode = 'done', to = null) {
  const t = store.get(id)
  if (!t || busy.has(t.id) || t.status !== 'pending') return
  busy.add(t.id)
  const els = $$(`#abody .row[data-id="${t.id}"]`)
  const reduce = C.reducedMotion()
  if (els.length) {
    els.forEach((el) => {
      el.classList.remove('swiping', 'armed')
      el.classList.add(mode === 'delete' ? 'is-deleted' : mode === 'filed' ? 'is-filed' : 'is-struck')
      const st = el.querySelector('.stamp')
      if (mode === 'filed') st.textContent = `→ ${labelFor(to)}`
      if (mode === 'delete') st.textContent = 'gelöscht'
    })
    await C.sleep(reduce ? 160 : mode === 'filed' ? 520 : 600)
    els.forEach((el) => { el.style.height = el.offsetHeight + 'px'; void el.offsetHeight; el.classList.add('is-gone') })
    await C.sleep(reduce ? 0 : 190) // the row leaves the tree well inside 1 s (contract)
  }
  busy.delete(t.id)
  if (to) store.clarify(t.id, to)
  else if (mode === 'delete') store.remove(t.id)
  else store.complete(t.id)
  for (const k of [...rowCache.keys()]) if (k.endsWith(':' + t.id)) rowCache.delete(k)
  render()
}
function clarify(id, to) {
  ui.sheet = null; ui.step = null
  render()
  if (to === 'delete') return complete(id, 'delete', 'delete')
  if (to === 'done') return complete(id, 'done', 'done')
  return complete(id, 'filed', to)
}
function openTask(id) {
  const t = store.get(id)
  if (!t) return
  if (isInbox(t)) { if (ui.tab !== 'inbox' || ui.sub) show('inbox'); ui.menuFor = t.id; ui.sheet = 'clarify'; ui.step = null }
  else { ui.menuFor = t.id; ui.sheet = 'tab' }
  render()
}

// notice with the 6 s hold (outbox): one per screen, bottom; Rückgängig holds the last action only
let nt = 0
function notify(text, undo) {
  const n = (ui.sub || ui.tab) === 'inbox' ? $('#anotice') : $('#afloat')
  ;[$('#anotice'), $('#afloat')].forEach((x) => x.classList.remove('show'))
  clearTimeout(nt)
  void n.offsetWidth
  n.innerHTML = `<span class="what">${C.esc(text)}</span>${undo ? '<button class="undo" data-act="undo">Rückgängig</button>' : ''}<span class="timer"></span>`
  n._undo = undo
  n.classList.add('show')
  nt = setTimeout(() => n.classList.remove('show'), 6000)
}
store.subscribe((why, d) => {
  const t = d?.id && store.get(d.id)
  if (why === 'capture') notify('In Inbox ✓', () => store.undo(t.id))
  if (why === 'done') notify(`Erledigt: ${t.description}`, () => store.undo(t.id))
  if (why === 'delete') notify('Gelöscht', () => store.undo(t.id))
  // filing is reversible through the API: Rückgängig sends the inverse tags_remove
  if (why === 'clarify') notify(`→ ${store.clarified.at(-1)?.label || ''}`, () => store.undoClarify(t.id))
  render()
})

// ───────────────────────────── phone events ─────────────────────────────
// keep the keyboard up while tapping "+" or a ring (Android keeps the IME on these taps)
scr.addEventListener('mousedown', (e) => { if (scr.classList.contains('ime') && e.target.closest('.ring, .go, .undo')) e.preventDefault() })
$('#afield').addEventListener('focus', setIme)
$('#afield').addEventListener('blur', () => setTimeout(setIme, 0))
$('#aeditfield').addEventListener('focus', setIme)
$('#aeditfield').addEventListener('blur', () => setTimeout(setIme, 0))

scr.addEventListener('click', (e) => {
  if (swipe.moved) { swipe.moved = false; return }
  const a = e.target.closest('[data-act], [data-tab], [data-ctx], [data-sub], [data-to], [data-cl], [data-menu], [data-project], [data-web]')
  const rowEl = e.target.closest('.alist .row[data-id]')
  if (!a && rowEl) {
    const id = Number(rowEl.dataset.id)
    if (rowEl.dataset.kind === 'inbox') { // Inbox: a one-tap menu at the row's right edge
      const r = rowEl.getBoundingClientRect(), s = scr.getBoundingClientRect()
      const m = $('#amenu')
      const t = store.get(id)
      m.innerHTML = t.sync === 'failed'
        ? '<button data-menu="retry" role="menuitem">Erneut senden</button><button data-menu="edit" role="menuitem">Bearbeiten und erneut senden</button><button data-menu="delete" role="menuitem">Löschen</button>'
        : '<button data-menu="edit" role="menuitem">Bearbeiten</button><button data-menu="clarify" role="menuitem">Klären</button><button data-menu="delete" role="menuitem">Löschen</button>'
      m.style.top = Math.min(r.top - s.top + 30, 915 - 220) + 'px'
      ui.menuFor = id; ui.sheet = 'menu'; render()
    } else { ui.menuFor = id; ui.sheet = 'tab'; render() } // Nächste, Warten auf: Custom Tab with ?task=
    return
  }
  if (!a) { if (ui.sheet === 'menu') { ui.sheet = null; render() } return }
  const d = a.dataset
  if (d.act === 'done' && rowEl) return complete(Number(rowEl.dataset.id))
  if (d.tab) return show(d.tab)
  if (d.ctx !== undefined) { ui.ctx = d.ctx || null; return render() }
  if (d.sub) return show(d.sub)
  if (d.web) { ui.sheet = null; render(); return }
  if (d.cl) { ui.step = ui.step === d.cl ? null : d.cl; return render() }
  if (d.to) return clarify(ui.menuFor, d.to)
  if (d.menu === 'edit') { ui.edit = ui.menuFor; ui.sheet = null; render(); const f = $('#aeditfield'); f.value = store.get(ui.edit).description; f.focus(); return }
  if (d.menu === 'clarify') { ui.sheet = 'clarify'; ui.step = null; return render() }
  if (d.menu === 'retry') { ui.sheet = null; render(); return }
  if (d.menu === 'delete') { ui.sheet = null; render(); return complete(ui.menuFor, 'delete') }
  if (d.project) return
  switch (d.act) {
    case 'more': ui.sheet = 'mehr'; render(); break
    case 'back': show(ui.tab); break
    case 'scrim': ui.sheet = null; ui.step = null; render(); break
    case 'closetab': ui.sheet = null; render(); break
    case 'undo': { const n = a.closest('.anotice'); n?._undo?.(); n?.classList.remove('show'); break }
    case 'editcancel': ui.edit = null; render(); $('#afield').focus(); break
    case 'editsave': store.rename(ui.edit, $('#aeditfield').value); ui.edit = null; render(); $('#afield').focus(); break
  }
})
$('#ascrim').addEventListener('click', () => { ui.sheet = null; ui.step = null; render() })
$('#acapture').addEventListener('submit', (e) => { e.preventDefault(); const f = $('#afield'); if (store.capture(f.value)) f.value = ''; f.focus() })
$('#aeditfield').addEventListener('keydown', (e) => { if (e.key === 'Enter') { store.rename(ui.edit, e.target.value); ui.edit = null; render(); $('#afield').focus() } if (e.key === 'Escape') { ui.edit = null; render() } })

// swipe right = check off; the coral strike follows the finger, armed past 35 % (min 96 dp)
const swipe = { el: null, x0: 0, y0: 0, dx: 0, on: false, moved: false }
scr.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.alist .row[data-id]')
  if (!el || e.target.closest('.ring') || busy.has(Number(el.dataset.id))) return
  Object.assign(swipe, { el, x0: e.clientX, y0: e.clientY, dx: 0, on: false, moved: false })
})
scr.addEventListener('pointermove', (e) => {
  const s = swipe
  if (!s.el) return
  const dx = e.clientX - s.x0, dy = e.clientY - s.y0
  if (!s.on) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.el = null; return } // vertical scroll never checks off
    if (dx > 10) { s.on = true; s.moved = true; s.el.setPointerCapture?.(e.pointerId); s.el.classList.add('swiping'); s.el.classList.remove('settle') }
  }
  if (!s.on) return
  s.dx = Math.max(0, dx)
  const thr = Math.max(96, s.el.offsetWidth * 0.35)
  const k = Math.min(1, s.dx / thr)
  s.el.style.setProperty('--dx', `${Math.min(s.dx * 0.25, 40)}px`)
  s.el.querySelector('.strike path').style.strokeDashoffset = String(1 - k)
  const was = s.el.classList.contains('armed')
  s.el.classList.toggle('armed', k >= 1)
  if (!was && k >= 1 && navigator.vibrate) navigator.vibrate(8) // haptic tick at the threshold
})
const endSwipe = () => {
  const s = swipe
  if (!s.el) return
  const el = s.el
  s.el = null
  if (!s.on) return
  const armed = el.classList.contains('armed')
  el.classList.add('settle')
  el.style.setProperty('--dx', '0px')
  if (armed) { el.querySelector('.strike path').style.strokeDashoffset = ''; complete(Number(el.dataset.id)) }
  else { el.classList.remove('swiping'); el.querySelector('.strike path').style.strokeDashoffset = '' }
}
scr.addEventListener('pointerup', endSwipe)
scr.addEventListener('pointercancel', endSwipe)

// ───────────────────────────── widget (Glance, text only) ─────────────────────────────
// every target 48 dp: header, chip (32 dp pill inside a 48 dp box), "+", each row's ring, the footer
const WCTX = [null, ...CONTEXTS]
function renderWidget(L) {
  const ctx = WCTX[ui.wctx]
  const due = L.due
  const dueIds = new Set(due.map((t) => t.id))
  const rows = [...due, ...store.lists(ctx).nextIn.filter((t) => !dueIds.has(t.id))]
  const shown = rows.slice(0, 4)
  const more = rows.length - shown.length
  const unsent = 0
  const w = $('#widget')
  w.innerHTML = `<div class="wh"><button class="hdr" data-w="refresh" aria-label="Neu laden">Inbox ${L.inbox.length} · fällig ${due.length}</button>
      <button class="chip" data-w="chip"><span>${ctx || 'Alle'}</span></button><button class="plus" data-w="plus" aria-label="+ Todo">+</button></div>
    ${shown.map((t) => { const d = C.dueInfo(t); return `<div class="wr ${d?.tone === 'overdue' ? 'overdue' : ''} ${ui.wdone === t.id ? 'done' : ''}"><button class="ring" data-w="done" data-id="${t.id}" aria-label="Abhaken: ${C.esc(t.description)}"></button><span class="t">${C.esc(t.description)}</span>${d && ['overdue', 'today'].includes(d.tone) ? `<span class="mk ${d.tone}">${d.tone === 'overdue' ? 'überfällig' : 'heute'}</span>` : '<span></span>'}</div>` }).join('')}
    <div class="wf">${ui.wdoneNote ? `<span>Erledigt · <button data-w="undo">Rückgängig</button></span>` : more > 0 ? `<button data-w="more">+${more} weitere</button>` : '<span></span>'}${unsent ? `<span class="u">${unsent} nicht gesendet</span>` : `<span>Stand ${store.stand}</span>`}</div>`
}
let wTimer = 0
$('#widget').addEventListener('click', (e) => {
  const b = e.target.closest('[data-w]')
  if (!b) return
  const k = b.dataset.w
  if (k === 'chip') { ui.wctx = (ui.wctx + 1) % WCTX.length; render() }
  if (k === 'plus') { openOverlay() }
  if (k === 'more') { ui.ctx = WCTX[ui.wctx]; show('next') }
  if (k === 'refresh') { b.textContent = 'lädt …'; setTimeout(render, 500) }
  if (k === 'done') {
    const id = Number(b.dataset.id)
    ui.wdone = id; ui.wdoneNote = true; render()
    setTimeout(() => { store.complete(id); ui.wdone = null; render() }, 450)
    clearTimeout(wTimer); wTimer = setTimeout(() => { ui.wdoneNote = false; render() }, 5500)
  }
  if (k === 'undo') { store.undo(); ui.wdoneNote = false; render() }
})

// ───────────────────────────── tile + overlay (plain Views) ─────────────────────────────
// Only the field, the notice, Rückgängig and Schließen; Enter saves. Nothing else, also on the keyguard.
function openOverlay() { $('#overlay').classList.remove('off'); $('#ofield').focus() }
$('#tile').addEventListener('click', openOverlay)
$('#oclose').addEventListener('click', () => $('#overlay').classList.add('off'))
$('#ocapture').addEventListener('submit', (e) => {
  e.preventDefault()
  const f = $('#ofield')
  const t = store.capture(f.value)
  if (!t) return
  f.value = ''
  const n = $('#onotice')
  n.classList.remove('show'); void n.offsetWidth
  n.innerHTML = `<span class="what">In Inbox ✓</span><button class="undo" type="button" id="oundo">Rückgängig</button><span class="timer"></span>`
  n.classList.add('show')
  $('#oundo').onclick = () => { store.undo(t.id); n.classList.remove('show') }
  setTimeout(() => n.classList.remove('show'), 6000)
})

// ───────────────────────────── share target ─────────────────────────────
$('#sharego').addEventListener('click', (e) => {
  const b = e.currentTarget
  if (b.classList.contains('ok')) return
  store.capture('Agenten-Evaluation: ein Leitfaden', 'https://example.org/agenten-evaluation-leitfaden')
  b.textContent = 'In Inbox ✓'
  b.classList.add('ok')
  setTimeout(() => { b.textContent = 'In Inbox'; b.classList.remove('ok') }, 2400)
})

// ───────────────────────────── still phones: the pinned states ─────────────────────────────
const STATUSBAR = $('.statusbar').outerHTML
const KEYBOARD = `<div class="akbd" aria-hidden="true"><div class="sug"><span>ablegen</span><span>abgeben</span><span>Ablage</span></div>${
  ['qwertzuiopü', 'asdfghjklöä', '⇧yxcvbnm⌫', '?123 , ␣ . ⏎'].map((r, i) => `<div class="kr r${i}">${(i === 3 ? r.split(' ') : [...r]).map((k) => `<i>${k === '␣' ? '' : k}</i>`).join('')}</div>`).join('')}<div class="nav"><b></b></div></div>`
// unsent local captures, as the outbox shows them (uuid "lokal <8>" until the server answers)
const local = (id, description, sync) => ({
  id, uuid: `local-${(id * 2654435761 >>> 0).toString(16).padStart(8, '0')}`, description,
  status: 'pending', project: null, tags: [], due: null, start: null, annotations: [], entry: '20261031T083900Z', sync, local: true,
})
function stillPhone({ label, tab, inboxN, banner = '', head, rows, notice = '', field = '', ime = false, menu = '', cls = '' }) {
  return `<figure class="still" aria-label="${C.esc(label)}"><div class="device"><div class="screen ${ime ? 'ime' : ''} ${cls}">
    ${STATUSBAR}<div class="abar-s">${tabsHTML(tab, inboxN)}</div>${banner}
    <div class="ascroll"><div class="ahead">${head}</div><div class="alist">${rows.map((r) => r.html ?? rowMarkup(r.t, r.kind)).join('')}</div></div>
    ${tab === 'inbox' ? `<div class="abottom">${notice ? `<div class="anotice show">${notice}</div>` : ''}<div class="afield"><span class="ftext ${field ? '' : 'ph'}">${field || 'Neues Todo'}${ime ? '<i class="caret"></i>' : ''}</span><span class="go" aria-hidden="true">+</span></div></div>` : ''}
    ${ime ? KEYBOARD : '<div class="gesture"><i></i></div>'}${menu}
  </div></div><figcaption>${label}</figcaption></figure>`
}
function renderStill() {
  const L = store.lists()
  const net = local(201, 'Rückruf Druckerei wegen Proof', 'net')
  const failed = local(202, 'Steuerbescheid ablegen', 'failed')
  const paused = local(203, 'Kita-Anmeldung ausdrucken', 'auth')
  const inbox = L.inbox.map((t) => ({ t, kind: 'inbox' }))
  const undoN = '<span class="what">In Inbox ✓</span><span class="undo">Rückgängig</span><span class="timer static"></span>'
  // 1: keyboard open. 412 x 915 dp, 300 dp keyboard: eyebrow only, notice, field; 6 rows of 56 dp stay visible
  const a = stillPhone({
    label: 'Inbox, Tastatur offen · 300 dp Tastatur · Überschrift wird zur Zeile · 6 Zeilen sichtbar',
    tab: 'inbox', inboxN: L.inbox.length + 1, ime: true,
    head: eyebrow('Inbox', L.inbox.length + 1, 'Stand 09:41'),
    rows: [{ t: net, kind: 'inbox' }, ...inbox],
    notice: undoN, field: 'Proof an die Druckerei sch',
  })
  // 2: key rejected: the banner, rows waiting for setup, a failed capture and its one-tap menu
  const b = stillPhone({
    label: 'Banner neu einrichten · Zeilenstatus · Menü einer nicht gesendeten Zeile',
    tab: 'inbox', inboxN: L.inbox.length + 3,
    banner: `<div class="abanner error"><div class="t">Key abgelehnt – neu einrichten</div><span class="go">→</span></div>`,
    head: `${eyebrow('Inbox', L.inbox.length + 3, 'Stand 09:41')}<h1 class="display">${C.heading('inbox')}</h1>`,
    rows: [{ t: net, kind: 'inbox' }, { t: paused, kind: 'inbox' }, { t: failed, kind: 'inbox' }, ...inbox.slice(0, 3)],
    menu: `<div class="amenu on"><button>Erneut senden</button><button>Bearbeiten und erneut senden</button><button>Löschen</button></div>`,
  })
  // 3: 150 % text: three tabs still one line each, chips wrap, the "Altes Konto" banner as one 48 dp line
  const dueIds = new Set(L.due.map((t) => t.id))
  const nx = L.nextIn.filter((t) => !dueIds.has(t.id))
  const c = stillPhone({
    label: 'Schrift 150 % · Tabs einzeilig · Chips und Banner Altes Konto umbrechen',
    tab: 'next', inboxN: L.inbox.length, cls: 'fs150',
    banner: `<div class="abanner line"><div class="t">Altes Konto: 2 nicht gesendet</div><span class="pill quiet">Verwerfen</span></div>`,
    head: `${eyebrow('Nächste', 'Stand 09:41')}<h1 class="display">${C.heading('next')}</h1><div class="ctxbar">${['Alle', ...CONTEXTS].map((x, i) => `<span class="ctx" aria-pressed="${i === 0}">${x}</span>`).join('')}</div>`
      + sec('Fällig', L.due.length),
    rows: [...L.due.map((t) => ({ t, kind: 'next' })), { html: sec('Nächste Aktionen', nx.length) }, { t: { ...nx[0], sync: 'failed' }, kind: 'next' }, { t: nx[1], kind: 'next' }],
  })
  $('#still').innerHTML = a + b + c
  // the menu opens at the failed row's right edge, as on the live phone
  const fr = $('#still .row.sync-failed'), menu = $('#still .amenu')
  if (fr && menu) menu.style.top = (fr.getBoundingClientRect().bottom - fr.closest('.screen').getBoundingClientRect().top - 4) + 'px'
}

// ───────────────────────────── boot + test hook ─────────────────────────────
function resolve(id) {
  const t = store.get(Number(id)) || store.get(id) || store.tasks.find((x) => x.description.toLowerCase().includes(String(id).toLowerCase()))
  return t?.id ?? null
}
window.proto = {
  show: (view) => show(view),
  filter: (context) => { show('next'); ui.ctx = context || null; render() },
  capture: (text) => store.capture(text),
  open: (id) => openTask(resolve(id)),
  complete: (id) => complete(resolve(id)),
  clarify: (id, to) => clarify(resolve(id), to),
  async signature() {
    const last = store.fileAllButOne()
    show('inbox')
    preloadInk()
    await C.sleep(260)
    return clarify(last.id, 'next:@computer')
  },
  store, ui, ink: inkStats, calls: store.calls,
}
$('#akbdslot').outerHTML = KEYBOARD.replace('class="akbd"', 'class="akbd" id="akbd"')
render()
renderStill()
$('#ofield').value = 'Rückruf Druckerei wegen Proof'
