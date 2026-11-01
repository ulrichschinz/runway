// runway · Greifbar — web prototype (desktop first, down to phone width).
import { createStore, berlinDay } from './store.js'
import { VIEWS, MARK_SVG, icon, esc, rowHTML, sectionHTML, dueInfo, wdm, dm, hm, longToday, contextsOf, dateOptions, berlinMorning, dayText } from './ui.js'
import { createStack } from './stack.js'

const store = createStore()
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const html = document.documentElement
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const darkMq = matchMedia('(prefers-color-scheme: dark)')
const phoneMq = matchMedia('(max-width: 760px)')
const isPhone = () => phoneMq.matches

const ui = {
  view: 'next', ctx: null, query: '', sel: -1, open: null, project: null, projTab: 'tasks', inboxMode: 'stack', showDone: false,
  klaeren: false, // phone width: the stack is opened from the Inbox list ("Klären · N"), as on Android
  searching: false, // phone width: the search field is open in the top bar
  askNext: null, // details panel: this task waits for a context before it moves to Nächste
  newProject: false, // Projekte: the inline "Neues Projekt" form is open
  panelNewProj: false, // details panel: the "Neues Projekt" field under the project select is open
}
let gl = null
let glReady = null

// ---------------------------------------------------------------- toast + live region
let toastTimer = 0
function toast(msg, undo = true, action = null) {
  const el = $('#toast')
  el.querySelector('.toast-msg').innerHTML = `<span>${esc(msg)}</span>`
  el.querySelectorAll('button').forEach((b) => b.remove())
  if (action) {
    const b = document.createElement('button'); b.textContent = action.label
    b.addEventListener('click', () => { hideToast(); action.fn() }); el.insertBefore(b, el.querySelector('.drain'))
  }
  if (undo) {
    const b = document.createElement('button'); b.textContent = 'Rückgängig'
    b.addEventListener('click', () => { hideToast(); undo_() }); el.insertBefore(b, el.querySelector('.drain'))
  }
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on')
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000)
}
function hideToast() { $('#toast').classList.remove('on') }
function announce(msg) { $('#live').textContent = msg }

// ---------------------------------------------------------------- the inbox stage (kept alive across renders)
const stageEl = document.createElement('div')
stageEl.className = 'stage'
stageEl.innerHTML = `
  <div class="stage-main">
    <div class="stage-q"><h2>Wohin <em>gehört</em> das?</h2><span class="stack-progress"></span><div class="buddy-slot stage-buddy" data-buddy aria-hidden="true">${MARK_SVG}</div></div>
    <p class="sr-only stack-sr" aria-live="polite"></p>
    <div class="stack-wrap"><div class="stack-slot"></div></div>
    <div class="trays" role="group" aria-label="Einsortieren"></div>
    <p class="stack-hint"></p>
    <div class="stage-empty">
      <p class="big">Kopf frei.</p>
      <p>Inbox ist leer.</p>
      <p class="mono stage-empty-n" style="font-size:12px"></p>
      <button class="btn btn-ink" data-go="next">Weiter zu Nächste ${icon('forward')}</button>
    </div>
  </div>
  <aside class="queue" aria-label="Im Stapel"><p class="eyebrow"><span class="slash">//</span> Im Stapel</p><ol class="sheet"></ol>
    <p class="queue-note">Neu Erfasstes landet oben. Mit <kbd>Z</kbd> kommt die letzte Karte zurück.</p></aside>`
stageEl.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) { ui.klaeren = false; setView(go.dataset.go) }
  const q = e.target.closest('[data-pin]'); if (q) stack.pin(Number(q.dataset.pin))
})
const stack = createStack({
  store, root: stageEl, motion: () => !reduced.matches, onOpen: (id) => openDetails(id), toast: (m, u) => toast(m, u), announce,
  compact: () => matchMedia('(max-width: 760px), (pointer: coarse)').matches,
  onChange: () => renderQueue(),
})

function renderQueue() {
  const items = store.lists().inbox
  const cur = stack.current()
  $('ol', stageEl).innerHTML = items.length
    ? items.map((t) => `<li class="${cur && cur.id === t.id ? 'cur' : ''}"><button data-pin="${t.id}" title="Nach oben holen"><span class="q-t">${esc(t.description)}</span><span class="q-d">${wdm(t.entry)} · ${hm(t.entry)}</span></button></li>`).join('')
    : '<li class="empty" style="padding:10px 12px;font-size:13px">Nichts mehr im Stapel.</li>'
  $('.stage-empty-n', stageEl).textContent = `${store.counts().doneToday} heute erledigt · ${store.counts().next} nächste Aktionen`
}

// ---------------------------------------------------------------- sidebar, topbar, bottom nav
function companionText(c) {
  if (c.inbox === 0) return { line: '<em>Kopf frei.</em>', sub: '<span class="slash">//</span> Inbox leer' }
  const oldest = store.lists().inbox.reduce((m, t) => (t.entry < m ? t.entry : m), '9')
  return { line: `${c.inbox} ${c.inbox === 1 ? 'Ding' : 'Dinge'} zu klären`, sub: `<span class="slash">//</span> älteste vom ${dm(oldest)}` }
}

function renderSide() {
  const c = store.counts()
  const n = { inbox: c.inbox, next: c.next, waiting: c.waiting, projects: c.projects, someday: c.someday }
  const ctxN = (ctx) => store.lists().nextAll.filter((t) => contextsOf(t).includes(ctx)).length
  const ct = companionText(c)
  $('#side').innerHTML = `
    <div class="brand">${MARK_SVG}<div><div class="brand-name">runway</div><div class="brand-by">by Agentic Reach</div></div></div>
    <button class="searchbtn" data-act="search">${icon('search')}Suchen<kbd>/</kbd></button>
    <nav class="nav">${VIEWS.map((v) => `<button class="nav-item${ui.view === v.id && !ui.query ? ' on' : ''}" data-view="${v.id}" ${ui.view === v.id ? 'aria-current="page"' : ''}>
      ${icon(v.icon)}<span>${v.label}</span><span class="nav-n${v.id === 'inbox' && n.inbox ? ' hot' : ''}" data-count="${v.id}">${v.id === 'projects' && c.stalled ? `<i class="nav-dot" title="${c.stalled} steht still"></i>` : ''}${n[v.id]}</span></button>`).join('')}</nav>
    <div class="side-sec"><p class="eyebrow"><span class="slash">//</span> Kontexte</p>
      ${store.state.contexts.map((ctx) => `<button class="ctx-item${ui.ctx === ctx ? ' on' : ''}" data-ctx="${ctx}">${ctx}<span class="nav-n">${ctxN(ctx)}</span></button>`).join('')}</div>
    <div class="side-foot">
      <button class="side-link${ui.view === 'all' ? ' on' : ''}" data-view="all">${icon('all')}Alle Aufgaben<kbd>G A</kbd></button>
      <button class="side-link${ui.view === 'settings' ? ' on' : ''}" data-view="settings">${icon('settings')}Einstellungen</button>
      <button class="side-link" data-act="keys">${icon('key')}Tastenkürzel<kbd>?</kbd></button>
      <div class="buddy" title="Klarheit: je mehr von heute geklärt ist, desto heller">
        <div class="buddy-slot" data-buddy>${MARK_SVG}</div>
        <div class="buddy-text"><div class="buddy-line">${ct.line}</div><div class="buddy-sub">${ct.sub}</div></div>
      </div>
    </div>`
}

