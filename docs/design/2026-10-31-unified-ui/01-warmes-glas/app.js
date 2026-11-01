// runway web prototype, proposal 01 "Warmes Glas".
import * as S from './store.js'
import { glyph, brandMark } from './glyphs.js'
import { flatLens, flatPebbles } from './lens-flat.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const phone = matchMedia('(max-width: 760px)')
const coarse = matchMedia('(pointer: coarse)')
const darkMq = matchMedia('(prefers-color-scheme: dark)')
const WORDS = ['keins', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']
const word = (n) => WORDS[n] ?? String(n)
const Word = (n) => { const w = word(n); return w[0].toUpperCase() + w.slice(1) }

const VIEWS = {
  inbox: { name: 'Inbox', glyph: 'inbox', key: '1' },
  next: { name: 'Nächste', glyph: 'next', key: '2' },
  waiting: { name: 'Warten auf', glyph: 'waiting', key: '3' },
  projects: { name: 'Projekte', glyph: 'projects', key: '4' },
  someday: { name: 'Irgendwann', glyph: 'someday', key: '5' },
  review: { name: 'Wochenrückblick', glyph: 'review' },
  all: { name: 'Alle Todos', glyph: 'all' },
  settings: { name: 'Einstellungen', glyph: 'settings' },
}
const MAIN = ['inbox', 'next', 'waiting', 'projects', 'someday']

const ui = {
  sel: null, fx: null, fxState: 'idle', fxWait: null, shown: S.progress(), flights: 0,
  clarifyChoice: 'next', clarifyCtx: '@computer', clarifyDate: '2026-11-03', clarifyProject: '',
  pal: null, palSel: 0, palDone: false, noticeKey: null, noticeTimer: 0, planTab: 0, reviewDone: new Set(),
  selKey: null, fromReview: false, drag: null,
}
const st = S.state
const app = $('#app'), main = $('#main')

// ================================================================ 3D, loaded lazily
function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
function groundColor() { return getComputedStyle(document.body).backgroundColor }
function pebbleItems() {
  return S.lists().inbox.map((t) => ({ id: t.id }))
}
function wantsFx() { return (st.view === 'next' || st.view === 'inbox') && !reduced.matches }
async function loadFx() {
  if (ui.fxState !== 'idle') return ui.fxWait
  if (reduced.matches || !webglOk()) { ui.fxState = 'off'; return null }
  ui.fxState = 'loading'
  ui.fxWait = (async () => {
    try {
      const mod = await import('./fx3d.js')
      const fx = new mod.Fx({ onLost: () => { ui.fxState = 'off'; ui.fx = null; renderSlot() } })
      fx.setBackground(groundColor())
      fx.setLevel(ui.shown.level, { animate: false })
      fx.setPebbles(pebbleItems(), { animate: false })
      ui.fx = fx
      ui.fxState = 'ready'
      renderSlot()
      return fx
    } catch (e) {
      ui.fxState = 'off'
      renderSlot()
      return null
    }
  })()
  return ui.fxWait
}
function lensSize() { return phone.matches ? 72 : 136 }
// More than nine inbox items: nine pebbles and a "+N" mark, the caption keeps the real count.
function pebbleOverflow() { const n = S.counts().inbox; return n > 9 ? `<span class="slot-more">+${n - 9}</span>` : '' }

function renderSlot() {
  const slot = $('#slot')
  const v = st.view
  if (v !== 'next' && v !== 'inbox') { slot.innerHTML = ''; return }
  const size = lensSize()
  const cap = v === 'next'
    ? (phone.matches ? S.progressLabel(ui.shown, { short: true }) : S.progressLabel(ui.shown))
    : `${S.counts().inbox} zu klären`
  if (ui.fxState === 'ready' && ui.fx && !reduced.matches) {
    const mode = v === 'next' ? 'lens' : 'pebbles'
    // keep a static layer underneath while the canvas fades in on first mount
    if (!slot.querySelector('.fx-canvas')) {
      slot.innerHTML = `<div class="slot-static">${v === 'next' ? flatLens(ui.shown.level, { size }) : flatPebbles(S.counts().inbox, { size })}</div><span class="slot-cap">${cap}</span>${v === 'inbox' ? pebbleOverflow() : ''}`
      ui.fx.mount(slot, mode, size)
      ui.fx.canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }).onfinish = () => slot.querySelector('.slot-static')?.remove()
    } else {
      if (ui.fx.mode !== mode || ui.fx.size !== size) ui.fx.mount(slot, mode, size)
      const c = slot.querySelector('.slot-cap'); if (c) c.textContent = cap
      slot.querySelector('.slot-more')?.remove()
      if (v === 'inbox') slot.insertAdjacentHTML('beforeend', pebbleOverflow())
    }
    return
  }
  slot.innerHTML = `${v === 'next' ? flatLens(ui.shown.level, { size }) : flatPebbles(S.counts().inbox, { size })}<span class="slot-cap">${cap}</span>${v === 'inbox' ? pebbleOverflow() : ''}`
}

// ================================================================ rendering
function navCount(v, c) {
  if (v === 'inbox') return c.inbox
  if (v === 'next') return c.next
  if (v === 'waiting') return c.waiting
  if (v === 'projects') return c.projects
  if (v === 'someday') return c.someday
  return ''
}
function miniLens(level) {
  const h = 12 * clamp(level)
  return `<svg class="mini-lens" viewBox="0 0 14 14" aria-hidden="true"><clipPath id="ml"><circle cx="7" cy="7" r="6"/></clipPath><rect x="0" y="${13 - h}" width="14" height="${h + 1}" clip-path="url(#ml)" style="fill:var(--rw-action)"/><circle cx="7" cy="7" r="6.25" fill="none" style="stroke:var(--rw-ring)" stroke-width="1"/></svg>`
}
function renderSide() {
  const c = S.counts()
  const daysSince = Math.round((Date.parse(S.TODAY) - Date.parse(st.lastReview)) / 86400000)
  const item = (v) => {
    const V = VIEWS[v]
    const cur = st.view === v ? 'aria-current="page"' : ''
    let extra = ''
    if (v === 'next') extra = miniLens(ui.shown.level)
    if (v === 'waiting' && c.followUps) extra = '<span class="dot" title="Nachhaken fällig"></span>'
    if (v === 'projects' && c.stalled) extra = '<span class="dot" title="Projekt steht still"></span>'
    return `<button class="nav-item" data-view="${v}" ${cur}>${glyph(V.glyph)}<span>${V.name}</span><span class="n" data-count="${v}">${extra}${navCount(v, c)}</span>${V.key ? `<kbd class="key">${V.key}</kbd>` : ''}</button>`
  }
  $('#side').innerHTML = `
    <div class="brand">${brandMark(30)}<div><div class="brand-name">runway</div><div class="brand-by">by Agentic Reach</div></div></div>
    <button class="side-search" data-act="palette">${glyph('search', { size: 18 })}<span>Suchen</span><kbd>/</kbd></button>
    <nav class="nav">${MAIN.map(item).join('')}</nav>
    <div class="nav-h"><span class="slash">//</span> Überblick</div>
    <nav class="nav">
      <button class="nav-item" data-view="review" ${st.view === 'review' ? 'aria-current="page"' : ''}>${glyph('review')}<span>Wochenrückblick</span><span class="sub">${daysSince === 0 ? 'heute' : S.fmtDay(st.lastReview, { weekday: false })}${daysSince >= 7 ? ' <span class="dot"></span>' : ''}</span></button>
      <button class="nav-item" data-view="all" ${st.view === 'all' ? 'aria-current="page"' : ''}>${glyph('all')}<span>Alle Todos</span><span class="n"></span></button>
      <button class="nav-item" data-view="settings" ${st.view === 'settings' ? 'aria-current="page"' : ''}>${glyph('settings')}<span>Einstellungen</span><span class="n"></span></button>
    </nav>
    <div class="side-foot"><span class="avatar">U</span><div><div class="who">uli</div><button class="stand" data-act="refresh" title="Neu laden (R)"><span class="sync"></span>Stand ${S.NOW_LABEL}</button></div></div>`
}
function renderTabbar() {
  const c = S.counts()
  $('#tabbar').innerHTML = MAIN.map((v) => {
    const V = VIEWS[v]
    const badge = v === 'inbox' && c.inbox ? `<span class="badge">${c.inbox}</span>` : (v === 'projects' && c.stalled) || (v === 'waiting' && c.followUps) ? '<span class="badge"><span class="dot"></span></span>' : ''
    return `<button class="tab" data-view="${v}" ${st.view === v ? 'aria-current="page"' : ''}><span class="ind">${glyph(V.glyph)}</span>${V.name}${badge}</button>`
  }).join('')
}

