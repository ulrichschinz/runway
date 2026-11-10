// runway · Orbit — web prototype. Vanilla modules, no build. The list is the work surface; on
// Nächste and in the weekly review the Fokus-Orbit beside it explains urgency (rings), context
// (sectors, sized by how much waits there) and state (materials). Elsewhere the side column
// holds the task details, or nothing, and the list gets the width.

import {
  TASKS, PROJECTS, CONTEXTS, TODAY, NOW, LISTS, RING_NAMES, RING_HINT, NO_CTX, VOLUME,
  lists, ringOf, isOverdue, isDueToday, dueLabel, capturedLabel, followUpDay, followUpDue,
  relDay, longToday, matchesContext, projectStats, orbitSummary, contextsOf, tagParts,
  orbitScore, dayOf, shortDay, addDays, dayToTw, knownContexts, layoutOrbit, projectParts, isNext,
} from './model.js'
import { icon, sectorGlyph, hubGlyph, ringGlyph, placeGlyph, MARKS } from './icons.js'

const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
const STATUS_TAGS = ['next', 'waiting', 'someday']
const TAG_RE = /^(?:@|[A-Za-z_])[\w@.\-äöüÄÖÜß]*$/
const params = new URLSearchParams(location.search)

// ---------- state ----------
const S = {
  tasks: structuredClone(TASKS),
  projects: structuredClone(PROJECTS),
  contexts: [...CONTEXTS], // the context setting: fixes the sector order (Einstellungen → Kontexte)
  view: 'next', ctx: null, ring: null, q: '', searchOpen: false,
  cursor: null, hover: null, open: null,
  clarify: null, clarifyMode: null, clarifyProject: '', clarifyText: null,
  pick: null, // { kind: 'activate', id } | { kind: 'plan', text } : the same context choice as Klären
  project: null, projectTab: 'tasks', showDone: false,
  review: null, lastReview: null,
  theme: 'system', orbitStyle: params.has('flat') ? 'flat' : '3d', orbitOff: false,
  ghosts: [], undo: null, saved: false, depQ: '', tagErr: '',
  plans: {
    'Website-Relaunch': {
      purpose: 'Mehr passende Anfragen über die Website, ohne Kaltakquise.',
      principles: 'Klar, ruhig, ehrlich. Keine erfundenen Zahlen.',
      vision: 'Besucher verstehen in zehn Sekunden, was wir tun, und buchen ein Erstgespräch.',
      ideas: [{ id: 1, text: 'Kundenstimmen als kurze Videos' }, { id: 2, text: 'Use Cases als eigene Seiten' }, { id: 3, text: 'Startseite kürzen' }],
      organized: [{ id: 3, text: 'Startseite kürzen' }, { id: 2, text: 'Use Cases als eigene Seiten' }],
    },
  },
}
let uid = 900
let clock = 12
const nowTw = () => { clock += 1; const m = String(clock % 60).padStart(2, '0'); const h = String(8 + Math.floor(clock / 60)).padStart(2, '0'); return `20261031T${h}${m}00Z` }
const byId = (id) => S.tasks.find((t) => t.id === Number(id) || t.uuid === id)
const L = () => lists(S.tasks)
const doneToday = () => S.tasks.filter((t) => t.status === 'completed' && dayOf(t.end) === TODAY)
const stats = () => projectStats(S.tasks, S.projects)
const ctxList = () => knownContexts(S.tasks, S.contexts)
const layout = () => layoutOrbit(S.tasks, liveGhosts(), S.contexts)
const sectorOf = (ctx, lay = layout()) => lay.sectors.find((s) => s.ctx === ctx) || null
const isMobile = () => matchMedia('(max-width: 760px)').matches
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ctxLabel = (c) => (c === NO_CTX ? 'ohne Kontext' : c)

// ---------- where the side column goes ----------
// The orbit only where it helps you choose: Nächste and the weekly review. Details replace it
// (no 3D close-up). Everywhere else the list takes the width. O hides the orbit on Nächste.
function sideMode() {
  if (S.open) return 'detail'
  if ((S.view === 'next' || S.review) && !S.orbitOff) return 'orbit'
  return 'none'
}

// ---------- the orbit adapter ----------
let orbit = null
let orbitLoading = null
let orbitReady
const orbitReadyP = new Promise((r) => { orbitReady = r })
const stage = $('#stage'), labelsEl = $('#labels'), orbitCol = $('#orbit')

function isDark() { return S.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) }
function readColors() {
  const names = ['space', 'canvas', 'disc', 'discSelected', 'discDim', 'hub', 'ringLine', 'beadNext', 'beadWaiting', 'beadInbox', 'beadDim', 'attention', 'live', 'focus', 'you']
  const probe = document.createElement('i'); probe.style.display = 'none'; document.body.append(probe)
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const g = cv.getContext('2d', { willReadFrequently: true })
  const out = { dark: isDark() }
  for (const n of names) {
    probe.style.color = `var(--o-${kebab(n)})`
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = getComputedStyle(probe).color; g.fillRect(0, 0, 1, 1)
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
    out[n === 'you' ? 'youColor' : n] = `rgb(${r},${gg},${b})`
  }
  probe.remove()
  return out
}
function whereOf(m) { return m.tray ? 'Inbox' : m.hub ? 'ohne Kontext' : m.ring === 3 ? `Nachhaken · ${m.ctx}` : `${m.ctx} · ${RING_NAMES[m.ring]}` }
function tipFor(info) {
  if (info.kind === 'more') {
    const t = byId(info.id)
    return t ? `<b>${esc(t.description)}</b><small>in „+${info.more.n}“ · ${esc(whereOf(info.more))}</small>` : `<b>${info.more.n} weitere</b><small>${esc(whereOf(info.more))} · Klick zeigt sie in der Liste</small>`
  }
  const t = byId(info.id)
  if (!t) return ''
  let meta
  if (info.kind === 'inbox') meta = `Inbox · erfasst ${capturedLabel(t)}`
  else if (info.kind === 'waiting') meta = `Warten auf · Nachhaken ${relDay(followUpDay(t))}${t.project ? ' · ' + t.project : ''}`
  else { const d = dueLabel(t); meta = [info.hub ? 'ohne Kontext' : RING_NAMES[ringOf(t)], contextsOf(t).join(' '), t.start ? 'läuft' : '', d?.text].filter(Boolean).join(' · ') }
  return `<b>${esc(t.description)}</b><small>${esc(meta)}</small>`
}
async function initOrbit() {
  if (orbit || orbitLoading) return orbitLoading
  orbitLoading = (async () => {
    const flat = S.orbitStyle === 'flat' || reducedMotion()
    const common = {
      stage, labels: labelsEl, colors: readColors(), tipFor,
      onHover: (id) => linkRow(id),
      onOpen: (id) => openTask(id),
      onSector: (ctx) => setFilter(ctx),
      onMore: (m) => openMore(m),
      onLost: () => { S.orbitStyle = 'flat'; reinitOrbit() }, // WebGL context lost: same information, flat
    }
    let o = null
    if (!flat) {
      try { o = await (await import('./orbit3d.js')).createOrbit3D(common) } catch (e) { o = null }
    }
    if (!o) o = (await import('./orbit2d.js')).createOrbit2D(common)
    orbit = o
    orbitCol.classList.toggle('flat', orbit.kind === '2d')
    syncOrbit()
    renderSuggest()
    frameOrbit(0)
    orbitCol.classList.add('ready')
    orbitReady()
  })()
  await orbitLoading
  orbitLoading = null
}
function reinitOrbit() {
  if (orbit) { orbit.dispose(); orbit = null }
  orbitCol.classList.remove('ready')
  if (sideMode() === 'orbit') initOrbit()
}
function liveGhosts() {
  const st = stats()
  return S.ghosts.filter((g) => st.find((p) => p.name === g.project)?.stalled)
}
function orbitEmph() {
  if (S.review) { const st = S.review.steps[S.review.i]; return st.kind === 'inbox' ? 'inbox' : st.kind === 'waiting' ? 'waiting' : st.kind === 'someday' || st.kind === 'done' ? 'none' : 'next' }
  return 'next'
}
function orbitProject() {
  if (S.review) { const st = S.review.steps[S.review.i]; return st.kind === 'project' ? st.name : null }
  return null
}
function syncOrbit() {
  if (!orbit) return
  orbit.update(S.tasks, { ctx: S.ctx, emph: orbitEmph(), project: orbitProject(), focusId: S.cursor, hoverId: S.hover, ghosts: liveGhosts(), order: S.contexts })
  $('#orbit-desc').textContent = describeOrbit()
}
function frameOrbit(dur = 700) {
  if (!orbit) return
  const proj = orbitProject()
  if (proj) {
    const ids = S.tasks.filter((t) => t.status === 'pending' && t.project === proj && (isNext(t) || tagParts(t).includes('waiting'))).map((t) => t.id)
    return orbit.framePoints(ids, liveGhosts().filter((g) => g.project === proj), 1100)
  }
  if (S.review) {
    const kind = S.review.steps[S.review.i].kind
    return orbit.frame(null, 1100) // the whole disc: a clarified bead's flight from the tray stays in view
  }
  if (S.ctx && S.ctx !== NO_CTX) return orbit.frame({ kind: 'sector', ctx: S.ctx }, dur)
  orbit.frame(null, dur)
}
function describeOrbit() {
  const lay = layout()
  const inner = lay.lists.next.filter((t) => ringOf(t) === 0).map((t) => t.description)
  return `Fokus-Orbit: ${lay.lists.next.length} nächste Aktionen in ${lay.sectors.map((s) => `${s.ctx} (${s.count})`).join(', ')}${lay.hubCount ? `, ${lay.hubCount} ohne Kontext` : ''}. Im inneren Ring: ${inner.join(', ') || 'nichts'}. ${lay.waitingCount} warten, ${lay.lists.inbox.length} in der Inbox.`
}