function renderTop() {
  const c = store.counts()
  const top = $('#topbar')
  top.classList.toggle('searching', ui.searching)
  // phone width: the product lockup (mark + runway), search that expands in place, and the Mehr menu
  top.innerHTML = ui.searching
    ? `<label class="tsearch">${icon('search')}<span class="sr-only">Suchen</span><input class="field" id="tsearch" type="search" placeholder="Suchen" value="${esc(ui.query)}" enterkeyhint="search"></label>
       <button class="tool" data-act="search-close" aria-label="Suche schließen">${icon('close')}</button>`
    : `<div class="brand">${MARK_SVG}<span class="brand-name">runway</span></div><span class="grow"></span>
       <button class="tool" data-act="search" aria-label="Suchen">${icon('search')}</button>
       <button class="tool" data-act="more" aria-label="Mehr" aria-haspopup="menu">${icon('more')}</button>`
  $('#bottomnav').innerHTML = VIEWS.map((v) => `<button class="bn${ui.view === v.id ? ' on' : ''}" data-view="${v.id}"><span class="bn-ind">${icon(v.icon)}</span>${v.label}${v.id === 'inbox' && c.inbox ? `<span class="bn-badge">${c.inbox}</span>` : ''}</button>`).join('')
}

// ---------------------------------------------------------------- views
function head(eyebrow, title, lead, tools = '') {
  return `<header class="head"><div><p class="eyebrow"><span class="slash">//</span> ${eyebrow}</p><h1>${title}</h1></div><div class="head-tools">${tools}</div>${lead ? `<p class="lead">${lead}</p>` : ''}</header>`
}
const searchBox = () => `<label class="searchbox">${icon('search')}<span class="sr-only">Suchen</span><input class="field" id="search" type="search" placeholder="Suchen" value="${esc(ui.query)}"></label>`
const rows = (ts, view, extra = {}) => ts.map((t) => rowHTML(t, { view, ...extra }))
const STAND = 'Stand 09:12'

function viewNext() {
  const l = store.lists(ui.ctx), c = store.counts()
  const chips = [`<button class="chip mono-chip${!ui.ctx ? ' on' : ''}" data-ctx="">Alle <span class="n">${c.next}</span></button>`,
    ...store.state.contexts.map((ctx) => `<button class="chip mono-chip${ui.ctx === ctx ? ' on' : ''}" data-ctx="${ctx}">${ctx} <span class="n">${store.lists().nextAll.filter((t) => contextsOf(t).includes(ctx)).length}</span></button>`)].join('')
  const stats = `<div class="stats"><span><b>${c.doneToday}</b> heute erledigt</span><span><b>${c.due}</b> fällig</span><span>${STAND}</span></div>`
  // Fällig is never filtered; with a context on, rows from other contexts shrink to one quiet line
  const dueRows = l.due.map((t) => rowHTML(t, { view: 'next', other: !!ui.ctx && !store.inContext(t, ui.ctx) }))
  return head(`${longToday()}`, 'Nächste', 'Was du <em>jetzt</em> tun kannst.', stats + searchBox()) +
    `<div class="stand"><span>${STAND}</span><span>${c.doneToday} heute erledigt</span></div>` +
    `<div class="ctxbar" role="group" aria-label="Kontext">${chips}</div>` +
    sectionHTML(ui.ctx ? 'Fällig · alle Kontexte' : 'Fällig', l.due.length, dueRows, { empty: 'Nichts fällig' }) +
    sectionHTML(ui.ctx ? `Nächste Aktionen · ${ui.ctx}` : 'Nächste Aktionen', l.next.length, rows(l.next, 'next'), { empty: 'Keine nächsten Aktionen' })
}
function viewWaiting() {
  const l = store.lists()
  const due = l.waiting.filter((t) => store.followUp(t).due), rest = l.waiting.filter((t) => !store.followUp(t).due)
  return head('Warten auf', 'Warten auf', 'Was andere für dich <em>erledigen</em>.', searchBox()) +
    (due.length ? sectionHTML('Nachhaken', due.length, rows(due, 'waiting')) : '') +
    sectionHTML('Wartet', rest.length, rows(rest, 'waiting'), { empty: 'Du wartest auf nichts' })
}
function viewSomeday() {
  const l = store.lists()
  const paused = store.projects().filter((p) => p.status === 'on_hold')
  return head('Irgendwann', 'Irgendwann', 'Ideen, die <em>warten</em> dürfen.', searchBox()) +
    sectionHTML('Vielleicht', l.someday.length, rows(l.someday, 'someday'), { empty: 'Nichts für irgendwann' }) +
    (l.tickler.length ? sectionHTML('Zurückgestellt', l.tickler.length, l.tickler.map((t) => rowHTML({ ...t }, { view: 'someday' }).replace('<div class="row-meta">', `<div class="row-meta"><span class="m-tick">zurück am ${wdm(t.wait)}</span><span class="dot">·</span>`))) : '') +
    (paused.length ? `<section class="sec"><h3 class="eyebrow"><span class="slash">//</span> Pausierte Projekte <span class="sec-n">${paused.length}</span></h3>
      <div class="proj-grid">${paused.map(projCard).join('')}</div></section>` : '')
}
function inboxHead() {
  const c = store.counts()
  const seg = `<div class="seg inbox-seg" role="tablist"><button class="${ui.inboxMode === 'stack' ? 'on' : ''}" data-imode="stack">${icon('stack')}Stapel</button><button class="${ui.inboxMode === 'list' ? 'on' : ''}" data-imode="list">${icon('all')}Liste</button></div>`
  return head(`Inbox · ${c.inbox} zu klären`, 'Inbox', 'Alles, was reinkommt. Eins nach dem <em>anderen</em> klären.', seg)
}
function viewInboxList() {
  const l = store.lists()
  // phone width: list newest first with "Klären · N", exactly like the Android Inbox
  const stand = isPhone() ? `<div class="stand"><span>${STAND}</span>${l.inbox.length ? `<button class="chip klaeren-chip" data-act="klaeren">${icon('stack')}Klären · ${l.inbox.length}</button>` : ''}</div>` : ''
  return stand + sectionHTML('Inbox · neueste zuerst', l.inbox.length, rows(l.inbox, 'inbox'), { empty: 'Inbox ist leer' })
}
function viewAll() {
  const l = store.lists()
  const done = ui.showDone ? l.doneToday : []
  return head('Alle Aufgaben', 'Alle Aufgaben', 'Alles Offene, nach Liste.', `<div class="seg"><button class="${!ui.showDone ? 'on' : ''}" data-done="0">Offen</button><button class="${ui.showDone ? 'on' : ''}" data-done="1">Mit Erledigten</button></div>`) +
    sectionHTML('Inbox', l.inbox.length, rows(l.inbox, 'inbox')) +
    sectionHTML('Nächste', l.nextAll.length, rows(l.nextAll, 'next')) +
    sectionHTML('Warten auf', l.waiting.length, rows(l.waiting, 'waiting')) +
    sectionHTML('Irgendwann', l.someday.length, rows(l.someday, 'someday')) +
    (l.tickler.length ? sectionHTML('Zurückgestellt', l.tickler.length, rows(l.tickler, 'someday')) : '') +
    (l.unclarified.length ? sectionHTML('Ohne Liste', l.unclarified.length, rows(l.unclarified, 'next')) : '') +
    (ui.showDone ? sectionHTML('Heute erledigt', done.length, done.map((t) => rowHTML(t, { view: 'next' }).replace('class="row', 'class="row done'))) : '')
}
function viewSearch() {
  const hits = store.search(ui.query)
  const by = (w) => hits.filter((t) => store.where(t) === w)
  const groups = [['inbox', 'Inbox'], ['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann'], ['tickler', 'Zurückgestellt'], ['project', 'Ohne Liste']]
  return head(`Suche · ${hits.length} Treffer`, 'Suche', `„${esc(ui.query)}“ in Beschreibung, Projekt, Kontext und Notizen.`, searchBox()) +
    (hits.length ? groups.map(([w, lbl]) => by(w).length ? sectionHTML(lbl, by(w).length, rows(by(w), ['project', 'tickler'].includes(w) ? 'next' : w)) : '').join('') : '<p class="sheet empty">Nichts gefunden.</p>')
}