const DATE_LONG = 'Samstag, 31. Oktober'
function headModel() {
  const m = headModelBase()
  // a list opened from the weekly review offers the way back
  if (ui.fromReview && ['inbox', 'next', 'waiting', 'projects', 'someday'].includes(st.view) && !st.projectName) {
    m.eyebrow = `<button class="back" data-act="to-review">${glyph('back', { size: 16 })}Wochenrückblick</button>`
  }
  return m
}
function headModelBase() {
  const v = st.view
  const c = S.counts()
  const p = ui.shown
  const L = S.lists()
  if (v === 'next') {
    const open = p.total - p.done
    const overdue = c.overdue
    let lede
    if (!p.total) lede = 'Für heute ist nichts <em>vorgemerkt</em>. Mit T merkst du ein Todo vor.'
    else if (!open) lede = 'Alles für <em>heute</em> ist erledigt.'
    else lede = `Noch ${word(open)} für <em>heute</em>${overdue ? `, ${word(overdue)} davon überfällig` : ''}.`
    return { eyebrow: `<span class="slash">//</span> ${phone.matches ? 'Sa 31.10.' : DATE_LONG} · Stand ${S.NOW_LABEL}`, title: 'Nächste', lede, slot: true }
  }
  if (v === 'inbox') {
    const n = c.inbox
    const oldest = L.inbox.length ? L.inbox[L.inbox.length - 1] : null
    const lede = n === 0 ? 'Alles <em>geklärt</em>. Neues landet hier, bis du es einordnest.'
      : n === 1 ? 'Ein Todo wartet darauf, <em>geklärt</em> zu werden.'
      : `${Word(n)} Todos warten darauf, <em>geklärt</em> zu werden.`
    // phone: only Stand (the old row carries its age and the attention dot)
    return { eyebrow: `<span class="slash">//</span> ${phone.matches ? '' : `${oldest ? `Ältestes ${S.age(oldest.entry)}` : 'Leer'} · `}Stand ${S.NOW_LABEL}`, title: 'Inbox', lede, slot: true }
  }
  if (v === 'waiting') {
    const f = c.followUps
    return { eyebrow: `<span class="slash">//</span> ${c.waiting} offen · ${f} Nachhaken fällig · Stand ${S.NOW_LABEL}`, title: 'Warten auf', lede: f ? `Bei <em>${f === 1 ? 'einem' : word(f)}</em> ist Nachhaken fällig.` : 'Nichts zum <em>Nachhaken</em>. Die anderen sind dran.' }
  }
  if (v === 'projects') {
    if (st.projectName) {
      const pr = S.projectOverview().find((x) => x.name === st.projectName)
      return { eyebrow: `<button class="back" data-act="projects-back">${glyph('back', { size: 16 })}Projekte</button>`, title: esc(pr.name), lede: `<span class="outcome"><b>Ergebnis</b>${esc(pr.outcome)}</span>`, project: pr }
    }
    const s = c.stalled
    return { eyebrow: `<span class="slash">//</span> ${c.projects} aktiv · ${s} steht still · Stand ${S.NOW_LABEL}`, title: 'Projekte', lede: s ? `<em>${s === 1 ? 'Eines' : Word(s)}</em> steht still. Leg eine nächste Aktion fest.` : 'Jedes aktive Projekt hat eine <em>nächste</em> Aktion.' }
  }
  if (v === 'someday') return { eyebrow: `<span class="slash">//</span> ${L.someday.length} Ideen · ${L.tickler.length} zurückgelegt · Stand ${S.NOW_LABEL}`, title: 'Irgendwann', lede: 'Ohne Druck. Im Wochenrückblick schaust du sie <em>wieder</em> an.' }
  if (v === 'review') {
    const d = Math.round((Date.parse(S.TODAY) - Date.parse(st.lastReview)) / 86400000)
    return { eyebrow: `<span class="slash">//</span> Zuletzt ${d === 0 ? 'heute' : `am ${S.fmtDay(st.lastReview, { weekday: false })}, vor ${d} Tagen`}`, title: 'Wochenrückblick', lede: 'Sechs Schritte, dann ist der Kopf <em>frei</em>.' }
  }
  if (v === 'all') return { eyebrow: `<span class="slash">//</span> Nach Dringlichkeit`, title: 'Alle Todos', lede: 'Alles, was offen ist, an <em>einem</em> Ort.' }
  return { eyebrow: '<span class="slash">//</span> Konto, Geräte, Claude', title: 'Einstellungen', lede: 'Was runway über dich <em>weiß</em> und wie es aussieht.' }
}
function renderHead() {
  const m = headModel()
  const head = $('#head')
  head.classList.toggle('no-slot', !m.slot)
  $('#eyebrow').innerHTML = m.eyebrow
  $('#title').innerHTML = m.title
  $('#lede').innerHTML = m.lede
  const p = ui.shown
  let ro = ''
  if (st.view === 'next') ro = `<div class="big compact-only"><span class="roll">${p.done}</span><small>/${p.total}</small></div>`
  if (m.project) {
    const pr = m.project
    ro = `<div class="head-acts"><div class="seg" role="group" aria-label="Status">${[['active', 'Aktiv'], ['on_hold', 'Pausiert'], ['done', 'Erledigt']].map(([k, l]) => `<button data-act="pstatus" data-v="${k}" aria-pressed="${pr.status === k}">${l}</button>`).join('')}</div><button class="pill" data-act="plan">${glyph('plan', { size: 16 })}Planen</button></div>`
  }
  ro += `<button class="icon-btn phone-only" data-act="palette" aria-label="Suchen">${glyph('search')}</button>`
  $('#readout').innerHTML = ro
  renderSlot()
}
function renderChips() {
  const el = $('#chips')
  if (st.view !== 'next') { el.innerHTML = ''; return }
  const open = st.tasks.filter(S.isNext)
  const all = `<button class="chip" data-ctx="" aria-pressed="${!st.context}">Alle<span class="n">${open.length}</span></button>`
  el.innerHTML = all + S.contexts().map((c) => {
    const n = open.filter((t) => S.ctxOf(t).includes(c)).length
    return `<button class="chip" data-ctx="${c}" aria-pressed="${st.context === c}">${c}<span class="n">${n}</span></button>`
  }).join('')
}

function statusWord(t, list) {
  if (list === 'inbox') return 'Inbox'
  if (list === 'waiting') return S.followUpDue(t) ? 'Nachhaken fällig' : 'Wartet'
  if (S.isOverdue(t)) return 'überfällig'
  if (t.due && S.dayOf(t.due) === S.TODAY) return 'fällig heute'
  return 'Nächste'
}
function metaHtml(t, list) {
  const m = []
  if (list === 'inbox' && S.isStale(t)) m.push(`<span class="attn"><span class="dot"></span>${S.age(t.entry)}</span>`)
  if (S.isRunning(t)) m.push('<span class="run"><span class="pulse"></span>läuft</span>')
  if (t.due && t.status === 'pending') {
    const d = S.dayOf(t.due)
    if (d < S.TODAY) m.push(`<span class="warn">überfällig seit ${S.fmtDay(d)}</span>`)
    else if (d === S.TODAY) m.push('<span class="today-due">fällig heute</span>')
    else m.push(`<span>fällig ${S.relDay(d)}</span>`)
  }
  if (list === 'next' && S.isMarkedToday(t) && !S.isRunning(t)) m.push(`<span class="mark-today">${glyph('today', { size: 13 })}für heute</span>`)
  if (list === 'waiting') {
    const fu = S.followUp(t)
    if (S.followUpDue(t)) m.push(`<span class="attn"><span class="dot"></span>Nachhaken ${fu < S.TODAY ? `seit ${S.fmtDay(fu)}` : 'heute'}</span>`)
    else if (fu) m.push(`<span>Wiedervorlage ${S.fmtDay(fu)}</span>`)
  }
  if (t.project && !(st.view === 'projects' && st.projectName)) m.push(`<span class="proj">${esc(t.project)}</span>`)
  const ctx = S.ctxOf(t)
  if (ctx.length && list !== 'inbox') m.push(`<span class="ctx">${ctx.join(' ')}</span>`)
  if (t.priority === 'H') m.push('<span class="prio">↑ hoch</span>')
  if (list === 'inbox') {
    if (!S.isStale(t)) m.push(`<span>${S.age(t.entry)}</span>`)
    if (t.annotations?.length) m.push(`<span>${glyph('note', { size: 13, cls: 'inl' })}</span>`)
  }
  if (list === 'waiting' && t.annotations?.length) m.push(`<span>${esc(t.annotations[t.annotations.length - 1].description)}</span>`)
  if (t.status === 'completed') m.push(`<span>erledigt ${S.relDay(S.dayOf(t.end))}</span>`)
  return m.length ? `<span class="meta">${m.join('')}</span>` : ''
}
// key = section + id: a due next action is shown twice (Fällig and Nächste Aktionen), and the
// selection belongs to one of the two rows.
function rowHtml(t, list, { isNew = false, key = `${list}-${t.id}` } = {}) {
  const cls = ['row']
  if (S.isOverdue(t)) cls.push('is-overdue')
  if (t.status === 'completed') cls.push('is-done')
  if (ui.selKey ? ui.selKey === key : ui.sel === t.id) cls.push('is-sel')
  if (isNew) cls.push('is-new')
  const label = `${t.description}, ${statusWord(t, list)}, ID ${t.uuid.slice(-8)}`
  let acts = ''
  if (list === 'inbox') acts = `<button class="pill" data-act="clarify" tabindex="-1">Klären <kbd>↵</kbd></button><button class="icon-btn" data-act="delete" aria-label="Löschen" tabindex="-1">${glyph('trash', { size: 18 })}</button>`
  else if (t.status === 'pending') acts = `<button class="icon-btn" data-act="today" aria-pressed="${S.isMarkedToday(t)}" aria-label="Für heute" title="Für heute (T)" tabindex="-1">${glyph('today', { size: 18 })}</button><button class="icon-btn" data-act="start" aria-label="${t.start ? 'Pausieren' : 'Starten'}" title="${t.start ? 'Pausieren' : 'Starten'} (S)" tabindex="-1">${glyph(t.start ? 'pause' : 'play', { size: 18 })}</button><button class="icon-btn" data-act="open" aria-label="Details" tabindex="-1">${glyph('chevron', { size: 18 })}</button>`
  // the row body is a real button: Tab reaches it, Enter opens details (Klären in the Inbox)
  return `<div class="${cls.join(' ')}" data-id="${t.id}" data-key="${key}" data-list="${list}" role="listitem" aria-label="${esc(label)}">
    <button class="ring" data-act="done" aria-label="Abhaken: ${esc(t.description)}"><i>${glyph('check', { size: 14 })}</i></button>
    <button class="row-body" data-act="${list === 'inbox' ? 'clarify' : 'open'}" aria-label="${esc(`${list === 'inbox' ? 'Klären' : 'Öffnen'}: ${t.description}`)}"><span class="row-text">${esc(t.description)}</span>${metaHtml(t, list)}</button>
    <div class="row-acts">${acts}</div></div>`
}
function section(title, rows, list, { empty = '', hint = '', newId = null, always = false, sec = list, groups = null } = {}) {
  if (!rows.length && !always) return ''
  const body = (arr) => arr.map((t) => rowHtml(t, list, { isNew: t.id === newId, key: `${sec}-${t.id}` })).join('')
  let inner
  if (!rows.length) inner = `<div class="empty">${empty}</div>`
  else if (groups) inner = groups.filter((g) => g.rows.length).map((g, i) => `${g.label ? `<div class="grp${i ? ' grp-gap' : ''}" aria-hidden="true">${g.label}</div>` : ''}${body(g.rows)}`).join('')
  else inner = body(rows)
  return `<h2 class="sec-h"><span class="slash">//</span> ${title} <span class="n">${rows.length || ''}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</h2>
  <div class="card" role="list" aria-label="${title}">${inner}</div>`
}
function bigEmpty(t, s) { return `<div class="card"><div class="empty-big"><div class="t">${t}</div><p>${s}</p></div></div>` }

