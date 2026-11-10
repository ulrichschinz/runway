// runway web, proposal 03 "Papier & Tinte". Vanilla modules standing in for the Vue components
// named in README.md (RailNav, ListPage, TaskLine, Randspalte, CaptureLine, NoticeBar, InkSurface).

import { createStore, CONTEXTS, contextsOf, parseTw, isInbox, isNext, isWaiting, isSomeday, listOf, TODAY, NOW, dayKey } from './store.js'
import * as C from './common.js'
import { inkBloom, preloadInk, release as releaseInk, stats as inkStats } from './ink.js'

// ?input=touch: the page runs inside the Android Custom Tab mock, so it behaves like a touch screen
if (new URLSearchParams(location.search).get('input') === 'touch') document.documentElement.dataset.input = 'touch'

const store = createStore()
const ui = {
  view: 'next', ctx: null, query: '', focus: null, open: null, project: null,
  step: null, // clarify sub-step: null | 'ctx' | 'project' | 'newproject'
  showDone: false, more: false, toc: false, today: false, reviewChecked: new Set(), addOpen: false, projAdd: false,
  zero: { play: false, host: null }, lastInbox: null, freshTally: -1,
}
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const app = $('#app'), rail = $('#rail'), phonebar = $('#phonebar'), scrollEl = $('#scroll')
const headEl = $('#head'), bodyEl = $('#body'), toplineEl = $('#topline'), marginEl = $('#margin')
const noticeEl = $('#notice'), keysEl = $('#keys'), captureForm = $('#capture'), captureInput = $('#capture input')
const searchInput = $('#search')
const rowCache = new Map()
const busy = new Set()
const isPhone = () => matchMedia('(max-width: 760px)').matches
const isNarrow = () => matchMedia('(max-width: 1180px)').matches

// ───────────────────────────── rows ─────────────────────────────
function rowMeta(t, kind) {
  const due = C.dueInfo(t)
  const ctx = contextsOf(t)
  const ctxText = ctx.length ? (ctx.length > 1 ? `${ctx[0]} +${ctx.length - 1}` : ctx[0]) : (isNext(t) ? 'überall' : '')
  const proj = t.project || ''
  if (kind === 'inbox') return [
    { text: t.annotations.length ? `¶ ${t.annotations.length} Notiz` : '', cls: 'empty' },
    { text: `erfasst ${C.entryInfo(t)}`, cls: '' },
  ]
  if (kind === 'waiting') { const f = C.followInfo(t); return [{ text: proj, cls: proj ? '' : 'empty' }, { text: f.text, cls: f.tone, mark: f.due }] }
  if (kind === 'someday') return [{ text: proj, cls: proj ? '' : 'empty' }, { text: `seit ${C.dm(parseTw(t.entry))}`, cls: 'empty' }]
  return [
    { text: proj, cls: proj ? '' : 'empty' },
    { text: ctxText, cls: ctx.length ? '' : 'empty' },
    { text: due ? (due.tone === 'overdue' ? `überfällig ${C.dm(parseTw(t.due))}` : due.text) : '', cls: due?.tone || 'empty' },
  ]
}
// Same status vocabulary as Android's pinned row text "<Beschreibung>, <Status>, ID <8>".
function statusWord(t) {
  const due = C.dueInfo(t)
  if (due?.status) return due.status
  if (isWaiting(t) && C.followInfo(t).due) return 'Nachhaken fällig'
  return { inbox: 'Inbox', next: 'Nächste', waiting: 'Wartet', someday: 'Irgendwann', none: 'ohne Liste' }[listOf(t)]
}
function rowHTML(t, kind) {
  const meta = rowMeta(t, kind)
  const due = C.dueInfo(t)
  const cls = ['row', due?.tone === 'overdue' ? 'overdue' : '', t.fresh ? 'fresh' : ''].join(' ')
  const aria = `${t.description}, ${statusWord(t)}, ID ${t.uuid.slice(-8)}`
  return `<div class="${cls}" data-id="${t.id}" role="listitem" aria-label="${C.esc(aria)}">
    <button class="ring" data-act="done" aria-label="Abhaken: ${C.esc(t.description)}"></button>
    <div class="main"><span class="desc"><span class="txt">${C.esc(t.description)}</span>${C.strikeSVG(t.id)}</span>${
      t.start ? '<span class="live"><i class="pulse"></i>läuft</span>' : ''}${
      t.priority === 'H' ? '<span class="prio" title="Priorität hoch">H</span>' : ''}${
      kind !== 'inbox' && t.annotations.length ? `<span class="note" title="Notizen">¶ ${t.annotations.length}</span>` : ''}</div>
    <span class="meta">${meta.map((m) => `<span class="m ${m.cls}">${m.mark ? '<span class="ring-mark"></span>' : ''}${C.esc(m.text)}</span>`).join('')}</span>
    <span class="stamp"></span>
  </div>`
}
function rowEl(t, kind, section) {
  const key = `${section}:${t.id}`
  const sig = JSON.stringify([t.description, t.project, t.tags, t.due, t.start, t.priority, t.annotations.length, t.fresh, t.entry, kind])
  const c = rowCache.get(key)
  if (c && c.sig === sig && !c.el.classList.contains('is-gone')) return c.el
  const el = C.html(rowHTML(t, kind))
  rowCache.set(key, { el, sig })
  return el
}
const secEl = (key, label, count, extra = '') => {
  const k = `sec:${key}:${label}:${count}:${extra}`
  const c = rowCache.get(k)
  if (c) return c.el
  const el = C.html(`<div class="sec"><div class="eyebrow"><span class="slash">//</span><span>${C.esc(label)}</span>${count != null ? `<span class="sep">·</span><span>${count}</span>` : ''}${extra}</div></div>`)
  rowCache.set(k, { el })
  return el
}
const emptyEl = (key, text) => {
  const k = `empty:${key}:${text}`
  if (!rowCache.has(k)) rowCache.set(k, { el: C.html(`<div class="empty-line">${C.esc(text)}</div>`) })
  return rowCache.get(k).el
}

// ───────────────────────────── views ─────────────────────────────
const eyebrow = (...parts) => `<div class="eyebrow"><span class="slash">//</span>${parts.filter((p) => p !== '' && p != null).map((p, i) => `${i ? '<span class="sep">·</span>' : ''}<span>${p}</span>`).join('')}</div>`

function sectionsFor(view, L) {
  if (view === 'next') {
    const dueIds = new Set(L.due.map((t) => t.id))
    const nx = L.nextIn.filter((t) => !dueIds.has(t.id))
    return [
      { key: 'due', label: 'Fällig', tasks: L.due, kind: 'next', empty: 'Nichts fällig' },
      { key: 'next', label: 'Nächste Aktionen', tasks: nx, kind: 'next', empty: ui.ctx ? `Nichts für ${ui.ctx}` : 'Keine nächsten Aktionen' },
    ]
  }
  if (view === 'inbox') return [{ key: 'inbox', label: null, tasks: L.inbox, kind: 'inbox' }]
  if (view === 'waiting') {
    const w = waitingSplit(L)
    return [
      { key: 'wdue', label: 'Heute nachhaken', tasks: w.due, kind: 'waiting', empty: 'Heute ist niemand fällig' },
      { key: 'wsoon', label: 'Diese Woche', tasks: w.soon, kind: 'waiting' },
      { key: 'wlater', label: 'Später oder ohne Datum', tasks: w.later, kind: 'waiting', empty: w.due.length + w.soon.length ? null : 'Du wartest auf nichts' },
    ].filter((x) => x.tasks.length || x.empty)
  }
  if (view === 'someday') return [{ key: 'some', label: 'Ideen', tasks: L.someday, kind: 'someday', empty: 'Keine Ideen geparkt' }]
  if (view === 'all') {
    const s = [
      { key: 'ai', label: 'Inbox', tasks: L.inbox, kind: 'next' },
      { key: 'an', label: 'Nächste', tasks: L.next, kind: 'next' },
      { key: 'aw', label: 'Warten auf', tasks: L.waiting, kind: 'next' },
      { key: 'as', label: 'Irgendwann', tasks: L.someday, kind: 'next' },
      { key: 'ap', label: 'Ohne Liste', tasks: L.unlisted, kind: 'next' },
    ].filter((x) => x.tasks.length)
    if (ui.showDone) s.push({ key: 'ad', label: 'Erledigt, letzte 7 Tage', tasks: [], kind: 'done' })
    return s
  }
  if (view === 'project') {
    const ts = L.open.filter((t) => t.project === ui.project)
    return [
      { key: 'pn', label: 'Nächste Aktionen', tasks: ts.filter(isNext), kind: 'next', empty: 'Keine nächste Aktion' },
      { key: 'pw', label: 'Warten auf', tasks: ts.filter(isWaiting), kind: 'waiting' },
      { key: 'ps', label: 'Irgendwann', tasks: ts.filter(isSomeday), kind: 'someday' },
      { key: 'po', label: 'Ohne Liste', tasks: ts.filter((t) => listOf(t) === 'none'), kind: 'next' },
    ].filter((x) => x.tasks.length || x.empty)
  }
  if (view === 'search') {
    const q = ui.query.toLowerCase()
    const hit = (t) => [t.description, t.project || '', ...t.tags].join(' ').toLowerCase().includes(q)
    return [
      { key: 'si', label: 'Inbox', tasks: L.inbox.filter(hit), kind: 'inbox' },
      { key: 'sn', label: 'Nächste', tasks: L.next.filter(hit), kind: 'next' },
      { key: 'sw', label: 'Warten auf', tasks: L.waiting.filter(hit), kind: 'waiting' },
      { key: 'ss', label: 'Irgendwann', tasks: L.someday.filter(hit), kind: 'someday' },
      { key: 'sp', label: 'Ohne Liste', tasks: L.unlisted.filter(hit), kind: 'next' },
    ].filter((x) => x.tasks.length)
  }
  return []
}
function waitingSplit(L) {
  const due = [], soon = [], later = []
  for (const t of L.waiting) {
    const f = C.followInfo(t)
    if (f.due) due.push(t)
    else if (f.key && C.daysBetween(TODAY, f.key) <= 7) soon.push(t)
    else later.push(t)
  }
  return { due, soon, later }
}