const ctxSelect = () => `<select class="field" name="c" aria-label="Kontext">${store.state.contexts.map((c) => `<option>${c}</option>`).join('')}</select>`
function projCard(p) {
  const nx = p.next[0]
  if (p.stalled) {
    return `<div class="proj sheet stalled" data-proj="${esc(p.name)}">
      <div class="proj-name">${esc(p.name)}</div><div class="proj-out">${esc(p.outcome)}</div>
      <div class="stall"><i></i>Steht still · keine nächste Aktion</div>
      <form class="stall-add" data-add="${esc(p.name)}"><input class="field" name="d" placeholder="Nächste Aktion für ${esc(p.name)}" aria-label="Nächste Aktion für ${esc(p.name)}">${ctxSelect()}</form>
    </div>`
  }
  return `<button class="proj sheet" data-proj="${esc(p.name)}">
    <span class="proj-name">${esc(p.name)}</span><span class="proj-out">${esc(p.outcome)}</span>
    <span class="proj-meta">${p.next.length} nächste · ${p.waiting.length} wartet${p.done.length ? ` · ${p.done.length} erledigt` : ''}</span>
    ${nx ? `<span class="proj-next">${icon('next')}<span>${esc(nx.description)}</span></span>` : p.waiting[0] ? `<span class="proj-next">${icon('waiting')}<span>${esc(p.waiting[0].description)}</span></span>` : ''}
  </button>`
}
function newProjectForm() {
  return `<form class="newproj sheet" data-newproj-form><p class="eyebrow"><span class="slash">//</span> Neues Projekt</p>
    <div class="np-row"><input class="field" name="n" placeholder="Name des Projekts" aria-label="Name des Projekts" maxlength="100" autocomplete="off">
    <input class="field" name="o" placeholder="Ergebnis: woran erkennst du, dass es fertig ist?" aria-label="Ergebnis" autocomplete="off"></div>
    <p class="np-err" role="alert"></p>
    <div class="np-actions"><button class="btn btn-ghost btn-sm" type="button" data-act="newproj-cancel">Abbrechen</button><button class="btn btn-coral btn-sm" type="submit">Anlegen</button></div></form>`
}
function viewProjects() {
  if (ui.project) return viewProject()
  const ps = store.projects(), c = store.counts()
  const stalled = ps.filter((p) => p.stalled), active = ps.filter((p) => p.status === 'active' && !p.stalled)
  const steps = [
    ['01', 'Inbox leeren', c.inbox ? `${c.inbox} offen` : 'leer', !c.inbox, 'inbox'],
    ['02', 'Warten auf prüfen', `${c.waiting} Einträge`, false, 'waiting'],
    ['03', 'Jedes Projekt bewegt sich', stalled.length ? `${stalled.length} steht still` : 'alle in Bewegung', !stalled.length, 'projects'],
    ['04', 'Irgendwann durchsehen', `${c.someday} Ideen`, false, 'someday'],
  ]
  return head(`Projekte · ${c.projects} aktiv${c.stalled ? ` · ${c.stalled} steht still` : ''}`, 'Projekte', 'Jedes Projekt braucht eine <em>nächste</em> Aktion.',
    `<button class="btn btn-ghost btn-sm" data-act="newproj">${icon('plus')}Neues Projekt</button>` + searchBox()) +
    (ui.newProject ? newProjectForm() : '') +
    `<section class="review sheet" aria-label="Wochenrückblick"><div><p class="eyebrow"><span class="slash">//</span> Wochenrückblick · zuletzt ${wdm(store.state.lastReview)}</p></div>
      <button class="btn btn-ink btn-sm" data-act="review">${icon('review')}Rückblick abschließen</button>
      <div class="review-steps">${steps.map(([n, lbl, st, ok, go]) => `<button class="rstep${ok ? ' ok' : ''}" data-view="${go}"><span class="num">${n} <span class="slash">//</span></span><span class="lbl">${lbl}</span><span class="st">${st}</span></button>`).join('')}</div></section>` +
    (stalled.length ? `<section class="sec"><h3 class="eyebrow"><span class="slash">//</span> Steht still <span class="sec-n">${stalled.length}</span></h3><div class="proj-grid">${stalled.map(projCard).join('')}</div></section>` : '') +
    `<section class="sec"><h3 class="eyebrow"><span class="slash">//</span> Aktiv <span class="sec-n">${active.length}</span></h3><div class="proj-grid">${active.map(projCard).join('')}</div></section>`
}
function viewProject() {
  const p = store.projects().find((x) => x.name === ui.project)
  if (!p) { ui.project = null; return viewProjects() }
  const tabs = `<div class="seg"><button class="${ui.projTab === 'tasks' ? 'on' : ''}" data-ptab="tasks">Aufgaben</button><button class="${ui.projTab === 'plan' ? 'on' : ''}" data-ptab="plan">Plan</button></div>`
  const status = `<div class="seg" aria-label="Status">${[['active', 'Aktiv'], ['on_hold', 'Pausiert'], ['done', 'Erledigt']].map(([k, l]) => `<button class="${p.status === k ? 'on' : ''}" data-pstatus="${k}">${l}</button>`).join('')}</div>`
  let body = ''
  if (ui.projTab === 'plan') {
    const steps = [['01', 'Warum', 'Zweck, Werte und Prinzipien.'], ['02', 'Vision', 'Wie sieht es aus, wenn es fertig ist?'], ['03', 'Ideen', 'Alles sammeln, nichts bewerten.'], ['04', 'Ordnen', 'Reihenfolge und Meilensteine.'], ['05', 'Aktionen', 'Jede geordnete Idee wird mit einem Klick zur nächsten Aktion, mit Kontext.']]
    body = `<div class="plan">${steps.map(([n, t, d], i) => `<div class="plan-step sheet"><span class="num">${n} <span class="slash">//</span></span><h4>${t}</h4><p>${d}</p>${i === 1 ? `<p style="color:var(--rw-text);font-size:14px">${esc(p.outcome)}</p>` : ''}</div>`).join('')}</div>`
  } else {
    body = (p.stalled ? `<div class="banner"><span class="nav-dot"></span><div style="flex:none"><b>Steht still.</b> Was ist die nächste Aktion?</div>
      <form class="stall-add" data-add="${esc(p.name)}" style="flex:1;margin:0"><input class="field" name="d" placeholder="Nächste Aktion" aria-label="Nächste Aktion für ${esc(p.name)}">${ctxSelect()}</form></div>` : '') +
      sectionHTML('Nächste Aktionen', p.next.length, rows(p.next, 'project'), { empty: 'Keine nächste Aktion' }) +
      (p.waiting.length ? sectionHTML('Warten auf', p.waiting.length, rows(p.waiting, 'waiting')) : '') +
      (p.rest.length ? sectionHTML('Ohne Liste', p.rest.length, rows(p.rest, 'project')) : '') +
      (p.someday.length ? sectionHTML('Irgendwann', p.someday.length, rows(p.someday, 'someday')) : '') +
      (p.done.length ? sectionHTML('Erledigt', p.done.length, p.done.map((t) => rowHTML(t, { view: 'project' }).replace('class="row', 'class="row done'))) : '')
  }
  return `<div class="proj-head"><button class="backlink" data-act="projects">${icon('back')}Projekte</button></div>` +
    head(`Projekt${p.stalled ? ' · steht still' : ''}`, esc(p.name), esc(p.outcome), status) +
    `<div class="proj-tabs">${tabs}</div>` + body
}
function viewSettings() {
  return head('Einstellungen', 'Einstellungen', 'Konto, Verbindungen und Darstellung.') + `<div class="settings">
    <div class="set-card sheet"><h3>Konto</h3><div class="set-row"><input class="field" style="max-width:260px" value="Uli" aria-label="Name"><input class="field" style="max-width:300px" value="uli@example.com" aria-label="E-Mail"><button class="btn btn-ink btn-sm">Speichern</button></div>
      <div class="set-row"><button class="btn btn-ghost btn-sm">Passwort ändern</button><button class="btn btn-ghost btn-sm">Abmelden</button></div></div>
    <div class="set-card sheet"><h3>Kontexte</h3><p>Gelten im Web, in der Android-App und im Widget.</p><div class="d-chips">${store.state.contexts.map((c) => `<span class="chip mono-chip">${c}</span>`).join('')}<button class="chip ghost">${icon('plus')}Kontext</button></div></div>
    <div class="set-card sheet"><h3>API-Key</h3><p>Für die Android-App („Key einfügen“) und für Claude.</p><div class="set-row"><span class="code" style="flex:1">rw_••••••••••••••••••••3f9a</span><button class="btn btn-ghost btn-sm">Anzeigen</button><button class="btn btn-ghost btn-sm">Kopieren</button><button class="btn btn-ghost btn-sm">Neu erzeugen …</button></div></div>
    <div class="set-card sheet"><h3>Claude verbinden</h3><div class="seg"><button class="on">Claude Code</button><button>Claude Desktop</button><button>curl</button></div><div class="code">claude mcp add runway --transport http https://runway.agentic-reach.com/api/mcp</div></div>
    <div class="set-card sheet"><h3>Darstellung</h3><div class="set-row"><div class="seg"><button class="on">System</button><button>Hell</button><button>Dunkel</button></div><div class="seg"><button class="on">Bewegung: voll</button><button>reduziert</button><button>ohne 3D</button></div></div></div>
    <div class="set-card sheet"><h3>Verwaltung</h3><div class="set-row"><span>Registrierung erlauben</span><div class="seg"><button>an</button><button class="on">aus</button></div></div></div>
  </div>`
}