function renderList({ newId = null } = {}) {
  const L = S.lists()
  const v = st.view
  let h = ''
  if (v === 'next') {
    // the contract shape (P08): Fällig first, then exactly /gtd/next; "für heute" is a group
    h += section('Fällig', L.due, 'next', { sec: 'due', empty: 'Nichts fällig', always: true, hint: L.due.length ? 'ohne Kontextfilter' : '' })
    h += section('Nächste Aktionen', L.next, 'next', {
      sec: 'next', empty: 'Keine nächsten Aktionen', always: true, hint: st.context ? `${st.context} und ohne Kontext` : '',
      groups: [{ label: L.today.length ? `${glyph('today', { size: 13 })}für heute <span class="n">${L.today.length}</span>` : '', rows: L.today }, { label: L.today.length ? 'weitere' : '', rows: L.later }],
    })
  } else if (v === 'inbox') {
    h += L.inbox.length ? section('Zu klären', L.inbox, 'inbox', { newId, hint: phone.matches || coarse.matches ? '' : 'Neueste oben · Enter klärt' }) : `<div style="height:22px"></div>${bigEmpty('Inbox ist leer', 'Mit N erfasst du Neues. Es landet hier, bis du es klärst.')}`
  } else if (v === 'waiting') {
    const due = L.waiting.filter(S.followUpDue), rest = L.waiting.filter((t) => !S.followUpDue(t))
    h += section('Nachhaken', due, 'waiting')
    h += section('Wartet', rest, 'waiting', { always: !due.length, empty: 'Du wartest auf nichts' })
  } else if (v === 'someday') {
    h += section('Irgendwann / Vielleicht', L.someday, 'someday', { always: true, empty: 'Keine Ideen geparkt' })
    h += section('Zurückgelegt', L.tickler, 'someday', { hint: 'kommt am Datum zurück' })
  } else if (v === 'all') {
    h += `<div class="sec-h" style="margin-top:18px"><button class="chip" data-act="showdone" aria-pressed="${st.showDone}">Erledigte zeigen</button></div>`
    h += section('Offen', L.all.filter((t) => t.status === 'pending'), 'all', { always: true })
    if (st.showDone) h += section('Erledigt', L.all.filter((t) => t.status === 'completed'), 'all')
  } else if (v === 'projects') h = st.projectName ? projectDetailHtml(st.projectName) : projectsHtml()
  else if (v === 'review') h = reviewHtml()
  else if (v === 'settings') h = settingsHtml()
  const hadFocus = !!document.activeElement?.closest?.('#list')
  $('#list').innerHTML = h
  if (hadFocus && ui.selKey) focusRow($(`#list .row[data-key="${ui.selKey}"]`))
}

function projectsHtml() {
  const ov = S.projectOverview()
  const row = (p) => `<div class="row proj-row" data-project="${esc(p.name)}" role="listitem" tabindex="-1">
    <span class="hexg">${glyph('projects')}</span>
    <button class="row-body" data-act="project"><span class="name">${esc(p.name)}</span><span class="out">${esc(p.outcome)}</span>
      ${p.stalled ? '<span class="stall-note"><span class="dot"></span>steht still, keine nächste Aktion</span>' : ''}</button>
    <div class="counts">${p.next ? `<span>${p.next} nächste</span>` : ''}${p.waiting ? `<span>${p.waiting} wartet</span>` : ''}${p.hasPlan ? `<span>${glyph('plan', { size: 14 })}</span>` : ''}${glyph('chevron', { size: 16 })}</div></div>`
  const stalled = ov.filter((p) => p.stalled), active = ov.filter((p) => p.status === 'active' && !p.stalled), hold = ov.filter((p) => p.status === 'on_hold'), done = ov.filter((p) => p.status === 'done')
  const sec = (t, list, hint = '') => list.length ? `<h2 class="sec-h"><span class="slash">//</span> ${t} <span class="n">${list.length}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</h2><div class="card" role="list">${list.map(row).join('')}</div>` : ''
  return sec('Steht still', stalled, 'aktiv, ohne nächste Aktion') + sec('Aktiv', active) + sec('Pausiert', hold) + sec('Erledigt', done) +
    `<h2 class="sec-h"><span class="slash">//</span> Neues Projekt</h2><form class="banner" data-form="newproject"><input name="p" placeholder="Name des Projekts" aria-label="Name des Projekts"><button class="pill" type="submit">Anlegen und planen</button></form>`
}
function projectDetailHtml(name) {
  const pr = S.projectOverview().find((p) => p.name === name)
  const mine = st.tasks.filter((t) => S.isOpen(t) && t.project === name)
  let h = ''
  if (pr.stalled) h += `<form class="banner" data-form="nextaction"><span class="dot"></span><span class="bt"><b>Steht still.</b> Was ist der nächste sichtbare Schritt?</span></form>
    <form class="banner" data-form="nextaction" style="margin-top:8px"><input name="d" placeholder="Nächste Aktion für ${esc(name)}" aria-label="Nächste Aktion"><select name="c" aria-label="Kontext" style="height:38px;border-radius:999px;border:1px solid var(--rw-line-strong);padding:0 10px;background:var(--rw-surface)">${S.contexts().map((c) => `<option>${c}</option>`).join('')}</select><button class="pill coral" type="submit">Festlegen</button></form>`
  h += section('Nächste Aktionen', mine.filter(S.isNext), 'next', { always: !pr.stalled, empty: 'Keine nächste Aktion' })
  h += section('Warten auf', mine.filter(S.isWaiting), 'waiting')
  h += section('Irgendwann', mine.filter(S.isSomeday), 'someday')
  h += section('Ohne Liste', mine.filter((t) => !S.isNext(t) && !S.isWaiting(t) && !S.isSomeday(t)), 'all')
  const done = st.tasks.filter((t) => t.project === name && t.status === 'completed')
  h += section('Erledigt', done, 'all')
  return h
}
function reviewHtml() {
  const c = S.counts(), L = S.lists()
  const steps = [
    ['inbox', 'Inbox leeren', c.inbox ? `${c.inbox} zu klären` : 'leer', 'Inbox klären'],
    ['next', 'Nächste durchsehen', `${c.next} Aktionen${c.overdue ? `, ${c.overdue} überfällig` : ''}`, 'Nächste öffnen'],
    ['waiting', 'Warten auf nachhaken', c.followUps ? `${c.followUps} Nachhaken fällig` : 'nichts fällig', 'Warten auf öffnen'],
    ['projects', 'Projekte prüfen', c.stalled ? `${c.stalled} steht still` : 'alle haben eine nächste Aktion', 'Projekte öffnen'],
    ['someday', 'Irgendwann durchsehen', `${L.someday.length} Ideen`, 'Irgendwann öffnen'],
    ['calendar', 'Kalender der nächsten zwei Wochen', 'Termine, die Todos brauchen', ''],
  ]
  return `<h2 class="sec-h"><span class="slash">//</span> Schritte <span class="n">${ui.reviewDone.size} von 6</span></h2><div class="card steps" role="list">${steps.map(([k, t, s, a], i) => `
    <div class="row ${ui.reviewDone.has(k) ? 'is-done' : ''}" data-step="${k}" role="listitem">
      <button class="ring" data-act="step" aria-label="Schritt erledigt: ${t}"><i>${glyph('check', { size: 14 })}</i></button>
      <div class="row-body"><span class="row-text"><span class="step-n">0${i + 1}</span>&nbsp; ${t}</span><span class="meta"><span>${s}</span></span></div>
      <div>${a ? `<button class="pill quiet" data-act="review-open" data-v="${k}">${a}${glyph('chevron', { size: 14 })}</button>` : ''}</div></div>`).join('')}</div>
    <div style="display:flex;gap:10px;margin-top:18px;align-items:center"><button class="pill coral lg" data-act="review-done">Rückblick abschließen</button><span class="meta" style="margin:0">Wird für Claude und den nächsten Rückblick gespeichert.</span></div>`
}
function settingsHtml() {
  return `<div class="settings">
    <section class="set-card"><h2>Konto</h2><p>Angemeldet als uli. Name und E-Mail ändern, Passwort neu setzen.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pill">Profil bearbeiten</button><button class="pill">Passwort ändern</button><button class="pill quiet">Abmelden</button></div></section>
    <section class="set-card"><h2>Darstellung</h2><p>Hell und dunkel folgen dem System. Effekte folgen „Bewegung reduzieren“.</p><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><div class="seg"><button aria-pressed="true">System</button><button>Hell</button><button>Dunkel</button></div><div class="seg"><button aria-pressed="${!reduced.matches}">Effekte an</button><button aria-pressed="${reduced.matches}">Reduziert</button></div></div></section>
    <section class="set-card"><h2>Kontexte</h2><p>Gelten im Web und auf dem Telefon. Reihenfolge = Reihenfolge der Chips.</p><div style="display:flex;gap:6px;flex-wrap:wrap">${S.contexts().map((c) => `<span class="chip sm">${c}</span>`).join('')}<button class="chip sm">+ Kontext</button></div></section>
    <section class="set-card"><h2>API-Key</h2><p>Für die Android-App („Key einfügen“) und für Claude.</p><div class="code">rw_••••••••••••••••••••3f9a</div><div style="display:flex;gap:8px;margin-top:10px"><button class="pill">Anzeigen</button><button class="pill">Kopieren</button><button class="pill quiet">Neu erzeugen</button></div></section>
    <section class="set-card"><h2>Claude verbinden</h2><p>MCP-Server: ${location.origin}/api/mcp</p><div class="seg" style="margin-bottom:10px"><button aria-pressed="true">Claude Code</button><button>Claude Desktop</button><button>curl</button></div><div class="code">claude mcp add runway --transport http ${location.origin}/api/mcp</div></section>
  </div>`
}