function renderList(view, L) {
  const nodes = []
  const secs = sectionsFor(view, L)
  for (const s of secs) {
    if (s.label) nodes.push(secEl(s.key, s.label, s.tasks.length || (s.key === 'ad' ? L.doneWeek.length : 0)))
    if (s.key === 'ad') {
      L.doneWeek.forEach((t) => nodes.push(rowCache.get(`done:${t.id}`)?.el || (() => {
        const end = t.end && parseTw(t.end)
        const when = !end ? 'gerade' : dayKey(end) === TODAY ? 'heute ' + C.hm(end) : C.day(end)
        const el = C.html(`<div class="row is-struck" data-done="${t.id}"><span class="ring"></span><div class="main"><span class="desc"><span class="txt">${C.esc(t.description)}</span>${C.strikeSVG(t.id)}</span></div><span class="meta"><span class="m">${C.esc(t.project || '')}</span><span class="m">${C.esc(contextsOf(t).join(' '))}</span><span class="m empty">${when}</span></span></div>`)
        rowCache.set(`done:${t.id}`, { el }); return el
      })()))
      continue
    }
    if (!s.tasks.length && s.empty) nodes.push(emptyEl(s.key, s.empty))
    s.tasks.forEach((t) => nodes.push(rowEl(t, s.kind, s.key)))
  }
  if (!secs.length && view === 'search') nodes.push(emptyEl('search', 'Nichts gefunden. Die Suche geht über Beschreibung, Projekt und Tags.'))
  let list = bodyEl.querySelector(':scope > .list')
  if (!list) { bodyEl.replaceChildren(); list = C.html('<div class="list" role="list"></div>'); bodyEl.append(list) }
  list.classList.toggle('wide-meta', ['inbox', 'waiting', 'someday'].includes(view))
  C.patch(list, nodes)
  $$('.row', list).forEach((el) => el.classList.toggle('focus', Number(el.dataset.id) === ui.focus))
}

function renderHead(view, L) {
  const ov = store.projectOverview()
  let h = ''
  if (view === 'next') {
    h = eyebrow('Nächste', ui.ctx || 'alle Kontexte', L.nextIn.length) + `<h1 class="display">${C.heading('next')}</h1>`
      + `<div class="ctxbar" role="group" aria-label="Kontext">${[null, ...CONTEXTS].map((c, i) =>
        `<button class="ctx" data-ctx="${c || ''}" aria-pressed="${ui.ctx === c}" title="Taste ${i}">${c || 'Alle'} <span class="n">${c ? L.ctxCount[c] : L.next.length}</span></button>`).join('')}<span class="hint mono mute"><kbd>0</kbd> – <kbd>5</kbd></span></div>`
  } else if (view === 'inbox') {
    if (L.inbox.length) {
      const oldest = L.inbox[L.inbox.length - 1]
      h = eyebrow('Inbox', `${L.inbox.length} ungeklärt`, `älteste ${C.entryInfo(oldest)}`) + `<h1 class="display">${C.heading('inbox')}</h1>`
        + `<p class="lead">Jeder Eintrag bekommt einen Platz: eine Taste für die Liste, eine Ziffer für den Kontext.</p>`
    } else {
      h = eyebrow('Inbox', '0', `Stand ${store.stand}`) + `<h1 class="display">${C.heading('inboxEmpty')}</h1>`
        + `<p class="lead">Alles geklärt. Was jetzt zählt, steht unter Nächste.</p>`
        + `<div class="actions"><button class="pill" data-go="next">Zu Nächste <kbd>g</kbd><kbd>n</kbd></button><button class="pill quiet" data-focus="capture">Neues Todo <kbd>n</kbd></button></div>`
    }
  } else if (view === 'waiting') {
    h = eyebrow('Warten auf', L.waiting.length, 'nach Nachhak-Datum') + `<h1 class="display">${C.heading('waiting')}</h1>`
  } else if (view === 'someday') {
    h = eyebrow('Irgendwann', L.someday.length, 'im Rückblick durchsehen') + `<h1 class="display">${C.heading('someday')}</h1>`
  } else if (view === 'projects') {
    const active = ov.filter((p) => p.status === 'active')
    const stalled = ov.filter((p) => p.stalled)
    h = eyebrow('Projekte', `${active.length} aktiv`, stalled.length ? `${stalled.length} steckt fest` : 'alle in Bewegung') + `<h1 class="display">${C.heading('projects')}</h1>`
  } else if (view === 'project') {
    const p = ov.find((x) => x.name === ui.project)
    const state = p.stalled ? 'steckt fest' : { active: 'aktiv', on_hold: 'ruht', done: 'abgeschlossen' }[p.status]
    // PUT /projects/{name}/status: active | on_hold | done. Reversible, so every change gets Rückgängig.
    const sp = (s, label) => `<button class="pill quiet" data-pstatus="${s}">${label}</button>`
    const statusPills = p.status === 'active' ? sp('on_hold', 'Ruhen lassen') + sp('done', 'Abschließen')
      : p.status === 'on_hold' ? sp('active', 'Wieder aufnehmen') + sp('done', 'Abschließen') : sp('active', 'Wieder aufnehmen')
    h = eyebrow('Projekt', state, `${p.next} nächste`, `${p.waiting} wartet`)
      + `<h1 class="display">${C.esc(p.name)}</h1>`
      + (p.outcome ? `<p class="lead accent outcome-lead">${C.esc(p.outcome)}</p>` : '<p class="lead">Noch kein Ergebnis formuliert. Der Plan in der Randspalte hilft dabei.</p>')
      + (p.stalled
        ? `<div class="callout"><span class="ring-mark"></span><p><b>Steckt fest.</b> Kein nächster Schritt und nichts, worauf du wartest.</p><div class="acts"><button class="pill action" data-act="add-next">Nächste Aktion festlegen <kbd>n</kbd></button>${statusPills}</div></div>`
        : `<div class="pstatus"><span class="mono mute">Status</span>${statusPills}</div>`)
      + `<div class="inline-add ${ui.addOpen ? 'on' : ''}" id="inlineadd"><span class="plus-s mono mute">+</span><input placeholder="Nächste Aktion für ${C.esc(p.name)}" aria-label="Nächste Aktion für ${C.esc(p.name)}"><span class="mono mute">⏎ anlegen · Esc</span></div>`
  } else if (view === 'review') {
    const days = C.daysBetween(store.lastReview, TODAY)
    h = eyebrow('Rückblick', `zuletzt ${C.day(new Date(store.lastReview + 'T12:00:00Z'))}`, days ? `vor ${days} Tagen` : 'heute') + `<h1 class="display">${C.heading('review')}</h1>`
      + `<p class="lead">Sechs Schritte, einmal pro Woche. Was runway prüfen kann, hakt es selbst ab.</p>`
  } else if (view === 'all') {
    h = eyebrow('Alle', `${L.open.length} offen`, ui.showDone ? `${L.doneWeek.length} erledigt in 7 Tagen` : '') + `<h1 class="display">${C.heading('all')}</h1>`
      + `<div class="ctxbar" style="margin-top:20px"><button class="ctx" data-act="toggle-done" aria-pressed="${ui.showDone}">Erledigte zeigen <kbd>d</kbd></button></div>`
  } else if (view === 'settings') {
    h = eyebrow('Einstellungen', 'uli', 'Admin') + `<h1 class="display">${C.heading('settings')}</h1>`
  } else if (view === 'search') {
    const n = sectionsFor('search', L).reduce((a, s) => a + s.tasks.length, 0)
    h = eyebrow('Suche', `»${C.esc(ui.query)}«`, `${n} Treffer`) + `<h1 class="display">${C.heading('search')}</h1>`
      + `<div class="actions"><button class="pill quiet" data-act="clear-search">Suche beenden <kbd>Esc</kbd></button></div>`
  }
  const key = view + '|' + h
  if (headEl.dataset.key !== key) {
    const viewChanged = headEl.dataset.view !== view
    headEl.innerHTML = h
    headEl.dataset.key = key
    headEl.dataset.view = view
    if (viewChanged) { headEl.classList.remove('view-anim'); void headEl.offsetWidth; headEl.classList.add('view-anim') }
  }
}