let mountedStage = false
const stageWanted = () => !ui.query && ui.view === 'inbox' && (isPhone() ? ui.klaeren : ui.inboxMode === 'stack')
function renderView() {
  const v = $('#view')
  html.classList.toggle('klaeren', stageWanted() && isPhone())
  if (stageWanted()) {
    v.classList.add('wide')
    if (!mountedStage) {
      v.innerHTML = '<div id="ihead"></div>'
      v.appendChild(stageEl)
      mountedStage = true
      stack.setVisible(true)
    }
    $('#ihead').innerHTML = isPhone()
      ? `<div class="k-head"><button class="backlink" data-act="klaeren-off">${icon('back')}Inbox</button></div>`
      : inboxHead()
    renderQueue()
    stack.render()
    requestAnimationFrame(() => stack.layout())
    return
  }
  if (mountedStage) { mountedStage = false; stageEl.remove(); stack.setVisible(false) }
  v.classList.remove('wide')
  let out = ''
  if (ui.query) out = viewSearch()
  else if (ui.view === 'inbox') out = inboxHead() + viewInboxList()
  else if (ui.view === 'next') out = viewNext()
  else if (ui.view === 'waiting') out = viewWaiting()
  else if (ui.view === 'projects') out = viewProjects()
  else if (ui.view === 'someday') out = viewSomeday()
  else if (ui.view === 'all') out = viewAll()
  else if (ui.view === 'settings') out = viewSettings()
  const active = document.activeElement
  const keep = active && (active.id === 'search' || active.name === 'n' || active.name === 'o') ? { id: active.id, name: active.name, caret: active.selectionStart, value: active.value } : null
  v.innerHTML = out
  if (keep && keep.id === 'search') { const s = $('#search'); if (s) { s.focus(); s.setSelectionRange(keep.caret, keep.caret) } }
  applySel()
}

function renderAll() {
  const tsearchFocused = document.activeElement?.id === 'tsearch'
  const caret = tsearchFocused ? document.activeElement.selectionStart : 0
  renderSide(); renderTop(); renderView()
  if (tsearchFocused) { const s = $('#tsearch'); if (s) { s.focus(); s.setSelectionRange(caret, caret) } }
  if (ui.open) renderPanel()
  if (gl) { const c = store.counts(); gl.companion.set(c.inbox, c.cleared); placeCompanion() }
}
let pending = 0
function schedule() { if (!pending) pending = requestAnimationFrame(() => { pending = 0; renderAll() }) }
let quiet = 0
store.on(() => { if (!quiet) schedule() })

function setView(view) {
  if (!view) return
  if (view === 'projects') ui.project = null
  if (view !== 'inbox') ui.klaeren = false
  ui.view = view; ui.query = ''; ui.sel = -1; ui.searching = false; ui.newProject = false
  closeMenus()
  $('#scroll').scrollTop = 0
  renderAll()
}

// ---------------------------------------------------------------- selection (keyboard)
function rowEls() { return $$('#view .row') }
function applySel() {
  const r = rowEls()
  r.forEach((el, i) => el.classList.toggle('sel', i === ui.sel))
  if (r[ui.sel]) r[ui.sel].scrollIntoView({ block: 'nearest' })
}
function selId() { const r = rowEls()[ui.sel]; return r ? Number(r.dataset.id) : null }