function renderPanel() {
  const panel = $('#panel')
  const t = ui.clarifyId ? S.find(ui.clarifyId) : st.openId ? S.find(st.openId) : null
  if (!t) {
    panel.hidden = true; app.classList.remove('has-panel'); $('#scrim').hidden = true
    st.openId = null; ui.clarifyId = null
    return
  }
  panel.innerHTML = ui.clarifyId ? clarifyHtml(t) : detailHtml(t)
  panel.hidden = false
  app.classList.add('has-panel')
  $('#scrim').hidden = !phone.matches
}
function detailHtml(t) {
  const list = S.listOf(t)
  const listKey = S.isInbox(t) ? 'inbox' : S.isWaiting(t) ? 'waiting' : S.isSomeday(t) ? 'someday' : S.isNext(t) ? 'next' : ''
  const ctxs = S.ctxOf(t)
  const dueVal = t.due ? S.dayOf(t.due) : ''
  const notes = (t.annotations || []).map((a) => `<div class="note"><span class="nd"></span><div>${esc(a.description)}<span class="when">${S.fmtDay(S.dayOf(a.entry), { weekday: false })}2026, ${a.entry.slice(9, 11) * 1 + 1}:${a.entry.slice(11, 13)}</span></div></div>`).join('')
  return `<div class="p-head"><span class="p-eyebrow"><span class="slash">//</span> ${list}</span><button class="icon-btn" data-act="close" aria-label="Schließen (Esc)">${glyph('close')}</button></div>
  <div class="p-body">
    <div class="p-title" data-id="${t.id}"><button class="ring" data-act="done" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><i>${glyph('check', { size: 14 })}</i></button><textarea rows="1" data-field="description" aria-label="Beschreibung">${esc(t.description)}</textarea></div>
    <div style="margin:16px 0 0"><div class="seg" role="group" aria-label="Liste">${[['inbox', 'Inbox'], ['next', 'Nächste'], ['waiting', 'Warten auf'], ['someday', 'Irgendwann']].map(([k, l]) => `<button data-act="move" data-v="${k}" aria-pressed="${listKey === k}">${l}</button>`).join('')}</div></div>
    <dl class="fields">
      <dt>Projekt</dt><dd><input type="text" data-field="project" value="${esc(t.project || '')}" placeholder="Kein Projekt" list="projlist" aria-label="Projekt" style="flex:1"><datalist id="projlist">${st.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist></dd>
      <dt>Kontext</dt><dd>${S.contexts().map((c) => `<button class="chip sm" data-act="ctx" data-v="${c}" aria-pressed="${ctxs.includes(c)}">${c}</button>`).join('')}</dd>
      <dt>Für heute</dt><dd><button class="switch" role="switch" data-act="today" aria-checked="${S.isMarkedToday(t)}" aria-label="Für heute vormerken"></button><span class="muted">${S.isMarkedToday(t) ? 'vorgemerkt, zählt in die Tageslinse' : 'zählt dann in die Tageslinse'}</span></dd>
      <dt>Fällig</dt><dd><input type="date" data-field="due" value="${dueVal}" aria-label="Fällig">${S.isOverdue(t) ? '<span class="meta" style="margin:0"><span class="warn">überfällig</span></span>' : ''}</dd>
      <dt>Priorität</dt><dd><div class="seg">${[['H', 'Hoch'], ['M', 'Mittel'], ['L', 'Niedrig']].map(([k, l]) => `<button data-act="prio" data-v="${k}" aria-pressed="${t.priority === k}">${l}</button>`).join('')}</div></dd>
    </dl>
    <details class="more-fields"><summary>${glyph('plus', { size: 14 })}Tags, Zurücklegen, Wiederholung, Blockiert durch, Läuft ab</summary>
      <dl class="fields" style="margin-top:6px">
        <dt>Tags</dt><dd>${t.tags.flatMap((x) => String(x).split(',')).filter((x) => x && !x.startsWith('@') && !['next', 'waiting', 'someday'].includes(x)).map((x) => `<span class="chip sm">${esc(x)}</span>`).join('') || '<span class="muted">keine weiteren</span>'}<button class="chip sm">+ Tag</button></dd>
        <dt>Zurücklegen</dt><dd><input type="date" aria-label="Zurücklegen bis" value="${t.wait ? S.dayOf(t.wait) : ''}"><span class="muted">bis dahin in keiner Liste</span></dd>
        <dt>Wiederholung</dt><dd><div class="seg"><button>täglich</button><button>wöchentlich</button><button>monatlich</button></div><span class="muted">braucht ein Fälligkeitsdatum</span></dd>
        <dt>Blockiert durch</dt><dd><span class="muted">Kein anderes Todo</span><button class="pill quiet">Auswählen</button></dd>
        <dt>Läuft ab</dt><dd><input type="date" aria-label="Läuft ab am"></dd>
      </dl></details>
    <div class="notes"><h3>Notizen</h3>${notes}<input class="note-add" data-field="note" placeholder="Notiz hinzufügen, Enter speichert" aria-label="Notiz hinzufügen"></div>
  </div>
  <div class="p-meta">Erfasst ${S.fmtDay(S.dayOf(t.entry), { weekday: false })}2026 · Dringlichkeit ${String(t.urgency).replace('.', ',')} · ID ${t.uuid.slice(-8)}</div>
  <div class="p-foot">${t.status === 'pending' ? `<button class="pill coral lg" data-act="done" data-id="${t.id}">${glyph('check', { size: 16 })}Abhaken</button><button class="pill lg" data-act="start">${glyph(t.start ? 'pause' : 'play', { size: 16 })}${t.start ? 'Pausieren' : 'Starten'}</button>` : '<span class="meta">Erledigt</span>'}<span class="grow"></span><button class="pill quiet" data-act="delete">${glyph('trash', { size: 16 })}Löschen</button></div>`
}
// Touch (phone web, like Android's Klären sheet): one tap applies. Nächste Aktion and Projekt
// unfold their context chips; tapping a chip applies. No keys, no "Übernehmen".
function clarifyTouchHtml(t) {
  const inbox = S.lists().inbox
  const idx = inbox.findIndex((x) => x.id === t.id)
  const c = ui.clarifyChoice
  const chips = (kind) => `<div class="opt-extra">${kind === 'project' ? `<label>Projekt</label><input type="text" data-field="cproj" list="cprojlist" value="${esc(ui.clarifyProject)}" placeholder="Name, neu oder bestehend" style="flex:1"><datalist id="cprojlist">${st.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist><label>Kontext, ein Tipp legt es an</label>` : ''}${S.contexts().map((x) => `<button class="chip" data-act="ctap" data-v="${kind}:${x}">${x}</button>`).join('')}</div>`
  const opt = (k, g, title, desc, unfold = false) => `<div><button class="opt" data-act="${unfold ? 'copt' : 'ctap'}" data-v="${k}" aria-expanded="${unfold ? c === k : 'false'}"><span class="og">${glyph(g)}</span><span><span class="ot">${title}</span><span class="od">${desc}</span></span></button>${unfold && c === k ? chips(k) : ''}</div>`
  return `<div class="p-head"><span class="p-eyebrow"><span class="slash">//</span> Klären · ${idx + 1} von ${inbox.length}</span><button class="icon-btn" data-act="close" aria-label="Schließen">${glyph('close')}</button></div>
  <div class="p-body">
    <div class="p-title" style="grid-template-columns:1fr;margin-left:0"><textarea rows="1" data-field="cdesc" aria-label="Beschreibung">${esc(t.description)}</textarea></div>
    <p class="clarify-q">Was ist der <em>nächste</em> Schritt?</p>
    <div class="opts">
      ${opt('next', 'next', 'Nächste Aktion', 'Kontext antippen, fertig.', true)}
      ${opt('waiting', 'waiting', 'Warten auf', 'Nachhaken in drei Tagen.')}
      ${opt('project', 'projects', 'Projekt', 'Mehr als ein Schritt.', true)}
      ${opt('someday', 'someday', 'Irgendwann', 'Nicht jetzt.')}
      ${opt('tickler', 'calendar', 'Zurücklegen', 'Kommt in einer Woche zurück.')}
      ${opt('done', 'check', 'Sofort erledigt', 'Unter zwei Minuten.')}
      ${opt('delete', 'trash', 'Löschen', 'Nicht nötig.')}
    </div>
  </div>
  <div class="p-foot"><button class="pill quiet" data-act="cskip">Überspringen</button><span class="grow"></span><span class="meta" style="margin:0">dann das nächste</span></div>`
}
function clarifyHtml(t) {
  if (phone.matches || coarse.matches) return clarifyTouchHtml(t)
  const inbox = S.lists().inbox
  const idx = inbox.findIndex((x) => x.id === t.id)
  const c = ui.clarifyChoice
  const ctxChips = (sel) => S.contexts().map((x, i) => `<button class="chip sm" data-act="cctx" data-v="${x}" aria-pressed="${sel === x}">${x}<span class="n">${i + 1}</span></button>`).join('')
  const opt = (k, key, g, title, desc, extra = '') => `<div><button class="opt" data-act="copt" data-v="${k}" aria-pressed="${c === k}"><span class="og">${glyph(g)}</span><span><div class="ot">${title}</div><div class="od">${desc}</div></span><kbd>${key}</kbd></button>${c === k && extra ? `<div class="opt-extra">${extra}</div>` : ''}</div>`
  const projList = `<datalist id="cprojlist">${st.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>`
  return `<div class="p-head"><span class="p-eyebrow"><span class="slash">//</span> Klären · ${idx + 1} von ${inbox.length}</span><button class="icon-btn" data-act="close" aria-label="Schließen (Esc)">${glyph('close')}</button></div>
  <div class="p-body">
    <div class="p-title" style="grid-template-columns:1fr;margin-left:0"><textarea rows="1" data-field="cdesc" aria-label="Beschreibung">${esc(t.description)}</textarea></div>
    ${(t.annotations || []).map((a) => `<div class="note"><span class="nd"></span><div>${esc(a.description)}</div></div>`).join('')}
    <div class="meta" style="margin-top:6px"><span>erfasst ${S.age(t.entry)}</span></div>
    <p class="clarify-q">Was ist der <em>nächste</em> Schritt?</p>
    <div class="opts">
      ${opt('next', 'N', 'next', 'Nächste Aktion', 'Du tust es selbst. Wähl den Kontext.', `<label>Kontext</label>${ctxChips(ui.clarifyCtx)}<label>Projekt, optional</label><input type="text" data-field="cproj" list="cprojlist" value="${esc(ui.clarifyProject)}" placeholder="Kein Projekt" style="flex:1">${projList}`)}
      ${opt('waiting', 'W', 'waiting', 'Warten auf', 'Jemand anderes ist dran.', `<label>Nachhaken am</label><input type="date" data-field="cdate" value="${ui.clarifyDate}">`)}
      ${opt('project', 'P', 'projects', 'Projekt', 'Mehr als ein Schritt. Dies wird die erste Aktion.', `<label>Projekt</label><input type="text" data-field="cproj" list="cprojlist" value="${esc(ui.clarifyProject)}" placeholder="Name, neu oder bestehend" style="flex:1">${projList}<label>Kontext</label>${ctxChips(ui.clarifyCtx)}`)}
      ${opt('someday', 'I', 'someday', 'Irgendwann', 'Nicht jetzt, vielleicht später.')}
      ${opt('tickler', 'Z', 'calendar', 'Zurücklegen', 'Kommt an einem Tag zurück in die Inbox.', `<label>Zurück am</label><input type="date" data-field="cdate" value="2026-11-07">`)}
      ${opt('done', 'E', 'check', 'Sofort erledigt', 'Dauert unter zwei Minuten.')}
      ${opt('delete', 'L', 'trash', 'Löschen', 'Nicht nötig.')}
    </div>
  </div>
  <div class="p-foot"><button class="pill coral lg" data-act="capply">Übernehmen <kbd>↵</kbd></button><button class="pill quiet" data-act="cskip">Überspringen</button><span class="grow"></span><span class="meta" style="margin:0">dann das nächste</span></div>`
}

function renderAll(opts = {}) {
  if (!ui.flights) ui.shown = S.progress()
  renderSide(); renderTabbar(); renderHead(); renderChips(); renderList(opts); renderPanel()
  if (ui.fxState === 'ready' && ui.fx && !ui.flights) ui.fx.setLevel(ui.shown.level)
}
function renderChrome() {
  renderSide(); renderTabbar(); renderChips()
  if (!ui.flights) { ui.shown = S.progress(); renderHead() }
}

// ================================================================ signature: bead along the throughline into the lens
const easeOut = (k) => 1 - (1 - k) ** 3
function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  return (x) => {
    let t = x
    for (let i = 0; i < 6; i++) { const f = ((ax * t + bx) * t + cx) * t - x; const d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-6) break; t -= f / d }
    t = clamp(t)
    return ((ay * t + by) * t + cy) * t
  }
}
const easePull = bezierEase(0.55, 0, 0.25, 1)