function renderProjects() {
  const ov = store.projectOverview()
  const active = ov.filter((p) => p.status === 'active'), resting = ov.filter((p) => p.status === 'on_hold'), done = ov.filter((p) => p.status === 'done')
  const row = (p) => `<button class="proj ${ui.focus === 'p:' + p.name ? 'focus' : ''}" data-project="${C.esc(p.name)}">
      <span>${p.stalled ? '<span class="ring-mark" title="steckt fest"></span>' : ''}</span>
      <span><span class="name">${C.esc(p.name)}</span>${p.outcome ? `<span class="outcome">${C.esc(p.outcome)}</span>` : '<span class="outcome none">noch kein Ergebnis formuliert</span>'}</span>
      <span class="state ${p.stalled ? 'stalled' : ''}">${p.stalled ? 'steckt fest' : { active: 'in Bewegung', on_hold: 'ruht', done: 'abgeschlossen' }[p.status]}</span>
      <span class="counts">${p.next} nächste · ${p.waiting} wartet</span></button>`
  const sec = (label, n) => `<div class="sec"><div class="eyebrow"><span class="slash">//</span><span>${label}</span><span class="sep">·</span><span>${n}</span></div></div>`
  // POST /projects: a new project is active and has no next action yet, so it opens as "steckt fest"
  const add = ui.projAdd
    ? `<div class="proj-add on" id="projadd"><span class="plus-s mono mute">+</span><input placeholder="Name des neuen Projekts" aria-label="Name des neuen Projekts" maxlength="100"><span class="mono mute err" aria-live="polite">⏎ anlegen · Esc</span></div>`
    : `<button class="proj-add" data-act="projadd"><span class="plus-s mono mute">+</span><span>Projekt</span><kbd>n</kbd></button>`
  const html = sec('Aktiv', active.length) + active.map(row).join('') + add
    + sec('Ruht', resting.length) + resting.map(row).join('')
    + (done.length ? sec('Abgeschlossen', done.length) + done.map(row).join('') : '')
  if (bodyEl.dataset.html !== html || !bodyEl.querySelector('.proj')) {
    const focused = document.activeElement?.closest?.('#projadd')
    if (focused) return // typing a name: never re-render under the cursor
    bodyEl.innerHTML = html
    bodyEl.dataset.html = html
  }
}

function reviewSteps(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled)
  const w = waitingSplit(L)
  const soon = w.due.length + w.soon.length
  return [
    { id: 1, what: 'Inbox leeren', why: 'Jeder Eintrag hat einen Platz.', status: L.inbox.length ? `${L.inbox.length} offen` : 'leer', ok: L.inbox.length === 0, go: 'inbox' },
    { id: 2, what: 'Nächste Aktionen durchsehen', why: 'Erledigtes abhaken, Veraltetes löschen.', status: `${L.next.length} · ${L.due.length} fällig`, go: 'next' },
    { id: 3, what: 'Warten auf: nachhaken', why: 'Wer ist dran, wann fragst du nach?', status: w.due.length ? `${w.due.length} heute · ${soon} diese Woche` : `${L.waiting.length} · ${soon} diese Woche`, go: 'waiting' },
    { id: 4, what: 'Projekte: jedes hat eine nächste Aktion', why: stalled.length ? `Steckt fest: ${stalled.map((p) => p.name).join(', ')}` : 'Alle aktiven Projekte sind in Bewegung.', status: stalled.length ? `${stalled.length} steckt fest` : 'alle in Bewegung', ok: !stalled.length, go: 'projects' },
    { id: 5, what: 'Irgendwann durchsehen', why: 'Wird etwas davon jetzt wichtig?', status: `${L.someday.length} Ideen`, go: 'someday' },
    { id: 6, what: 'Kalender: letzte und nächste Woche', why: 'Außerhalb von runway, im Kalender.', status: 'Kalender', go: null },
  ]
}
function renderReview(L) {
  const steps = reviewSteps(L)
  bodyEl.innerHTML = steps.map((s) => {
    const ok = s.ok || ui.reviewChecked.has(s.id)
    return `<div class="step ${ok ? 'ok' : ''}"><button class="num" data-act="review-check" data-step="${s.id}" aria-pressed="${ok}" aria-label="Schritt ${s.id} abhaken">${String(s.id).padStart(2, '0')}</button>
      <span><span class="what">${C.esc(s.what)}</span><span class="why">${C.esc(s.why)}</span></span>
      ${s.go ? `<button class="pill quiet" data-go="${s.go}">${C.esc(s.status)} →</button>` : `<span class="mono mute">${s.status}</span>`}</div>`
  }).join('') + `<div class="review-foot"><button class="pill action" data-act="review-done">Rückblick abschließen</button><span class="mono mute">speichert den Zeitpunkt für dich und für Claude</span></div>`
}
function renderSettings() {
  bodyEl.innerHTML = [
    ['Konto', `<p>Ulrich Schinz · uli · Admin</p><button class="pill">Profil bearbeiten</button>`],
    ['Passwort', `<p>Zuletzt geändert vor 3 Monaten.</p><button class="pill">Passwort ändern</button>`],
    ['API-Key', `<p>Für die Android-App („Key einfügen“) und für Claude.</p><div class="code"><span>rw_live_••••••••••••••••3f9a</span><span style="display:flex;gap:6px"><button class="pill quiet">Anzeigen</button><button class="pill quiet">Kopieren</button></span></div>`],
    ['Claude verbinden', `<p>Vier Schritte, jeder zum Kopieren: Umgebung, MCP-Server, Plugin, Regel für CLAUDE.md.</p><div class="code"><span>claude mcp add runway --transport http https://runway.agentic-reach.com/api/mcp</span><button class="pill quiet">Kopieren</button></div>`],
    ['MCP-Server', `<p>Endpunkt <span class="mono">/api/mcp</span> · Claude Code · Claude Desktop · curl</p>`],
    ['Kontexte', `<p>Die Kontexte für Nächste, das Widget und die Android-Chips. Eine Liste für alle Geräte.</p><div class="ctxbar">${CONTEXTS.map((c) => `<span class="ctx">${c}</span>`).join('')}<button class="ctx">+ Kontext</button></div>`],
    ['Darstellung', `<div class="ctxbar"><button class="ctx" aria-pressed="true">System</button><button class="ctx">Hell</button><button class="ctx">Dunkel</button></div>`],
    ['Verwaltung', `<p>Registrierung erlauben · Benutzer und Rollen</p>`],
  ].map(([h, b]) => `<section class="set"><h3>${h}</h3><div>${b}</div></section>`).join('') + `<div style="margin-top:22px"><button class="pill">Abmelden</button></div>`
}

// The empty Inbox is Uli's normal state, so it is plain typography. WebGL runs only for the change
// itself: the Inbox went from >= 1 to 0 in this session (rule 5.1: the effect explains a state
// change). A revisit, reduced motion or a WebGL failure: the same page, no canvas.
function renderZero() {
  if (bodyEl.querySelector(':scope > .zero')) return
  const play = ui.zero.play && !C.reducedMotion()
  ui.zero.play = false
  bodyEl.innerHTML = play ? '<div class="zero"><div class="ink-host" id="inkhost" aria-hidden="true"></div></div>' : '<div class="zero"></div>'
  if (!play) return
  const host = $('#inkhost')
  ui.zero.host = host
  requestAnimationFrame(() => inkBloom(host, { onEnd: () => { if (ui.zero.host === host) ui.zero.host = null } }))
}