// ---------- rail ----------
function counts() {
  const l = L()
  return { inbox: l.inbox.length, next: l.next.length, waiting: l.waiting.length, projects: S.projects.filter((p) => p.status === 'active').length, someday: l.someday.length }
}
function renderRail() {
  const c = counts()
  const st = stats()
  const stalled = st.filter((p) => p.stalled).length
  const lay = layout()
  const nextAll = lay.lists.next
  const over = nextAll.filter(isOverdue).length
  const noCtx = nextAll.filter((t) => !contextsOf(t).length).length
  $('#rail').innerHTML = `
    <a class="brand" href="#" aria-label="runway by Agentic Reach">${MARKS}<span>runway</span><small>by Agentic Reach</small></a>
    <nav class="nav">
      ${LISTS.map((l) => `<button class="nav-item ${S.view === l.id && !S.review ? 'on' : ''}" data-view="${l.id}" aria-current="${S.view === l.id ? 'page' : 'false'}">
        ${icon(l.id, 18)}<span>${l.label}</span>
        <span class="count">${l.id === 'next' && over ? `<i class="dot-attn" title="${over} überfällig"></i>` : ''}${l.id === 'projects' && stalled ? `<i class="dot-attn" title="${stalled} steht still"></i>` : ''}${c[l.id]}</span><kbd>${l.key}</kbd></button>`).join('')}
    </nav>
    <div class="rail-h"><span class="slash">//</span> Kontexte</div>
    <nav class="ctx-nav">
      ${ctxList().map((ctx) => {
        const n = nextAll.filter((t) => contextsOf(t).includes(ctx)).length
        return `<button class="ctx-item ${S.ctx === ctx ? 'on' : ''} ${n ? '' : 'idle'}" data-ctx="${ctx}" aria-pressed="${S.ctx === ctx}">${sectorGlyph(sectorOf(ctx, lay))}<span>${ctx}</span><span class="count">${n}</span></button>`
      }).join('')}
      ${noCtx ? `<button class="ctx-item ${S.ctx === NO_CTX ? 'on' : ''}" data-ctx="${NO_CTX}" aria-pressed="${S.ctx === NO_CTX}">${hubGlyph()}<span>ohne Kontext</span><span class="count">${noCtx}</span></button>` : ''}
    </nav>
    <div class="rail-h"><span class="slash">//</span> Mehr</div>
    <nav class="nav">
      <button class="nav-item ${S.review ? 'on' : ''}" data-act="review">${icon('review', 18)}<span>Wochenrückblick</span><span class="count small">${S.lastReview ? 'heute' : ''}</span><kbd>R</kbd></button>
      <button class="nav-item ${S.view === 'all' ? 'on' : ''}" data-view="all">${icon('all', 18)}<span>Alle Aufgaben</span><span class="count"></span><kbd>A</kbd></button>
      <button class="nav-item ${S.view === 'settings' ? 'on' : ''}" data-view="settings">${icon('settings', 18)}<span>Einstellungen</span><span class="count"></span><kbd>,</kbd></button>
    </nav>
    <div class="rail-foot">
      <button class="palette-btn" data-act="palette">${icon('command', 16)}<span>Befehle</span><kbd>⌘K</kbd></button>
      <div class="who"><span class="avatar">U</span><span>uli</span><span class="stand">Stand ${NOW.time}</span></div>
    </div>`
}

// ---------- tab bar (phone) ----------
function renderTabbar() {
  const c = counts()
  $('#tabbar').innerHTML = LISTS.map((l) => `<button class="tab ${S.view === l.id ? 'on' : ''}" data-view="${l.id}" aria-current="${S.view === l.id ? 'page' : 'false'}">
    <span class="tab-ic">${icon(l.id, 22)}${c[l.id] && l.id !== 'projects' ? `<b>${c[l.id]}</b>` : ''}</span><span class="tab-l">${l.label}</span></button>`).join('')
}

