// runway · Orbit — Android prototype (stands in for Jetpack Compose). Same model, names, flows
// and tokens as the web; the orbit is drawn natively (orbit-canvas.js), never in a WebView.
// Start screen: Inbox with the field focused and the keyboard up. Default navigation: the pinned
// top tabs Inbox · Nächste · Warten auf plus "Mehr"; the five-item bottom bar is an option.

import {
  TASKS, PROJECTS, CONTEXTS, NOW, TODAY, LISTS, RING_NAMES, lists, ringOf, isOverdue, isDueToday, dueLabel,
  followUpDay, followUpDue, relDay, matchesContext, projectStats, contextsOf, tagParts, orbitScore, dayOf,
  addDays, dayToTw, knownContexts, layoutOrbit, isNext, projectParts,
} from './model.js'
import { icon, MARKS, placeGlyph } from './icons.js'
import { createCanvasOrbit } from './orbit-canvas.js'

const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const STATUS_TAGS = ['next', 'waiting', 'someday']
const A = {
  tasks: structuredClone(TASKS), projects: structuredClone(PROJECTS),
  view: 'inbox', from: 'inbox', nav: 'top', kb: true, edit: null, q: '',
  ctx: null, ghosts: [], review: null, wctx: 0, undo: null, scrolled: false, lastReview: null,
}
let uid = 700, clock = 12
const nowTw = () => { clock += 1; return `20261031T08${String(clock % 60).padStart(2, '0')}00Z` }
const byId = (id) => A.tasks.find((t) => t.id === Number(id) || t.uuid === id)
const L = () => lists(A.tasks)
const stats = () => projectStats(A.tasks, A.projects)
const ctxList = () => knownContexts(A.tasks)
const TABS = ['inbox', 'next', 'waiting'] // pinned by the acceptance contract
const TITLE = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', projects: 'Projekte', someday: 'Irgendwann', search: 'Suchen' }

// ---------- colours for the canvas (OrbitTheme in Compose) ----------
const VARS = { ink: '--ar-ink', disc: '--o-disc', discSide: '--oc-disc-side', base: '--oc-base', discSelected: '--o-disc-selected', discDim: '--o-disc-dim', ringLine: '--o-ring-line', hub: '--o-hub', you: '--o-you', youRim: '--oc-you-rim', attention: '--o-attention', beadWaiting: '--o-bead-waiting', beadDim: '--o-bead-dim', beadInbox: '--o-bead-inbox', live: '--o-live', liveRim: '--oc-live-rim', beadNext: '--oc-bead', beadRim: '--oc-bead-rim', focus: '--o-focus', rim: '--oc-rim' }
function colors() {
  const probe = document.createElement('i'); probe.style.display = 'none'; document.body.append(probe)
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const g = cv.getContext('2d', { willReadFrequently: true })
  const out = { dark: matchMedia('(prefers-color-scheme: dark)').matches }
  for (const [k, v] of Object.entries(VARS)) {
    probe.style.color = `var(${v})`
    g.clearRect(0, 0, 1, 1); g.fillStyle = getComputedStyle(probe).color; g.fillRect(0, 0, 1, 1)
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
    out[k] = `rgb(${r},${gg},${b})`
  }
  probe.remove()
  return out
}
const orbit = createCanvasOrbit($('#a-orbit'), {
  colors: colors(), labels: $('#oc-labels'),
  onSector: (ctx) => filter(ctx),
  onBead: (id) => openTask(id),
  onMore: (m) => openMore(m),
})
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => orbit.setColors(colors()))