function flyToLens(rowEl, after) {
  const ring = rowEl.querySelector('.ring i').getBoundingClientRect()
  const slot = $('#slot').getBoundingClientRect()
  const P0 = { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 }
  const k = slot.width / lensSize()
  let E
  if (ui.fxState === 'ready' && ui.fx) { const e = ui.fx.beadEntry(); E = { x: slot.left + e.x * k, y: slot.top + e.y * k } } else E = { x: slot.left + slot.width / 2, y: slot.top + slot.height * 0.1 }
  // route: out of the row into the gutter left of the cards, up the gutter, hook over the lens
  const card = rowEl.closest('.card')?.getBoundingClientRect() || ring
  const gx = Math.min(card.left, slot.left) - 14
  const P1 = { x: gx, y: Math.min(P0.y - 36, slot.top + slot.height * 0.62) }
  const up = Math.max(0, P0.y - 36 - P1.y)
  const d = `M${P0.x},${P0.y} C${P0.x - 8},${P0.y - 20} ${gx},${P0.y - 6} ${gx},${P0.y - 36}`
    + (up > 1 ? ` L${gx},${P1.y}` : '')
    + ` C${gx},${slot.top - 2 * k} ${E.x - slot.width * 0.4},${E.y - 18 * k - 6} ${E.x},${E.y}`
  const svg = $('#flight')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  const L = path.getTotalLength()
  const bead = document.createElement('div')
  bead.className = 'bead'
  document.body.appendChild(bead)
  ui.flights += 1
  const T_DRAW = 260, T_START = 120, T_FLY = 600
  const t0 = performance.now()
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = now - t0
      const drawn = easeOut(clamp(t / T_DRAW)) * L
      const kb = easePull(clamp((t - T_START) / T_FLY))
      const s = kb * L
      path.style.strokeDasharray = `${Math.max(0, drawn - s)} ${L * 2}`
      path.style.strokeDashoffset = `${-s}`
      const p = path.getPointAtLength(s)
      bead.style.transform = `translate(${p.x}px, ${p.y}px)`
      bead.style.opacity = t >= T_START - 30 ? '1' : '0'
      if (kb < 1) { requestAnimationFrame(frame); return }
      bead.remove(); path.remove()
      const done = () => {
        ui.flights = Math.max(0, ui.flights - 1)
        if (!ui.flights) { ui.shown = S.progress(); renderHead(); renderSide(); const r = $('#head .roll'); r && r.classList.add('up') }
        resolve()
      }
      if (ui.fxState === 'ready' && ui.fx && st.view === 'next') ui.fx.dropBead({ nextLevel: after.level, beadPx: 6 / k }).then(done)
      else done()
    }
    requestAnimationFrame(frame)
  })
}