// ───────────────────────────── margin ─────────────────────────────
function todayPanel(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled)
  const days = C.daysBetween(store.lastReview, TODAY)
  const w = waitingSplit(L)
  const follow = [...w.due, ...w.soon].slice(0, 3)
  // on Warten auf the list itself is the follow-up list, so the margin does not repeat it
  const followSec = ui.view === 'waiting' && !ui.query ? '' : `<section class="msec">${eyebrow('Nachhaken', w.due.length ? `${w.due.length} heute` : '')}
      ${follow.length ? follow.map((t) => { const f = C.followInfo(t); return `<button class="mrow" data-open="${t.id}"><span class="t">${f.due ? '<span class="ring-mark"></span>&nbsp; ' : ''}${C.esc(t.description)}</span><span class="m">${f.due ? (f.key === TODAY ? 'heute' : 'seit ' + C.dm(C_follow(t))) : C.day(C_follow(t))}</span></button>` }).join('') : '<p class="mnote">Diese Woche ist niemand fällig.</p>'}
    </section>`
  return `<section class="msec">${eyebrow('Heute', C.longDay(NOW))}
      <div class="tallyline">${C.tallySVG(L.doneToday.length, { fresh: ui.freshTally })}<span class="count">${L.doneToday.length} erledigt</span></div>
      <ul class="donelist">${L.doneToday.map((t) => `<li><span class="desc"><span class="txt">${C.esc(t.description)}</span>${C.strikeSVG(t.id)}</span><span class="m">${t.end ? C.hm(parseTw(t.end)) : 'gerade'}</span></li>`).join('')}</ul>
    </section>
    ${followSec}
    <section class="msec">${eyebrow('Projekte')}
      ${stalled.length ? stalled.map((p) => `<button class="mrow" data-project="${C.esc(p.name)}"><span class="t"><span class="ring-mark"></span>&nbsp; ${C.esc(p.name)}</span><span class="m">steckt fest</span></button>`).join('')
        : `<p class="mnote">Alle ${ov.filter((p) => p.status === 'active').length} aktiven Projekte haben eine nächste Aktion.</p>`}
    </section>
    <section class="msec">${eyebrow('Rückblick')}
      <p class="mnote">Zuletzt <b>${C.day(new Date(store.lastReview + 'T12:00:00Z'))}</b>${days ? `, vor ${days} Tagen` : ', heute'}.</p>
      ${days >= 7 ? `<div style="margin-top:12px"><button class="pill" data-go="review">Rückblick beginnen <kbd>g</kbd><kbd>r</kbd></button></div>` : ''}
    </section>`
}
const C_follow = (t) => parseTw(t.scheduled || t.wait)

function clarifyPanel(t, L) {
  const ov = store.projectOverview().filter((p) => p.status === 'active')
  const notes = t.annotations.length ? `<ul class="notes">${t.annotations.map((a) => `<li><span class="m">${C.dm(parseTw(a.entry))}</span><span>${C.esc(a.description)}</span></li>`).join('')}</ul>` : ''
  const choice = (key, k, lab, why, cls = '') => `<button class="choice ${cls} ${ui.step === key ? 'on' : ''}" data-clarify="${key}"><kbd>${k}</kbd><span class="lab">${lab}</span><span class="why">${why}</span></button>`
  const ctxSub = ui.step === 'ctx' ? `<div class="subchoices">${CONTEXTS.map((c, i) => `<button class="ctx" data-to="next:${c}"><kbd>${i + 1}</kbd>${c}</button>`).join('')}<button class="ctx" data-to="next"><kbd>0</kbd>überall</button></div>` : ''
  // the project step ends with "Neues Projekt": POST /projects, then the item is its first next action
  const projSub = ui.step === 'project'
    ? `<div class="subchoices">${ov.map((p, i) => `<button class="ctx" data-to="project:${C.esc(p.name)}"><kbd>${i + 1}</kbd>${C.esc(p.name)}</button>`).join('')}<button class="ctx new" data-act="newproj"><kbd>n</kbd>Neues Projekt</button></div>`
    : ui.step === 'newproject'
      ? `<div class="subchoices newproj"><input id="newproj" placeholder="Name des Projekts" aria-label="Name des neuen Projekts" maxlength="100"><span class="mono mute err" id="newprojerr" aria-live="polite">⏎ anlegen und einordnen · Esc zurück</span></div>`
      : ''
  return `<div class="mhead">${eyebrow('Klären', `noch ${L.inbox.length}`)}<span class="mono mute">ID ${t.uuid.slice(-8)}</span></div>
    <h2 class="title">${C.esc(t.description)}</h2>
    <div class="mono mute">erfasst ${C.entryInfo(t)}</div>${notes}
    <div class="question">Was ist es?</div>
    ${choice('ctx', 'a', 'Nächste Aktion', 'dann Kontext 1–5')}${ctxSub}
    ${choice('waiting', 'w', 'Warten auf', 'jemand anderes ist dran')}
    ${choice('someday', 'v', 'Irgendwann', 'vielleicht später')}
    ${choice('project', 'p', 'Zu einem Projekt', 'mehr als ein Schritt', ui.step === 'newproject' ? 'on' : '')}${projSub}
    ${choice('done', 'x', 'Gleich erledigt', 'unter zwei Minuten')}
    ${choice('delete', 'Entf', 'Löschen', 'nicht mehr wichtig', 'danger')}
    <p class="mnote keyhints"><span><kbd>j</kbd> <kbd>k</kbd> weiter</span><span><kbd>e</kbd> Text ändern</span><span><kbd>z</kbd> rückgängig</span></p>`
}

function filedPanel(L) {
  const log = store.clarified
  return `<section class="msec">${eyebrow('Geklärt', log.length)}
      ${log.length ? `<ul class="filed">${log.map((x) => `<li><span class="t">${C.esc(x.description)}</span><span class="m">→ ${C.esc(x.label)}</span></li>`).join('')}</ul>` : '<p class="mnote">Nichts zu klären. Neues landet hier, sobald du es erfasst.</p>'}
    </section>` + todayPanel(L)
}

function detailPanel(t) {
  const list = listOf(t)
  const due = C.dueInfo(t)
  const ctx = contextsOf(t)
  const dueKey = t.due ? dayKey(parseTw(t.due)) : ''
  const others = store.lists().open.filter((x) => x.id !== t.id).slice(0, 12)
  const opt = (on, attrs, label) => `<button class="ctx" ${attrs} aria-pressed="${on}">${label}</button>`
  const more = ui.more ? `
    <div class="field"><label for="f-sched">Nachhaken</label><div class="val"><input id="f-sched" type="date" value="${t.scheduled ? dayKey(parseTw(t.scheduled)) : ''}"></div></div>
    <div class="field"><label for="f-wait">Zurück&shy;stellen</label><div class="val"><input id="f-wait" type="date" value="${t.wait ? dayKey(parseTw(t.wait)) : ''}"> <span class="mono mute">bis dahin unsichtbar</span></div></div>
    <div class="field"><label for="f-until">Läuft ab</label><div class="val"><input id="f-until" type="date"></div></div>
    <div class="field"><span class="lab">Wieder&shy;holen</span><div class="opts">${['täglich', 'wöchentlich', 'monatlich', 'jährlich'].map((r) => opt(false, '', r)).join('')}</div></div>
    <div class="field"><span class="lab">Hängt ab von</span><div class="val"><select style="font:inherit;font-size:13px;background:transparent;border:0;color:inherit;max-width:100%"><option>nichts</option>${others.map((o) => `<option>${C.esc(o.description)}</option>`).join('')}</select></div></div>` : ''
  // Liste sends tags_add [list] + tags_remove the other two status tags (rules.js listPayload);
  // Kontext toggles one @tag and never touches next. Back to the Inbox is not offered: the API
  // would have to drop every tag and the project.
  return `<div class="mhead">${eyebrow('Todo', { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', someday: 'Irgendwann', none: 'ohne Liste' }[list])}<button class="mclose" data-act="close"><kbd>Esc</kbd> schließen</button></div>
    <h2 class="title" id="dtitle" data-id="${t.id}" spellcheck="false">${C.esc(t.description)}</h2>
    <div class="mono mute">ID ${t.uuid.slice(-8)} · erfasst ${C.entryInfo(t)}</div>
    <div class="livebar">${t.start ? `<i class="pulse"></i>läuft seit ${C.sinceStart(t)}` : '<span>nicht gestartet</span>'}<button class="pill" data-act="start">${t.start ? 'Pausieren' : 'Starten'} <kbd>s</kbd></button></div>
    <div class="field"><span class="lab">Liste</span><div class="opts">${[['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann']].map(([k, l]) => opt(list === k, `data-list="${k}"`, l)).join('')}</div></div>
    <div class="field"><span class="lab">Kontext</span><div class="opts">${CONTEXTS.map((c) => opt(ctx.includes(c), `data-setctx="${c}"`, c)).join('')}</div></div>
    <div class="field"><span class="lab">Projekt</span><div class="val">${t.project ? `<button data-project="${C.esc(t.project)}" style="border-bottom:1px solid var(--rw-rule-strong)">${C.esc(t.project)}</button>` : '<span class="mute">keins</span>'}</div></div>
    <div class="field"><label for="f-due">Fällig</label><div class="val"><input id="f-due" type="date" value="${dueKey}"> ${due && ['overdue', 'today'].includes(due.tone) ? `<span class="m ${due.tone}">${due.tone === 'overdue' ? 'überfällig' : 'heute'}</span>` : ''}</div></div>
    <div class="field"><span class="lab">Priorität</span><div class="opts">${[['H', 'Hoch'], ['M', 'Mittel'], ['L', 'Niedrig']].map(([k, l]) => opt(t.priority === k, `data-prio="${k}"`, l)).join('')}</div></div>
    ${more}
    <div class="field"><span class="lab">Mehr</span><div class="more">${ui.more ? '<button data-act="more">weniger</button>' : '<button data-act="more">Nachhaken</button> · <button data-act="more">Zurückstellen</button> · <button data-act="more">Läuft ab</button> · <button data-act="more">Wiederholen</button> · <button data-act="more">Hängt ab von</button>'}</div></div>
    <section class="msec">${eyebrow('¶ Notizen', t.annotations.length)}
      <ul class="notes">${t.annotations.map((a) => `<li><span class="m">${C.dm(parseTw(a.entry))}</span><span>${C.esc(a.description)}</span></li>`).join('')}</ul>
      <input class="noteadd" id="noteadd" placeholder="Notiz hinzufügen, Enter" aria-label="Notiz hinzufügen">
    </section>
    <div class="detail-actions"><button class="pill action" data-act="done-open">Abhaken <kbd>x</kbd></button><button class="pill" data-act="delete-open">Löschen <kbd>Entf</kbd></button></div>`
}