// ---------- render ----------
const orbitShown = () => !!A.review || A.view === 'next'
function render() {
  const scr = $('#screen')
  scr.classList.toggle('nav-top', A.nav === 'top')
  scr.classList.toggle('nav-bottom', A.nav === 'bottom')
  scr.dataset.view = A.review ? 'review' : A.view
  const kb = A.kb && A.view === 'inbox' && !A.review
  scr.classList.toggle('kb', kb)
  const sub = A.review || !TABS.includes(A.view) // a screen reached through "Mehr" (or the review)
  // top: the pinned tabs (default), or a slim bar with a back arrow on Mehr screens
  if (A.nav === 'top' && !sub) {
    $('#a-top').innerHTML = `<span class="a-mark" aria-hidden="true">${MARKS}</span>
      ${TABS.map((v) => `<button class="a-tabt ${A.view === v ? 'on' : ''}" data-a="tab" data-v="${v}">${TITLE[v]}</button>`).join('')}
      <button class="icon-btn" data-a="menu" aria-label="Mehr">${icon('more', 22)}</button>`
  } else {
    const title = A.review ? 'Wochenrückblick' : TITLE[A.view]
    $('#a-top').innerHTML = sub
      ? `<button class="icon-btn" data-a="${A.review ? 'pg-close' : 'back'}" aria-label="${A.review ? 'Wochenrückblick schließen' : 'Zurück'}">${icon(A.review ? 'close' : 'back', 22)}</button><h1>${title}</h1><button class="icon-btn" data-a="menu" aria-label="Mehr">${icon('more', 22)}</button>`
      : `<span class="a-mark" aria-hidden="true">${MARKS}</span><h1>${title}</h1><button class="icon-btn" data-a="menu" aria-label="Mehr">${icon('more', 22)}</button>`
  }
  // chips only on Nächste: Alle + the context setting, exactly one selected, wrap instead of scroll
  $('#a-chips').innerHTML = A.view === 'next' && !A.review
    ? [`<button class="chip ${!A.ctx ? 'on' : ''}" data-a="ctx" data-ctx="">Alle</button>`, ...ctxList().map((c) => `<button class="chip ${A.ctx === c ? 'on' : ''}" data-a="ctx" data-ctx="${c}">${c}</button>`)].join('')
    : ''
  renderList()
  const l = L()
  const c = { inbox: l.inbox.length, next: l.next.length, waiting: l.waiting.length, projects: stats().filter((p) => p.stalled).length, someday: l.someday.length }
  $('#a-nav').innerHTML = LISTS.map((x) => `<button class="a-tab ${A.view === x.id ? 'on' : ''}" data-a="tab" data-v="${x.id}" aria-label="${x.label}"><span class="ind">${icon(x.id, 22)}${c[x.id] ? `<b class="${x.id === 'projects' ? 'attn' : ''}">${c[x.id]}</b>` : ''}</span>${x.label}</button>`).join('')
  $('#a-capture').hidden = A.view !== 'inbox' || !!A.review || A.edit != null
  $('#a-edit').hidden = A.edit == null
  $('#a-fab').hidden = A.view === 'inbox' || !!A.review
  $('#a-orbit').hidden = !orbitShown()
  const half = A.review ? 0 : A.scrolled ? 1 : 0
  $('#a-orbit').classList.toggle('half', !!half)
  orbit.setHalf(half)
  sync()
  renderWidget()
}
function sync() {
  if (!orbitShown()) return
  const st = stats()
  let emph = 'next', project = null, showTray = false
  if (A.review) {
    const s = A.review.steps[A.review.i]
    emph = s.kind === 'inbox' ? 'inbox' : s.kind === 'waiting' ? 'waiting' : s.kind === 'someday' || s.kind === 'done' ? 'none' : 'next'
    project = s.kind === 'project' ? s.name : null
    showTray = s.kind === 'inbox'
  }
  orbit.update(A.tasks, { ctx: A.review ? (project ? projectCtx(project) : null) : A.ctx, emph, project, showTray, ghosts: A.ghosts.filter((g) => st.find((p) => p.name === g.project)?.stalled) })
}
function projectCtx(name) {
  const t = A.tasks.find((x) => x.status === 'pending' && x.project === name && isNext(x) && contextsOf(x).length)
  const g = A.ghosts.find((x) => x.project === name)
  return t ? contextsOf(t)[0] : g?.ctx || null
}
const meta = (t) => {
  const p = []
  if (t.project) p.push(`<span>${esc(t.project.replace(/\./g, ' › '))}</span>`)
  const ctxs = contextsOf(t)
  if (ctxs.length) p.push(`<span>${ctxs.join(' ')}</span>`) // also on Nächste: with "Alle" you see where a task is done
  else if (isNext(t)) p.push('<span>ohne Kontext</span>')
  if (tagParts(t).includes('waiting')) { const f = followUpDay(t); p.push(f ? `<span class="${followUpDue(t) ? 'od' : ''}">${followUpDue(t) ? 'Nachhaken ' : 'Wiedervorlage '}${relDay(f)}</span>` : '<span>Wartet</span>') }
  const d = dueLabel(t)
  if (d) p.push(`<span class="${d.tone === 'overdue' ? 'od' : d.tone === 'today' ? 'td' : ''}">${d.text}</span>`)
  if (t.start) p.push('<span class="lv"><i class="dot-live"></i>läuft</span>')
  return p.join('')
}
function row(t, view = A.view) {
  const w = tagParts(t).includes('waiting')
  const over = isOverdue(t) || isDueToday(t) || (w && followUpDue(t))
  const inbox = view === 'inbox'
  const status = inbox ? 'Inbox' : isOverdue(t) ? 'überfällig' : isDueToday(t) ? 'fällig heute' : w ? (followUpDue(t) ? 'Nachhaken fällig' : 'Wartet') : 'Nächste'
  return `<div class="a-row ${over ? 'over' : ''} ${t.start ? 'live' : ''} ${inbox ? 'in' : ''}" data-id="${t.id}">
    <div class="a-row-bg">${icon('check', 18)} Abhaken</div>
    <div class="a-row-fg" data-a="row" data-id="${t.id}" aria-label="${esc(t.description)}, ${status}, ID ${t.uuid.slice(-8)}">
      <button class="a-chk ${w ? 'hollow' : ''}" data-a="done" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><span></span></button>
      <div class="a-txt"><div class="a-t" ${inbox ? 'data-testtag="inbox-row-text"' : ''}>${esc(t.description)}</div>${inbox ? '' : `<div class="a-m">${meta(t)}</div>`}</div>
    </div></div>`
}
const sec = (label, glyph, rows, view) => rows.length ? `<div class="a-sec">${glyph}<span>${label}</span><b>${rows.length}</b></div>${rows.map((t) => row(t, view)).join('')}` : ''
const stand = () => `<div class="a-stand">Stand ${NOW.time}</div>`
function renderList() {
  const l = L()
  let h = ''
  if (A.review) { $('#a-list').innerHTML = reviewHtml(); return }
  if (A.view === 'next') {
    const due = l.next.filter((t) => isOverdue(t) || isDueToday(t))
    const rest = l.next.filter((t) => !due.includes(t) && matchesContext(t, A.ctx)).sort((a, b) => orbitScore(b) - orbitScore(a))
    h += sec('Fällig', '<i class="ring"></i>', due) || '<div class="a-sec"><i class="ring"></i><span>Fällig</span></div><div class="a-empty sm">Nichts fällig</div>'
    RING_NAMES.forEach((n, r) => { h += `<div id="ring-${r}"></div>` + sec(n, ringIcon(r), rest.filter((t) => ringOf(t) === r)) })
  } else if (A.view === 'inbox') {
    h += stand() + (l.inbox.length ? l.inbox.map((t) => row(t, 'inbox')).join('') : '<div class="a-empty">Inbox ist leer</div>')
  } else if (A.view === 'waiting') {
    h += stand() + sec('Nachhaken', '<i class="ring"></i>', l.waiting.filter(followUpDue)) + sec('Wartet', icon('waiting', 14), l.waiting.filter((t) => !followUpDue(t)))
    if (!l.waiting.length) h += '<div class="a-empty">Du wartest auf nichts</div>'
  } else if (A.view === 'someday') {
    h += stand() + (l.someday.map((t) => row(t)).join('') || '<div class="a-empty">Nichts für irgendwann</div>')
  } else if (A.view === 'projects') {
    const st = stats().sort((a, b) => b.stalled - a.stalled || a.name.localeCompare(b.name))
    h = stand() + `<button class="review-btn" data-a="review">${icon('review', 22)}<span><b>Wochenrückblick</b><small>${A.lastReview ? 'zuletzt heute · ' : ''}${st.filter((p) => p.status === 'active').length} Projekte · Inbox ${l.inbox.length}</small></span><span class="go">→</span></button>`
    h += st.map((p) => `<button class="a-proj" data-a="project" data-name="${esc(p.name)}" style="--depth:${projectParts(p.name).depth}"><span class="pi">${icon('projects', 20)}</span><span><b>${projectParts(p.name).parent ? `<i>${esc(projectParts(p.name).parent)} › </i>` : ''}${esc(projectParts(p.name).leaf)}</b><small>${esc(p.outcome)}</small></span>${p.stalled ? '<span class="flag"><i></i>steht still</span>' : `<span class="flag">${p.next} · ${p.waiting}</span>`}</button>`).join('')
  } else if (A.view === 'search') {
    const q = A.q.trim().toLowerCase()
    const hits = q ? A.tasks.filter((t) => t.status === 'pending' && (t.description.toLowerCase().includes(q) || (t.project || '').toLowerCase().includes(q))) : []
    h = `<div class="a-search"><input id="a-q" value="${esc(A.q)}" placeholder="Suchen" aria-label="Suchen" enterkeyhint="search"></div>` + (q ? (hits.map((t) => row(t, 'search')).join('') || '<div class="a-empty">Nichts gefunden</div>') : '<div class="a-empty sm">Sucht in allen offenen Aufgaben, auch in Projekten.</div>')
  }
  $('#a-list').innerHTML = h
}
const ringIcon = (r) => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${[2.2, 4.2, 6.2].map((rr, i) => `<circle cx="7" cy="7" r="${rr}" fill="none" stroke="currentColor" stroke-width="${i === r ? 1.6 : 0.9}" stroke-opacity="${i === r ? 1 : 0.35}"/>`).join('')}<circle cx="7" cy="7" r="1" fill="currentColor"/></svg>`

// ---------- review pager: the same steps as the web (Inbox, Warten auf, Projekte, Irgendwann) ----------
function startReview() {
  const st = stats().filter((p) => p.status === 'active').sort((a, b) => b.stalled - a.stalled)
  A.review = { i: 0, steps: [{ kind: 'inbox' }, { kind: 'waiting' }, ...st.map((p) => ({ kind: 'project', name: p.name })), { kind: 'someday' }, { kind: 'done' }] }
  A.scrolled = false
  closeSheet(); render()
}
function stalledCard(name) {
  return `<div class="stalled"><b>Steht still</b><p>Kein nächster Schritt, nichts in Warten auf. Im Orbit bleibt ein leerer gelber Ring.</p>
    <input id="pg-step" placeholder="Nächster Schritt für ${esc(name)}" aria-label="Nächster Schritt">
    <div class="sh-row">${ctxList().map((c, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-a="pg-ctx" data-ctx="${c}">${c}</button>`).join('')}<button class="chip" data-a="pg-ctx" data-ctx="">ohne Kontext</button></div>
    <div class="sh-act"><button class="pill dark" data-a="pg-add" data-p="${esc(name)}">Anlegen</button><button class="pill" data-a="pstatus" data-p="${esc(name)}" data-s="on_hold">Pausieren</button><button class="pill" data-a="pstatus" data-p="${esc(name)}" data-s="done">Abschließen</button></div></div>`
}
function reviewHtml() {
  const r = A.review
  const s = r.steps[r.i]
  const l = L()
  let title = '', lead = '', body = ''
  if (s.kind === 'inbox') { title = 'Inbox leeren'; lead = l.inbox.length ? 'Tippe einen Eingang an, um ihn zu klären.' : 'Leer. Weiter zu Warten auf.'; body = l.inbox.map((t) => row(t, 'review-inbox')).join('') }
  else if (s.kind === 'waiting') { title = 'Warten auf prüfen'; lead = 'Hakst du irgendwo nach? Fällige stehen oben.'; body = l.waiting.map((t) => row(t)).join('') }
  else if (s.kind === 'project') {
    const p = stats().find((x) => x.name === s.name)
    title = esc(p.name.replace(/\./g, ' › ')); lead = esc(p.outcome)
    const open = A.tasks.filter((t) => t.status === 'pending' && t.project === p.name)
    body = (p.stalled ? stalledCard(p.name) : '') + `<div class="a-sec" style="padding-left:0">${icon('next', 14)}<span>${p.next} nächste · ${p.waiting} wartet</span></div>` + open.map((t) => row(t)).join('')
  } else if (s.kind === 'someday') { title = 'Irgendwann durchsehen'; lead = 'Ist etwas davon jetzt dran? Antippen und aktivieren.'; body = l.someday.map((t) => row(t)).join('') }
  else { const st = stats(); title = 'Fertig'; lead = `${st.filter((p) => p.status === 'active').length} Projekte gesehen, ${st.filter((p) => p.stalled).length} stehen still, Inbox ${l.inbox.length}. „Fertig“ speichert den Rückblick.` }
  return `<div class="pager">
    <div class="pg-dots">${r.steps.map((_, k) => `<i class="${k === r.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="eyebrow" style="margin-top:12px"><span class="slash">//</span> Schritt ${r.i + 1} von ${r.steps.length}</div>
    <div class="pg-t">${title}</div><div class="pg-o">${lead}</div>
    ${body}
    <div class="sh-act pg-nav"><button class="pill" data-a="pg-prev" ${r.i === 0 ? 'disabled' : ''}>Zurück</button>${s.kind !== 'done' ? '<button class="pill coral" data-a="pg-next">Weiter</button>' : '<button class="pill coral" data-a="pg-end">Fertig</button>'}</div>
  </div>`
}

// ---------- sheets ----------
function sheet(html, full = false) {
  $('#a-sheet').innerHTML = html; $('#a-sheet').hidden = false; $('#a-sheet').classList.toggle('full', full)
  $('#a-scrim').hidden = false
}
function closeSheet() { $('#a-sheet').hidden = true; $('#a-scrim').hidden = true }
function openTask(id) {
  const t = byId(id); if (!t) return
  const l = L()
  A.kb = false
  if (l.inbox.includes(t)) {
    render()
    return sheet(`<div class="grab"></div><div class="sh-t">${esc(t.description)}</div><div class="sh-m">Inbox</div>
      <button class="menu-item" data-a="clarify-open" data-id="${t.id}">Klären<small>Nächste, Warten auf, Irgendwann</small></button>
      <button class="menu-item" data-a="edit" data-id="${t.id}">Bearbeiten</button>
      <button class="menu-item" data-a="delete" data-id="${t.id}">Löschen</button>`)
  }
  if (l.someday.includes(t)) return pickSheet(t, 'Aktivieren', 'activate')
  const d = dueLabel(t)
  const ctxs = contextsOf(t)
  const lay = layoutOrbit(A.tasks)
  const secOf = lay.sectors.find((s) => ctxs.includes(s.ctx)) || null
  const w = tagParts(t).includes('waiting')
  sheet(`<div class="grab"></div>
    <div class="sh-head">${placeGlyph(secOf, w ? -1 : ringOf(t), 40, !w && !ctxs.length)}<div class="eyebrow"><span class="slash">//</span> ${w ? 'Warten auf' : `${RING_NAMES[ringOf(t)]} · ${ctxs.join(' ') || 'ohne Kontext'}`}</div></div>
    <div class="sh-t">${esc(t.description)}</div>
    <div class="sh-m">${[t.project, d?.text, w && followUpDay(t) ? 'Nachhaken ' + relDay(followUpDay(t)) : '', t.start ? 'läuft' : ''].filter(Boolean).join(' · ')}</div>
    ${w ? '' : `<div class="sh-l">Kontext</div><div class="sh-row">${ctxList().map((c) => `<button class="chip ${ctxs.includes(c) ? 'on' : ''}" data-a="set-ctx" data-id="${t.id}" data-ctx="${c}" aria-pressed="${ctxs.includes(c)}">${c}</button>`).join('')}</div>`}
    <div class="sh-act"><button class="pill dark" data-a="done" data-id="${t.id}">${icon('check', 16)} Erledigt</button>${w ? '' : `<button class="pill" data-a="start" data-id="${t.id}">${t.start ? 'Pausieren' : 'Starten'}</button>`}<button class="pill" data-a="web" data-id="${t.id}">Im Web öffnen</button></div>`)
}
/** Klären: the same choices as the web strip (context or ohne Kontext, project, Warten auf with date and person, Irgendwann, Gleich erledigt, Löschen). */
function clarifySheet(id) {
  const t = byId(id)
  const projs = A.projects.filter((p) => p.status === 'active')
  sheet(`<div class="grab"></div><div class="eyebrow"><span class="slash">//</span> Klären</div>
    <label class="sh-l" for="cl-text">Was ist der nächste sichtbare Schritt?</label>
    <input class="sh-in" id="cl-text" value="${esc(t.description)}">
    <div class="sh-l">Nächste in</div><div class="sh-row">${ctxList().map((c) => `<button class="chip" data-a="cl" data-to="next:${c}" data-id="${id}">${c}</button>`).join('')}<button class="chip" data-a="cl" data-to="next:" data-id="${id}">ohne Kontext</button></div>
    <div class="sh-l">Projekt</div><div class="sh-row" id="cl-proj"><button class="chip on" data-a="cl-proj" data-p="">kein Projekt</button>${projs.map((p) => `<button class="chip" data-a="cl-proj" data-p="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>
    <div class="sh-l">Sonst</div><div class="sh-row"><button class="chip" data-a="cl-wait" data-id="${id}">Warten auf</button><button class="chip" data-a="cl" data-to="someday" data-id="${id}">Irgendwann</button><button class="chip" data-a="cl" data-to="done" data-id="${id}">Gleich erledigt</button><button class="chip" data-a="cl" data-to="delete" data-id="${id}">Löschen</button></div>
    <div class="cl-wait" id="cl-wait" hidden><div class="sh-l">Warten auf</div>
      <div class="sh-two"><label>Nachhaken am<input type="date" id="cl-follow" value="${addDays(TODAY, 7)}"></label><label>bei wem<input id="cl-who" placeholder="optional"></label></div>
      <div class="sh-act"><button class="pill dark" data-a="cl" data-to="waiting" data-id="${id}">Übernehmen</button></div></div>`)
}
function pickSheet(t, title, act) {
  sheet(`<div class="grab"></div><div class="eyebrow"><span class="slash">//</span> Irgendwann</div><div class="sh-t">${esc(t.description)}</div>
    <div class="sh-l">${title} in</div><div class="sh-row">${ctxList().map((c) => `<button class="chip" data-a="${act}" data-to="next:${c}" data-id="${t.id}">${c}</button>`).join('')}<button class="chip" data-a="${act}" data-to="next:" data-id="${t.id}">ohne Kontext</button></div>
    <div class="sh-act"><button class="pill" data-a="done" data-id="${t.id}">${icon('check', 16)} Erledigt</button></div>`)
}
function menu() {
  const items = A.nav === 'top' ? [['projects', 'Projekte'], ['someday', 'Irgendwann'], ['review', 'Wochenrückblick'], ['search', 'Suchen']] : [['review', 'Wochenrückblick'], ['search', 'Suchen']]
  sheet(`<div class="grab"></div>${items.map(([k, l]) => `<button class="menu-item" data-a="go" data-v="${k}">${icon(k === 'review' ? 'review' : k === 'search' ? 'search' : k, 20)}<span>${l}</span></button>`).join('')}
    <div class="menu-sep"></div><div class="menu-item static">Angemeldet als uli</div><button class="menu-item">Widget hinzufügen</button><button class="menu-item">Protokoll exportieren</button><button class="menu-item">Abmelden</button>`)
}

// ---------- notice with undo (6 s hold, the outbox sends afterwards) ----------
let noticeTimer = 0
function notice(text, undo, el = $('#a-notice')) {
  A.undo = undo
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button data-a="undo">Rückgängig</button>' : ''}<i></i>`
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show')
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.classList.remove('show'); A.undo = null }, 6000)
}

// ---------- actions ----------
function show(v) {
  if (!TITLE[v]) return
  if (TABS.includes(v)) A.from = v
  A.view = v; A.review = null; A.scrolled = false; A.edit = null; A.kb = v === 'inbox'
  closeSheet(); $('#a-list').scrollTop = 0; render()
  if (v === 'inbox') setTimeout(() => $('#a-cap')?.focus({ preventScroll: true }), 0)
  if (v === 'search') setTimeout(() => $('#a-q')?.focus(), 0)
}
function filter(ctx) { A.ctx = ctx || null; if (A.view !== 'next') A.view = 'next'; A.review = null; A.scrolled = false; render() }
function openMore(m) {
  if (m.tray) return show('inbox')
  if (m.ring === 3) return show('waiting')
  A.ctx = m.hub ? null : m.ctx
  A.view = 'next'; render()
  if (m.ring >= 0) $(`#ring-${m.ring}`)?.scrollIntoView({ block: 'start' })
}
function capture(text, note) {
  const d = String(text || '').trim().replace(/\s+/g, ' ')
  if (!d) return null
  const id = ++uid
  A.tasks.push({ id, uuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, description: d.slice(0, 500), status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 0.8, entry: nowTw(), start: null, annotations: note ? [{ entry: nowTw(), description: note }] : [] })
  render()
  return id
}
async function complete(id, opts = {}) {
  const t = byId(id); if (!t || t.status !== 'pending') return
  const before = structuredClone(t)
  const pos = orbit.positionOf(t.id)
  const r = document.querySelector(`.a-row[data-id="${t.id}"]`)
  if (r) { r.style.maxHeight = r.offsetHeight + 'px'; void r.offsetHeight; r.classList.add('leaving') }
  t.status = 'completed'; t.end = nowTw(); t.start = null
  const pj = t.project && stats().find((p) => p.name === t.project)
  let ghost = null
  if (pj?.stalled && pos && isNext(before)) { ghost = { project: t.project, ctx: pos.ctx || null, ring: pos.ring >= 0 && pos.ring <= 2 ? pos.ring : 2, score: orbitScore(before) }; A.ghosts.push(ghost) }
  closeSheet()
  const flight = orbitShown() ? orbit.complete(t.id, opts) : Promise.resolve()
  notice('Erledigt', () => { Object.assign(t, before); delete t.end; if (ghost) A.ghosts = A.ghosts.filter((g) => g !== ghost); orbit.restore(); render() })
  setTimeout(render, r ? 260 : 0)
  return flight
}
function clarify(id, to, opts = {}) {
  const t = byId(id); if (!t) return
  const before = structuredClone(t)
  const text = (opts.text ?? $('#cl-text')?.value ?? '').trim()
  const proj = opts.project ?? ($('#cl-proj .chip.on')?.dataset.p || null)
  if (text && to !== 'delete') t.description = text
  let label
  if (to === 'delete') { t.status = 'deleted'; label = 'Gelöscht' }
  else if (to === 'done') { closeSheet(); return complete(id) }
  else if (to.startsWith('next')) { const c = to.split(':')[1] || ''; t.tags = c ? ['next', c] : ['next']; label = `Geklärt: Nächste ${c || 'ohne Kontext'}` }
  else if (to === 'waiting') {
    const follow = opts.follow || $('#cl-follow')?.value || addDays(TODAY, 7)
    const who = (opts.who ?? $('#cl-who')?.value ?? '').trim()
    t.tags = ['waiting']; t.scheduled = dayToTw(follow)
    if (who) t.annotations = [...(t.annotations || []), { entry: nowTw(), description: `Wartet auf: ${who}` }]
    label = `Geklärt: Warten auf${who ? ' ' + who : ''}, Nachhaken ${relDay(follow)}`
  }
  else if (to === 'someday') { t.tags = ['someday']; label = 'Geklärt: Irgendwann' }
  else return
  if (proj && to !== 'delete') t.project = proj
  closeSheet()
  notice(label, () => { Object.assign(t, before); render() })
  render()
}
function activate(id, to) {
  const t = byId(id); const before = structuredClone(t)
  const c = to.split(':')[1] || ''
  t.tags = [...t.tags.filter((x) => x !== 'someday'), 'next', ...(c ? [c] : [])]
  closeSheet(); notice(`Aktiviert: Nächste ${c || 'ohne Kontext'}`, () => { Object.assign(t, before); render() }); render()
}
// Edits name what they change (tags_add / tags_remove), never the whole tag set.
function toggleCtx(t, c) {
  if (contextsOf(t).includes(c)) t.tags = t.tags.flatMap((raw) => String(raw).split(',').map((x) => x.trim())).filter((x) => x && x !== c)
  else { t.tags = [...t.tags, c]; if (!tagParts(t).some((x) => STATUS_TAGS.includes(x))) t.tags.push('next') }
}
function startEdit(id) {
  A.edit = id; A.kb = true
  closeSheet(); render()
  const inp = $('#ed-in'); inp.value = byId(id).description; inp.focus()
}
function saveEdit() {
  const t = byId(A.edit); const v = $('#ed-in').value.trim()
  if (t && v && v !== t.description) { const before = t.description; t.description = v; notice('Gespeichert', () => { t.description = before; render() }) }
  A.edit = null; render(); $('#a-cap')?.focus({ preventScroll: true })
}

// ---------- widget (Glance: text and vector only) ----------
function renderWidget() {
  const l = L()
  const WCTX = [null, ...ctxList()]
  const due = l.next.filter((t) => isOverdue(t) || isDueToday(t))
  const ctx = WCTX[A.wctx % WCTX.length]
  const rows = [...due, ...l.next.filter((t) => !due.includes(t) && matchesContext(t, ctx)).sort((a, b) => ringOf(a) - ringOf(b) || orbitScore(b) - orbitScore(a))]
  const shown = rows.slice(0, 5)
  $('#widget').innerHTML = `<div class="w-head"><b data-w="reload">Inbox ${l.inbox.length} · fällig ${due.length}</b><button class="w-chip" data-w="chip">${ctx || 'Alle'}</button><button class="w-plus" data-w="plus" aria-label="+ Todo">+</button></div>
    ${shown.map((t) => `<div class="w-row ${isOverdue(t) || isDueToday(t) ? 'over' : ''}"><button class="w-ring" data-w="done" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><span></span></button><span class="w-t">${esc(t.description)}</span>${isOverdue(t) ? '<span class="w-mk">überfällig</span>' : isDueToday(t) ? '<span class="w-mk">heute</span>' : ''}</div>`).join('')}
    <div class="w-foot" id="w-foot">${rows.length > 5 ? `<button data-w="more">+${rows.length - 5} weitere</button>` : '<span></span>'}<span>Stand ${NOW.time}</span></div>`
}
document.getElementById('widget').addEventListener('click', (e) => {
  const b = e.target.closest('[data-w]'); if (!b) return
  const w = b.dataset.w
  const WCTX = [null, ...ctxList()]
  if (w === 'chip') { A.wctx = (A.wctx + 1) % WCTX.length; renderWidget() }
  if (w === 'plus') openOverlay()
  if (w === 'more') { A.ctx = WCTX[A.wctx]; show('next') }
  if (w === 'done') { complete(Number(b.dataset.id)); setTimeout(() => { const f = $('#w-foot'); if (f) f.innerHTML = '<span>Erledigt · <button data-w="undo">Rückgängig</button></span><span></span>' }, 300) }
  if (w === 'undo') { A.undo && A.undo(); A.undo = null }
})

// ---------- capture overlay (tile, widget +, shortcut, FAB) ----------
function openOverlay() { $('#a-overlay').hidden = false; $('#ov-notice').innerHTML = ''; $('#ov-in').value = ''; setTimeout(() => $('#ov-in').focus(), 30) }
$('#tile').addEventListener('click', openOverlay)
$('#ov-close').addEventListener('click', () => { const v = $('#ov-in').value.trim(); if (v) capture(v); $('#a-overlay').hidden = true })
$('#ov-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const id = capture($('#ov-in').value)
  if (!id) return
  $('#ov-in').value = ''
  $('#ov-notice').innerHTML = `<span>In Inbox ✓</span><button type="button" id="ov-undo">Rückgängig</button>`
  $('#ov-undo').onclick = () => { A.tasks = A.tasks.filter((t) => t.id !== id); $('#ov-notice').innerHTML = ''; render() }
})
$('#a-overlay').addEventListener('click', (e) => { if (e.target.id === 'a-overlay') $('#ov-close').click() })