function animateRowOut(rowEl, delay) {
  setTimeout(() => {
    if (!rowEl.isConnected) return
    rowEl.style.height = `${rowEl.offsetHeight}px`
    rowEl.classList.add('is-leaving')
    requestAnimationFrame(() => Object.assign(rowEl.style, { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0' }))
    setTimeout(() => {
      rowEl.remove()
      // redraw once the row is gone: section counts, empty groups and empty states stay true
      if (!$('#list .row.is-leaving')) renderList()
      renderChips()
    }, 200)
  }, delay)
}

// Only a todo that counts for today (Fällig or für heute) sends a bead into the lens. Any other
// completion fills the ring and shows the notice; the caption counts it as "zusätzlich".
function completeWithFeedback(id, srcRow = null) {
  const t = S.find(id)
  if (!t || t.status !== 'pending') return null
  const rowEls = $$(`#list .row[data-id="${t.id}"]`) // a due next action is shown twice
  const rowEl = srcRow && srcRow.isConnected ? srcRow : rowEls[0]
  const planned = S.countsForToday(t)
  const fly = rowEl && st.view === 'next' && planned && !reduced.matches
  if (fly) ui.flights += 1 // hold the readout until the bead lands
  // keep the keyboard selection on the neighbour of the row that leaves
  if (rowEl && ui.selKey === rowEl.dataset.key) {
    const all = $$('#list .row[data-id]').filter((r) => r.dataset.id !== String(t.id))
    const below = $$('#list .row[data-id]').slice($$('#list .row[data-id]').indexOf(rowEl) + 1).find((r) => r.dataset.id !== String(t.id))
    const nb = below || all[all.length - 1]
    ui.selKey = nb?.dataset.key || null; ui.sel = nb ? +nb.dataset.id : null
    if (nb) { nb.classList.add('is-sel'); focusRow(nb) }
  }
  const h = S.complete(t.id)
  const after = S.progress()
  if (st.openId === t.id) { st.openId = null; renderPanel() }
  if (rowEls.length) {
    rowEls.forEach((r) => {
      r.classList.add('is-done')
      const i = r.querySelector('.ring i'); i.classList.add('pinch'); setTimeout(() => i.classList.remove('pinch'), 140)
      animateRowOut(r, reduced.matches ? 200 : 480)
    })
  } else if (st.view !== 'next') renderList()
  if (fly) { flyToLens(rowEl, after).then(() => {}); ui.flights -= 1 } else { ui.shown = after; renderHead(); renderSide(); if (ui.fx && planned) ui.fx.setLevel(after.level, { animate: !reduced.matches }) }
  showNotice(`Erledigt: ${t.description}`, h)
  $('#live').textContent = `Erledigt: ${t.description}. Heute ${S.progressLabel(after, { heute: false })}.`
  return h
}

// ================================================================ notice + undo
// The notice never covers the rows you work on. Desktop: it sits in the dock row, beside the
// capture field. Phone: it stacks above the field, the list gets its height as extra bottom
// padding, and the selected row is scrolled above it.
function showNotice(text, hold) {
  const n = $('#notice')
  clearTimeout(ui.noticeTimer)
  ui.noticeKey = hold?.key || null
  n.innerHTML = `<span class="txt">${esc(text)}</span>${hold ? `<button class="undo" data-act="undo">Rückgängig <kbd>Z</kbd></button><span class="timer"></span>` : ''}`
  n.hidden = false
  app.classList.add('has-notice')
  n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''
  const timer = n.querySelector('.timer')
  if (timer && !reduced.matches) timer.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: S.UNDO_MS, easing: 'linear', fill: 'forwards' })
  ui.noticeTimer = setTimeout(hideNotice, hold ? S.UNDO_MS : 3000)
  requestAnimationFrame(keepSelVisible)
}
function hideNotice() { $('#notice').hidden = true; ui.noticeKey = null; app.classList.remove('has-notice') }
function keepSelVisible() {
  const r = ui.selKey && $(`#list .row[data-key="${ui.selKey}"]`)
  if (!r) return
  const dock = $('#dock').getBoundingClientRect(), rr = r.getBoundingClientRect()
  const over = rr.bottom - (dock.top + (phone.matches ? 0 : 20))
  if (over > 0) main.scrollBy({ top: over + 12, behavior: reduced.matches ? 'auto' : 'smooth' })
}
function doUndo() {
  const h = S.undo(ui.noticeKey || undefined)
  hideNotice()
  if (h) showNotice('Rückgängig gemacht')
}
function refresh() {
  // prototype: the data is fixed. In the app: reload the lists, then "Stand" moves on.
  const b = $('.side-foot .sync'); b && b.animate([{ opacity: 1, transform: 'scale(1.6)' }, { opacity: 0.7, transform: 'none' }], { duration: 420 })
  showNotice(`Neu geladen · Stand ${S.NOW_LABEL}`)
}

// ================================================================ actions
function setView(v, { keepPanel = false, fromReview = false } = {}) {
  if (!VIEWS[v]) return
  st.view = v
  ui.fromReview = fromReview
  if (v !== 'projects') st.projectName = null
  if (!keepPanel) { st.openId = null; ui.clarifyId = null }
  ui.sel = null; ui.selKey = null
  // the Inbox opens with its first item selected, so Enter clarifies at once
  if (v === 'inbox') { const first = S.lists().inbox[0]; if (first) { ui.sel = first.id; ui.selKey = `inbox-${first.id}` } }
  main.scrollTop = 0
  $('#head').classList.remove('is-compact')
  history.replaceState(null, '', `#${v}`)
  renderAll()
  if (v === 'inbox' && ui.selKey && !keepPanel && document.activeElement?.id !== 'capture-input') focusRow($(`#list .row[data-key="${ui.selKey}"]`))
  if (wantsFx()) loadFx()
  if (ui.fx) ui.fx.setPebbles(pebbleItems(), { animate: false })
}
function focusRow(r) { r?.querySelector('.row-body')?.focus({ preventScroll: true }) }
function selectRow(r) {
  if (!r) return
  ui.sel = +r.dataset.id; ui.selKey = r.dataset.key
  $$('#list .row[data-id]').forEach((x) => x.classList.toggle('is-sel', x === r))
}
function setContext(c) { st.context = c || null; ui.sel = null; ui.selKey = null; renderChips(); renderList(); $('#live').textContent = c ? `Kontext ${c}` : 'Alle Kontexte' }
function cycleContext() {
  const list = [null, ...S.contexts()]
  const i = list.indexOf(st.context)
  setContext(list[(i + 1) % list.length])
}
function openTask(id) {
  const t = S.find(id)
  if (!t) return
  ui.clarifyId = null
  st.openId = t.id
  if (ui.sel !== t.id) { ui.sel = t.id; ui.selKey = $(`#list .row[data-id="${t.id}"]`)?.dataset.key || null }
  $$('#list .row[data-id]').forEach((r) => r.classList.toggle('is-sel', r.dataset.key === ui.selKey))
  renderPanel()
}
function startClarify(id) {
  const t = S.find(id)
  if (!t) return
  st.openId = null
  ui.clarifyId = t.id
  ui.clarifyChoice = 'next'; ui.clarifyProject = ''
  ui.sel = t.id; ui.selKey = `inbox-${t.id}`
  $$('#list .row[data-id]').forEach((r) => r.classList.toggle('is-sel', r.dataset.key === ui.selKey))
  renderPanel()
}
function applyClarify(id = ui.clarifyId, to = null) {
  const t = S.find(id)
  if (!t) return
  const desc = $('#panel [data-field="cdesc"]')?.value?.trim()
  const choice = to || ui.clarifyChoice
  let target = choice
  const extra = {}
  if (desc && desc !== t.description) extra.description = desc
  if (choice === 'next') { target = `next:${ui.clarifyCtx}`; if (ui.clarifyProject) extra.project = ui.clarifyProject }
  if (choice === 'project') target = `project:${ui.clarifyProject || 'Neues Projekt'}`, extra.context = ui.clarifyCtx
  if (choice === 'waiting') extra.followUp = ui.clarifyDate.replace(/-/g, '') + 'T080000Z'
  const nextInbox = S.lists().inbox.filter((x) => x.id !== t.id)
  // move selection and focus to the next item before the list redraws, so focus is never lost
  const hadFocus = !!document.activeElement?.closest?.('#list')
  if (ui.clarifyId && nextInbox[0]) { ui.sel = nextInbox[0].id; ui.selKey = `inbox-${nextInbox[0].id}`; if (hadFocus) focusRow($(`#list .row[data-key="${ui.selKey}"]`)) }
  const h = S.clarify(t.id, target, extra)
  const label = { next: `Nach Nächste · ${ui.clarifyCtx}`, waiting: 'Nach Warten auf', someday: 'Nach Irgendwann', tickler: 'Zurückgelegt', project: `Nach Projekt ${ui.clarifyProject || ''}`, done: `Erledigt: ${t.description}`, delete: 'Gelöscht' }[choice] || 'Geklärt'
  if (choice !== 'done') showNotice(label, h)
  if (ui.clarifyId) {
    ui.clarifyId = nextInbox.length ? nextInbox[0].id : null
    ui.clarifyChoice = 'next'; ui.clarifyProject = ''
    if (ui.clarifyId) { ui.sel = ui.clarifyId; ui.selKey = `inbox-${ui.clarifyId}` }
  }
  renderAll()
  if (ui.fx) ui.fx.setPebbles(pebbleItems())
}
function capture(text) {
  const t = S.capture(text)
  if (!t) return null
  showNotice('In Inbox ✓', st.holds[st.holds.length - 1])
  return t
}

// ================================================================ palette, dialogs
const COMMANDS = [
  ['Gehe zu Inbox', () => setView('inbox'), '1'], ['Gehe zu Nächste', () => setView('next'), '2'], ['Gehe zu Warten auf', () => setView('waiting'), '3'],
  ['Gehe zu Projekte', () => setView('projects'), '4'], ['Gehe zu Irgendwann', () => setView('someday'), '5'], ['Wochenrückblick', () => setView('review'), ''],
  ['Alle Todos', () => setView('all'), ''], ['Einstellungen', () => setView('settings'), ''], ['Tastenkürzel', () => openKeys(), '?'],
]
function openPalette() {
  ui.pal = 'search'; ui.palSel = 0
  const w = $('#palette')
  w.innerHTML = `<div class="palette" role="dialog" aria-label="Suchen" aria-modal="true"><div class="pal-in">${glyph('search')}<input id="pal-q" placeholder="Todos, Projekte und Befehle durchsuchen" aria-label="Suchen"><kbd>Esc</kbd></div><div class="pal-res" id="pal-res" role="listbox"></div>
  <div class="pal-foot"><span>↑↓ wählen</span><span>↵ öffnen</span><span class="grow"></span><button class="chip sm" data-act="paldone" aria-pressed="${ui.palDone}">Erledigte zeigen</button></div></div>`
  w.hidden = false
  const q = $('#pal-q')
  q.focus()
  q.addEventListener('input', () => { ui.palSel = 0; renderPal() })
  renderPal()
}
function palItems() {
  const q = ($('#pal-q')?.value || '').trim()
  const cmds = COMMANDS.filter(([l]) => !q || l.toLowerCase().includes(q.toLowerCase())).map(([l, fn, k]) => ({ kind: 'cmd', label: l, fn, k }))
  const tasks = q ? S.search(q, { done: ui.palDone }).map((t) => ({ kind: 'task', t })) : []
  return [...tasks, ...cmds]
}
function renderPal() {
  const items = palItems()
  $('#pal-res').innerHTML = items.length ? items.map((it, i) => it.kind === 'task'
    ? `<button class="pal-item ${i === ui.palSel ? 'is-sel' : ''}" data-i="${i}" role="option"><span class="d">${esc(it.t.description)}<small>${esc([it.t.project, S.ctxOf(it.t).join(' ')].filter(Boolean).join(' · '))}</small></span><span class="l">${S.listOf(it.t)}</span></button>`
    : `<button class="pal-item ${i === ui.palSel ? 'is-sel' : ''}" data-i="${i}" role="option"><span class="d">${it.label}</span><span class="l">${it.k ? `<kbd>${it.k}</kbd>` : 'Befehl'}</span></button>`).join('')
    : '<div class="empty">Nichts gefunden. Enter legt es als neues Todo in die Inbox.</div>'
}
function palRun(i) {
  const items = palItems()
  const it = items[i]
  const q = ($('#pal-q')?.value || '').trim()
  closePalette()
  if (!it) { if (q) capture(q); return }
  if (it.kind === 'cmd') it.fn()
  else {
    const v = { Inbox: 'inbox', Nächste: 'next', 'Warten auf': 'waiting', Irgendwann: 'someday', Zurückgelegt: 'someday' }[S.listOf(it.t)] || 'all'
    setView(v, { keepPanel: true })
    if (v === 'inbox') startClarify(it.t.id); else openTask(it.t.id)
  }
}
function closePalette() { $('#palette').hidden = true; $('#palette').innerHTML = ''; ui.pal = null }
function openKeys() {
  ui.pal = 'keys'
  const k = (keys, what) => `<dt>${keys.map((x) => `<kbd>${x}</kbd>`).join('')}</dt><dd>${what}</dd>`
  $('#palette').innerHTML = `<div class="palette" role="dialog" aria-label="Tastenkürzel" aria-modal="true"><div class="pal-in"><span style="color:var(--rw-text);font-size:17px;flex:1">Tastenkürzel</span><kbd>Esc</kbd></div><dl class="keys">
    ${k(['N'], 'Neues Todo erfassen, landet in der Inbox')}${k(['/'], 'Suchen und Befehle')}${k(['1', '–', '5'], 'Inbox, Nächste, Warten auf, Projekte, Irgendwann')}
    ${k(['J', 'K'], 'Auswahl nach unten, nach oben')}${k(['X'], 'Abhaken')}${k(['↵'], 'Öffnen, in der Inbox: klären')}${k(['T'], 'Für heute vormerken')}${k(['S'], 'Starten oder pausieren')}
    ${k(['C'], 'Kontext wechseln (wie das Widget)')}${k(['Z'], 'Rückgängig, 6 Sekunden lang')}${k(['⌫'], 'Löschen')}${k(['Esc'], 'Schließen')}
    ${k(['N', 'W', 'P', 'I', 'Z', 'E', 'L'], 'Beim Klären: Nächste, Warten, Projekt, Irgendwann, Zurücklegen, Erledigt, Löschen')}</dl></div>`
  $('#palette').hidden = false
}
function openPlan(name) {
  ui.pal = 'plan'
  const plan = st.plans[name] || { purpose: '', vision: '', brainstorm: [], organized: [] }
  st.plans[name] = plan
  const tabs = ['Warum', 'Vision', 'Ideen', 'Ordnen', 'Aktionen']
  const body = () => {
    const i = ui.planTab
    if (i === 0) return `<label>Zweck</label><textarea data-plan="purpose">${esc(plan.purpose)}</textarea><label style="margin-top:14px">Werte und Prinzipien</label><textarea data-plan="principles" placeholder="Was dabei wichtig ist">${esc(plan.principles || '')}</textarea>`
    if (i === 1) return `<label>So sieht es aus, wenn es geschafft ist</label><textarea data-plan="vision">${esc(plan.vision)}</textarea>`
    if (i === 2) return `<label>Ideen sammeln</label><input class="note-add" data-plan-add="brainstorm" placeholder="Neue Idee, Enter fügt hinzu" style="margin:0"><ul class="plan-list">${plan.brainstorm.map((x) => `<li><span class="t">${esc(x)}</span></li>`).join('') || '<li><span class="t" style="color:var(--rw-text-mute)">Noch keine Ideen. Einfach losschreiben.</span></li>'}</ul>`
    if (i === 3) return `<label>Reihenfolge · ziehen oder mit den Pfeilen</label><ul class="plan-list" data-plan-order>${plan.organized.map((x, j) => `<li draggable="true" data-j="${j}"><span class="grip" aria-hidden="true">${glyph('menu', { size: 14 })}</span><span class="num">0${j + 1}</span><span class="t">${esc(x)}</span><button class="icon-btn" data-plan-move="${j}" data-d="-1" aria-label="Nach oben: ${esc(x)}" ${j === 0 ? 'disabled' : ''}>${glyph('back', { size: 16, cls: 'up' })}</button><button class="icon-btn" data-plan-move="${j}" data-d="1" aria-label="Nach unten: ${esc(x)}" ${j === plan.organized.length - 1 ? 'disabled' : ''}>${glyph('back', { size: 16, cls: 'down' })}</button></li>`).join('')}</ul>`
    return `<label>Als nächste Aktion anlegen</label><ul class="plan-list">${plan.organized.map((x) => { const ex = st.tasks.some((t) => t.description === x && t.project === name && S.isOpen(t)); return `<li><span class="t">${esc(x)}</span>${ex ? '<span class="meta" style="margin:0">angelegt</span>' : `<button class="pill" data-plan-task="${esc(x)}">Als nächste Aktion</button>`}</li>` }).join('')}</ul>`
  }
  const draw = () => {
    $('#palette').innerHTML = `<div class="palette plan" role="dialog" aria-label="Plan: ${esc(name)}" aria-modal="true"><div class="pal-in"><span style="flex:1;color:var(--rw-text);font-size:17px">Plan: ${esc(name)} <span class="meta" style="display:inline;margin-left:8px">Natürliche Planung</span></span><button class="pill coral" data-plan-save>Speichern</button><button class="icon-btn" data-act="pclose" aria-label="Schließen">${glyph('close')}</button></div>
      <div class="plan-tabs" role="tablist">${tabs.map((t, i) => `<button role="tab" aria-selected="${ui.planTab === i}" data-plan-tab="${i}"><span class="num">0${i + 1}</span>${t}</button>`).join('')}</div><div class="plan-body">${body()}</div></div>`
  }
  ui.planDraw = draw
  ui.planName = name
  draw()
  $('#palette').hidden = false
}

// ================================================================ events
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-view], [data-ctx], [data-project], [data-plan-tab], [data-plan-save], [data-plan-task], [data-plan-move], .pal-item')
  if (!el) {
    if (e.target.id === 'palette') closePalette()
    if (e.target.id === 'scrim') { st.openId = null; ui.clarifyId = null; renderPanel() }
    return
  }
  if (el.classList.contains('pal-item')) { palRun(+el.dataset.i); return }
  if (el.dataset.planTab != null) { ui.planTab = +el.dataset.planTab; ui.planDraw(); return }
  if (el.dataset.planSave != null) { savePlanFields(); S.savePlan(ui.planName, st.plans[ui.planName]); closePalette(); showNotice('Plan gespeichert'); return }
  if (el.dataset.planTask) { savePlanFields(); S.addTask(el.dataset.planTask, { project: ui.planName, tags: ['@computer', 'next'] }); ui.planDraw(); return }
  if (el.dataset.planMove != null) {
    const p = st.plans[ui.planName].organized; const j = +el.dataset.planMove; const k = j + +el.dataset.d
    if (k >= 0 && k < p.length) [p[k], p[j]] = [p[j], p[k]]
    ui.planDraw(); $(`#palette [data-plan-move="${k}"][data-d="${el.dataset.d}"]`)?.focus(); return
  }
  if (el.dataset.view && !el.dataset.act) { setView(el.dataset.view); return }
  if (el.disabled) return
  if (el.dataset.ctx != null && !el.dataset.act) { setContext(el.dataset.ctx); return }
  if (el.dataset.project && !el.dataset.act) { st.projectName = el.dataset.project; main.scrollTop = 0; renderAll(); return }
  const act = el.dataset.act
  const row = el.closest('.row')
  const id = el.dataset.id || row?.dataset.id || st.openId || ui.clarifyId
  switch (act) {
    case 'done': if (row?.dataset.step) break; completeWithFeedback(id, row); break
    case 'refresh': refresh(); break
    case 'to-review': setView('review'); break
    case 'review-open': setView(el.dataset.v, { fromReview: true }); break
    case 'ctap': { const [k, ctx] = el.dataset.v.split(':'); if (ctx) ui.clarifyCtx = ctx; applyClarify(ui.clarifyId, k); break }
    case 'open': if (row) selectRow(row); openTask(id); break
    case 'clarify': if (row) selectRow(row); startClarify(id); break
    case 'delete': { const t = S.find(id); const h = S.remove(id); if (st.openId == id) st.openId = null; renderAll(); showNotice(`Gelöscht: ${t.description}`, h); break }
    case 'today': S.toggleToday(id); break
    case 'start': S.toggleStart(id); break
    case 'close': st.openId = null; ui.clarifyId = null; renderPanel(); break
    case 'undo': doUndo(); break
    case 'palette': openPalette(); break
    case 'move': S.moveTo(st.openId, el.dataset.v); break
    case 'ctx': S.setContext(st.openId, el.dataset.v); break
    case 'prio': { const t = S.find(st.openId); S.update(t.id, { priority: t.priority === el.dataset.v ? null : el.dataset.v }); break }
    case 'copt': ui.clarifyChoice = el.dataset.v; renderPanel(); break
    case 'cctx': ui.clarifyCtx = el.dataset.v; renderPanel(); break
    case 'capply': applyClarify(); break
    case 'cskip': { const inbox = S.lists().inbox; const i = inbox.findIndex((x) => x.id === ui.clarifyId); ui.clarifyId = inbox[(i + 1) % inbox.length]?.id; renderPanel(); break }
    case 'projects-back': st.projectName = null; renderAll(); break
    case 'project': st.projectName = row.dataset.project; main.scrollTop = 0; renderAll(); break
    case 'pstatus': S.setProjectStatus(st.projectName, el.dataset.v); break
    case 'plan': ui.planTab = 0; openPlan(st.projectName); break
    case 'pclose': closePalette(); break
    case 'step': { const k = row.dataset.step; ui.reviewDone.has(k) ? ui.reviewDone.delete(k) : ui.reviewDone.add(k); renderList(); break }
    case 'review-done': S.recordReview(); ui.reviewDone.clear(); showNotice('Rückblick gespeichert'); break
    case 'showdone': st.showDone = !st.showDone; renderList(); break
    case 'paldone': ui.palDone = !ui.palDone; el.setAttribute('aria-pressed', ui.palDone); renderPal(); break
  }
})
document.addEventListener('dragstart', (e) => { const li = e.target.closest?.('[data-plan-order] li'); if (!li) return; ui.drag = +li.dataset.j; li.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move' })
document.addEventListener('dragover', (e) => { const li = e.target.closest?.('[data-plan-order] li'); if (li && ui.drag != null) { e.preventDefault(); $$('[data-plan-order] li').forEach((x) => x.classList.toggle('is-over', x === li)) } })
document.addEventListener('drop', (e) => {
  const li = e.target.closest?.('[data-plan-order] li'); if (!li || ui.drag == null) return
  e.preventDefault()
  const p = st.plans[ui.planName].organized; const [x] = p.splice(ui.drag, 1); p.splice(+li.dataset.j, 0, x)
  ui.drag = null; ui.planDraw()
})
document.addEventListener('dragend', () => { ui.drag = null; $$('[data-plan-order] li').forEach((x) => x.classList.remove('is-drag', 'is-over')) })
function savePlanFields() {
  const plan = st.plans[ui.planName]
  $$('#palette [data-plan]').forEach((f) => { plan[f.dataset.plan] = f.value })
}
document.addEventListener('change', (e) => {
  const f = e.target.dataset.field
  if (!f || !st.openId) return
  if (f === 'project') S.update(st.openId, { project: e.target.value.trim() || null })
  if (f === 'due') S.update(st.openId, { due: e.target.value ? e.target.value.replace(/-/g, '') + 'T170000Z' : null })
  if (f === 'description' && e.target.value.trim()) S.update(st.openId, { description: e.target.value.trim() })
})
document.addEventListener('input', (e) => {
  if (e.target.dataset.field === 'cproj') ui.clarifyProject = e.target.value
  if (e.target.dataset.field === 'cdate') ui.clarifyDate = e.target.value
  if (e.target.id === 'capture-input') { const has = !!e.target.value.trim(); $('.capture-go').hidden = !has; $('#capture-hint').innerHTML = has ? '↵ in die Inbox' : '<kbd>N</kbd>' }
})
document.addEventListener('submit', (e) => {
  e.preventDefault()
  const form = e.target
  if (form.id === 'capture') {
    const input = $('#capture-input')
    if (capture(input.value)) { input.value = ''; $('.capture-go').hidden = true; $('#capture-hint').innerHTML = '↵ in die Inbox' }
    return
  }
  if (form.dataset.form === 'nextaction') {
    const d = form.querySelector('[name="d"]')?.value?.trim()
    if (!d) return
    S.addTask(d, { project: st.projectName, tags: [form.querySelector('[name="c"]').value, 'next'] })
    showNotice('Nächste Aktion festgelegt')
  }
  if (form.dataset.form === 'newproject') {
    const n = form.querySelector('[name="p"]').value.trim()
    if (!n) return
    st.projects.push({ name: n, outcome: 'Ergebnis noch offen', status: 'active' })
    st.projectName = n; renderAll(); ui.planTab = 0; openPlan(n)
  }
})
document.addEventListener('keydown', (e) => {
  const tgt = e.target
  const typing = tgt.matches('input, textarea, select, [contenteditable]')
  if (ui.pal === 'search') {
    if (e.key === 'Escape') { closePalette(); return }
    if (e.key === 'ArrowDown') { ui.palSel = Math.min(palItems().length - 1, ui.palSel + 1); renderPal(); e.preventDefault(); return }
    if (e.key === 'ArrowUp') { ui.palSel = Math.max(0, ui.palSel - 1); renderPal(); e.preventDefault(); return }
    if (e.key === 'Enter') { palRun(ui.palSel); e.preventDefault(); return }
    return
  }
  if (ui.pal) { if (e.key === 'Escape') closePalette(); if (e.key === 'Enter' && tgt.dataset.planAdd) { const v = tgt.value.trim(); if (v) { st.plans[ui.planName].brainstorm.push(v); st.plans[ui.planName].organized.push(v); ui.planDraw(); $('#palette [data-plan-add]')?.focus() } } return }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); doUndo(); return }
  if (typing) {
    if (e.key === 'Escape') tgt.blur()
    if (e.key === 'Enter' && tgt.dataset.field === 'note' && tgt.value.trim()) { S.annotate(st.openId, tgt.value.trim()); setTimeout(() => $('#panel [data-field="note"]')?.focus(), 0) }
    if (e.key === 'Enter' && !e.shiftKey && (tgt.dataset.field === 'description' || tgt.dataset.field === 'cdesc')) { e.preventDefault(); if (tgt.dataset.field === 'cdesc') applyClarify(); else tgt.blur() }
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key
  // Enter on a focused button activates it natively (row body = open or Klären); do not run it
  // twice. Exception: while Klären is open, Enter on the selected row applies the choice.
  if (k === 'Enter' && tgt.matches('button')) {
    if (ui.clarifyId && tgt.classList.contains('row-body')) { e.preventDefault(); applyClarify() }
    return
  }
  if (ui.clarifyId) {
    const map = { n: 'next', w: 'waiting', p: 'project', i: 'someday', z: 'tickler', e: 'done', l: 'delete' }
    if (map[k.toLowerCase()]) { ui.clarifyChoice = map[k.toLowerCase()]; renderPanel(); e.preventDefault(); return }
    if (/^[1-9]$/.test(k) && S.contexts()[+k - 1]) { ui.clarifyCtx = S.contexts()[+k - 1]; renderPanel(); e.preventDefault(); return }
    if (k === 'Enter') { applyClarify(); e.preventDefault(); return }
    if (k === 'Escape') { ui.clarifyId = null; renderPanel(); focusRow($(`#list .row[data-key="${ui.selKey}"]`)); return }
  }
  const rows = $$('#list .row[data-id]')
  const idx = rows.findIndex((r) => r.dataset.key === ui.selKey)
  // J/K move the selection and the DOM focus (screen readers announce the row)
  const sel = (i) => {
    const r = rows[clamp(i, 0, rows.length - 1)]
    if (!r) return
    selectRow(r)
    focusRow(r)
    r.scrollIntoView({ block: 'nearest' })
    if (st.openId) openTask(ui.sel)
    if (ui.clarifyId && st.view === 'inbox') startClarify(ui.sel)
  }
  switch (k) {
    case 'n': case 'N': e.preventDefault(); $('#capture-input').focus(); break
    case '/': e.preventDefault(); openPalette(); break
    case '?': openKeys(); break
    case '1': case '2': case '3': case '4': case '5': setView(MAIN[+k - 1]); break
    case 'c': cycleContext(); break
    case 'C': setContext(null); break
    case 'j': case 'ArrowDown': e.preventDefault(); sel(idx + 1); break
    case 'k': case 'ArrowUp': e.preventDefault(); sel(idx < 0 ? 0 : idx - 1); break
    case 'x': case ' ': if (ui.sel && rows[idx]) { e.preventDefault(); completeWithFeedback(ui.sel, rows[idx]) } break
    case 'Enter': if (ui.sel) { st.view === 'inbox' ? startClarify(ui.sel) : openTask(ui.sel) } break
    case 'r': case 'R': refresh(); break
    case 't': if (ui.sel) S.toggleToday(ui.sel); break
    case 's': if (ui.sel) S.toggleStart(ui.sel); break
    case 'z': doUndo(); break
    case 'Backspace': case 'Delete': if (ui.sel) { const t = S.find(ui.sel); const h = S.remove(ui.sel); renderAll(); showNotice(`Gelöscht: ${t.description}`, h) } break
    case 'Escape': if (st.openId || ui.clarifyId) { st.openId = null; ui.clarifyId = null; renderPanel(); focusRow($(`#list .row[data-key="${ui.selKey}"]`)) } else { ui.sel = null; ui.selKey = null; rows.forEach((x) => x.classList.remove('is-sel')) } break
  }
})
// Tab onto a row body selects that row, so keys and focus never disagree
document.addEventListener('focusin', (e) => {
  const r = e.target.closest?.('#list .row[data-key]')
  if (r && e.target.classList.contains('row-body') && r.dataset.key !== ui.selKey) selectRow(r)
})
// Refresh policy (both clients): on open, when the tab becomes visible again or the window gets
// focus and "Stand" is older than a minute, after every send from the outbox, every 5 minutes
// while visible; R or a click on "Stand" by hand. The prototype only marks the moments.
let lastLoad = performance.now()
const maybeRefresh = () => { if (document.visibilityState === 'visible' && performance.now() - lastLoad > 60_000) { lastLoad = performance.now(); refresh() } }
document.addEventListener('visibilitychange', maybeRefresh)
window.addEventListener('focus', maybeRefresh)

main.addEventListener('scroll', () => {
  const c = main.scrollTop > 28
  const head = $('#head')
  if (head.classList.contains('is-compact') !== c) head.classList.toggle('is-compact', c)
}, { passive: true })

// swipe right on touch = abhaken (same gesture as Android)
let sw = null
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return
  const row = e.target.closest('#list .row[data-id]')
  if (!row || e.target.closest('button')) return
  sw = { row, x: e.clientX, y: e.clientY, dx: 0, live: false }
})
document.addEventListener('pointermove', (e) => {
  if (!sw) return
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y
  if (!sw.live && Math.abs(dy) > 10) { sw = null; return }
  if (dx > 8) sw.live = true
  if (sw.live) { sw.dx = Math.max(0, dx); sw.row.style.transform = `translateX(${sw.dx}px)`; sw.row.style.background = sw.dx > sw.row.offsetWidth * 0.35 ? 'var(--rw-action-tint)' : '' }
})
document.addEventListener('pointerup', () => {
  if (!sw) return
  const { row, dx, live } = sw
  sw = null
  row.style.transform = ''; row.style.background = ''
  if (live && dx > Math.max(96, row.offsetWidth * 0.35)) completeWithFeedback(row.dataset.id, row)
})