function tocPanel(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled).length
  const item = (v, label, count, extra = '') => `<button class="mrow big" data-go="${v}"><span class="t">${label}</span><span class="m">${count}${extra}</span></button>`
  // phone web: the sheet behind "···" carries the brand lockup and search (the phone bar has neither)
  return `<div class="mhead">${C.LOCKUP}<button class="mclose" data-act="close">schließen</button></div>
    <label class="search toc-search"><span class="sr">Suchen</span><input id="tocsearch" type="search" placeholder="Suchen in allen Listen" autocomplete="off" enterkeyhint="search" value="${C.esc(ui.query)}"></label>
    <div style="margin-top:6px">${item('inbox', 'Inbox', L.inbox.length)}${item('next', 'Nächste', L.next.length)}${item('waiting', 'Warten auf', L.waiting.length)}
    ${item('projects', 'Projekte', ov.filter((p) => p.status === 'active').length, stalled ? ' · steckt fest' : '')}${item('someday', 'Irgendwann', L.someday.length)}
    ${item('review', 'Rückblick', C.daysBetween(store.lastReview, TODAY) >= 7 ? 'fällig' : '')}${item('all', 'Alle', '')}${item('settings', 'Einstellungen', '')}</div>` + `<div style="margin-top:28px">${todayPanel(L)}</div>`
}

function planPanel(name) {
  const p = store.projects.find((x) => x.name === name)
  const plan = p.plan
  if (!plan) return `${eyebrow('Plan', name)}<h2 class="title">Noch kein Plan</h2><p class="mnote" style="margin-top:8px">Natürliche Planung in fünf Schritten: Warum, Vision, Ideen, Ordnen, Aktionen.</p><div style="margin-top:16px"><button class="pill">Plan beginnen</button></div>` + `<div style="margin-top:30px">${todayPanel(store.lists())}</div>`
  return `<div class="plan">${eyebrow('Plan', name, 'Natürliche Planung')}
    <h4><span class="num">01</span> Warum</h4><p>${C.esc(plan.purpose)}</p><p class="mute" style="margin-top:6px;font-size:13px">${C.esc(plan.principles)}</p>
    <h4><span class="num">02</span> Vision</h4><p class="accent" style="font-size:16px">${C.esc(plan.vision)}</p>
    <h4><span class="num">03</span> Ideen</h4><div class="ideas">${plan.brainstorm.map((b) => `<span>${C.esc(b)}</span>`).join('')}</div>
    <h4><span class="num">04</span> Ordnen <span class="mute">· Alt ↑ ↓</span></h4>
    <ol>${plan.organized.map((o, i) => `<li><span>${C.esc(o)}</span><span style="display:flex;gap:8px"><button data-plan-up="${i}" aria-label="nach oben">↑</button><button data-plan-todo="${i}">→ Nächste</button></span></li>`).join('')}</ol>
    <h4><span class="num">05</span> Aktionen</h4><p class="mute" style="font-size:13px">„→ Nächste“ legt den Schritt als nächste Aktion im Projekt an.</p></div>`
}

let marginKey = ''
function renderMargin(L) {
  let key, htmlStr
  const openT = ui.open && store.get(ui.open)
  if (ui.toc) { key = 'toc'; htmlStr = tocPanel(L) }
  else if (ui.today && !openT) { key = 'today-panel'; htmlStr = `<div class="mhead"><span></span><button class="mclose" data-act="close"><kbd>Esc</kbd> schließen</button></div><div style="margin-top:6px">${todayPanel(L)}</div>` }
  else if (openT && openT.status === 'pending' && !store.holdOf(openT.id)?.kind?.match(/done|delete/)) { key = `d:${openT.id}`; htmlStr = detailPanel(openT) }
  else if (ui.view === 'inbox' && L.inbox.length) {
    const t = store.get(ui.focus) && isInbox(store.get(ui.focus)) ? store.get(ui.focus) : L.inbox[0]
    key = `c:${t.id}`; htmlStr = clarifyPanel(t, L)
  } else if (ui.view === 'inbox') { key = 'filed'; htmlStr = filedPanel(L) }
  else if (ui.view === 'project') { key = `p:${ui.project}`; htmlStr = planPanel(ui.project) }
  else { key = 'today'; htmlStr = todayPanel(L) }
  const editing = marginEl.contains(document.activeElement) && document.activeElement.matches('input, select, [contenteditable="true"]')
  if (editing && key === marginKey) return
  if (marginEl.dataset.html === htmlStr) return
  marginEl.innerHTML = htmlStr
  marginEl.dataset.html = htmlStr
  if (key !== marginKey) marginEl.scrollTop = 0
  marginKey = key
}

// ───────────────────────────── rail + phone bar ─────────────────────────────
function renderRail(L) {
  const ov = store.projectOverview()
  const stalled = ov.some((p) => p.stalled)
  const reviewDue = C.daysBetween(store.lastReview, TODAY) >= 7
  const cur = ui.view === 'project' ? 'projects' : ui.view
  const item = (v, label, count, key, extra = '') => `<button data-go="${v}" ${cur === v ? 'aria-current="page"' : ''}><span class="slot"></span><span>${label}</span><span class="count ${v === 'inbox' && count ? 'hot' : ''}">${extra}<span class="num">${count}</span><kbd>g ${key}</kbd></span></button>`
  const htmlStr = `<a class="brand" href="#next" aria-label="Agentic Reach runway">${C.MARK}<span>Agentic Reach</span></a>
    <div class="product">// runway</div>
    <nav class="nav" aria-label="Listen">
      ${item('inbox', 'Inbox', L.inbox.length, 'i')}${item('next', 'Nächste', L.next.length, 'n')}${item('waiting', 'Warten auf', L.waiting.length, 'w')}
      ${item('projects', 'Projekte', ov.filter((p) => p.status === 'active').length, 'p', stalled ? '<span class="ring-mark" title="Ein Projekt steckt fest"></span>' : '')}${item('someday', 'Irgendwann', L.someday.length, 'v')}
      <div class="nav-gap"></div>
      ${item('review', 'Rückblick', reviewDue ? 'fällig' : '', 'r', reviewDue ? '<span class="ring-mark"></span>' : '')}${item('all', 'Alle', '', 'a')}${item('settings', 'Einstellungen', '', ',')}
    </nav>
    <div class="rail-foot"><span>uli · Stand ${store.stand}</span><button data-act="keys"><kbd>?</kbd> Tastenkürzel</button></div>`
  if (rail.dataset.html !== htmlStr) { rail.innerHTML = htmlStr; rail.dataset.html = htmlStr }
  // phone web = Android: three equal text tabs (one line each), "···" for the rest; the yellow dot sits
  // under the selected label so it costs no width at 150 % text size
  const cur2 = ['inbox', 'next', 'waiting'].includes(cur) ? cur : 'more'
  const pb = `<nav class="tabs" aria-label="Listen">
      <button data-go="inbox" ${cur2 === 'inbox' ? 'aria-current="page"' : ''}><span class="l">Inbox <span class="n">${L.inbox.length || ''}</span></span></button>
      <button data-go="next" ${cur2 === 'next' ? 'aria-current="page"' : ''}><span class="l">Nächste</span></button>
      <button data-go="waiting" ${cur2 === 'waiting' ? 'aria-current="page"' : ''}><span class="l">Warten auf</span></button>
      <button class="more" data-act="toc" aria-label="Mehr" ${cur2 === 'more' ? 'aria-current="page"' : ''}>···</button></nav>`
  if (phonebar.dataset.html !== pb) { phonebar.innerHTML = pb; phonebar.dataset.html = pb }
}