// ---------- share target ----------
$('#share-btn').addEventListener('click', () => {
  const card = $('#share-card')
  capture(card.querySelector('b').textContent, card.querySelector('p').textContent)
  $('#share-btn').textContent = 'In Inbox ✓'
  notice('In Inbox ✓', null)
  setTimeout(() => { $('#share-btn').textContent = 'In Inbox' }, 2200)
})

// ---------- navigation option (side panel) ----------
document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  A.nav = b.dataset.nav
  document.querySelectorAll('[data-nav]').forEach((x) => x.classList.toggle('on', x === b))
  if (A.nav === 'top' && !TABS.includes(A.view)) A.view = A.from
  render()
}))

// ---------- events in the phone ----------
$('#screen').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return
  const id = b.dataset.id ? Number(b.dataset.id) : null
  switch (b.dataset.a) {
    case 'tab': show(b.dataset.v); break
    case 'back': show(A.from); break
    case 'go': if (b.dataset.v === 'review') startReview(); else show(b.dataset.v); break
    case 'ctx': filter(b.dataset.ctx || null); break
    case 'done': e.stopPropagation(); complete(id); break
    case 'row': if (e.target.closest('.a-chk')) break; A.kb = false; openTask(id); break
    case 'clarify-open': clarifySheet(id); break
    case 'cl': clarify(id, b.dataset.to); break
    case 'cl-wait': $('#cl-wait').hidden = false; b.classList.add('on'); $('#cl-follow').focus(); break
    case 'cl-proj': b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); break
    case 'activate': activate(id, b.dataset.to); break
    case 'delete': clarify(id, 'delete'); break
    case 'edit': startEdit(id); break
    case 'ed-cancel': A.edit = null; render(); break
    case 'ed-save': saveEdit(); break
    case 'set-ctx': { const t = byId(id); toggleCtx(t, b.dataset.ctx); render(); openTask(id); break }
    case 'start': { const t = byId(id); t.start = t.start ? null : nowTw(); render(); openTask(id); break }
    case 'web': notice(`Öffnet /next?task=${byId(id).uuid.slice(-8)} im Custom Tab`, null); closeSheet(); break
    case 'undo': A.undo && A.undo(); A.undo = null; $('#a-notice').classList.remove('show'); break
    case 'menu': menu(); break
    case 'review': startReview(); break
    case 'project': { const p = b.dataset.name; const ts = A.tasks.filter((t) => t.status === 'pending' && t.project === p); const st = stats().find((x) => x.name === p); sheet(`<div class="grab"></div><div class="eyebrow"><span class="slash">//</span> Projekt</div><div class="sh-t">${esc(p.replace(/\./g, ' › '))}</div><div class="sh-m">${esc(st.outcome)}</div>${st.stalled ? stalledCard(p) : ''}${ts.map((t) => row(t)).join('') || ''}`); break }
    case 'pg-next': A.review.i += 1; render(); break
    case 'pg-prev': A.review.i -= 1; render(); break
    case 'pg-close': A.review = null; render(); break
    case 'pg-end': A.review = null; A.lastReview = TODAY; notice('Wochenrückblick gespeichert', null); show('projects'); break // POST /gtd/review
    case 'pg-ctx': b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b)); break
    case 'pg-add': {
      const d = $('#pg-step').value.trim() || 'Beete für den Winter abdecken'
      const ctx = b.closest('.stalled').querySelector('.chip.on')?.dataset.ctx ?? ''
      const nid = ++uid
      A.tasks.push({ id: nid, uuid: `00000000-0000-4000-8000-${String(nid).padStart(12, '0')}`, description: d, status: 'pending', project: b.dataset.p, tags: ctx ? ['next', ctx] : ['next'], priority: null, due: null, urgency: 4.2, entry: nowTw(), start: null, annotations: [] })
      notice(`Nächster Schritt: ${d}`, () => { A.tasks = A.tasks.filter((t) => t.id !== nid); render() }); closeSheet(); render(); break
    }
    case 'pstatus': {
      const p = A.projects.find((x) => x.name === b.dataset.p); const prev = p.status; p.status = b.dataset.s
      notice(p.status === 'on_hold' ? `Pausiert: ${p.name}` : `Abgeschlossen: ${p.name}`, () => { p.status = prev; render() }); closeSheet(); render(); break
    }
  }
})
$('#a-scrim').addEventListener('click', closeSheet)
$('#a-fab').addEventListener('click', openOverlay)
$('#a-cap').addEventListener('focus', () => { if (!A.kb) { A.kb = true; render() } })
$('#a-capture').addEventListener('submit', (e) => {
  e.preventDefault()
  const id = capture($('#a-cap').value)
  if (!id) return
  $('#a-cap').value = ''
  notice('In Inbox ✓', () => { A.tasks = A.tasks.filter((t) => t.id !== id); render() })
})
$('#ed-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') { A.edit = null; render() } })
$('#a-list').addEventListener('input', (e) => { if (e.target.id === 'a-q') { A.q = e.target.value; const pos = e.target.selectionStart; renderList(); const n = $('#a-q'); n.focus(); n.setSelectionRange(pos, pos) } })
$('#a-list').addEventListener('scroll', () => {
  if (A.view === 'inbox' && A.kb) { A.kb = false; render() } // scrolling closes the keyboard and keeps the draft
  if (A.view !== 'next' || A.review) return
  const s = $('#a-list').scrollTop > 24
  if (s !== A.scrolled) { A.scrolled = s; $('#a-orbit').classList.toggle('half', s); orbit.setHalf(s ? 1 : 0) }
}, { passive: true })
// swipe right = check off (past 35 % of the width), vertical scroll never checks off
let sw = null
$('#a-list').addEventListener('pointerdown', (e) => { const fg = e.target.closest('.a-row-fg'); if (!fg || e.target.closest('.a-chk')) return; sw = { fg, x: e.clientX, y: e.clientY, dx: 0, on: false } })
$('#a-list').addEventListener('pointermove', (e) => {
  if (!sw) return
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y
  if (!sw.on && Math.abs(dy) > 10) { sw = null; return }
  if (dx > 8) sw.on = true
  if (sw.on) { sw.dx = Math.max(0, dx); sw.fg.style.transition = 'none'; sw.fg.style.transform = `translateX(${sw.dx}px)` }
})
$('#a-list').addEventListener('pointerup', () => {
  if (!sw) return
  const { fg, dx, on } = sw; sw = null
  fg.style.transition = ''
  if (on && dx > fg.offsetWidth * 0.35) { fg.style.transform = `translateX(${fg.offsetWidth}px)`; complete(Number(fg.dataset.id)) }
  else { fg.style.transform = '' }
})