// ---------------------------------------------------------------- complete with the clay pill
async function complete(id, rowEl) {
  const t = store.get(id)
  if (!t || t.status !== 'pending') return
  rowEl = rowEl || $(`#view .row[data-id="${t.id}"]`)
  const before = t.project ? store.projects().find((p) => p.name === t.project) : null
  quiet++
  try {
    if (rowEl && !rowEl.classList.contains('done')) {
      $$(`#view .row[data-id="${t.id}"]`).forEach((r) => r.classList.add('busy'))
      if (gl && !reduced.matches) {
        rowEl.classList.add('hide3d')
        // the DOM pill switches to its done state, without a transition, the moment before the
        // 3D pill fades, so the handover shows one edge
        await gl.squish(rowEl.querySelector('.pill').getBoundingClientRect(), () => {
          rowEl.classList.add('done', 'instant'); rowEl.classList.remove('hide3d')
        })
        await sleep(150)
      } else {
        rowEl.classList.add('done')
        await sleep(reduced.matches ? 250 : 380)
      }
      $$(`#view .row[data-id="${t.id}"]`).forEach((r) => r.classList.add('leave'))
      await sleep(160)
    }
  } finally { quiet-- }
  store.complete(t.id)
  const after = before ? store.projects().find((p) => p.name === before.name) : null
  if (after && after.stalled && !before.stalled) {
    toast(`Erledigt · ${after.name} steht still`, true, { label: 'Nächste Aktion', fn: () => { ui.view = 'projects'; ui.project = after.name; renderAll() } })
    announce(`Erledigt. Projekt ${after.name} hat keine nächste Aktion mehr.`)
  } else {
    toast('Erledigt', true)
    announce(`Erledigt: ${t.description}`)
  }
}

function undo_() {
  if (mountedStage && stack.undo()) return
  const u = store.undoLast()
  if (u) { toast('Rückgängig gemacht', false); announce('Rückgängig gemacht') }
}