function renderTopline() {
  const b = $('#back', toplineEl)
  const h = ui.view === 'project' ? '<button class="mclose" data-go="projects">← Projekte</button>' : ''
  if (b.innerHTML !== h) b.innerHTML = h
  $('#todaybtn')?.setAttribute('aria-pressed', String(!!ui.today))
}

// ───────────────────────────── render ─────────────────────────────
function render() {
  const L = store.lists(ui.ctx)
  const view = ui.query ? 'search' : ui.view
  // inbox zero is detected here, on every change: only the step from >= 1 to 0 plays the ink
  if (ui.lastInbox != null && ui.lastInbox > 0 && L.inbox.length === 0 && ui.view === 'inbox' && !ui.query) ui.zero.play = true
  ui.lastInbox = L.inbox.length
  // fetch the module (no WebGL context yet) while the last item or two are being clarified
  if (ui.view === 'inbox' && L.inbox.length > 0 && L.inbox.length <= 2 && !C.reducedMotion()) idle(preloadInk)
  const zeroView = view === 'inbox' && !L.inbox.length
  if (!zeroView && ui.zero.host) { releaseInk(); ui.zero.host = null }
  // 761-1180 px: the Inbox docks the clarify panel beside the list, so a/w/v/p never act unseen
  const dock = isNarrow() && !isPhone() && ui.view === 'inbox' && !ui.query && L.inbox.length > 0 && !ui.toc
  app.classList.toggle('dock', dock)

  renderRail(L)
  renderTopline()
  renderHead(view, L)
  if (zeroView) renderZero()
  else {
    if (['next', 'inbox', 'waiting', 'someday', 'all', 'project', 'search'].includes(view)) renderList(view, L)
    else if (view === 'projects') renderProjects()
    else if (view === 'review') renderReview(L)
    else if (view === 'settings') renderSettings()
  }
  bodyEl.dataset.view = view
  renderMargin(L)
  app.classList.toggle('panel-open', !dock && !!(ui.toc || ui.today || (ui.open && store.get(ui.open)) || (isPhone() && ui.view === 'inbox' && ui.sheetClarify && L.inbox.length)))
  document.title = `${ui.query ? 'Suche' : C.VIEW[ui.view] || ui.project} · runway`
}
const idle = (f) => (window.requestIdleCallback || setTimeout)(f)

// ───────────────────────────── actions ─────────────────────────────
function show(view, { project = null } = {}) {
  if (view === 'project') { ui.project = project; ui.addOpen = false }
  if (ui.view !== view || view === 'project') { ui.focus = null; ui.step = null }
  ui.view = view
  ui.open = null
  ui.toc = false
  ui.today = false
  ui.projAdd = false
  ui.query = ''
  if (searchInput.value) searchInput.value = ''
  if (view !== 'inbox') ui.sheetClarify = false
  bodyEl.classList.remove('view-anim'); void bodyEl.offsetWidth; bodyEl.classList.add('view-anim')
  if (!['settings', 'review', 'projects'].includes(view)) ui.focus = ui.focus ?? firstId(view)
  try { history.replaceState(null, '', view === 'project' ? `#projekt/${encodeURIComponent(project)}` : `#${view}`) } catch { /* sandbox */ }
  render()
  scrollEl.scrollTop = 0
}
function firstId(view) {
  const L = store.lists(ui.ctx)
  const secs = sectionsFor(view, L)
  for (const s of secs) if (s.tasks?.length) return s.tasks[0].id
  return null
}
function setCtx(c) {
  ui.ctx = c || null
  render()
}
function visibleRowIds() {
  const seen = []
  $$('.list .row[data-id]', bodyEl).forEach((el) => { if (!el.classList.contains('is-gone')) { const id = Number(el.dataset.id); if (!seen.includes(id)) seen.push(id) } })
  return seen
}
function moveFocus(d) {
  if (ui.view === 'projects') {
    const names = store.projectOverview().map((p) => 'p:' + p.name)
    const i = names.indexOf(ui.focus)
    ui.focus = names[Math.max(0, Math.min(names.length - 1, i < 0 ? 0 : i + d))]
    render(); $(`.proj.focus`)?.scrollIntoView({ block: 'nearest' }); return
  }
  const ids = visibleRowIds()
  if (!ids.length) return
  const i = ids.indexOf(ui.focus)
  ui.focus = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + d))]
  ui.step = null
  if (ui.open) ui.open = ui.focus
  render()
  $(`.row.focus`, bodyEl)?.scrollIntoView({ block: 'nearest' })
}
function focusAfter(id) {
  const ids = visibleRowIds()
  const i = ids.indexOf(id)
  const next = ids[i + 1] ?? ids[i - 1] ?? null
  if (ui.focus === id) ui.focus = next
  if (ui.open === id) ui.open = null
}
function openTask(id) {
  const t = store.get(id)
  if (!t) return
  ui.toc = false
  if (isInbox(t) && t.status === 'pending') {
    if (ui.view !== 'inbox') show('inbox')
    ui.focus = t.id; ui.open = null; ui.sheetClarify = true
  } else { ui.focus = t.id; ui.open = t.id; ui.more = false }
  render()
}

function labelFor(to) {
  const [k, a] = String(to).split(/:(.*)/s)
  return { next: a ? `Nächste · ${a}` : 'Nächste · überall', waiting: 'Warten auf', someday: 'Irgendwann', project: `Projekt · ${a}`, delete: 'gelöscht', done: 'erledigt' }[k]
}

// The signature: complete = a coral ink strike, then the line leaves; the tally gains a stroke.
async function complete(id, mode = 'done', to = null) {
  const t = store.get(id)
  if (!t || busy.has(t.id) || t.status !== 'pending') return
  busy.add(t.id)
  const els = $$(`.row[data-id="${t.id}"]`, bodyEl)
  const reduce = C.reducedMotion()
  if (els.length) {
    els.forEach((el) => {
      el.classList.add(mode === 'delete' ? 'is-deleted' : mode === 'filed' ? 'is-filed' : 'is-struck')
      const st = el.querySelector('.stamp')
      if (mode === 'filed') st.textContent = `→ ${labelFor(to)}`
      if (mode === 'delete') st.textContent = 'gelöscht'
    })
    focusAfter(t.id)
    await C.sleep(reduce ? 160 : mode === 'filed' ? 520 : 640)
    els.forEach((el) => { el.style.height = el.offsetHeight + 'px'; void el.offsetHeight; el.classList.add('is-gone') })
    await C.sleep(reduce ? 0 : 190)
  } else focusAfter(t.id)
  busy.delete(t.id)
  if (mode === 'done' || to === 'done') ui.freshTally = store.lists().doneToday.length
  if (to) {
    store.clarify(t.id, to)
    // filing is sent at once; Rückgängig sends the inverse (tags_remove what was added)
    if (mode === 'filed') notify(`→ ${labelFor(to)}`, () => { store.undoClarify(t.id); ui.focus = t.id; render() }, t.description)
  } else if (mode === 'delete') store.remove(t.id)
  else store.complete(t.id)
  for (const k of [...rowCache.keys()]) if (k.endsWith(':' + t.id)) rowCache.delete(k)
  ui.step = null
  render()
  ui.freshTally = -1
}
const clarify = (id, to) => {
  const t = store.get(id)
  if (!t) return
  if (to === 'delete') return complete(id, 'delete', 'delete')
  if (to === 'done') return complete(id, 'done', 'done')
  return complete(id, 'filed', to)
}

function capture(text) {
  const t = store.capture(text)
  if (!t) return null
  render()
  return t
}