// ---------- test hook (acts on the phone app) ----------
window.proto = {
  show(v) { show(v) },
  filter,
  capture(text) { const id = capture(text); if (id) notice('In Inbox ✓', () => { A.tasks = A.tasks.filter((t) => t.id !== id); render() }); return id },
  open(id) { openTask(byId(id)?.id ?? id) },
  complete(id) { return complete(byId(id)?.id ?? id) },
  clarify(id, to) { return clarify(byId(id)?.id ?? id, to) },
  edit(id) { startEdit(byId(id)?.id ?? id) },
  review() { startReview() },
  nav(mode) { document.querySelector(`[data-nav="${mode}"]`)?.click() },
  async signature() {
    show('next')
    const st = stats()
    const next = L().next
    const vis = (t) => { const p = orbit.positionOf(t.id); return p && !p.hidden ? p : null }
    const front = (t) => { const p = vis(t); return p ? Math.cos(p.a) * p.r : -9 }
    const target = next.filter((t) => vis(t) && t.project && st.find((p) => p.name === t.project && p.next === 1 && p.waiting === 0)).sort((a, b) => front(b) - front(a))[0] || next.filter(vis)[0]
    await complete(target.id, { hold: { at: 0.5, ms: 5000 } })
  },
}

render()
setTimeout(() => $('#a-cap')?.focus({ preventScroll: true }), 0)