// ---------- header ----------
const TITLES = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf', projects: 'Projekte', someday: 'Irgendwann', all: 'Alle Aufgaben', settings: 'Einstellungen' }
function summaryFor(view) {
  const l = L()
  const n = (k, one = 'Ein') => (k === 1 ? one : ['Nichts', 'Ein', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn'][k] || String(k))
  if (view === 'next') { const s = orbitSummary(S.tasks, S.ctx); return `<em>${s.accent}</em>${esc(s.text)}` }
  if (view === 'inbox') return l.inbox.length ? `<em>${n(l.inbox.length)}</em> ${l.inbox.length === 1 ? 'Eingang wartet' : 'Eingänge warten'} aufs Klären.` : '<em>Leer.</em> Alles ist an seinem Platz.'
  if (view === 'waiting') { const d = l.waiting.filter(followUpDue).length; const w = l.waiting.length; return `<em>${n(w)}</em> ${w === 1 ? 'Ding liegt' : 'Dinge liegen'} bei anderen${d ? `, ${d} zum Nachhaken` : ''}.` }
  if (view === 'projects') { const st = stats(); const s = st.filter((p) => p.stalled).length; return s ? `<em>${n(s)}</em> ${s === 1 ? 'Projekt steht' : 'Projekte stehen'} still, ${s === 1 ? 'es braucht' : 'sie brauchen'} einen nächsten Schritt.` : `<em>${n(st.filter((p) => p.status === 'active').length)}</em> aktive Projekte, jedes hat einen nächsten Schritt.` }
  if (view === 'someday') { const k = l.someday.length; return `<em>${n(k, 'Eine')}</em> ${k === 1 ? 'Idee liegt' : 'Ideen liegen'} außerhalb der Umlaufbahn.` }
  if (view === 'all') return 'Alles Offene, nach Dringlichkeit.'
  return 'Konto, Darstellung, Kontexte und Verbindungen.'
}
function renderHead() {
  if (S.review) { $('#head').innerHTML = ''; return }
  const p = S.view === 'projects' && S.project ? S.projects.find((x) => x.name === S.project) : null
  const title = p ? esc(projectParts(p.name).leaf) : TITLES[S.view]
  const eyebrow = p ? `<button class="back" data-act="back">${icon('back', 14)} Projekte${projectParts(p.name).parent ? ' › ' + esc(projectParts(p.name).parent) : ''}</button>` : `<span class="slash">//</span> ${longToday()}`
  const orbitBtn = S.view === 'next' && S.orbitOff ? `<button class="pill-btn ghost" data-act="orbit-toggle" aria-label="Fokus-Orbit zeigen">${icon('orbit', 15)}Orbit<kbd>O</kbd></button>` : ''
  $('#head').innerHTML = `
    <div class="eyebrow">${eyebrow}</div>
    <div class="title-row">
      <span class="head-mark" aria-hidden="true">${MARKS}</span>
      <h1>${title}</h1>
      <div class="head-tools">
        ${orbitBtn}
        <label class="search ${S.searchOpen || S.q ? 'open' : ''}">${icon('search', 16)}<input id="search" placeholder="Suchen" value="${esc(S.q)}" aria-label="Suchen"><kbd>/</kbd></label>
        <button class="pill-btn ghost pal-open" data-act="palette" aria-label="Befehle öffnen">${icon('command', 15)}<kbd>⌘K</kbd></button>
      </div>
    </div>
    <p class="summary">${p ? `<span class="outcome">${esc(p.outcome)}</span>` : summaryFor(S.view)}</p>`
}
// Phone: the same context choice as Android's chips (Alle + contexts), wrapping, never scrolling.
function renderCtxbar() {
  const el = $('#ctxbar')
  const show = (S.view === 'next' || S.view === 'all') && !S.review
  el.hidden = !show
  if (!show) { el.innerHTML = ''; return }
  const lay = layout()
  const noCtx = lay.lists.next.some((t) => !contextsOf(t).length)
  el.innerHTML = [`<button class="chip ${!S.ctx ? 'on' : ''}" data-act="set-ctx" data-ctx="">Alle</button>`,
    ...ctxList().filter((c) => lay.lists.next.some((t) => contextsOf(t).includes(c)) || S.ctx === c).map((c) => `<button class="chip ${S.ctx === c ? 'on' : ''}" data-act="set-ctx" data-ctx="${c}">${sectorGlyph(sectorOf(c, lay), 12)}${c}</button>`),
    ...(noCtx ? [`<button class="chip ${S.ctx === NO_CTX ? 'on' : ''}" data-act="set-ctx" data-ctx="${NO_CTX}">${hubGlyph(12)}ohne Kontext</button>`] : [])].join('')
}
function renderFilterbar() {
  const chips = []
  if ((S.ctx || S.ring != null) && (S.view === 'next' || S.view === 'all')) {
    const lay = layout()
    const glyph = S.ctx === NO_CTX ? hubGlyph(12) : S.ctx ? sectorGlyph(sectorOf(S.ctx, lay), 12) : ''
    const label = [S.ctx ? ctxLabel(S.ctx) : '', S.ring != null ? RING_NAMES[S.ring] : ''].filter(Boolean).join(' · ')
    chips.push(`<button class="chip on" data-act="clear-ctx">${glyph}${S.ring != null ? ringGlyph(S.ring, 12) : ''}${label}<span class="x">${icon('close', 12)}</span></button><span class="fb-note">${S.ctx && S.ctx !== NO_CTX ? 'dazu alles ohne Kontext · ' : ''}Fällig bleibt sichtbar</span>`)
  }
  if (S.q) chips.push(`<button class="chip on" data-act="clear-q">„${esc(S.q)}“<span class="x">${icon('close', 12)}</span></button>`)
  $('#filterbar').innerHTML = chips.join('')
  $('#filterbar').classList.toggle('show', chips.length > 0)
}

// ---------- rows ----------
function matchesQ(t) {
  if (!S.q) return true
  const q = S.q.toLowerCase()
  return t.description.toLowerCase().includes(q) || (t.project || '').toLowerCase().includes(q) || t.tags.join(' ').toLowerCase().includes(q)
}
function metaFor(t, view) {
  const parts = []
  if (view === 'inbox') {
    parts.push(`<span>erfasst ${capturedLabel(t)}</span>`)
    if (t.annotations?.length) parts.push(`<span class="m-note">${icon('note', 12)} Notiz</span>`)
    return parts.join('')
  }
  if (t.start) parts.push('<span class="m-live"><i class="dot-live"></i>läuft</span>') // phone: the word moves into the meta line
  if (t.project) parts.push(`<span class="m-proj">${esc(t.project.replace(/\./g, ' › '))}</span>`)
  const ctxs = contextsOf(t)
  if (ctxs.length) parts.push(`<span class="m-ctx">${ctxs.join(' ')}</span>`)
  else if (isNext(t)) parts.push('<span class="m-ctx soft">ohne Kontext</span>')
  if (tagParts(t).includes('waiting')) {
    const f = followUpDay(t)
    parts.push(f ? `<span class="m-due ${followUpDue(t) ? 'overdue' : ''}">${followUpDue(t) ? 'Nachhaken ' : 'Wiedervorlage '}${relDay(f)}</span>` : `<span>wartet seit ${shortDay(dayOf(t.entry))}</span>`)
  }
  const d = dueLabel(t)
  if (d) parts.push(`<span class="m-due ${d.tone}">${d.text}</span>`)
  if (t.recur) parts.push(`<span>↺ ${esc(t.recur)}</span>`)
  if (t.annotations?.length) parts.push(`<span class="m-note">${icon('note', 12)}${t.annotations.length}</span>`)
  return parts.join('')
}
function rowHtml(t, view) {
  const waiting = tagParts(t).includes('waiting')
  const over = isOverdue(t) || isDueToday(t) || (waiting && followUpDue(t))
  const done = t.status === 'completed'
  const cls = ['row', S.cursor === t.id ? 'sel' : '', S.hover === t.id ? 'linked' : '', over && !done ? 'over' : '', t.start ? 'live' : '', done ? 'done' : '', S.open === t.id ? 'opened' : ''].join(' ')
  const side = []
  if (t.start) side.push('<span class="live-tag"><i class="dot-live"></i>läuft</span>')
  if (t.priority === 'H') side.push('<span class="prio" title="Priorität hoch">H</span>')
  if (view === 'inbox') side.push(`<button class="pill-btn sm clarify-btn" data-act="clarify" data-id="${t.id}">Klären <kbd>C</kbd></button>`)
  if (view === 'someday') side.push(`<button class="pill-btn sm" data-act="activate" data-id="${t.id}">Aktivieren</button>`)
  const actions = view === 'inbox' || done ? '' : `<span class="row-actions"><button class="iconbtn" data-act="start" data-id="${t.id}" aria-label="${t.start ? 'Pausieren' : 'Starten'}" title="${t.start ? 'Pausieren' : 'Starten'} (S)">${icon(t.start ? 'pause' : 'play', 15)}</button></span>`
  const status = view === 'inbox' ? 'Inbox' : isOverdue(t) ? 'überfällig' : isDueToday(t) ? 'fällig heute' : waiting ? (followUpDue(t) ? 'Nachhaken fällig' : 'Wartet') : 'Nächste'
  const pick = S.pick?.kind === 'activate' && S.pick.id === t.id ? ctxPickHtml('Aktivieren in', 'pick') : ''
  return `<div class="${cls}" data-id="${t.id}" role="listitem" aria-label="${esc(t.description)}, ${status}, ID ${t.uuid.slice(-8)}">
    <button class="chk ${waiting ? 'hollow' : ''}" data-act="complete" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><span>${icon('check', 13)}</span></button>
    <div class="row-main" data-act="open" data-id="${t.id}">
      <div class="row-title">${esc(t.description)}</div>
      <div class="row-meta">${metaFor(t, view)}</div>
    </div>
    <div class="row-side">${side.join('')}${actions}</div>
  </div>${S.clarify === t.id ? clarifyHtml(t) : ''}${pick}`
}
/** The one context choice (clarify, activate, plan action, stalled project): keys 1–9, 0 = ohne Kontext. */
function ctxChips(act, extra = '') {
  return ctxList().slice(0, 9).map((c, i) => `<button class="chip" data-act="${act}" data-to="next:${c}" ${extra}>${sectorGlyph(sectorOf(c), 12)}${c}<kbd>${i + 1}</kbd></button>`).join('') +
    `<button class="chip" data-act="${act}" data-to="next:" ${extra}>${hubGlyph(12)}ohne Kontext<kbd>0</kbd></button>`
}
function ctxPickHtml(label, act) {
  return `<div class="clarify pick"><div class="cl-row"><span class="cl-l">${label}</span>${ctxChips(act)}<span class="cl-hint">Esc schließt</span></div></div>`
}
function clarifyHtml(t) {
  const projs = S.projects.filter((p) => p.status === 'active')
  const text = S.clarifyText ?? t.description
  return `<div class="clarify" data-id="${t.id}">
    <label class="cl-q"><span class="eyebrow"><span class="slash">//</span> Klären</span><span>Was ist der nächste sichtbare Schritt?</span></label>
    <input class="cl-text" id="cl-text" value="${esc(text)}" aria-label="Beschreibung, als nächsten Schritt formuliert">
    <div class="cl-row"><span class="cl-l">Nächste in</span>${ctxChips('cl', `data-id="${t.id}"`)}</div>
    <div class="cl-row"><span class="cl-l">Sonst</span>
      <button class="chip ${S.clarifyMode === 'waiting' ? 'on' : ''}" data-act="cl-wait" data-id="${t.id}">${icon('waiting', 13)}Warten auf<kbd>W</kbd></button>
      <button class="chip" data-act="cl" data-to="someday" data-id="${t.id}">${icon('someday', 13)}Irgendwann<kbd>I</kbd></button>
      <button class="chip" data-act="cl" data-to="done" data-id="${t.id}">${icon('check', 13)}Gleich erledigt<kbd>X</kbd></button>
      <button class="chip" data-act="cl" data-to="delete" data-id="${t.id}">${icon('trash', 13)}Löschen<kbd>⌫</kbd></button>
    </div>
    ${S.clarifyMode === 'waiting' ? `<form class="cl-row cl-wait" data-id="${t.id}"><span class="cl-l">Warten auf</span>
      <label class="df">Nachhaken am<input type="date" name="follow" value="${addDays(TODAY, 7)}"></label>
      <label class="df">bei wem<input name="who" placeholder="optional"></label>
      <button class="pill-btn sm dark" type="submit">Übernehmen <kbd>↵</kbd></button></form>` : ''}
    <div class="cl-row"><span class="cl-l">Projekt</span>
      <select id="cl-project" aria-label="Projekt (optional)"><option value="">kein Projekt</option>${projs.map((p) => `<option ${S.clarifyProject === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <span class="cl-hint">optional · Esc schließt</span>
    </div>
  </div>`
}
function section(key, label, glyph, rows, view, extra = '') {
  if (!rows.length) return ''
  return `<div class="sec sec-${key}">${glyph}<span>${label}</span><b>${rows.length}</b>${extra}</div>${rows.map((t) => rowHtml(t, view)).join('')}`
}
const emptyState = (title, sub) => `<div class="empty"><div class="empty-orb" aria-hidden="true"><i></i><i></i><i></i></div><div class="empty-t">${title}</div><div class="empty-s">${sub}</div></div>`

function renderList() {
  const el = $('#list')
  let html = ''
  let order = []
  const l = L()
  const take = (rows) => { order.push(...rows.map((t) => t.id)); return rows }
  if (S.review) { html = reviewHtml(); order = S.review.order || [] }
  else if (S.view === 'next') {
    const fällig = l.next.filter((t) => (isOverdue(t) || isDueToday(t)) && matchesQ(t))
    const rest = l.next.filter((t) => !fällig.includes(t) && matchesContext(t, S.ctx) && matchesQ(t)).sort((a, b) => orbitScore(b) - orbitScore(a))
    html += section('due', 'Fällig', `<i class="sec-attn"></i>`, take(fällig), 'next')
    ;[0, 1, 2].forEach((r) => { if (S.ring == null || S.ring === r) html += section('r' + r, RING_NAMES[r], ringGlyph(r), take(rest.filter((t) => ringOf(t) === r)), 'next', `<span class="sec-hint">${RING_HINT[r]}</span>`) })
    if (!html) html = emptyState('Keine nächsten Aktionen', S.ctx ? `Nichts in ${ctxLabel(S.ctx)}. Klick auf die Mitte des Orbits zeigt alle.` : 'Kläre die Inbox, dann füllt sich der Orbit.')
  } else if (S.view === 'inbox') {
    const rows = take(l.inbox.filter(matchesQ))
    html = rows.length ? `<div class="sec">${icon('inbox', 14)}<span>Neueste zuerst</span><b>${rows.length}</b><span class="sec-hint">C klärt · X erledigt in zwei Minuten</span></div>` + rows.map((t) => rowHtml(t, 'inbox')).join('') : emptyState('Inbox ist leer', 'Alles hat einen Platz.')
  } else if (S.view === 'waiting') {
    const rows = l.waiting.filter(matchesQ)
    html = section('fu', 'Nachhaken fällig', '<i class="sec-attn"></i>', take(rows.filter(followUpDue)), 'waiting') + section('w', 'Wartet', icon('waiting', 14), take(rows.filter((t) => !followUpDue(t))), 'waiting')
    if (!html) html = emptyState('Du wartest auf nichts', 'Was du delegierst, landet hier.')
  } else if (S.view === 'someday') {
    const rows = take(l.someday.filter(matchesQ))
    html = rows.length ? `<div class="sec">${icon('someday', 14)}<span>Außerhalb der Umlaufbahn</span><b>${rows.length}</b></div>` + rows.map((t) => rowHtml(t, 'someday')).join('') : emptyState('Nichts für irgendwann', 'Ideen landen hier, wenn du sie beim Klären parkst.')
  } else if (S.view === 'all') {
    const open = S.tasks.filter((t) => t.status === 'pending' && matchesQ(t) && matchesContext(t, S.ctx)).sort((a, b) => b.urgency - a.urgency)
    html = `<div class="sec">${icon('all', 14)}<span>Offen</span><b>${open.length}</b><button class="toggle ${S.showDone ? 'on' : ''}" data-act="toggle-done" aria-pressed="${S.showDone}"><i></i>Erledigte zeigen</button></div>` + take(open).map((t) => rowHtml(t, 'all')).join('')
    if (S.showDone) { const d = L().done.filter(matchesQ); html += section('done', 'Erledigt', icon('check', 14), d, 'all') }
  } else if (S.view === 'projects') {
    html = S.project ? projectDetailHtml(S.project, take) : projectsHtml()
  } else if (S.view === 'settings') html = settingsHtml()
  el.innerHTML = html
  S.order = order
  el.dataset.view = S.review ? 'review' : S.view
}

// ---------- projects ----------
const STATUS_DE = { active: 'aktiv', on_hold: 'pausiert', done: 'erledigt', someday: 'irgendwann' }
function projName(name) {
  const p = projectParts(name)
  return p.parent ? `<span class="pp">${esc(p.parent)} › </span>${esc(p.leaf)}` : esc(name)
}
function projectRow(p) {
  return `<button class="proj ${p.stalled ? 'stalled' : ''}" data-act="project" data-name="${esc(p.name)}" style="--depth:${projectParts(p.name).depth}">
    <span class="proj-ic">${icon('projects', 18)}</span>
    <span class="proj-main"><span class="proj-name">${projName(p.name)}</span><span class="proj-out">${esc(p.outcome)}</span></span>
    <span class="proj-meta">${p.stalled ? '<span class="flag"><i class="dot-attn"></i>steht still</span>' : ''}<span class="mono">${p.next} nächste · ${p.waiting} wartet</span><span class="status s-${p.status}">${STATUS_DE[p.status] || p.status}</span></span>
  </button>`
}
function projectsHtml() {
  const st = stats().sort((a, b) => a.name.localeCompare(b.name))
  const stalled = st.filter((p) => p.stalled)
  const active = st.filter((p) => p.status === 'active' && !p.stalled)
  const other = st.filter((p) => p.status !== 'active')
  let h = ''
  if (stalled.length) h += `<div class="sec sec-due"><i class="sec-attn"></i><span>Braucht einen nächsten Schritt</span><b>${stalled.length}</b></div>` + stalled.map(projectRow).join('')
  h += `<div class="sec">${icon('projects', 14)}<span>Aktiv</span><b>${active.length}</b><button class="pill-btn sm ghost" data-act="new-project">${icon('plus', 13)} Projekt</button></div>` + active.map(projectRow).join('')
  if (other.length) h += `<div class="sec">${icon('someday', 14)}<span>Pausiert und irgendwann</span><b>${other.length}</b></div>` + other.map(projectRow).join('')
  return h
}
function projectDetailHtml(name, take) {
  const p = stats().find((x) => x.name === name)
  if (!p) return ''
  const open = S.tasks.filter((t) => t.status === 'pending' && t.project === name)
  const nx = open.filter(isNext)
  const wt = open.filter((t) => tagParts(t).includes('waiting'))
  const sd = open.filter((t) => tagParts(t).includes('someday'))
  const loose = open.filter((t) => !nx.includes(t) && !wt.includes(t) && !sd.includes(t))
  const tabs = `<div class="tabs"><button class="${S.projectTab === 'tasks' ? 'on' : ''}" data-act="ptab" data-tab="tasks">Aufgaben</button><button class="${S.projectTab === 'plan' ? 'on' : ''}" data-act="ptab" data-tab="plan">Plan</button>
    <span class="status-seg">${['active', 'on_hold', 'done'].map((s) => `<button class="${p.status === s ? 'on' : ''}" data-act="pstatus" data-name="${esc(name)}" data-s="${s}">${STATUS_DE[s]}</button>`).join('')}</span></div>`
  if (S.projectTab === 'plan') return tabs + planHtml(name)
  let h = tabs
  if (p.stalled) h += stalledCard(name)
  h += section('n', 'Nächste', icon('next', 14), take(nx), 'next') + section('w', 'Warten auf', icon('waiting', 14), take(wt), 'waiting') + section('s', 'Irgendwann', icon('someday', 14), take(sd), 'someday') + section('l', 'Ohne Liste', icon('all', 14), take(loose), 'all')
  if (!p.stalled) h += addStepHtml(name, 'Weiterer Schritt')
  return h
}
/** A stalled project: add a next step, or say honestly that it rests (Pausieren) or is done. */
function stalledCard(name) {
  return `<div class="stalled-card"><div class="sc-h"><i class="ring-attn"></i><div><b>Steht still</b><span>Aktiv, aber ohne nächsten Schritt und ohne Warten auf. Im Orbit bleibt ein leerer gelber Ring.</span></div></div>
    ${addStepHtml(name, 'Nächster Schritt')}
    <div class="sc-alt"><span class="muted">Oder:</span><button class="pill-btn sm ghost" data-act="pstatus" data-name="${esc(name)}" data-s="on_hold">${icon('pause', 13)} Pausieren</button><button class="pill-btn sm ghost" data-act="pstatus" data-name="${esc(name)}" data-s="done">${icon('check', 13)} Abschließen</button></div></div>`
}
function addStepHtml(name, label) {
  return `<form class="addstep" data-project="${esc(name)}"><input name="d" placeholder="${label} für ${esc(name)}" aria-label="${label}"><span class="as-ctx">${ctxList().slice(0, 9).map((c, i) => `<button type="button" class="chip sm ${i === 0 ? 'on' : ''}" data-act="as-ctx" data-ctx="${c}">${c}</button>`).join('')}<button type="button" class="chip sm" data-act="as-ctx" data-ctx="">ohne Kontext</button></span><button class="pill-btn dark sm" type="submit">Anlegen</button></form>`
}
function planHtml(name) {
  const pl = S.plans[name] || (S.plans[name] = { purpose: '', principles: '', vision: '', ideas: [], organized: [] })
  const step = (n, t, body) => `<section class="plan-step"><div class="ps-n">${n}</div><div class="ps-b"><h3>${t}</h3>${body}</div></section>`
  return `<div class="plan" data-project="${esc(name)}">
    ${step('01', 'Warum', `<label>Zweck<textarea data-pl="purpose" rows="2" placeholder="Wozu machst du das?">${esc(pl.purpose)}</textarea></label><label>Prinzipien<textarea data-pl="principles" rows="2" placeholder="Was ist dir dabei wichtig?">${esc(pl.principles)}</textarea></label>`)}
    ${step('02', 'Vision', `<label>Wie sieht es aus, wenn es fertig ist?<textarea data-pl="vision" rows="2">${esc(pl.vision)}</textarea></label>`)}
    ${step('03', 'Ideen', `<ul class="ideas">${pl.ideas.map((i) => `<li>${esc(i.text)}<button class="iconbtn sm" data-act="idea-del" data-iid="${i.id}" aria-label="Idee entfernen">${icon('close', 12)}</button></li>`).join('') || '<li class="muted">Noch keine Ideen. Einfach losschreiben.</li>'}</ul><input class="plan-in" data-act-enter="idea" placeholder="Neue Idee, Enter fügt hinzu">`)}
    ${step('04', 'Ordnen', `<ol class="ordered">${pl.organized.map((i, k) => `<li><span class="mono">${String(k + 1).padStart(2, '0')}</span>${esc(i.text)}<span><button class="iconbtn sm" data-act="ord-up" data-k="${k}" aria-label="Nach oben">↑</button><button class="iconbtn sm" data-act="ord-down" data-k="${k}" aria-label="Nach unten">↓</button></span></li>`).join('')}</ol><button class="pill-btn sm ghost" data-act="ord-take">Aus den Ideen übernehmen</button>`)}
    ${step('05', 'Aktionen', `<ul class="ordered acts">${pl.organized.map((i) => `<li>${esc(i.text)}<button class="pill-btn sm" data-act="plan-pick" data-text="${esc(i.text)}">→ Nächste</button></li>${S.pick?.kind === 'plan' && S.pick.text === i.text ? `<li class="pick-li">${ctxPickHtml('Nächste in', 'pick')}</li>` : ''}`).join('') || '<li class="muted">Erst ordnen, dann werden daraus Aufgaben.</li>'}</ul>`)}
    <div class="plan-saved">${S.saved ? 'Gespeichert' : 'Speichert automatisch'}</div>
  </div>`
}

// ---------- settings ----------
function settingsHtml() {
  const card = (t, body) => `<section class="set-card"><h3>${t}</h3>${body}</section>`
  return `<div class="settings">
    ${card('Darstellung', `<div class="seg">${[['system', 'System'], ['light', 'Hell'], ['dark', 'Plum-Nacht']].map(([k, l]) => `<button class="${S.theme === k ? 'on' : ''}" data-act="theme" data-theme="${k}">${l}</button>`).join('')}</div><p class="muted">Folgt standardmäßig dem System.</p>`)}
    ${card('Fokus-Orbit', `<div class="seg">${[['3d', 'Räumlich'], ['flat', 'Karte']].map(([k, l]) => `<button class="${S.orbitStyle === k ? 'on' : ''}" data-act="orbit-style" data-s="${k}">${l}</button>`).join('')}</div><p class="muted">Gleiche Information in beiden Formen. Bei „Bewegung reduzieren“ oder ohne WebGL zeigt runway immer die Karte. O blendet den Orbit auf Nächste aus.</p>`)}
    ${card('Kontexte', `<p class="muted">Die Reihenfolge legt fest, wo ein Kontext im Orbit liegt. Kontexte ohne offene Aufgabe bekommen keinen Sektor.</p><ol class="ctx-edit">${S.contexts.map((c, k) => `<li>${sectorGlyph(sectorOf(c), 14)}<span class="mono">${c}</span><span><button class="iconbtn sm" data-act="ctx-up" data-k="${k}" aria-label="${c} nach vorn">↑</button><button class="iconbtn sm" data-act="ctx-down" data-k="${k}" aria-label="${c} nach hinten">↓</button><button class="iconbtn sm" data-act="ctx-del" data-k="${k}" aria-label="${c} entfernen">${icon('close', 12)}</button></span></li>`).join('')}</ol><input class="d-in" data-act-enter="ctx-add" placeholder="@kontext, Enter fügt hinzu" aria-label="Kontext hinzufügen">`)}
    ${card('Profil', `<div class="form2"><label>Name<input value="Uli"></label><label>E-Mail<input value="uli@example.com"></label></div><button class="pill-btn">Speichern</button>`)}
    ${card('Passwort', `<div class="form2"><label>Aktuelles Passwort<input type="password"></label><label>Neues Passwort<input type="password"></label></div><button class="pill-btn">Passwort ändern</button>`)}
    ${card('API-Key', `<div class="code"><code>rw_••••••••••••••••••••3f9a</code><button class="pill-btn sm">Anzeigen</button><button class="pill-btn sm">Kopieren</button></div><p class="muted">Für die Android-App („Key einfügen“) und für Claude. Neu erzeugen macht den alten Key sofort ungültig.</p>`)}
    ${card('Claude verbinden', `<ol class="steps"><li><code>export RUNWAY_API_KEY=… RUNWAY_URL=https://runway.agentic-reach.com/api</code></li><li><code>claude mcp add runway …</code></li><li>Plugin installieren</li><li>Regel in <code>~/.claude/CLAUDE.md</code> ergänzen</li></ol>`)}
    ${card('MCP-Server', `<div class="seg sm"><button class="on">Claude Code</button><button>Claude Desktop</button><button>curl</button></div><div class="code"><code>https://runway.agentic-reach.com/api/mcp</code></div>`)}
    ${card('Verwaltung', `<label class="toggle-row"><span>Registrierung erlauben</span><button class="toggle" aria-pressed="false"><i></i></button></label><button class="pill-btn ghost">Abmelden</button>`)}
  </div>`
}

// ---------- review ----------
function startReview() {
  const st = stats().filter((p) => p.status === 'active')
  st.sort((a, b) => b.stalled - a.stalled)
  S.review = { i: 0, steps: [{ kind: 'inbox' }, { kind: 'waiting' }, ...st.map((p) => ({ kind: 'project', name: p.name })), { kind: 'someday' }, { kind: 'done' }] }
  S.open = null; S.clarify = null; S.pick = null
  renderAll(); frameOrbit()
}
function reviewStep(d) {
  const r = S.review
  r.i = Math.max(0, Math.min(r.steps.length - 1, r.i + d))
  if (r.steps[r.i].kind === 'done') S.lastReview = `${TODAY} ${NOW.time}` // POST /gtd/review { kind: 'weekly' }
  S.cursor = null
  renderAll(); frameOrbit()
}
function endReview() { S.review = null; renderAll(); frameOrbit() }
function reviewHtml() {
  const r = S.review
  const st = r.steps[r.i]
  const total = r.steps.length
  const l = L()
  const take = (rows) => { r.order = rows.map((t) => t.id); return rows }
  const progress = `<div class="rv-progress"><i style="width:${((r.i + 1) / total) * 100}%"></i></div>`
  let body = ''
  let title = ''
  let lead = ''
  if (st.kind === 'inbox') {
    title = 'Inbox leeren'
    lead = l.inbox.length ? `Kläre jeden Eingang. Der Orbit zeigt die rohen Perlen vorn in der Schale.` : '<em>Leer.</em> Weiter zu Warten auf.'
    body = take(l.inbox).map((t) => rowHtml(t, 'inbox')).join('')
  } else if (st.kind === 'waiting') {
    title = 'Warten auf prüfen'
    lead = 'Hakst du irgendwo nach? Fällige stehen oben und im Orbit am äußeren Ring.'
    body = take(l.waiting).map((t) => rowHtml(t, 'waiting')).join('')
  } else if (st.kind === 'project') {
    const p = stats().find((x) => x.name === st.name)
    title = projName(p.name)
    lead = `<span class="outcome">${esc(p.outcome)}</span>`
    const open = S.tasks.filter((t) => t.status === 'pending' && t.project === p.name)
    body = (p.stalled ? stalledCard(p.name) : '') + `<div class="rv-meta mono">${p.next} nächste · ${p.waiting} wartet · ${STATUS_DE[p.status]}</div>` + take(open).map((t) => rowHtml(t, tagParts(t).includes('waiting') ? 'waiting' : tagParts(t).includes('someday') ? 'someday' : 'next')).join('')
  } else if (st.kind === 'someday') {
    title = 'Irgendwann durchsehen'
    lead = 'Ist etwas davon jetzt dran? Aktivieren holt es in den Orbit.'
    body = take(l.someday).map((t) => rowHtml(t, 'someday')).join('')
  } else {
    const s = stats()
    title = 'Rückblick gespeichert'
    lead = `<em>Fertig.</em> ${s.filter((p) => p.status === 'active').length} Projekte gesehen, ${s.filter((p) => p.stalled).length} ${s.filter((p) => p.stalled).length === 1 ? 'steht' : 'stehen'} still, Inbox ${l.inbox.length}.`
    body = `<div class="rv-done mono">Wochenrückblick · ${shortDay(TODAY)} ${NOW.time} · gespeichert</div>`
  }
  return `<div class="review">
    <div class="eyebrow"><span class="slash">//</span> Wochenrückblick · Schritt ${r.i + 1} von ${total}</div>
    ${progress}
    <div class="rv-head"><h1>${title}</h1><button class="pill-btn ghost sm" data-act="end-review">Beenden <kbd>Esc</kbd></button></div>
    <p class="summary">${lead}</p>
    <div class="rv-body">${body}</div>
    <div class="rv-nav"><button class="pill-btn ghost" data-act="rv-prev" ${r.i === 0 ? 'disabled' : ''}>${icon('back', 14)} Zurück</button>
      ${st.kind === 'done' ? '<button class="pill-btn primary" data-act="end-review">Schließen</button>' : `<button class="pill-btn primary" data-act="rv-next">Weiter <kbd>→</kbd></button>`}</div>
  </div>`
}

// ---------- detail (side column on wide screens, a sheet on phones) ----------
function renderDetail() {
  const el = $('#detail')
  const t = S.open ? byId(S.open) : null
  if (!t) { el.innerHTML = ''; return }
  const tags = tagParts(t)
  const statusOf = tags.includes('waiting') ? 'waiting' : tags.includes('someday') ? 'someday' : isNext(t) ? 'next' : !t.project && !tags.length ? 'inbox' : 'none'
  const ctxs = contextsOf(t)
  const lay = layout()
  const pos = lay.beads.find((b) => b.id === t.id) || lay.more.find((m) => m.ids.includes(t.id))
  const sec = ctxs.length ? sectorOf(ctxs.find((c) => sectorOf(c, lay)) || ctxs[0], lay) : null
  const head = t.status === 'completed' ? 'Erledigt' : statusOf === 'next' ? `${ctxs.length ? RING_NAMES[ringOf(t)] + ' · ' + ctxs.join(' ') : 'ohne Kontext · ' + RING_NAMES[ringOf(t)]}${pos?.n ? ` · in „+${pos.n}“` : ''}` : statusOf === 'inbox' ? 'Inbox' : statusOf === 'waiting' ? 'Warten auf' : statusOf === 'someday' ? 'Irgendwann' : 'Ohne Liste'
  const dateField = (k, label) => `<label class="df">${label}<input type="date" data-f="${k}" value="${t[k] ? dayOf(t[k]) : ''}"></label>`
  const deps = t.depends || []
  const cands = S.tasks.filter((x) => x.status === 'pending' && x.id !== t.id && (!S.depQ || x.description.toLowerCase().includes(S.depQ.toLowerCase()) || deps.includes(x.uuid)))
    .sort((a, b) => deps.includes(b.uuid) - deps.includes(a.uuid))
  const PRESETS = [['', 'nie'], ['daily', 'täglich'], ['weekly', 'wöchentlich'], ['monthly', 'monatlich'], ['yearly', 'jährlich']]
  const custom = t.recur && !PRESETS.some(([k]) => k === t.recur) ? t.recur : ''
  const otherTags = tags.filter((x) => !x.startsWith('@') && !STATUS_TAGS.includes(x))
  el.innerHTML = `
    <div class="d-head">
      ${statusOf === 'next' || statusOf === 'waiting' ? placeGlyph(sec, statusOf === 'next' ? ringOf(t) : -1, 40, statusOf === 'next' && !ctxs.length) : ''}
      <div class="eyebrow"><span class="slash">//</span> ${esc(head)}</div>
      <button class="iconbtn" data-act="close-detail" aria-label="Schließen (Esc)">${icon('close', 16)}</button>
    </div>
    <textarea class="d-title" data-f="description" rows="1" aria-label="Beschreibung">${esc(t.description)}</textarea>
    <div class="d-actions">
      ${t.status === 'pending' ? `<button class="pill-btn dark" data-act="complete" data-id="${t.id}">${icon('check', 15)} Erledigt <kbd>X</kbd></button>
      <button class="pill-btn" data-act="start" data-id="${t.id}">${icon(t.start ? 'pause' : 'play', 14)} ${t.start ? 'Pausieren' : 'Starten'} <kbd>S</kbd></button>
      <button class="pill-btn ghost" data-act="delete" data-id="${t.id}">${icon('trash', 14)} Löschen</button>` : '<span class="muted">Erledigt. Die API kann Erledigtes nicht wieder öffnen.</span>'}
    </div>
    <div class="d-grid">
      <div class="d-l">Liste</div>
      <div class="seg sm">${[['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann'], ['none', 'Ohne Liste']].map(([k, l]) => `<button class="${statusOf === k ? 'on' : ''}" data-act="d-status" data-s="${k}">${l}</button>`).join('')}</div>
      <div class="d-l">Kontext</div>
      <div class="chips">${[...new Set([...ctxList(), ...ctxs])].map((c) => `<button class="chip sm ${ctxs.includes(c) ? 'on' : ''}" data-act="d-ctx" data-ctx="${c}" aria-pressed="${ctxs.includes(c)}">${sectorGlyph(sectorOf(c, lay), 11)}${c}</button>`).join('')}</div>
      <div class="d-l">Projekt</div>
      <div><input class="d-in" data-f="project" list="projlist" value="${esc(t.project || '')}" placeholder="kein Projekt"><datalist id="projlist">${S.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist></div>
      <div class="d-l">Priorität</div>
      <div class="seg sm">${[['H', 'Hoch'], ['M', 'Mittel'], ['L', 'Niedrig']].map(([k, l]) => `<button class="${t.priority === k ? 'on' : ''}" data-act="d-prio" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="d-l">Termine</div>
      <div class="dates">${dateField('due', 'Fällig')}${dateField('scheduled', tags.includes('waiting') ? 'Nachhaken' : 'Beginnen ab')}${dateField('wait', 'Zurückstellen bis')}${dateField('until', 'Läuft ab')}</div>
      <div class="d-l">Wiederholung</div>
      <div class="recur"><div class="seg sm">${PRESETS.map(([k, l]) => `<button class="${(t.recur || '') === k ? 'on' : ''}" data-act="d-recur" data-r="${k}" ${k && !t.due ? 'disabled title="Braucht ein Fälligkeitsdatum"' : ''}>${l}</button>`).join('')}</div>
        <input class="d-in" data-f="recur" value="${esc(custom)}" placeholder="oder z. B. 2weeks, 3d" ${t.due ? '' : 'disabled'} aria-label="Wiederholung frei eingeben">${t.due ? '' : '<span class="muted">Braucht ein Fälligkeitsdatum.</span>'}</div>
      <div class="d-l">Tags</div>
      <div class="tagbox"><div class="chips">${otherTags.map((x) => `<span class="chip sm on">${esc(x)}<button class="x" data-act="d-tag-del" data-tag="${esc(x)}" aria-label="Tag ${esc(x)} entfernen">${icon('close', 11)}</button></span>`).join('')}</div>
        <input class="d-in" data-act-enter="tag" placeholder="Tag oder @kontext, Enter fügt hinzu" aria-label="Tag hinzufügen">${S.tagErr ? `<span class="err">${esc(S.tagErr)}</span>` : ''}</div>
      <div class="d-l">Blockiert durch</div>
      <div class="deps"><input class="d-in" id="dep-q" value="${esc(S.depQ)}" placeholder="Aufgabe suchen" aria-label="Abhängigkeiten durchsuchen">
        <div class="dep-list" role="group" aria-label="Blockiert durch">${cands.map((o) => `<label class="dep ${deps.includes(o.uuid) ? 'on' : ''}"><input type="checkbox" data-dep="${o.uuid}" ${deps.includes(o.uuid) ? 'checked' : ''}><span>${esc(o.description)}</span></label>`).join('') || '<span class="muted">Nichts gefunden.</span>'}</div>
        <span class="muted">${deps.length ? `${deps.length} ${deps.length === 1 ? 'Aufgabe muss' : 'Aufgaben müssen'} vorher fertig sein.` : 'Nichts blockiert diese Aufgabe.'}</span></div>
    </div>
    <div class="d-notes">
      <div class="d-l">Notizen</div>
      ${(t.annotations || []).map((a) => `<div class="note"><span class="mono">${shortDay(dayOf(a.entry))}</span>${esc(a.description)}</div>`).join('')}
      <input class="d-in" data-act-enter="note" placeholder="Notiz, Enter fügt hinzu" aria-label="Notiz hinzufügen">
    </div>
    <div class="d-foot mono">Dringlichkeit ${t.urgency.toFixed(1)} · erfasst ${shortDay(dayOf(t.entry))} · ID ${t.uuid.slice(-8)}${S.saved ? ' · <span class="saved">gespeichert</span>' : ''}</div>`
}

// ---------- orbit footer, legend, tools ----------
function renderFoot() {
  const l = L()
  const inner = l.next.filter((t) => ringOf(t) === 0 && matchesContext(t, S.ctx)).length
  const attn = l.next.filter((t) => isOverdue(t) || isDueToday(t)).length + l.waiting.filter(followUpDue).length + liveGhosts().length
  $('#foot').innerHTML = `
    <div class="stat"><b>${inner}</b><span>Innen</span></div>
    <div class="stat attn"><b>${attn}</b><span>Braucht dich</span></div>
    <div class="stat"><b>${l.waiting.length}</b><span>Wartet</span></div>
    <div class="stat done"><b>${doneToday().length}</b><span>Heute erledigt</span></div>`
  $('#legend').innerHTML = `
    <span><svg width="22" height="12" viewBox="0 0 22 12"><circle cx="5" cy="6" r="3.2" class="lg-bead"/><path d="M11 6h9" class="lg-line"/></svg>innen = dringender</span>
    <span>${sectorGlyph({ a0: -0.4, a1: -2.0 }, 12)}Sektor = Kontext, Breite = Menge</span>
    <span>${hubGlyph(12)}Mitte = ohne Kontext</span>
    <span><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.6" class="lg-attn"/><circle cx="7" cy="7" r="2.6" class="lg-bead"/></svg>braucht dich heute</span>
    <span><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.4" class="lg-live"/></svg>läuft</span>
    <span><svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.6" class="lg-hollow"/></svg>nachhaken</span>
    <span><b class="lg-more">+N</b>weitere, Klick filtert</span>`
  $('#orbit-tools').innerHTML = (S.ctx || S.ring != null
    ? `<button class="chip on" data-act="clear-ctx">${[S.ctx ? ctxLabel(S.ctx) : '', S.ring != null ? RING_NAMES[S.ring] : ''].filter(Boolean).join(' · ')}<span class="x">${icon('close', 12)}</span></button>`
    : `<span class="mono soft">${S.review ? 'Rückblick' : 'Alle Kontexte'}</span>`) +
    (S.review ? '' : `<button class="iconbtn" data-act="orbit-toggle" aria-label="Fokus-Orbit ausblenden (O)" title="Ausblenden (O)">${icon('close', 15)}</button>`)
}

// ---------- "Als Nächstes": the orbit's conclusion, one actionable line under the disc ----------
function suggestion() {
  const l = L()
  const due = l.next.filter((t) => (isOverdue(t) || isDueToday(t)) && !t.start && matchesContext(t, S.ctx))
  if (due.length) return due[0]
  return l.next.filter((t) => matchesContext(t, S.ctx) && !t.start && (S.ring == null || ringOf(t) === S.ring)).sort((a, b) => ringOf(a) - ringOf(b) || orbitScore(b) - orbitScore(a))[0]
}
function renderSuggest() {
  const el = $('#suggest')
  const t = suggestion()
  const running = L().next.filter((x) => x.start && x.id !== t?.id)
  el.hidden = !t || !!S.review || S.view !== 'next'
  if (el.hidden) { el.innerHTML = ''; orbit?.setInsets?.({ bottom: 0, top: 0 }); return }
  const d = dueLabel(t)
  const meta = [d?.text, contextsOf(t).join(' ') || 'ohne Kontext', t.project].filter(Boolean).join(' · ')
  el.innerHTML = `
    <div class="sg-main" data-act="open" data-id="${t.id}">
      <div class="eyebrow"><span class="slash">//</span> Als Nächstes${S.ctx ? ' in ' + esc(ctxLabel(S.ctx)) : ''}</div>
      <b>${esc(t.description)}</b>
      <small class="${d?.tone === 'overdue' ? 'overdue' : ''}">${esc(meta)}</small>
      ${running.length ? `<span class="sg-live"><i class="dot-live"></i>läuft: ${running.map((x) => esc(x.description)).join(' · ')}</span>` : ''}
    </div>
    <div class="sg-act">
      <button class="pill-btn sm ghost" data-act="start" data-id="${t.id}">${icon('play', 13)} Starten</button>
      <button class="pill-btn sm dark" data-act="complete" data-id="${t.id}">${icon('check', 13)} Erledigt</button>
    </div>`
  const h = el.offsetHeight
  orbit?.setInsets?.({ bottom: isMobile() ? 0 : h + 20, top: 6 })
}

// ---------- toast with undo ----------
let toastTimer = 0
function setUndo(label, detail, undo) {
  S.undo = { label, detail, undo }
  const el = $('#toast')
  el.innerHTML = `<span class="t-l">${label}</span><span class="t-d">${esc(detail || '')}</span>${undo ? '<button class="undo" data-act="undo">Rückgängig <kbd>Z</kbd></button>' : ''}<i class="t-bar"></i>`
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.classList.remove('show'); S.undo = null }, 6000)
}
function doUndo() {
  if (!S.undo?.undo) return
  const u = S.undo; S.undo = null
  $('#toast').classList.remove('show')
  u.undo()
}

// ---------- actions ----------
function show(view) {
  if (!TITLES[view]) return
  S.view = view; S.review = null; S.clarify = null; S.pick = null; S.open = null
  if (view !== 'projects') S.project = null
  if (view !== 'next' && view !== 'all') S.ring = null
  renderAll()
  S.cursor = S.order[0] ?? null
  renderAll(); frameOrbit()
  $('#list').scrollTop = 0
}
function setFilter(ctx, ring = null) {
  S.ctx = ctx || null
  S.ring = ring
  if (!['next', 'all'].includes(S.view) || S.review) { S.view = 'next'; S.review = null; S.project = null }
  S.open = null
  renderAll()
  if (!S.order.includes(S.cursor)) S.cursor = S.order[0] ?? null
  renderAll(); frameOrbit()
}
/** A "+N" marker: show what it stands for in the list (same sector and ring). */
function openMore(m) {
  if (m.tray) return show('inbox')
  if (m.ring === 3) return show('waiting')
  setFilter(m.hub ? NO_CTX : m.ctx, m.hub ? null : m.ring)
}
function capture(text) {
  const d = String(text || '').trim().replace(/\s+/g, ' ')
  if (!d) return null
  const id = ++uid
  const t = { id, uuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, description: d.slice(0, 500), status: 'pending', project: null, tags: [], priority: null, due: null, scheduled: null, wait: null, urgency: 0.8, entry: nowTw(), start: null, annotations: [] }
  if (d.length > 500) t.annotations.push({ entry: t.entry, description: d.slice(500) })
  S.tasks.push(t)
  orbit?.expect(id, 'capture')
  setUndo('In Inbox ✓', d, () => { S.tasks = S.tasks.filter((x) => x.id !== id); renderAll() })
  renderAll()
  return id
}
async function complete(id, opts = {}) {
  const t = byId(id)
  if (!t || t.status !== 'pending') return
  const before = structuredClone(t)
  const pos = orbit?.positionOf(t.id) || layout().beads.find((b) => b.id === t.id)
  const idx = S.order.indexOf(t.id)
  const row = $(`#list .row[data-id="${t.id}"]`)
  row?.classList.add('leaving')
  t.status = 'completed'; t.end = nowTw(); t.start = null
  // A project that just lost its last next action: leave an empty yellow ring where it was.
  const pj = t.project && stats().find((p) => p.name === t.project)
  let ghost = null
  if (pj?.stalled && pos && isNext(before)) { ghost = { project: t.project, ctx: pos.ctx || null, ring: pos.ring >= 0 && pos.ring <= 2 ? pos.ring : 2, score: orbitScore(before) }; S.ghosts.push(ghost) }
  if (S.cursor === t.id) { const rest = S.order.filter((x) => x !== t.id); S.cursor = rest[Math.min(idx, rest.length - 1)] ?? null }
  if (S.open === t.id) S.open = null
  const flight = orbit && sideMode() === 'orbit' ? orbit.complete(t.id, opts) : Promise.resolve()
  setUndo('Erledigt', t.description + (ghost ? ` · ${t.project} steht jetzt still` : ''), () => {
    Object.assign(t, before); delete t.end
    if (ghost) S.ghosts = S.ghosts.filter((g) => g !== ghost)
    orbit?.restore(t.id)
    S.cursor = t.id
    renderAll()
  })
  setTimeout(() => { renderAll(); $('#foot .stat.done')?.classList.add('bump'); if (!S.open) frameOrbit(600) }, row ? 240 : 0)
  return flight
}
/** Clarify an inbox item. Only tags are added (tags_add); the text can be rephrased on the way. */
function clarify(id, to, opts = {}) {
  const t = byId(id)
  if (!t || t.status !== 'pending') return
  const before = structuredClone(t)
  const proj = opts.project ?? (S.clarifyProject || null)
  const text = (opts.text ?? S.clarifyText ?? '').trim()
  if (text && text !== t.description && to !== 'delete') t.description = text
  let label
  if (to === 'delete') { t.status = 'deleted'; label = 'Gelöscht' }
  else if (to === 'done') { S.clarify = null; S.clarifyText = null; return complete(id) }
  else if (to.startsWith('next')) { const ctx = to.split(':')[1] || ''; t.tags = ctx ? ['next', ctx] : ['next']; label = `Geklärt · Nächste ${ctx || 'ohne Kontext'} · ${RING_NAMES[ringOf(t)]}` }
  else if (to === 'waiting') {
    const follow = opts.follow || addDays(TODAY, 7)
    t.tags = ['waiting']; t.scheduled = dayToTw(follow)
    if (opts.who) t.annotations = [...(t.annotations || []), { entry: nowTw(), description: `Wartet auf: ${opts.who}` }]
    label = `Geklärt · Warten auf${opts.who ? ' ' + opts.who : ''} · Nachhaken ${relDay(follow)}`
  }
  else if (to === 'someday') { t.tags = ['someday']; label = 'Geklärt · Irgendwann' }
  else return
  if (proj && to !== 'delete') t.project = proj
  const idx = S.order.indexOf(t.id)
  S.clarify = null; S.clarifyMode = null; S.clarifyProject = ''; S.clarifyText = null
  const rest = S.order.filter((x) => x !== t.id)
  S.cursor = rest[Math.min(idx, rest.length - 1)] ?? null
  setUndo(label, t.description, () => { Object.assign(t, before); S.cursor = t.id; renderAll() })
  renderAll()
}
/** Activate a someday item or turn a plan action into a task: the same context choice as Klären. */
function applyPick(to) {
  const ctx = to.split(':')[1] || ''
  const p = S.pick; S.pick = null
  if (!p) return
  if (p.kind === 'activate') {
    const t = byId(p.id); const before = structuredClone(t)
    t.tags = [...t.tags.filter((x) => x !== 'someday'), 'next', ...(ctx ? [ctx] : [])]
    setUndo('Aktiviert', `${t.description} · Nächste ${ctx || 'ohne Kontext'}`, () => { Object.assign(t, before); renderAll() })
    renderAll()
  } else if (p.kind === 'plan') addNext(S.project, p.text, ctx)
}
function toggleStart(id) {
  const t = byId(id); if (!t || t.status !== 'pending') return
  t.start = t.start ? null : nowTw()
  renderAll()
}
function del(id) {
  const t = byId(id); if (!t) return
  const before = structuredClone(t)
  t.status = 'deleted'
  if (S.open === t.id) S.open = null
  setUndo('Gelöscht', t.description, () => { Object.assign(t, before); renderAll() })
  renderAll(); frameOrbit()
}
function openTask(id) {
  const t = byId(id); if (!t) return
  S.open = t.id; S.cursor = t.id; S.saved = false; S.depQ = ''; S.tagErr = ''
  renderAll()
  if (isMobile()) $('#detail').scrollTop = 0
}
function closeDetail() { S.open = null; renderAll(); frameOrbit(0) }
let saveTimer = 0
function saved() { S.saved = true; clearTimeout(saveTimer); saveTimer = setTimeout(() => { S.saved = false; const s = $('.d-foot .saved'); s && s.remove(); const p = $('.plan-saved'); if (p) p.textContent = 'Speichert automatisch' }, 1600) }
function addNext(project, desc, ctx) {
  const id = ++uid
  S.tasks.push({ id, uuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`, description: desc, status: 'pending', project, tags: ctx ? ['next', ctx] : ['next'], priority: null, due: null, scheduled: null, wait: null, urgency: 5.2, entry: nowTw(), start: null, annotations: [] })
  setUndo('Nächster Schritt angelegt', `${desc} · ${ctx || 'ohne Kontext'}`, () => { S.tasks = S.tasks.filter((x) => x.id !== id); renderAll() })
  renderAll(); frameOrbit()
}
// Edits change only what they name (the API's tags_add / tags_remove), never the whole tag set.
const splitRaw = (tags) => tags.flatMap((raw) => (String(raw).includes(',') ? String(raw).split(',').map((x) => x.trim()).filter(Boolean) : [raw]))
function setStatus(tk, s) {
  tk.tags = [...tk.tags.filter((x) => !STATUS_TAGS.includes(x)), ...(s === 'none' ? [] : [s])]
  if (s === 'waiting' && !tk.scheduled) tk.scheduled = dayToTw(addDays(TODAY, 7))
}
function toggleCtx(tk, c) {
  if (contextsOf(tk).includes(c)) tk.tags = splitRaw(tk.tags).filter((x) => x !== c)
  else { tk.tags = [...tk.tags, c]; if (!tagParts(tk).some((x) => STATUS_TAGS.includes(x))) tk.tags.push('next') }
}
function addTag(tk, raw) {
  const v = raw.trim().replace(/^\+/, '')
  const parts = v.split(/[\s,]+/).filter(Boolean)
  const bad = parts.find((p) => !TAG_RE.test(p))
  if (!parts.length || bad) { S.tagErr = `„${bad || v}“ geht nicht: Tags beginnen mit Buchstabe, _ oder @, ohne Leerzeichen und Komma.`; return false }
  for (const p of parts) if (!tagParts(tk).includes(p)) tk.tags.push(p)
  S.tagErr = ''
  return true
}

// ---------- render all ----------
function renderAll() {
  if (S.theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = S.theme
  const side = sideMode()
  const app = $('#app')
  app.dataset.view = S.review ? 'review' : S.view
  app.dataset.side = side
  renderRail(); renderTabbar(); renderHead(); renderCtxbar(); renderFilterbar(); renderList(); renderDetail()
  if (side === 'orbit') { renderFoot(); renderSuggest() }
  $('#capture').hidden = S.view === 'settings' && !S.review
  if (side === 'orbit' && !orbit) requestAnimationFrame(() => setTimeout(initOrbit, 0))
  else syncOrbit()
}
function linkRow(id) {
  S.hover = id
  document.querySelectorAll('#list .row.linked').forEach((r) => r.classList.remove('linked'))
  if (id == null) return
  const r = $(`#list .row[data-id="${id}"]`)
  if (r) {
    r.classList.add('linked')
    const lr = $('#list').getBoundingClientRect(), rr = r.getBoundingClientRect()
    if (rr.top < lr.top + 30 || rr.bottom > lr.bottom - 10) r.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }
}
function moveCursor(d) {
  if (!S.order.length) return
  const i = S.order.indexOf(S.cursor)
  S.cursor = S.order[i < 0 ? 0 : Math.max(0, Math.min(S.order.length - 1, i + d))]
  document.querySelectorAll('#list .row.sel').forEach((r) => r.classList.remove('sel'))
  const r = $(`#list .row[data-id="${S.cursor}"]`)
  r?.classList.add('sel'); r?.scrollIntoView({ block: 'nearest' })
  orbit?.focus(S.cursor)
  if (S.open) { S.open = S.cursor; renderDetail() }
}

// ---------- events ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act],[data-view],[data-ctx]')
  if (!el) return
  if (el.dataset.view && !el.dataset.act) { show(el.dataset.view); return }
  if (el.classList.contains('ctx-item')) { setFilter(S.ctx === el.dataset.ctx ? null : el.dataset.ctx); return }
  const id = el.dataset.id ? Number(el.dataset.id) : null
  const tk = S.open ? byId(S.open) : null
  switch (el.dataset.act) {
    case 'complete': ev.stopPropagation(); complete(id); break
    case 'open': if (S.clarify !== id) openTask(id); break
    case 'start': ev.stopPropagation(); toggleStart(id); break
    case 'delete': del(id); break
    case 'clarify': ev.stopPropagation(); S.clarify = S.clarify === id ? null : id; S.clarifyMode = null; S.clarifyText = null; S.cursor = id; renderList(); break
    case 'cl': clarify(id, el.dataset.to); break
    case 'cl-wait': S.clarifyMode = S.clarifyMode === 'waiting' ? null : 'waiting'; S.clarifyText = $('#cl-text')?.value ?? S.clarifyText; renderList(); $('.cl-wait input[name="follow"]')?.focus(); break
    case 'activate': S.pick = S.pick?.id === id ? null : { kind: 'activate', id }; renderList(); break
    case 'plan-pick': S.pick = S.pick?.text === el.dataset.text ? null : { kind: 'plan', text: el.dataset.text }; renderList(); break
    case 'pick': applyPick(el.dataset.to); break
    case 'close-detail': closeDetail(); break
    case 'clear-ctx': setFilter(null); break
    case 'set-ctx': setFilter(el.dataset.ctx || null); break
    case 'clear-q': S.q = ''; renderAll(); break
    case 'undo': doUndo(); break
    case 'palette': openPalette(); break
    case 'review': startReview(); break
    case 'rv-next': reviewStep(1); break
    case 'rv-prev': reviewStep(-1); break
    case 'end-review': endReview(); break
    case 'orbit-toggle': S.orbitOff = !S.orbitOff; renderAll(); frameOrbit(0); break
    case 'orbit-style': S.orbitStyle = el.dataset.s; renderAll(); reinitOrbit(); break
    case 'project': S.project = el.dataset.name; S.projectTab = 'tasks'; S.cursor = null; renderAll(); break
    case 'back': S.project = null; renderAll(); break
    case 'ptab': S.projectTab = el.dataset.tab; renderList(); break
    case 'pstatus': {
      const p = S.projects.find((x) => x.name === el.dataset.name); if (!p) break
      const prev = p.status; p.status = el.dataset.s
      if (el.closest('.stalled-card')) setUndo(p.status === 'on_hold' ? 'Pausiert' : 'Abgeschlossen', p.name, () => { p.status = prev; renderAll() })
      renderAll(); break
    }
    case 'as-ctx': el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el)); break
    case 'toggle-done': S.showDone = !S.showDone; renderList(); break
    case 'theme': S.theme = el.dataset.theme; renderAll(); orbit?.setColors(readColors()); break
    case 'new-project': { const n = prompt('Projektname'); if (n && n.trim()) { S.projects.push({ name: n.trim(), outcome: 'Ergebnis beschreiben', status: 'active' }); S.project = n.trim(); S.projectTab = 'plan'; renderAll() } break }
    case 'd-status': setStatus(tk, el.dataset.s); saved(); renderAll(); break
    case 'd-ctx': toggleCtx(tk, el.dataset.ctx); saved(); renderAll(); break
    case 'd-tag-del': tk.tags = splitRaw(tk.tags).filter((x) => x !== el.dataset.tag); saved(); renderAll(); break
    case 'd-prio': tk.priority = tk.priority === el.dataset.p ? null : el.dataset.p; saved(); renderAll(); break
    case 'd-recur': tk.recur = el.dataset.r || null; saved(); renderDetail(); break
    case 'idea-del': { const pl = S.plans[S.project]; pl.ideas = pl.ideas.filter((i) => i.id !== Number(el.dataset.iid)); saved(); renderList(); break }
    case 'ord-up': case 'ord-down': { const pl = S.plans[S.project]; const k = +el.dataset.k; const j = k + (el.dataset.act === 'ord-up' ? -1 : 1); if (j >= 0 && j < pl.organized.length) { [pl.organized[k], pl.organized[j]] = [pl.organized[j], pl.organized[k]]; saved(); renderList() } break }
    case 'ord-take': { const pl = S.plans[S.project]; pl.ideas.forEach((i) => { if (!pl.organized.some((o) => o.id === i.id)) pl.organized.push({ ...i }) }); saved(); renderList(); break }
    case 'ctx-up': case 'ctx-down': { const k = +el.dataset.k; const j = k + (el.dataset.act === 'ctx-up' ? -1 : 1); if (j >= 0 && j < S.contexts.length) { [S.contexts[k], S.contexts[j]] = [S.contexts[j], S.contexts[k]]; renderAll() } break }
    case 'ctx-del': S.contexts.splice(+el.dataset.k, 1); renderAll(); break
  }
})
$('#list').addEventListener('mouseover', (ev) => {
  const r = ev.target.closest('.row'); const id = r ? Number(r.dataset.id) : null
  if (id !== S.hover) { S.hover = id; orbit?.hover(id) }
})
$('#list').addEventListener('mouseleave', () => { S.hover = null; orbit?.hover(null) })
$('#list').addEventListener('scroll', () => { if (isMobile()) orbitCol.classList.toggle('collapsed', $('#list').scrollTop > 40) }, { passive: true })
$('#list').addEventListener('submit', (ev) => {
  const f = ev.target.closest('.addstep')
  if (f) {
    ev.preventDefault()
    const d = f.d.value.trim(); if (!d) return
    addNext(f.dataset.project, d, f.querySelector('.chip.on')?.dataset.ctx ?? '')
    return
  }
  const w = ev.target.closest('.cl-wait')
  if (w) { ev.preventDefault(); clarify(Number(w.dataset.id), 'waiting', { follow: w.follow.value, who: w.who.value.trim() }) }
})
document.addEventListener('change', (ev) => {
  const el = ev.target
  if (el.id === 'cl-project') { S.clarifyProject = el.value; return }
  if (el.dataset.dep && S.open) {
    const t = byId(S.open)
    const set = new Set(t.depends || [])
    el.checked ? set.add(el.dataset.dep) : set.delete(el.dataset.dep)
    t.depends = [...set]; saved(); renderDetail(); return
  }
  if (el.dataset.f && S.open) {
    const t = byId(S.open)
    const k = el.dataset.f
    if (['due', 'scheduled', 'wait', 'until'].includes(k)) t[k] = el.value ? dayToTw(el.value) : null
    else if (k === 'project') t.project = el.value.trim() || null
    else if (k === 'recur') { if (t.due) t.recur = el.value.trim() || null }
    else if (k === 'description') { if (el.value.trim()) t.description = el.value.trim() }
    saved(); renderAll()
  }
})
document.addEventListener('input', (ev) => {
  const el = ev.target
  if (el.id === 'search') { S.q = el.value; renderList(); renderFilterbar(); syncOrbit() }
  if (el.id === 'cl-text') S.clarifyText = el.value
  if (el.id === 'dep-q') { S.depQ = el.value; const pos = el.selectionStart; renderDetail(); const n = $('#dep-q'); n.focus(); n.setSelectionRange(pos, pos) }
  if (el.dataset.pl) { S.plans[S.project][el.dataset.pl] = el.value; S.saved = true; const p = $('.plan-saved'); if (p) p.textContent = 'Gespeichert' }
})
$('#capture').addEventListener('submit', (ev) => {
  ev.preventDefault()
  const inp = $('#capture-input')
  if (capture(inp.value)) inp.value = ''
})

// keyboard-first (letters are case-insensitive)
const keysEl = $('#keys')
function typing(el) { return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) }
document.addEventListener('keydown', (ev) => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key
  if ((ev.metaKey || ev.ctrlKey) && k === 'k') { ev.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return }
  if (!$('#palette').hidden) return paletteKey(ev)
  if (!keysEl.hidden) { if (k === 'Escape' || k === '?') keysEl.hidden = true; return }
  const el = document.activeElement
  if (typing(el)) {
    if (k === 'Escape') {
      el.blur()
      if (el.id === 'search' && !S.q) { S.searchOpen = false; renderHead() }
      if (el.closest('.cl-wait')) { S.clarifyMode = null; renderList() }
    }
    if (k === 'Enter' && el.id === 'cl-text') { ev.preventDefault(); el.blur() }
    if (k === 'Enter' && el.dataset.actEnter && el.value.trim()) {
      ev.preventDefault()
      const v = el.value.trim()
      if (el.dataset.actEnter === 'note') { byId(S.open).annotations.push({ entry: nowTw(), description: v }); saved(); renderDetail(); $('#detail [data-act-enter="note"]')?.focus() }
      if (el.dataset.actEnter === 'tag') { addTag(byId(S.open), v) && saved(); renderAll(); $('#detail [data-act-enter="tag"]')?.focus() }
      if (el.dataset.actEnter === 'idea') { const pl = S.plans[S.project]; pl.ideas.push({ id: Date.now(), text: v }); saved(); renderList(); $('.plan-in')?.focus() }
      if (el.dataset.actEnter === 'ctx-add') { const c = v.startsWith('@') ? v : '@' + v; if (TAG_RE.test(c) && !S.contexts.includes(c)) S.contexts.push(c); renderAll(); $('[data-act-enter="ctx-add"]')?.focus() }
    }
    if (k === 'Enter' && el.classList.contains('d-title')) { ev.preventDefault(); el.blur() }
    return
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) { if ((ev.metaKey || ev.ctrlKey) && k === 'z') { ev.preventDefault(); doUndo() } return }
  // the context choice (clarify, activate, plan action) has its own small keymap
  if (S.clarify != null || S.pick) {
    const n = Number(k)
    const ctxs = ctxList().slice(0, 9)
    const go = (to) => (S.clarify != null ? clarify(S.clarify, to) : applyPick(to))
    if (k === '0') { ev.preventDefault(); return go('next:') }
    if (n >= 1 && n <= ctxs.length) { ev.preventDefault(); return go('next:' + ctxs[n - 1]) }
    if (k === 'Escape') { S.clarify = null; S.clarifyMode = null; S.pick = null; renderList(); return }
    if (S.clarify != null) {
      if (k === 'w') { ev.preventDefault(); S.clarifyMode = 'waiting'; renderList(); $('.cl-wait input[name="follow"]')?.focus(); return }
      if (k === 'i') return clarify(S.clarify, 'someday')
      if (k === 'x') return clarify(S.clarify, 'done')
      if (k === 'Backspace' || k === 'Delete') return clarify(S.clarify, 'delete')
      if (k === 'c') { S.clarify = null; renderList(); return }
    }
  }
  if (S.review) {
    if (k === 'ArrowRight' || (k === 'Enter' && !S.cursor)) { ev.preventDefault(); return reviewStep(1) }
    if (k === 'ArrowLeft') { ev.preventDefault(); return reviewStep(-1) }
    if (k === 'Escape' && !S.open) return endReview()
  }
  const L5 = { 1: 'inbox', 2: 'next', 3: 'waiting', 4: 'projects', 5: 'someday' }
  if (L5[k]) { ev.preventDefault(); return show(L5[k]) }
  switch (k) {
    case 'j': case 'ArrowDown': ev.preventDefault(); moveCursor(1); break
    case 'k': case 'ArrowUp': ev.preventDefault(); moveCursor(-1); break
    case 'x': if (S.cursor) complete(S.cursor); break
    case 'e': case 'Enter': if (S.cursor) { ev.preventDefault(); openTask(S.cursor) } break
    case 's': if (S.cursor) toggleStart(S.cursor); break
    case 'c': if (S.cursor && L().inbox.some((t) => t.id === S.cursor)) { S.clarify = S.cursor; S.clarifyMode = null; S.clarifyText = null; renderList() } break
    case 'n': ev.preventDefault(); $('#capture-input').focus(); break
    case '/': ev.preventDefault(); S.searchOpen = true; renderHead(); $('#search').focus(); break
    case 'o': if (S.view === 'next' && !S.review) { S.orbitOff = !S.orbitOff; renderAll(); frameOrbit(0) } break
    case '[': case ']': { const cs = layout().sectors.map((s) => s.ctx); if (!cs.length) break; const i = S.ctx ? cs.indexOf(S.ctx) : -1; const j = k === ']' ? (i + 1) % cs.length : (i <= 0 ? cs.length - 1 : i - 1); setFilter(cs[j]); break }
    case '0': setFilter(null); break
    case 'r': startReview(); break
    case 'a': show('all'); break
    case ',': show('settings'); break
    case 'z': doUndo(); break
    case '?': showKeys(); break
    case 'Escape': if (S.open) closeDetail(); else if (S.ctx || S.ring != null) setFilter(null); else if (S.q) { S.q = ''; renderAll() } break
  }
})