// ---------------------------------------------------------------- capture
const CAPTURED = 'In Inbox ✓' // one string on every surface (pinned by the Android contract)
function capture(text) {
  const t = store.capture(text)
  if (!t) return null
  flyToInbox(text)
  toast(CAPTURED, true)
  announce(`In Inbox: ${t.description}`)
  return t
}
function flyToInbox(text) {
  if (reduced.matches) return
  const from = $('#dock-input').getBoundingClientRect()
  const target = mountedStage ? $('.stack-slot', stageEl) : ($$('[data-count="inbox"]').find((e) => e.offsetParent) || $$('.bn')[0])
  if (!target) return
  const to = target.getBoundingClientRect()
  const f = document.createElement('div'); f.className = 'flyer'; f.textContent = text
  document.body.appendChild(f)
  const x0 = from.left + 12, y0 = from.top + 12
  const x1 = to.left + to.width / 2 - 60, y1 = to.top + to.height / 2 - 15
  f.style.left = `${x0}px`; f.style.top = `${y0}px`
  f.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${(x1 - x0) * 0.5}px, ${(y1 - y0) * 0.5 - 70}px) scale(.9)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.35)`, opacity: 0 },
  ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => {
    f.remove()
    $$('[data-count="inbox"], .bn-badge').forEach((e) => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump') })
  }
}
const dock = $('#dock'), dockInput = $('#dock-input')
dockInput.addEventListener('input', () => dock.classList.toggle('has-text', !!dockInput.value.trim()))
$('#dock-form').addEventListener('submit', (e) => {
  e.preventDefault()
  if (capture(dockInput.value)) { dockInput.value = ''; dock.classList.remove('has-text') }
})
$('.dock-plus').innerHTML = icon('plus')

// ---------------------------------------------------------------- moving between lists: Nächste always gets a context
const LISTS = [['inbox', 'Inbox'], ['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann']]
const listName = (k) => LISTS.find(([x]) => x === k)?.[1] || 'Projekt'
/** Moves a task. Returns 'ask' when Nächste still needs a context. */
function moveTo(id, to, opts = {}) {
  const t = store.get(id)
  if (!t) return null
  if (to === 'next') {
    const ctx = opts.ctx || contextsOf(t)[0]
    if (!ctx) return 'ask'
    store.clarify(id, `next:${ctx}`)
    toast(`Verschoben: Nächste · ${ctx}`, true)
    return 'done'
  }
  store.clarify(id, to, opts.scheduled !== undefined ? { scheduled: opts.scheduled } : {})
  toast(`Verschoben: ${listName(to)}${opts.scheduled ? ` · nachhaken ${wdm(opts.scheduled)}` : ''}`, true)
  return 'done'
}

// ---------------------------------------------------------------- details panel
function openDetails(id, focusTitle = false) {
  const t = store.get(id)
  if (!t) return
  if (ui.open !== t.id) { ui.askNext = null; ui.panelNewProj = false }
  ui.open = t.id
  $('#panel').classList.add('open')
  renderPanel()
  if (focusTitle) setTimeout(() => $('#panel .d-title')?.focus(), 60)
}
function closeDetails() { ui.open = null; ui.askNext = null; ui.panelNewProj = false; $('#panel').classList.remove('open') }
function dateField(k, label, tw, urgent) {
  const d = tw ? berlinDay(tw) : ''
  return `<label class="d-field"><span class="k">${label}</span><input class="v mono d-date${tw ? '' : ' none'}${urgent ? ' urgent' : ''}" type="date" data-date="${k}" value="${d}"></label>`
}
function renderPanel() {
  const t = store.get(ui.open)
  if (!t || t.status !== 'pending') { closeDetails(); return }
  const w = store.where(t)
  const due = dueInfo(t)
  const ctxs = contextsOf(t)
  const prio = [['H', 'hoch'], ['M', 'mittel'], ['L', 'niedrig']]
  const asking = ui.askNext === t.id
  const follow = w === 'waiting' && !t.scheduled
    ? `<div class="d-quick"><span class="k">Nachhaken</span>${dateOptions('follow').slice(0, 3).map((o) => `<button class="chip mono-chip" data-follow="${o.day}">${o.label}</button>`).join('')}</div>` : ''
  $('#panel-in').innerHTML = `
    <div class="panel-top"><p class="eyebrow"><span class="slash">//</span> ${listName(w === 'tickler' ? 'someday' : w)} · ID ${t.uuid.slice(-8)}</p><button class="xbtn" data-act="close" aria-label="Schließen (Esc)">${icon('close')}</button></div>
    <textarea class="d-title" rows="2" aria-label="Beschreibung">${esc(t.description)}</textarea>
    ${t.start ? `<div class="d-running"><i class="pulse"></i>läuft seit ${hm(t.start)}</div>` : ''}
    <div class="d-block"><p class="eyebrow"><span class="slash">//</span> Liste <kbd>M</kbd></p>
      <div class="seg" style="justify-self:start">${LISTS.map(([k, l]) => `<button class="${(asking ? k === 'next' : w === k) ? 'on' : ''}${asking && k === 'next' ? ' asking' : ''}" data-move="${k}">${l}</button>`).join('')}</div></div>
    <div class="d-block${asking ? ' ask' : ''}"><p class="eyebrow"><span class="slash">//</span> ${asking ? 'Kontext · <span class="ask-q">wo erledigst du das?</span>' : 'Kontext'}</p><div class="d-chips">${store.state.contexts.map((c) => `<button class="chip mono-chip${ctxs.includes(c) ? ' on' : ''}" data-tctx="${c}">${c}</button>`).join('')}</div>
      ${asking ? '<p class="ask-note">Nächste braucht einen Kontext. Wähle einen, dann wird verschoben.</p>' : ''}</div>
    <div class="d-block"><p class="eyebrow"><span class="slash">//</span> Projekt</p><select class="field" data-proj-sel aria-label="Projekt"><option value="">Kein Projekt</option>${store.state.projects.map((p) => `<option ${t.project === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="__new">Neues Projekt …</option></select>
      ${ui.panelNewProj ? '<form class="np-inline" data-panel-newproj><input class="field" name="n" placeholder="Name des Projekts" aria-label="Name des Projekts" maxlength="100" autocomplete="off"><button class="btn btn-ghost btn-sm" type="submit">Anlegen</button><p class="np-err" role="alert"></p></form>' : ''}</div>
    <div class="d-grid">
      ${dateField('due', 'Fällig', t.due, due && due.kind === 'overdue')}
      ${dateField('scheduled', 'Nachhaken', t.scheduled)}
      ${dateField('wait', 'Zurückstellen bis', t.wait)}
      ${dateField('until', 'Läuft ab', t.until)}
      <div class="d-field"><span class="k">Wiederholung</span><span class="v${t.recur ? '' : ' none'}">${t.recur || 'keine'}</span></div>
      <div class="d-field"><span class="k">Priorität</span><span class="d-chips" style="gap:4px">${prio.map(([k, l]) => `<button class="chip mono-chip${t.priority === k ? ' on' : ''}" style="height:26px;padding:0 9px" data-prio="${k}">${l}</button>`).join('')}</span></div>
    </div>
    ${follow}
    <div class="d-block"><p class="eyebrow"><span class="slash">//</span> Hängt ab von</p><p style="margin:0;color:var(--rw-soft);font-size:14px">nichts</p></div>
    <div class="d-block"><p class="eyebrow"><span class="slash">//</span> Notizen</p>
      ${t.annotations.length ? `<ul class="notes">${t.annotations.map((a) => `<li><span class="when">${wdm(a.entry)} · ${hm(a.entry)}</span>${esc(a.description)}</li>`).join('')}</ul>` : ''}
      <form data-note><input class="field" name="n" placeholder="Notiz hinzufügen" aria-label="Notiz hinzufügen"></form></div>
    <p class="d-meta">erfasst ${wdm(t.entry)} ${hm(t.entry)} · Dringlichkeit ${String(t.urgency.toFixed(1)).replace('.', ',')}</p>
    <div class="d-actions">
      <button class="btn btn-ghost btn-sm" data-dact="start">${icon(t.start ? 'pause' : 'play')}${t.start ? 'Pausieren' : 'Starten'}</button>
      <button class="btn btn-ghost btn-sm" data-dact="delete">${icon('trash')}Löschen</button><span class="grow"></span>
      <button class="btn btn-coral" data-dact="done">${icon('check')}Abhaken</button>
    </div>`
  const ta = $('#panel .d-title')
  ta.addEventListener('change', () => { const v = ta.value.replace(/\s+/g, ' ').trim(); if (v) store.update(t.id, { description: v }) })
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.blur() } })
  if (ui.panelNewProj) setTimeout(() => $('#panel [data-panel-newproj] input')?.focus(), 0)
}
$('#panel').addEventListener('click', (e) => {
  const id = ui.open
  const b = e.target.closest('button')
  if (!b || !id) return
  if (b.dataset.act === 'close') closeDetails()
  if (b.dataset.move) {
    const res = moveTo(id, b.dataset.move)
    if (res === 'ask') { ui.askNext = id; renderPanel(); $('#panel .d-block.ask .chip')?.focus() } else ui.askNext = null
  }
  if (b.dataset.tctx) {
    if (ui.askNext === id) { ui.askNext = null; moveTo(id, 'next', { ctx: b.dataset.tctx }) } else store.toggleContext(id, b.dataset.tctx)
  }
  if (b.dataset.follow) { store.update(id, { scheduled: berlinMorning(b.dataset.follow) }); toast(`Nachhaken ${dayText(b.dataset.follow)}`, false) }
  if (b.dataset.prio) { const t = store.get(id); store.update(id, { priority: t.priority === b.dataset.prio ? null : b.dataset.prio }) }
  if (b.dataset.dact === 'start') store.toggleStart(id)
  if (b.dataset.dact === 'delete') { store.remove(id); closeDetails(); toast('Gelöscht', true) }
  if (b.dataset.dact === 'done') { closeDetails(); complete(id) }
})
$('#panel').addEventListener('change', (e) => {
  const id = ui.open
  if (e.target.matches('[data-proj-sel]')) {
    if (e.target.value === '__new') { ui.panelNewProj = true; renderPanel(); return }
    ui.panelNewProj = false
    store.update(id, { project: e.target.value || null })
  }
  if (e.target.dataset.date) {
    const v = e.target.value
    store.update(id, { [e.target.dataset.date]: v ? berlinMorning(v) : null })
  }
})
$('#panel').addEventListener('submit', (e) => {
  e.preventDefault()
  if (e.target.matches('[data-note]')) { store.addNote(ui.open, e.target.n.value); e.target.n.value = '' }
  if (e.target.matches('[data-panel-newproj]')) {
    const res = store.createProject(e.target.n.value)
    if (res.error) { e.target.querySelector('.np-err').textContent = res.error; return }
    ui.panelNewProj = false
    store.update(ui.open, { project: res.project.name })
    toast(`Projekt angelegt: ${res.project.name}`, false)
  }
})
$('#scrim').addEventListener('click', () => closeDetails())

// ---------------------------------------------------------------- clicks in views and nav
let moreMenu = null
function closeMenus() { closeMove(); moreMenu?.remove(); moreMenu = null }
function openMore(btn) {
  closeMenus()
  moreMenu = document.createElement('div'); moreMenu.className = 'menu more-menu'; moreMenu.setAttribute('role', 'menu')
  moreMenu.innerHTML = `<button role="menuitem" data-view="all">${icon('all')}Alle Aufgaben</button><button role="menuitem" data-view="settings">${icon('settings')}Einstellungen</button><button role="menuitem" data-act="signout">${icon('back')}Abmelden</button>`
  const r = btn.getBoundingClientRect()
  moreMenu.style.position = 'fixed'; moreMenu.style.right = `${Math.max(8, innerWidth - r.right)}px`; moreMenu.style.top = `${r.bottom + 4}px`
  document.body.appendChild(moreMenu)
  moreMenu.querySelector('button').focus()
}
document.addEventListener('click', (e) => {
  const t = e.target
  if (moreMenu && !t.closest('.more-menu') && !t.closest('[data-act="more"]')) { moreMenu.remove(); moreMenu = null }
  if (moveMenu && !t.closest('.move-menu')) closeMove()
  const nav = t.closest('[data-view]'); if (nav) { setView(nav.dataset.view); return }
  const c = t.closest('[data-ctx]')
  if (c) { const v = c.dataset.ctx || null; ui.ctx = ui.ctx === v ? null : v; if (ui.view !== 'next' || ui.query) { ui.view = 'next'; ui.query = '' } ui.sel = -1; renderAll(); return }
  const act = t.closest('[data-act]')
  if (act && !t.closest('#panel')) {
    const a = act.dataset.act
    if (a === 'search') {
      if (isPhone()) { ui.searching = true; renderAll(); setTimeout(() => $('#tsearch')?.focus(), 0); return }
      if (ui.view === 'inbox' && ui.inboxMode === 'stack') { ui.view = 'next'; renderAll() }
      setTimeout(() => $('#search')?.focus(), 0)
    }
    if (a === 'search-close') { ui.searching = false; ui.query = ''; renderAll(); return }
    if (a === 'keys') openKeys()
    if (a === 'projects') { ui.project = null; renderAll() }
    if (a === 'review') { store.recordReview(); toast('Rückblick abgeschlossen', false) }
    if (a === 'more') { if (moreMenu) { moreMenu.remove(); moreMenu = null } else openMore(act) }
    if (a === 'signout') { closeMenus(); toast('Abmelden ist im Prototyp ohne Funktion', false) }
    if (a === 'klaeren') { ui.klaeren = true; renderAll(); return }
    if (a === 'klaeren-off') { ui.klaeren = false; renderAll(); return }
    if (a === 'newproj') { ui.newProject = true; renderAll(); setTimeout(() => $('[data-newproj-form] input')?.focus(), 0); return }
    if (a === 'newproj-cancel') { ui.newProject = false; renderAll(); return }
  }
  const row = t.closest('#view .row')
  if (row) {
    const id = Number(row.dataset.id)
    const r = t.closest('[data-act]')?.dataset.act
    ui.sel = rowEls().indexOf(row)
    if (r === 'check') { complete(id, row); return }
    if (r === 'start') { store.toggleStart(id); return }
    if (r === 'open' || !r) { applySel(); openDetails(id) }
    return
  }
  const pr = t.closest('button.proj[data-proj]'); if (pr) { ui.project = pr.dataset.proj; ui.projTab = 'tasks'; renderAll(); $('#scroll').scrollTop = 0; return }
  const pt = t.closest('[data-ptab]'); if (pt) { ui.projTab = pt.dataset.ptab; renderAll(); return }
  const ps = t.closest('[data-pstatus]'); if (ps) { store.setProjectStatus(ui.project, ps.dataset.pstatus); return }
  const im = t.closest('[data-imode]'); if (im) { ui.inboxMode = im.dataset.imode; renderAll(); return }
  const dn = t.closest('[data-done]'); if (dn) { ui.showDone = dn.dataset.done === '1'; renderAll() }
})
document.addEventListener('submit', (e) => {
  const np = e.target.closest('[data-newproj-form]')
  if (np) {
    e.preventDefault()
    const res = store.createProject(np.n.value, np.o.value.trim())
    if (res.error) { np.querySelector('.np-err').textContent = res.error; return }
    ui.newProject = false; ui.project = res.project.name; ui.projTab = 'tasks'
    renderAll()
    toast(`Projekt angelegt: ${res.project.name}`, false, { label: 'Plan', fn: () => { ui.projTab = 'plan'; renderAll() } })
    setTimeout(() => $('.banner .stall-add input')?.focus(), 0)
    return
  }
  const f = e.target.closest('[data-add]')
  if (!f) return
  e.preventDefault()
  const d = f.d.value.trim(); if (!d) return
  store.addNextAction(f.dataset.add, d, f.c.value)
  toast(`${f.dataset.add} bewegt sich wieder`, false)
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'search' || e.target.id === 'tsearch') { ui.query = e.target.value; ui.sel = -1; renderSide(); renderView() }
})

// ---------------------------------------------------------------- keyboard
function openKeys() {
  const K = [['Neues Todo', 'N'], ['Suchen', '/'], ['Inbox · Nächste · Warten', 'G I · G N · G W'], ['Projekte · Irgendwann', 'G P · G S'], ['Auf und ab', 'J K'], ['Abhaken', 'X'],
    ['Details', '↵'], ['Starten oder pausieren', 'S'], ['Bearbeiten', 'E'], ['Verschieben', 'M'], ['Löschen', '⌫'], ['Kontext wechseln', 'C'], ['Rückgängig', 'Z'], ['Schließen', 'Esc'],
    ['Klären: einsortieren', '1–5'], ['Klären: Kontext oder Datum', '1–9 · 0'], ['Klären: Projekt', 'P'], ['Klären: zurückstellen', 'T'], ['Klären: überspringen', '→']]
  $('#keys').innerHTML = `<div class="modal"><p class="eyebrow"><span class="slash">//</span> Tastatur</p><h3>Alles ohne Maus</h3><div class="keys">${K.map(([l, k]) => `<div><span>${l}</span><span>${k.split(' ').map((x) => x === '·' ? '<span style="color:var(--rw-soft)">·</span>' : `<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div></div>`
  $('#keys').classList.add('open')
}
$('#keys').addEventListener('click', (e) => { if (e.target.id === 'keys') $('#keys').classList.remove('open') })