// notice with the 6 s undo window
let noticeTimer = 0
function notify(text, onUndo, detail = '') {
  clearTimeout(noticeTimer)
  noticeEl.classList.remove('show')
  void noticeEl.offsetWidth
  noticeEl.innerHTML = `<span class="what">${C.esc(text)}${detail ? `<span style="opacity:.6"> · ${C.esc(detail)}</span>` : ''}</span>${onUndo ? '<button class="undo" data-act="undo">Rückgängig <kbd>z</kbd></button>' : ''}<span class="timer"></span>`
  noticeEl._undo = onUndo
  noticeEl.classList.add('show')
  noticeTimer = setTimeout(() => { noticeEl.classList.remove('show'); noticeEl._undo = null }, 6000)
}
function undo() {
  const f = noticeEl._undo
  if (!f) return
  f()
  noticeEl._undo = null
  noticeEl.classList.remove('show')
}
store.subscribe((why, d) => {
  if (why === 'capture') { const t = store.get(d.id); notify('In Inbox ✓', () => store.undo(t.id), t.description) }
  if (why === 'done') { const t = store.get(d.id); notify(`Erledigt: ${t.description}`, () => store.undo(t.id)) }
  if (why === 'delete') { const t = store.get(d.id); notify(`Gelöscht: ${t.description}`, () => store.undo(t.id)) }
  if (why === 'review') notify('Rückblick gespeichert')
  render()
})

// ───────────────────────────── events ─────────────────────────────
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act], [data-go], [data-ctx], [data-clarify], [data-to], [data-open], [data-project], [data-list], [data-setctx], [data-prio], [data-focus], [data-plan-todo], [data-plan-up], [data-pstatus]')
  if (e.target === app && app.classList.contains('panel-open')) { ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; render(); return }
  const row = e.target.closest('.list .row[data-id]')
  if (!a && row) { // select a row
    const id = Number(row.dataset.id)
    const t = store.get(id)
    ui.focus = id; ui.step = null
    if (isInbox(t)) { ui.open = null; ui.sheetClarify = true } else { ui.open = id; ui.more = false }
    render(); return
  }
  if (!a) return
  const d = a.dataset
  if (d.act === 'done' && row) return complete(Number(row.dataset.id))
  if (d.go) { show(d.go); return }
  if (d.ctx !== undefined) return setCtx(d.ctx || null)
  if (d.clarify) return clarifyKey(d.clarify)
  if (d.to) return clarify(currentInboxId(), d.to)
  if (d.open) return openTask(Number(d.open))
  if (d.project && !d.list) return show('project', { project: d.project })
  if (d.list) { store.setList(ui.open, d.list); return }
  if (d.setctx) { store.setContext(ui.open, d.setctx); return }
  if (d.prio) { store.setPriority(ui.open, d.prio); return }
  if (d.focus === 'capture') { captureInput.focus(); return }
  if (d.planTodo) { const p = store.projects.find((x) => x.name === ui.project); const txt = p.plan.organized[Number(d.planTodo)]; store.addToProject(p.name, txt); notify(`Nächste Aktion angelegt · ${txt}`); return }
  if (d.planUp) { const p = store.projects.find((x) => x.name === ui.project); const i = Number(d.planUp); if (i > 0) { const o = p.plan.organized; [o[i - 1], o[i]] = [o[i], o[i - 1]]; render() } return }
  if (d.pstatus) return setProjectStatus(ui.project, d.pstatus)
  switch (d.act) {
    case 'close': ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; render(); break
    case 'today': ui.today = !ui.today; ui.open = null; render(); break
    case 'clear-search': clearSearch(); break
    case 'newproj': newProjectStep(); break
    case 'projadd': openProjAdd(); break
    case 'start': store.toggleStart(ui.open); break
    case 'more': ui.more = !ui.more; render(); break
    case 'done-open': { const id = ui.open; ui.open = null; render(); complete(id); break }
    case 'delete-open': { const id = ui.open; ui.open = null; render(); complete(id, 'delete'); break }
    case 'undo': undo(); break
    case 'keys': toggleKeys(); break
    case 'toc': ui.toc = !ui.toc; render(); break
    case 'toggle-done': ui.showDone = !ui.showDone; render(); break
    case 'review-check': { const s = Number(d.step); ui.reviewChecked.has(s) ? ui.reviewChecked.delete(s) : ui.reviewChecked.add(s); render(); break }
    case 'review-done': store.recordReview(); break
    case 'add-next': openInlineAdd(); break
  }
})
const currentInboxId = () => { const L = store.lists(); const t = store.get(ui.focus); return t && isInbox(t) ? t.id : L.inbox[0]?.id }
function clarifyKey(k) {
  const id = currentInboxId()
  if (!id) return
  if (k === 'ctx') { ui.step = ui.step === 'ctx' ? null : 'ctx'; render(); return }
  if (k === 'project') { ui.step = ui.step === 'project' ? null : 'project'; render(); return }
  clarify(id, k)
}
function openInlineAdd() {
  ui.addOpen = true
  render()
  const inp = $('#inlineadd input')
  inp?.focus()
}
function newProjectStep() {
  ui.step = 'newproject'
  render()
  $('#newproj')?.focus()
}
function openProjAdd() {
  ui.projAdd = true
  render()
  $('#projadd input')?.focus()
}
function clearSearch() {
  ui.query = ''
  searchInput.value = ''
  const ts = $('#tocsearch')
  if (ts) ts.value = ''
  render()
}
const STATUS_WORD = { active: 'wieder aktiv', on_hold: 'ruht', done: 'abgeschlossen' }
function setProjectStatus(name, status) {
  const prev = store.setProjectStatus(name, status)
  if (!prev) return
  notify(`${name} ${STATUS_WORD[status]}`, () => { store.setProjectStatus(name, prev); render() })
  render()
}
// Enter in a name field: validate as the API does, create, then go on (file the item, or open the project)
function submitProjectName(input, then) {
  const res = store.createProject(input.value.trim())
  if (res.error) {
    const err = input.parentElement.querySelector('.err')
    if (err) { err.textContent = res.error; err.classList.add('bad') }
    return
  }
  then(res.name)
}

marginEl.addEventListener('input', (e) => {
  if (e.target.id === 'tocsearch') { ui.query = e.target.value.trim(); ui.open = null; render() }
})
marginEl.addEventListener('keydown', (e) => {
  if (e.target.id === 'tocsearch' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); ui.toc = false; render(); scrollEl.scrollTop = 0; window.scrollTo(0, 0) }
  if (e.target.id === 'newproj') {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.step = 'project'; marginEl.dataset.html = ''; render() }
    if (e.key === 'Enter') {
      e.preventDefault()
      const id = currentInboxId()
      submitProjectName(e.target, (name) => { e.target.blur(); ui.step = null; clarify(id, `project:${name}`) })
    }
    return
  }
  if (e.target.id === 'noteadd' && e.key === 'Enter') { store.addNote(ui.open, e.target.value); e.target.value = ''; marginEl.dataset.html = ''; render(); $('#noteadd')?.focus() }
  if (e.target.id === 'dtitle' && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault()
    if (e.key === 'Enter') store.rename(Number(e.target.dataset.id), e.target.textContent)
    e.target.contentEditable = 'false'; marginEl.dataset.html = ''; render()
  }
})
marginEl.addEventListener('change', (e) => { if (e.target.id === 'f-due') store.setDue(ui.open, e.target.value) })
marginEl.addEventListener('dblclick', (e) => { if (e.target.id === 'dtitle') editTitle() })
function editTitle() {
  const el = $('#dtitle')
  if (!el) return false
  el.contentEditable = 'true'
  el.focus()
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
  return true
}
bodyEl.addEventListener('keydown', (e) => {
  if (e.target.closest('#projadd')) {
    if (e.key === 'Escape') { e.target.blur(); ui.projAdd = false; render() }
    if (e.key === 'Enter') submitProjectName(e.target, (name) => { e.target.blur(); ui.projAdd = false; show('project', { project: name }) })
    return
  }
  if (e.target.closest('#inlineadd') && e.key === 'Enter') {
    const v = e.target.value
    if (v.trim()) { store.addToProject(ui.project, v); notify(`Nächste Aktion angelegt · ${v.trim()}`) }
    ui.addOpen = false; render()
  }
  if (e.target.closest('#inlineadd') && e.key === 'Escape') { ui.addOpen = false; render() }
})
headEl.addEventListener('keydown', (e) => {
  if (!e.target.closest('#inlineadd')) return
  if (e.key === 'Enter') { const v = e.target.value; if (v.trim()) { store.addToProject(ui.project, v); notify(`Nächste Aktion angelegt · ${v.trim()}`) } ui.addOpen = false; headEl.dataset.key = ''; render() }
  if (e.key === 'Escape') { ui.addOpen = false; headEl.dataset.key = ''; render() }
})