S.subscribe((type, d) => {
  if (type === 'sent') return
  if (type === 'completed') { renderChrome(); return }
  if (type === 'captured') {
    renderChrome(); renderHead()
    if (st.view === 'inbox') { renderList({ newId: d.id }); if (ui.fx) ui.fx.setPebbles(pebbleItems()) }
    const n = $('[data-count="inbox"]'); if (n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump') }
    $('#live').textContent = 'In Inbox'
    return
  }
  renderAll()
  if (ui.fx) { ui.fx.setPebbles(pebbleItems()); ui.fx.setLevel(S.progress().level, { animate: !reduced.matches }) }
})
const onTheme = () => { if (ui.fx) ui.fx.setBackground(groundColor()) }
darkMq.addEventListener('change', onTheme)
reduced.addEventListener('change', () => { renderSlot() })
phone.addEventListener('change', () => { renderAll() })

// ================================================================ boot + test hook
const hashView = location.hash.slice(1)
st.view = VIEWS[hashView] ? hashView : 'next'
const qTask = new URLSearchParams(location.search).get('task')
renderAll()
if (qTask) { const t = S.find(qTask); if (t) openTask(t.id) } // Android hands off with ?task=<uuid>
if (wantsFx()) (window.requestIdleCallback || setTimeout)(() => loadFx(), { timeout: 200 })

async function ready() {
  await document.fonts.ready
  if (wantsFx()) await loadFx()
}
window.proto = {
  show(view) { setView(view) },
  filter(context) { if (st.view !== 'next') setView('next'); setContext(context) },
  capture(text) { return capture(text) },
  open(id) {
    const t = S.find(id); if (!t) return
    const v = { Inbox: 'inbox', Nächste: 'next', 'Warten auf': 'waiting', Irgendwann: 'someday' }[S.listOf(t)] || 'all'
    if (st.view !== v && !(st.view === 'projects' && st.projectName === t.project)) setView(v, { keepPanel: true })
    v === 'inbox' ? startClarify(t.id) : openTask(t.id)
  },
  complete(id) { return completeWithFeedback(S.find(id)?.id) },
  clarify(id, to) {
    const t = S.find(id); if (!t) return
    const [k, arg] = String(to).split(':')
    if (k === 'next' && arg) ui.clarifyCtx = arg
    applyClarify(t.id, k)
  },
  async signature() {
    if (st.view !== 'next') setView('next')
    await ready()
    await new Promise((r) => setTimeout(r, 120))
    // a todo planned for today: the bead flies and the lens goes from 3 von 7 to 4 von 7
    const target = S.find('Steuerberatung zurückrufen')
    completeWithFeedback(target.id, $(`#list .row[data-key="next-${target.id}"]`))
  },
  ready,
  get state() { return { view: st.view, context: st.context, progress: S.progress(), label: S.progressLabel(S.progress()), fx: ui.fxState, frames: ui.fx?.frames ?? 0, sel: ui.selKey, focus: document.activeElement?.closest?.('.row')?.dataset.key || document.activeElement?.tagName } },
}