// M: move to another list. Nächste asks for the context, Warten auf for the follow-up day.
let gPending = 0
let moveMenu = null
function openMoveMenu(id) {
  closeMenus()
  const row = $(`#view .row[data-id="${id}"]`); if (!row) return
  moveMenu = document.createElement('div'); moveMenu.className = 'menu move-menu'; moveMenu.setAttribute('role', 'menu')
  const r = row.getBoundingClientRect()
  moveMenu.style.position = 'fixed'; moveMenu.style.left = `${Math.min(r.left + 60, innerWidth - 260)}px`; moveMenu.style.top = `${Math.min(r.bottom + 4, innerHeight - 330)}px`
  document.body.appendChild(moveMenu)
  moveMenu.dataset.id = id
  moveStep('lists')
  moveMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mv]'); if (!b) return
    e.stopPropagation()
    pickMove(b.dataset.mv)
  })
}
function moveStep(step) {
  moveMenu.dataset.step = step
  const opts = moveOptions()
  const q = step === 'lists' ? 'Verschieben nach' : step === 'ctx' ? 'Nächste · wo erledigst du das?' : 'Warten auf · wann nachhaken?'
  moveMenu.innerHTML = `<p class="eyebrow"><span class="slash">//</span> ${q}</p>` + opts.map((o) => `<button role="menuitem" data-mv="${esc(o.v)}"><kbd>${o.k}</kbd>${esc(o.l)}${o.h ? `<span class="m-h">${esc(o.h)}</span>` : ''}</button>`).join('')
  moveMenu.querySelector('button')?.focus({ preventScroll: true })
}
function moveOptions() {
  const step = moveMenu.dataset.step
  if (step === 'lists') return LISTS.map(([k, l], i) => ({ v: k, k: i + 1, l }))
  const back = { v: 'back', k: 0, l: 'Zurück' }
  if (step === 'ctx') return [...store.state.contexts.map((c, i) => ({ v: `ctx:${c}`, k: i < 9 ? i + 1 : '', l: c })), back]
  return [...dateOptions('follow').map((o, i) => ({ v: `date:${o.day}`, k: i + 1, l: o.label, h: o.day ? o.hint : '' })), back]
}
function pickMove(v) {
  const id = Number(moveMenu.dataset.id)
  const step = moveMenu.dataset.step
  if (v === 'back') return moveStep('lists')
  if (step === 'lists') {
    if (v === 'next' && moveTo(id, 'next') === 'ask') return moveStep('ctx')
    if (v === 'waiting') return moveStep('follow')
    if (v !== 'next') moveTo(id, v)
    return closeMove()
  }
  if (step === 'ctx') { moveTo(id, 'next', { ctx: v.slice(4) }); return closeMove() }
  const day = v.slice(5)
  moveTo(id, 'waiting', { scheduled: day ? berlinMorning(day) : null })
  closeMove()
}
function closeMove() { moveMenu?.remove(); moveMenu = null }
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]')
  if (e.key === 'Escape') {
    if ($('#keys').classList.contains('open')) { $('#keys').classList.remove('open'); return }
    if (moreMenu) { closeMenus(); return }
    if (moveMenu) { if (moveMenu.dataset.step !== 'lists') moveStep('lists'); else closeMove(); return }
    if (mountedStage && stack.key(e)) { e.preventDefault(); return }
    if (typing) {
      e.target.blur()
      if ((e.target.id === 'search' || e.target.id === 'tsearch') && ui.query) { ui.query = ''; ui.searching = false; renderAll() } else if (e.target.id === 'tsearch') { ui.searching = false; renderAll() }
      return
    }
    if (ui.askNext) { ui.askNext = null; renderPanel(); return }
    if (ui.open) { closeDetails(); return }
    if (ui.klaeren) { ui.klaeren = false; renderAll(); return }
    if (ui.ctx) { ui.ctx = null; renderAll() }
    return
  }
  if (typing) return
  if (e.metaKey || e.ctrlKey || e.altKey) { if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo_() } return }
  if (moveMenu && /^[0-9]$/.test(e.key)) {
    e.preventDefault()
    const o = moveOptions().find((x) => String(x.k) === e.key)
    if (o) pickMove(o.v)
    return
  }
  if (gPending) {
    clearTimeout(gPending); gPending = 0
    const map = { i: 'inbox', n: 'next', w: 'waiting', p: 'projects', s: 'someday', a: 'all', e: 'settings' }
    if (map[e.key]) { e.preventDefault(); setView(map[e.key]) }
    return
  }
  if (e.key === '?') { e.preventDefault(); openKeys(); return }
  if (mountedStage && stack.key(e)) { e.preventDefault(); return }
  const k = e.key
  if (k === 'g') { gPending = setTimeout(() => { gPending = 0 }, 1200); return }
  if (k === 'n') { e.preventDefault(); dockInput.focus(); return }
  if (k === '/') {
    e.preventDefault()
    if (isPhone()) { ui.searching = true; renderAll(); $('#tsearch')?.focus(); return }
    if (mountedStage) { ui.view = 'next'; renderAll() }
    $('#search')?.focus(); return
  }
  if (k === 'z') { e.preventDefault(); undo_(); return }
  if (k === 'c' && ui.view === 'next') { const cs = [null, ...store.state.contexts]; ui.ctx = cs[(cs.indexOf(ui.ctx) + 1) % cs.length]; ui.sel = -1; renderAll(); return }
  const rs = rowEls()
  if (!rs.length) return
  if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); ui.sel = Math.min(rs.length - 1, ui.sel + 1); applySel(); return }
  if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); ui.sel = Math.max(0, ui.sel - 1); applySel(); return }
  const id = selId(); if (id == null) return
  if (k === 'x' || k === ' ') { e.preventDefault(); complete(id, rs[ui.sel]); return }
  if (k === 'Enter') { e.preventDefault(); openDetails(id); return }
  if (k === 'e') { e.preventDefault(); openDetails(id, true); return }
  if (k === 's') { e.preventDefault(); store.toggleStart(id); return }
  if (k === 'm') { e.preventDefault(); openMoveMenu(id); return }
  if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); store.remove(id); toast('Gelöscht', true); return }
})