// ---------- command palette ----------
let palItems = [], palSel = 0
function commands() {
  const lay = layout()
  const c = [
    { label: 'Neues Todo', hint: 'N', ic: 'plus', run: () => $('#capture-input').focus() },
    ...LISTS.map((l) => ({ label: `Gehe zu ${l.label}`, hint: l.key, ic: l.id, run: () => show(l.id) })),
    { label: 'Wochenrückblick starten', hint: 'R', ic: 'review', run: startReview },
    ...lay.sectors.map((s) => ({ label: `Kontext ${s.ctx}`, hint: '[ ]', glyph: sectorGlyph(s), run: () => setFilter(s.ctx) })),
    ...(lay.hubCount ? [{ label: 'Kontext: ohne Kontext', glyph: hubGlyph(), run: () => setFilter(NO_CTX) }] : []),
    { label: 'Kontextfilter aufheben', hint: '0', ic: 'orbit', run: () => setFilter(null) },
    { label: S.orbitOff ? 'Fokus-Orbit zeigen' : 'Fokus-Orbit ausblenden', hint: 'O', ic: 'orbit', run: () => { S.orbitOff = !S.orbitOff; renderAll() } },
    { label: S.orbitStyle === 'flat' ? 'Orbit räumlich zeigen' : 'Orbit als Karte zeigen', ic: 'orbit', run: () => { S.orbitStyle = S.orbitStyle === 'flat' ? '3d' : 'flat'; reinitOrbit() } },
    { label: 'Alle Aufgaben', hint: 'A', ic: 'all', run: () => show('all') },
    { label: 'Einstellungen', hint: ',', ic: 'settings', run: () => show('settings') },
    { label: 'Darstellung: Plum-Nacht', ic: 'sun', run: () => { S.theme = 'dark'; renderAll(); orbit?.setColors(readColors()) } },
    { label: 'Darstellung: Hell', ic: 'sun', run: () => { S.theme = 'light'; renderAll(); orbit?.setColors(readColors()) } },
    { label: 'Darstellung: wie das System', ic: 'sun', run: () => { S.theme = 'system'; renderAll(); orbit?.setColors(readColors()) } },
    { label: 'Tastenkürzel', hint: '?', ic: 'command', run: showKeys },
  ]
  if (S.cursor && byId(S.cursor)?.status === 'pending') c.splice(1, 0, { label: `Erledigt: ${byId(S.cursor)?.description}`, hint: 'X', ic: 'check', run: () => complete(S.cursor) })
  return c
}
function openPalette() { $('#palette').hidden = false; $('#pal-input').value = ''; palSel = 0; renderPalette(); $('#pal-input').focus() }
function closePalette() { $('#palette').hidden = true }
function renderPalette() {
  const q = $('#pal-input').value.trim().toLowerCase()
  const cmds = commands().filter((c) => !q || c.label.toLowerCase().includes(q))
  const tasks = q ? S.tasks.filter((t) => t.status === 'pending' && t.description.toLowerCase().includes(q)).slice(0, 6).map((t) => ({ label: t.description, sub: t.project || contextsOf(t).join(' ') || 'Inbox', ic: 'next', run: () => openTask(t.id), task: true })) : []
  palItems = [...cmds.slice(0, 9), ...tasks]
  if (q) palItems.push({ label: `Als Todo erfassen: „${$('#pal-input').value.trim()}“`, ic: 'inbox', hint: '↵', run: () => capture($('#pal-input').value) })
  palSel = Math.min(palSel, palItems.length - 1)
  $('#pal-list').innerHTML = palItems.map((c, i) => `<button class="pal-item ${i === palSel ? 'on' : ''} ${c.task ? 'task' : ''}" data-i="${i}" role="option" aria-selected="${i === palSel}">${c.glyph || icon(c.ic || 'next', 16)}<span>${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ''}</button>`).join('') || '<div class="pal-empty">Nichts gefunden</div>'
}
function paletteKey(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); closePalette() }
  else if (ev.key === 'ArrowDown') { ev.preventDefault(); palSel = (palSel + 1) % palItems.length; renderPalette() }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); palSel = (palSel - 1 + palItems.length) % palItems.length; renderPalette() }
  else if (ev.key === 'Enter') { ev.preventDefault(); const c = palItems[palSel]; closePalette(); c?.run() }
}
$('#pal-input').addEventListener('input', () => { palSel = 0; renderPalette() })
$('#palette').addEventListener('click', (ev) => { const b = ev.target.closest('.pal-item'); if (b) { const c = palItems[+b.dataset.i]; closePalette(); c.run() } else if (ev.target.id === 'palette') closePalette() })
function showKeys() {
  const rows = [['N', 'Neues Todo'], ['⌘K', 'Befehle'], ['/', 'Suchen'], ['1–5', 'Inbox, Nächste, Warten auf, Projekte, Irgendwann'], ['J K', 'Nächste, vorige Zeile'], ['X', 'Erledigt'], ['E', 'Öffnen'], ['S', 'Starten, pausieren'], ['C', 'Klären (Inbox), dann 1–9 Kontext, 0 ohne Kontext, W, I, X, ⌫'], ['[ ]', 'Kontext wechseln, 0 hebt auf'], ['O', 'Fokus-Orbit ein- und ausblenden'], ['R', 'Wochenrückblick'], ['Z', 'Rückgängig'], ['Esc', 'Schließen']]
  keysEl.querySelector('#keys-body').innerHTML = `<div class="eyebrow"><span class="slash">//</span> Tastenkürzel</div><dl>${rows.map(([a, b]) => `<dt><kbd>${a}</kbd></dt><dd>${b}</dd>`).join('')}</dl>`
  keysEl.hidden = false
}
keysEl.addEventListener('click', () => { keysEl.hidden = true })