captureForm.addEventListener('submit', (e) => {
  e.preventDefault()
  if (capture(captureInput.value)) captureInput.value = ''
  try { localStorage.removeItem('rw-draft') } catch { /* private mode */ }
})
captureInput.addEventListener('input', () => { try { localStorage.setItem('rw-draft', captureInput.value) } catch { /* ignore */ } })
captureInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') captureInput.blur() })
try { const d = localStorage.getItem('rw-draft'); if (d) captureInput.value = d } catch { /* ignore */ }

searchInput.addEventListener('input', () => { ui.query = searchInput.value.trim(); ui.open = null; render() })
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { searchInput.value = ''; ui.query = ''; searchInput.blur(); render() }
  if (e.key === 'Enter' || e.key === 'ArrowDown') { searchInput.blur(); ui.focus = visibleRowIds()[0] ?? null; render() }
})

function toggleKeys(force) {
  const open = force ?? !keysEl.classList.contains('open')
  keysEl.classList.toggle('open', open)
  if (open && !keysEl.innerHTML) {
    const k = (...ks) => ks.map((x) => `<kbd>${x}</kbd>`).join('')
    const row = (l, ...ks) => `<div><dt>${l}</dt><dd>${k(...ks)}</dd></div>`
    keysEl.innerHTML = `<div class="keys" role="dialog" aria-modal="true" aria-label="Tastenkürzel">${eyebrow('Tastenkürzel')}<h2 class="display" style="font-size:36px;margin-top:10px">Alles mit der <em>Tastatur</em></h2>
      <div class="cols"><div><h4>Überall</h4><dl>${row('Neu: Todo · in Projekte ein Projekt · im Projekt die nächste Aktion', 'n')}${row('Suchen', '/')}${row('Rückgängig (die letzte Aktion)', 'z')}${row('Tastenkürzel', '?')}${row('Schließen', 'Esc')}</dl>
      <h4>Listen</h4><dl>${row('Inbox', 'g', 'i')}${row('Nächste', 'g', 'n')}${row('Warten auf', 'g', 'w')}${row('Projekte', 'g', 'p')}${row('Irgendwann', 'g', 'v')}${row('Rückblick', 'g', 'r')}${row('Alle', 'g', 'a')}</dl></div>
      <div><h4>Zeilen</h4><dl>${row('Nächste, vorige Zeile', 'j', 'k')}${row('Öffnen', '⏎')}${row('Abhaken', 'x')}${row('Text ändern', 'e')}${row('Starten, Pausieren', 's')}${row('Löschen', 'Entf')}${row('Kontext auf Nächste', '0', '–', '5')}</dl>
      <h4>Inbox klären</h4><dl>${row('Nächste Aktion, dann Kontext', 'a', '1–5')}${row('Warten auf', 'w')}${row('Irgendwann', 'v')}${row('Zu einem Projekt', 'p', '1–9')}${row('… neues Projekt', 'p', 'n')}${row('Gleich erledigt', 'x')}</dl></div></div></div>`
  }
}
keysEl.addEventListener('click', (e) => { if (e.target === keysEl) toggleKeys(false) })

let gPending = 0
document.addEventListener('keydown', (e) => {
  const tgt = e.target
  const typing = tgt.matches?.('input, textarea, select, [contenteditable="true"]')
  if (typing) return
  if (e.metaKey || e.ctrlKey || e.altKey) {
    if (e.altKey && ui.view === 'project' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault()
    return
  }
  const k = e.key
  if (keysEl.classList.contains('open')) { if (k === 'Escape' || k === '?') toggleKeys(false); return }
  if (gPending) {
    clearTimeout(gPending); gPending = 0
    const map = { i: 'inbox', n: 'next', w: 'waiting', p: 'projects', v: 'someday', r: 'review', a: 'all', ',': 'settings' }
    if (map[k]) { e.preventDefault(); show(map[k]) }
    return
  }
  const inInbox = ui.view === 'inbox' && !ui.query && store.lists().inbox.length > 0
  if (inInbox && ui.step === 'ctx' && /^[0-5]$/.test(k)) { e.preventDefault(); return clarify(currentInboxId(), k === '0' ? 'next' : `next:${CONTEXTS[Number(k) - 1]}`) }
  if (inInbox && ui.step === 'project' && k === 'n') { e.preventDefault(); return newProjectStep() }
  if (inInbox && ui.step === 'project' && /^[1-9]$/.test(k)) {
    const ps = store.projectOverview().filter((p) => p.status === 'active')
    const p = ps[Number(k) - 1]
    if (p) { e.preventDefault(); return clarify(currentInboxId(), `project:${p.name}`) }
  }
  switch (k) {
    case 'g': gPending = setTimeout(() => { gPending = 0 }, 900); return
    case 'n':
      e.preventDefault()
      if (ui.view === 'project') return openInlineAdd()
      if (ui.view === 'projects') return openProjAdd()
      captureInput.focus(); return
    case '/':
      e.preventDefault()
      if (isPhone()) { ui.toc = true; render(); $('#tocsearch')?.focus(); return }
      searchInput.focus(); return
    case '?': e.preventDefault(); toggleKeys(); return
    case 'j': case 'ArrowDown': e.preventDefault(); moveFocus(1); return
    case 'k': case 'ArrowUp': e.preventDefault(); moveFocus(-1); return
    case 'Enter': case 'o':
      if (ui.view === 'projects' && ui.focus?.startsWith?.('p:')) return show('project', { project: ui.focus.slice(2) })
      if (ui.focus && !inInbox) { ui.open = ui.focus; ui.more = false; render() }
      return
    case 'x': if (ui.focus && !ui.view.startsWith('proj')) { e.preventDefault(); inInbox ? clarify(currentInboxId(), 'done') : complete(ui.focus) } else if (ui.focus && ui.view === 'project') complete(ui.focus); return
    case 'Backspace': case 'Delete': if (ui.focus) { e.preventDefault(); inInbox ? clarify(currentInboxId(), 'delete') : complete(ui.focus, 'delete') } return
    case 'e': if (ui.focus) { e.preventDefault(); ui.open = ui.focus; render(); editTitle() } return
    case 's': if (ui.focus && !inInbox) { store.toggleStart(ui.focus) } return
    case 'z': undo(); return
    case 'd': if (ui.view === 'all') { ui.showDone = !ui.showDone; render() } return
    case 'Escape':
      if (ui.step) { ui.step = null; render(); return }
      if (ui.addOpen) { ui.addOpen = false; render(); return }
      if (ui.projAdd) { ui.projAdd = false; render(); return }
      if (ui.open || ui.toc || ui.today || ui.sheetClarify) { ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; render(); return }
      if (ui.query) { ui.query = ''; searchInput.value = ''; render() }
      return
  }
  if (inInbox) {
    const map = { a: 'ctx', w: 'waiting', v: 'someday', p: 'project' }
    if (map[k]) { e.preventDefault(); clarifyKey(map[k]) }
    return
  }
  if (ui.view === 'next' && /^[0-5]$/.test(k)) { setCtx(k === '0' ? null : CONTEXTS[Number(k) - 1]) }
})

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.zero.host) { releaseInk(); ui.zero.host = null; render() } })

// ───────────────────────────── boot + test hook ─────────────────────────────
function resolve(id) {
  if (id == null) return null
  const t = store.get(Number(id)) || store.get(id) || store.tasks.find((x) => x.description.toLowerCase().includes(String(id).toLowerCase()))
  return t?.id ?? null
}
window.proto = {
  show: (view) => show(view),
  filter: (context) => { if (!['next', 'all'].includes(ui.view)) show('next'); setCtx(context) },
  capture: (text) => capture(text),
  open: (id) => openTask(resolve(id)),
  complete: (id) => complete(resolve(id)),
  clarify: (id, to) => clarify(resolve(id), to),
  async signature() {
    const last = store.fileAllButOne()
    show('inbox')
    idle(preloadInk)
    await C.sleep(260)
    ui.focus = last.id
    render()
    return clarify(last.id, 'next:@computer')
  },
  store, ui, ink: inkStats, calls: store.calls,
}

const params = new URLSearchParams(location.search)
const hash = decodeURIComponent(location.hash.slice(1))
if (hash.startsWith('projekt/')) show('project', { project: hash.slice(8) })
else show(C.VIEW[hash] ? hash : 'next')
if (params.get('task')) openTask(resolve(params.get('task'))) // the Android handoff, honoured