// ---------------------------------------------------------------- WebGL layer: lazy, optional, on demand (pill + companion)
function placeCompanion() {
  if (!gl) return
  const slot = $$('[data-buddy]').find((el) => el.getBoundingClientRect().width > 0)
  if (slot) gl.companion.place(slot.getBoundingClientRect()); else gl.companion.hide()
}
function dropGL() {
  if (!gl) return
  try { gl.dispose() } catch { /* already gone */ }
  gl = null
  html.classList.remove('gl-on')
}
async function initGL() {
  if (reduced.matches || gl) return null
  try {
    const mod = await import('./gl.js')
    const layer = mod.createLayer($('#gl-host'), { dark: darkMq.matches, onContextLost: dropGL })
    if (!layer) return null
    gl = layer
    html.classList.add('gl-on')
    const c = store.counts()
    gl.companion.set(c.inbox, c.cleared, { react: false })
    placeCompanion()
    return gl
  } catch {
    return null
  }
}
darkMq.addEventListener('change', () => gl && gl.setDark(darkMq.matches))
reduced.addEventListener('change', () => { if (reduced.matches) dropGL(); else glReady = initGL() })
phoneMq.addEventListener('change', () => { ui.searching = false; closeMenus(); renderAll() })
new ResizeObserver(() => { placeCompanion(); if (mountedStage) stack.layout() }).observe($('#main'))
$('#scroll').addEventListener('scroll', () => { if (mountedStage) stack.layout() }, { passive: true })
addEventListener('resize', () => placeCompanion())

// ---------------------------------------------------------------- start
const params = new URLSearchParams(location.search)
if (params.get('view')) ui.view = params.get('view')
renderAll()
glReady = new Promise((res) => {
  const go = () => initGL().then(res)
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 500 }); else setTimeout(go, 120)
})

// ---------------------------------------------------------------- test hook
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
window.proto = {
  show(view) { setView(view) },
  filter(context) { ui.ctx = context || null; ui.view = 'next'; ui.query = ''; renderAll() },
  capture(text) { return capture(text) },
  open(id) { openDetails(id) },
  complete(id) { return complete(id) },
  clarify(id, to) {
    const t = store.get(id)
    if (!t) return
    if (mountedStage) return stack.clarify(t.id, to)
    const [dest, arg] = to.split(':')
    if (dest === 'next') { if (moveTo(t.id, 'next', { ctx: arg }) === 'ask') { openDetails(t.id); ui.askNext = t.id; renderPanel() } return }
    if (dest === 'waiting') return moveTo(t.id, 'waiting', arg ? { scheduled: berlinMorning(arg) } : {})
    store.clarify(t.id, dest)
    toast(dest === 'done' ? 'Erledigt' : dest === 'delete' ? 'Gelöscht' : `Verschoben: ${listName(dest)}`, true)
  },
  async signature(opts) {
    await Promise.race([glReady, sleep(2500)])
    ui.inboxMode = 'stack'; ui.klaeren = true
    setView('inbox')
    await frame()
    stack.layout()
    await frame()
    return stack.signature(opts)
  },
  /** frames drawn so far by the card springs and the WebGL layer (both 0 while nothing moves) */
  frames() { return { card: stack.frames, gl: gl ? gl.frames : 0 } },
  store, stack, ui, renderAll,
}