// theme and motion follow the system live
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'system') orbit?.setColors(readColors()) })
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => reinitOrbit())

// ---------- test hook (shared/README.md) ----------
window.proto = {
  show(view) { show(view) },
  filter(context) { setFilter(context) },
  capture(text) { return capture(text) },
  open(id) { openTask(byId(id)?.id ?? id) },
  complete(id) { return complete(byId(id)?.id ?? id) },
  clarify(id, to) { return clarify(byId(id)?.id ?? id, to) },
  async signature() {
    if (S.view !== 'next' || S.review || S.open) { S.open = null; show('next') }
    await orbitReadyP
    // The richest single frame: a bead near the viewer whose completion leaves its project
    // without a next step, so the flight into the hub and the empty yellow ring happen together.
    const st = stats()
    const next = L().next
    const vis = (t) => { const p = orbit.positionOf(t.id); return p && !p.hidden ? p : null }
    const front = (t) => { const p = vis(t); return p ? Math.cos(p.a) * p.r : -9 }
    const stalls = next.filter((t) => vis(t) && t.project && st.find((p) => p.name === t.project && p.next === 1 && p.waiting === 0))
    const target = stalls.sort((a, b) => front(b) - front(a))[0] || next.filter(vis).sort((a, b) => front(b) - front(a))[0]
    S.cursor = target.id
    renderAll()
    $(`#list .row[data-id="${target.id}"]`)?.scrollIntoView({ block: 'center' })
    orbit.focus(target.id)
    await new Promise((r) => setTimeout(r, 650))
    // held mid-flight for the still frame, then it lands and the hub answers
    await complete(target.id, { hold: { at: 0.46, ms: 5000 } })
  },
  volume: VOLUME,
}

// ---------- boot ----------
renderAll()
S.cursor = S.order[0] ?? null
renderAll()
