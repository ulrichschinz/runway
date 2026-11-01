// runway web, proposal 06 "Papier & Tinte + Tageslinse + Kartenstapel". Vanilla modules standing in
// for the Vue components named in README.md. Base: 03's web.js (shell, rows, keymap, panels).
// Grafts: 01 Tageslinse (lens.js), 05 card stack (stack.js) and "never guess metadata",
// 04 Jetzt · Bald · Später, "ohne Kontext" and the ⌘K palette, 02 write path and i18n.

import {
  createStore, CONTEXTS, contextsOf, parseTw, isInbox, isNext, isWaiting, isSomeday, listOf, TODAY, NOW, dayKey, dayOf, NO_CTX,
} from './store.js'
import * as C from './common.js'
import { t } from './i18n.js'
import { createLens } from './lens.js'
import { miniLens } from './lens-flat.js'
import { createStack } from './stack.js'

if (new URLSearchParams(location.search).get('input') === 'touch') document.documentElement.dataset.input = 'touch'

const store = createStore()
const coarse = () => matchMedia('(hover: none) and (pointer: coarse)').matches || document.documentElement.dataset.input === 'touch'
const isPhone = () => matchMedia('(max-width: 760px)').matches
const isNarrow = () => matchMedia('(max-width: 1180px)').matches
const reduced = () => C.reducedMotion()

const ui = {
  view: 'next', ctx: null, query: '', focus: null, open: null, project: null,
  step: null, stepProject: null, // clarify sub-step: null | 'ctx' | 'follow' | 'project' | 'projctx' | 'newproject'
  showDone: false, more: false, toc: false, today: false, reviewChecked: new Set(), addOpen: false, projAdd: false,
  inboxMode: coarse() || isPhone() ? 'stack' : 'list', // touch clarifies on the stack; desktop keeps the two-key panel
  shown: store.progress(), flights: 0, slow: 1, sheetClarify: false, needCtx: null, palOpen: false,
}
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const app = $('#app'), rail = $('#rail'), phonebar = $('#phonebar'), scrollEl = $('#scroll')
const headEl = $('#head'), bodyEl = $('#body'), toplineEl = $('#topline'), marginEl = $('#margin')
const noticeEl = $('#notice'), keysEl = $('#keys'), captureForm = $('#capture'), captureInput = $('#capture input')
const searchInput = $('#search'), paletteEl = $('#palette')
const rowCache = new Map()
const busy = new Set()

const lens = createLens({ reduced, timeScale: () => 1 / ui.slow })
const stageEl = C.html('<div class="stage" id="stage"></div>')
const stack = createStack({
  store, root: stageEl, motion: () => !reduced(), compact: () => isPhone() || coarse(),
  file: (id, to, opts) => fileFromStack(id, to, opts),
})

// ───────────────────────────── strings in the static shell ─────────────────────────────
for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n)
for (const el of $$('[data-i18n-attr]')) for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)) }

// ───────────────────────────── rows ─────────────────────────────
const lensCaption = (p, { short = false } = {}) => t(short ? 'lens.short' : 'lens.cap', { done: p.done, total: p.total }) + (p.extra ? t(short ? 'lens.extraShort' : 'lens.extra', { n: p.extra }) : '')
const countsToday = (x) => isNext(x) && store.isPlanned(x)

function rowMeta(x, kind) {
  const due = C.dueInfo(x)
  const ctx = contextsOf(x)
  const ctxText = ctx.length ? (ctx.length > 1 ? `${ctx[0]} +${ctx.length - 1}` : ctx[0]) : (isNext(x) ? t('ctx.none') : '')
  const proj = x.project || ''
  const unsent = `<span class="unsent"><span>${t('sync.unsent')}</span><button data-retry="">${t('sync.retry')}</button></span>`
  if (kind === 'inbox' && x.sync === 'failed') return [{ text: t('row.captured', { d: C.entryInfo(x) }), cls: '' }, { html: unsent, cls: '' }]
  if (kind === 'inbox') return [
    { text: x.annotations.length ? t('row.notes', { n: x.annotations.length }) : '', cls: 'empty' },
    { text: t('row.captured', { d: C.entryInfo(x) }), cls: '' },
  ]
  if (kind === 'waiting') { const f = C.followInfo(x); return [{ text: proj, cls: proj ? '' : 'empty' }, { text: f.text, cls: f.tone, mark: f.due }] }
  if (kind === 'someday') return [{ text: proj, cls: proj ? '' : 'empty' }, { text: t('row.since', { d: C.dm(parseTw(x.entry)) }), cls: 'empty' }]
  const planned = !due && countsToday(x) && x.scheduled
  return [
    { text: proj, cls: proj ? '' : 'empty' },
    { text: ctxText, cls: ctx.length ? '' : 'noctx' },
    { text: due ? due.text : planned ? t('row.planned') : '', cls: due?.tone || (planned ? 'planned' : 'empty') },
  ]
}
// Same status vocabulary as Android's pinned row text "<Beschreibung>, <Status>, ID <8>".
function statusWord(x) {
  const due = C.dueInfo(x)
  if (due?.status) return due.status
  if (isWaiting(x) && C.followInfo(x).due) return t('status.follow')
  return t(`status.${listOf(x)}`)
}
function rowHTML(x, kind) {
  const meta = rowMeta(x, kind)
  const due = C.dueInfo(x)
  const cls = ['row', due?.tone === 'overdue' ? 'overdue' : '', x.fresh ? 'fresh' : '', x.sync === 'failed' ? 'unsent-row' : ''].join(' ')
  const aria = `${x.description}, ${statusWord(x)}, ID ${x.uuid.slice(-8)}`
  return `<div class="${cls}" data-id="${x.id}" role="listitem" aria-label="${C.esc(aria)}">
    <button class="ring" data-act="done" aria-label="${C.esc(t('row.check', { d: x.description }))}"></button>
    <div class="main"><span class="desc"><span class="txt">${C.esc(x.description)}</span>${C.strikeSVG(x.id)}</span>${
      x.start ? `<span class="live"><i class="pulse"></i>${t('row.running')}</span>` : ''}${
      x.priority === 'H' ? `<span class="prio" title="${t('row.prioH')}">H</span>` : ''}${
      kind !== 'inbox' && x.annotations.length ? `<span class="note" title="${t('row.notesTitle')}">¶ ${x.annotations.length}</span>` : ''}${
      x.sync === 'failed' && kind !== 'inbox' ? `<span class="unsent"><span>${t('sync.unsent')}</span><button data-retry="">${t('sync.retry')}</button></span>` : ''}</div>
    <span class="meta">${meta.map((m) => `<span class="m ${m.cls}">${m.mark ? '<span class="ring-mark"></span>' : ''}${m.html ?? C.esc(m.text)}</span>`).join('')}</span>
    <span class="stamp"></span>
  </div>`
}
function rowEl(x, kind, section) {
  const key = `${section}:${x.id}`
  const sig = JSON.stringify([x.description, x.project, x.tags, x.due, x.start, x.priority, x.scheduled, x.annotations.length, x.fresh, x.sync, x.entry, kind])
  const c = rowCache.get(key)
  if (c && c.sig === sig && !c.el.classList.contains('is-gone')) return c.el
  const el = C.html(rowHTML(x, kind))
  rowCache.set(key, { el, sig })
  return el
}
const secEl = (key, label, count, extra = '') => {
  const k = `sec:${key}:${label}:${count}:${extra}`
  const c = rowCache.get(k)
  if (c) return c.el
  const el = C.html(`<div class="sec sec-${key}"><div class="eyebrow"><span class="slash">//</span><span>${C.esc(label)}</span>${count != null ? `<span class="sep">·</span><span>${count}</span>` : ''}${extra}</div></div>`)
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
const ctxName = (c) => c === NO_CTX ? t('ctx.none') : c

function sectionsFor(view, L) {
  if (view === 'next') {
    const R = L.rings
    const none = !R.jetzt.length && !R.bald.length && !R.spaeter.length
    // graft from 02: with a context active, due items elsewhere stay visible, apart and unranked.
    // After review: when the context itself has nothing due, they sit under the one "Fällig" heading
    // (Android pins "Fällig" at the top) with an "andere Kontexte" note, never below "Nichts fällig".
    const dueSecs = !L.due.length && L.dueOther.length
      ? [{ key: 'due', label: t('sec.due'), tasks: L.dueOther, kind: 'next', sub: t('sec.otherCtx') }]
      : [{ key: 'due', label: t('sec.due'), tasks: L.due, kind: 'next', empty: t('empty.due') },
         { key: 'dueOther', label: t('sec.dueOther'), tasks: L.dueOther, kind: 'next' }]
    return [
      ...dueSecs,
      // graft from 04: after Fällig, rings from fields Uli sets
      { key: 'jetzt', label: t('sec.jetzt'), tasks: R.jetzt, kind: 'next' },
      { key: 'bald', label: t('sec.bald'), tasks: R.bald, kind: 'next' },
      { key: 'spaeter', label: t('sec.spaeter'), tasks: R.spaeter, kind: 'next', empty: none ? (ui.ctx ? t('empty.nextCtx', { ctx: ctxName(ui.ctx) }) : t('empty.next')) : null },
    ].filter((s) => s.tasks.length || s.empty)
  }
  if (view === 'inbox') return [{ key: 'inbox', label: null, tasks: L.inbox, kind: 'inbox' }]
  if (view === 'waiting') {
    const w = waitingSplit(L)
    return [
      { key: 'wdue', label: t('sec.wdue'), tasks: w.due, kind: 'waiting', empty: t('empty.wdue') },
      { key: 'wsoon', label: t('sec.wsoon'), tasks: w.soon, kind: 'waiting' },
      { key: 'wlater', label: t('sec.wlater'), tasks: w.later, kind: 'waiting', empty: w.due.length + w.soon.length ? null : t('empty.waiting') },
    ].filter((x) => x.tasks.length || x.empty)
  }
  if (view === 'someday') return [{ key: 'some', label: t('sec.ideas'), tasks: L.someday, kind: 'someday', empty: t('empty.someday') }]
  if (view === 'all') {
    const s = [
      { key: 'ai', label: t('list.inbox'), tasks: L.inbox, kind: 'next' },
      { key: 'an', label: t('list.next'), tasks: L.next, kind: 'next' },
      { key: 'aw', label: t('list.waiting'), tasks: L.waiting, kind: 'next' },
      { key: 'as', label: t('list.someday'), tasks: L.someday, kind: 'next' },
      { key: 'ap', label: t('sec.unlisted'), tasks: L.unlisted, kind: 'next' },
    ].filter((x) => x.tasks.length)
    if (ui.showDone) s.push({ key: 'ad', label: t('sec.doneWeek'), tasks: [], kind: 'done' })
    return s
  }
  if (view === 'project') {
    const ts = L.open.filter((x) => x.project === ui.project)
    return [
      { key: 'pn', label: t('sec.nextActions'), tasks: ts.filter(isNext), kind: 'next', empty: t('empty.projNext') },
      { key: 'pw', label: t('list.waiting'), tasks: ts.filter(isWaiting), kind: 'waiting' },
      { key: 'ps', label: t('list.someday'), tasks: ts.filter(isSomeday), kind: 'someday' },
      { key: 'po', label: t('sec.unlisted'), tasks: ts.filter((x) => listOf(x) === 'none'), kind: 'next' },
    ].filter((x) => x.tasks.length || x.empty)
  }
  if (view === 'search') {
    const q = ui.query.toLowerCase()
    const hit = (x) => [x.description, x.project || '', ...x.tags].join(' ').toLowerCase().includes(q)
    return [
      { key: 'si', label: t('list.inbox'), tasks: L.inbox.filter(hit), kind: 'inbox' },
      { key: 'sn', label: t('list.next'), tasks: L.next.filter(hit), kind: 'next' },
      { key: 'sw', label: t('list.waiting'), tasks: L.waiting.filter(hit), kind: 'waiting' },
      { key: 'ss', label: t('list.someday'), tasks: L.someday.filter(hit), kind: 'someday' },
      { key: 'sp', label: t('sec.unlisted'), tasks: L.unlisted.filter(hit), kind: 'next' },
    ].filter((x) => x.tasks.length)
  }
  return []
}
function waitingSplit(L) {
  const due = [], soon = [], later = []
  for (const x of L.waiting) {
    const f = C.followInfo(x)
    if (f.due) due.push(x)
    else if (f.key && C.daysBetween(TODAY, f.key) <= 7) soon.push(x)
    else later.push(x)
  }
  return { due, soon, later }
}

function renderList(view, L) {
  const nodes = []
  const secs = sectionsFor(view, L)
  for (const s of secs) {
    if (s.label) nodes.push(secEl(s.key, s.label, s.tasks.length || (s.key === 'ad' ? L.doneWeek.length : 0), s.sub ? `<span class="sep">·</span><span class="subnote">${C.esc(s.sub)}</span>` : ''))
    if (s.key === 'ad') {
      L.doneWeek.forEach((x) => nodes.push(rowCache.get(`done:${x.id}`)?.el || (() => {
        const end = x.end && parseTw(x.end)
        const when = !end ? t('done.now') : dayKey(end) === TODAY ? t('entry.today', { t: C.hm(end) }) : C.day(end)
        const el = C.html(`<div class="row is-struck" data-done="${x.id}"><span class="ring"></span><div class="main"><span class="desc"><span class="txt">${C.esc(x.description)}</span>${C.strikeSVG(x.id)}</span></div><span class="meta"><span class="m">${C.esc(x.project || '')}</span><span class="m">${C.esc(contextsOf(x).join(' '))}</span><span class="m empty">${when}</span></span></div>`)
        rowCache.set(`done:${x.id}`, { el }); return el
      })()))
      continue
    }
    if (!s.tasks.length && s.empty) nodes.push(emptyEl(s.key, s.empty))
    s.tasks.forEach((x) => nodes.push(rowEl(x, s.kind, s.key)))
  }
  if (!secs.length && view === 'search') nodes.push(emptyEl('search', t('empty.search')))
  let list = bodyEl.querySelector(':scope > .list')
  if (!list) { bodyEl.replaceChildren(); list = C.html('<div class="list" role="list"></div>'); bodyEl.append(list) }
  list.classList.toggle('wide-meta', ['inbox', 'waiting', 'someday'].includes(view))
  C.patch(list, nodes)
  $$('.row', list).forEach((el) => el.classList.toggle('focus', Number(el.dataset.id) === ui.focus))
}

// the lens slot: lens.sync() fills it with the canvas (when on screen) or the static SVG
const lensSlot = (size, cls = '') => `<div class="lens-slot ${cls}" data-size="${size}" style="width:${size}px;height:${size}px"></div>`

function renderHead(view, L) {
  const ov = store.projectOverview()
  let h = ''
  if (view === 'next') {
    const size = isPhone() ? 52 : 104
    const chips = [null, ...CONTEXTS, NO_CTX].map((c, i) => {
      const n = c ? L.ctxCount[c] : L.next.length
      if (c === NO_CTX && !n) return ''
      const key = c === NO_CTX ? 6 : i
      return `<button class="ctx ${c === NO_CTX ? 'noctx' : ''}" data-ctx="${c || ''}" aria-pressed="${ui.ctx === c}" title="${t('key.n', { k: key })}">${c ? ctxName(c) : t('ctx.all')} <span class="n">${n}</span></button>`
    }).join('')
    // after review: the eyebrow shows the chip's own number; the lenient rule's extra rows (todos
    // without a context) are named apart, so chip and eyebrow never disagree
    const own = ui.ctx ? L.ctxCount[ui.ctx] : L.next.length
    const loose = ui.ctx && ui.ctx !== NO_CTX ? L.nextIn.length - own : 0
    h = `<div class="head-grid"><div class="head-text">${eyebrow(t('list.next'), ui.ctx ? ctxName(ui.ctx) : t('ctx.allLong'), own, loose ? t('ctx.plusNone', { n: loose }) : '')}<h1 class="display">${C.heading('next')}</h1></div>
      <button class="lensbox" data-act="today" aria-label="${C.esc(t('lens.aria', { done: ui.shown.done, total: ui.shown.total }))}">${lensSlot(size, 'in-head')}<span class="lens-cap">${C.esc(lensCaption(ui.shown, { short: isPhone() }))}</span></button></div>`
      + `<div class="ctxbar" role="group" aria-label="${t('ctx.label')}">${chips}</div>`
  } else if (view === 'inbox') {
    const toggle = `<div class="modes" role="group" aria-label="${t('inbox.mode')}"><button class="ctx" data-mode="list" aria-pressed="${ui.inboxMode === 'list'}">${t('inbox.list')}</button><button class="ctx" data-mode="stack" aria-pressed="${ui.inboxMode === 'stack'}">${t('inbox.stack')}</button><kbd>s</kbd></div>`
    if (L.inbox.length) {
      const oldest = L.inbox[L.inbox.length - 1]
      h = `<div class="head-grid inbox"><div class="head-text">${eyebrow(t('list.inbox'), t('inbox.open', { n: L.inbox.length }), t('inbox.oldest', { d: C.entryInfo(oldest) }))}<h1 class="display">${C.heading('inbox')}</h1></div>${toggle}</div>`
        + `<p class="lead">${ui.inboxMode === 'stack' ? t('inbox.leadStack') : t('inbox.leadList')}</p>`
    } else {
      h = eyebrow(t('list.inbox'), '0', t('stand', { t: store.stand })) + `<h1 class="display">${C.heading('inboxEmpty')}</h1>`
        + `<p class="lead">${t('inbox.zeroLead')}</p>`
        + `<div class="actions"><button class="pill" data-go="next">${t('inbox.toNext')} <kbd>g</kbd><kbd>n</kbd></button><button class="pill quiet" data-focus="capture">${t('capture.new')} <kbd>n</kbd></button></div>`
    }
  } else if (view === 'waiting') {
    h = eyebrow(t('list.waiting'), L.waiting.length, t('waiting.sorted')) + `<h1 class="display">${C.heading('waiting')}</h1>`
  } else if (view === 'someday') {
    h = eyebrow(t('list.someday'), L.someday.length, t('someday.sub')) + `<h1 class="display">${C.heading('someday')}</h1>`
  } else if (view === 'projects') {
    const active = ov.filter((p) => p.status === 'active')
    const stalled = ov.filter((p) => p.stalled)
    h = eyebrow(t('list.projects'), t('proj.active', { n: active.length }), stalled.length ? t('proj.stalledN', { n: stalled.length }) : t('proj.allMoving')) + `<h1 class="display">${C.heading('projects')}</h1>`
  } else if (view === 'project') {
    const p = ov.find((x) => x.name === ui.project)
    const state = p.stalled ? t('proj.stalled') : t(`proj.state.${p.status}`)
    const sp = (s, key) => `<button class="pill quiet" data-pstatus="${s}">${t(key)}</button>`
    const statusPills = p.status === 'active' ? sp('on_hold', 'proj.rest') + sp('done', 'proj.finish')
      : p.status === 'on_hold' ? sp('active', 'proj.resume') + sp('done', 'proj.finish') : sp('active', 'proj.resume')
    const ctxPick = `<span class="addctx">${CONTEXTS.map((c, i) => `<button class="ctx" data-addctx="${c}" aria-pressed="${ui.addCtx === c}"><kbd>${i + 1}</kbd>${c}</button>`).join('')}</span>`
    h = eyebrow(t('proj.one'), state, t('proj.nextN', { n: p.next }), t('proj.waitN', { n: p.waiting }))
      + `<h1 class="display">${C.esc(p.name)}</h1>`
      + (p.outcome ? `<p class="lead accent outcome-lead">${C.esc(p.outcome)}</p>` : `<p class="lead">${t('proj.noOutcome')}</p>`)
      + (p.stalled
        ? `<div class="callout"><span class="ring-mark"></span><p><b>${t('proj.stalledB')}</b> ${t('proj.stalledP')}</p><div class="acts"><button class="pill action" data-act="add-next">${t('proj.setNext')} <kbd>n</kbd></button>${statusPills}</div></div>`
        : `<div class="pstatus"><span class="mono mute">${t('proj.status')}</span>${statusPills}</div>`)
      + `<div class="inline-add ${ui.addOpen ? 'on' : ''}" id="inlineadd"><span class="plus-s mono mute">+</span><input placeholder="${C.esc(t('proj.addPh', { p: p.name }))}" aria-label="${C.esc(t('proj.addPh', { p: p.name }))}">${ctxPick}<span class="mono mute err">${t('proj.addHint')}</span></div>`
  } else if (view === 'review') {
    const days = C.daysBetween(store.lastReview, TODAY)
    h = eyebrow(t('nav.review'), t('review.last', { d: C.dayOfKey(store.lastReview) }), days ? t('review.ago', { n: days }) : t('review.today')) + `<h1 class="display">${C.heading('review')}</h1>`
      + `<p class="lead">${t('review.lead')}</p>`
  } else if (view === 'all') {
    h = eyebrow(t('nav.all'), t('all.open', { n: L.open.length }), ui.showDone ? t('all.doneN', { n: L.doneWeek.length }) : '') + `<h1 class="display">${C.heading('all')}</h1>`
      + `<div class="ctxbar" style="margin-top:20px"><button class="ctx" data-act="toggle-done" aria-pressed="${ui.showDone}">${t('all.showDone')} <kbd>d</kbd></button></div>`
  } else if (view === 'settings') {
    h = eyebrow(t('nav.settings'), 'uli', 'Admin') + `<h1 class="display">${C.heading('settings')}</h1>`
  } else if (view === 'search') {
    const n = sectionsFor('search', L).reduce((a, s) => a + s.tasks.length, 0)
    h = eyebrow(t('search.title'), `»${C.esc(ui.query)}«`, t('search.hits', { n })) + `<h1 class="display">${C.heading('search')}</h1>`
      + `<div class="actions"><button class="pill quiet" data-act="clear-search">${t('search.end')} <kbd>Esc</kbd></button></div>`
  }
  const key = view + '|' + h
  if (headEl.dataset.key !== key) {
    if (headEl.contains(document.activeElement) && document.activeElement.matches('input')) return // typing: never re-render under the cursor
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
      <span>${p.stalled ? `<span class="ring-mark" title="${t('proj.stalled')}"></span>` : ''}</span>
      <span><span class="name">${C.esc(p.name)}</span>${p.outcome ? `<span class="outcome">${C.esc(p.outcome)}</span>` : `<span class="outcome none">${t('proj.noOutcomeShort')}</span>`}</span>
      <span class="state ${p.stalled ? 'stalled' : ''}">${p.stalled ? t('proj.stalled') : t(`proj.row.${p.status}`)}</span>
      <span class="counts">${t('proj.counts', { n: p.next, w: p.waiting })}</span></button>`
  const sec = (label, n) => `<div class="sec"><div class="eyebrow"><span class="slash">//</span><span>${label}</span><span class="sep">·</span><span>${n}</span></div></div>`
  const add = ui.projAdd
    ? `<div class="proj-add on" id="projadd"><span class="plus-s mono mute">+</span><input placeholder="${t('proj.newPh')}" aria-label="${t('proj.newPh')}" maxlength="100"><span class="mono mute err" aria-live="polite">${t('proj.newHint')}</span></div>`
    : `<button class="proj-add" data-act="projadd"><span class="plus-s mono mute">+</span><span>${t('proj.new')}</span><kbd>n</kbd></button>`
  const htmlStr = sec(t('proj.secActive'), active.length) + active.map(row).join('') + add
    + sec(t('proj.secResting'), resting.length) + resting.map(row).join('')
    + (done.length ? sec(t('proj.secDone'), done.length) + done.map(row).join('') : '')
  if (bodyEl.dataset.html !== htmlStr || !bodyEl.querySelector('.proj')) {
    if (document.activeElement?.closest?.('#projadd')) return
    bodyEl.innerHTML = htmlStr
    bodyEl.dataset.html = htmlStr
  }
}

function reviewSteps(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled)
  const w = waitingSplit(L)
  const soon = w.due.length + w.soon.length
  return [
    { id: 1, what: t('rs.1'), why: t('rs.1w'), status: L.inbox.length ? t('rs.1s', { n: L.inbox.length }) : t('rs.empty'), ok: L.inbox.length === 0, go: 'inbox' },
    { id: 2, what: t('rs.2'), why: t('rs.2w'), status: t('rs.2s', { n: L.next.length, d: L.due.length }), go: 'next' },
    { id: 3, what: t('rs.3'), why: t('rs.3w'), status: t('rs.3s', { n: w.due.length, s: soon }), go: 'waiting' },
    { id: 4, what: t('rs.4'), why: stalled.length ? t('rs.4stalled', { p: stalled.map((p) => p.name).join(', ') }) : t('rs.4w'), status: stalled.length ? t('proj.stalledN', { n: stalled.length }) : t('proj.allMoving'), ok: !stalled.length, go: 'projects' },
    { id: 5, what: t('rs.5'), why: t('rs.5w'), status: t('rs.5s', { n: L.someday.length }), go: 'someday' },
    { id: 6, what: t('rs.6'), why: t('rs.6w'), status: t('rs.6s'), go: null },
  ]
}
function renderReview(L) {
  bodyEl.innerHTML = reviewSteps(L).map((s) => {
    const ok = s.ok || ui.reviewChecked.has(s.id)
    return `<div class="step ${ok ? 'ok' : ''}"><button class="num" data-act="review-check" data-step="${s.id}" aria-pressed="${ok}" aria-label="${t('rs.check', { n: s.id })}">${String(s.id).padStart(2, '0')}</button>
      <span><span class="what">${C.esc(s.what)}</span><span class="why">${C.esc(s.why)}</span></span>
      ${s.go ? `<button class="pill quiet" data-go="${s.go}">${C.esc(s.status)} →</button>` : `<span class="mono mute">${s.status}</span>`}</div>`
  }).join('') + `<div class="review-foot"><button class="pill action" data-act="review-done">${t('rs.finish')}</button><span class="mono mute">${t('rs.finishHint')}</span></div>`
}
function renderSettings() {
  bodyEl.innerHTML = [
    [t('set.account'), `<p>Ulrich Schinz · uli · Admin</p><button class="pill">${t('set.profile')}</button>`],
    [t('set.password'), `<p>${t('set.pwChanged')}</p><button class="pill">${t('set.pwChange')}</button>`],
    [t('set.apiKey'), `<p>${t('set.apiKeyP')}</p><div class="code"><span>rw_live_••••••••••••••••3f9a</span><span style="display:flex;gap:6px"><button class="pill quiet">${t('set.show')}</button><button class="pill quiet">${t('set.copy')}</button></span></div>`],
    [t('set.claude'), `<p>${t('set.claudeP')}</p><div class="code"><span>claude mcp add runway --transport http https://runway.agentic-reach.com/api/mcp</span><button class="pill quiet">${t('set.copy')}</button></div>`],
    [t('set.mcp'), `<p>${t('set.mcpP')}</p>`],
    [t('set.contexts'), `<p>${t('set.contextsP')}</p><div class="ctxbar">${CONTEXTS.map((c) => `<span class="ctx">${c}</span>`).join('')}<button class="ctx">${t('set.addCtx')}</button></div>`],
    [t('set.look'), `<div class="ctxbar"><button class="ctx" data-theme-set="" aria-pressed="${!document.documentElement.dataset.theme}">${t('set.system')}</button><button class="ctx" data-theme-set="light" aria-pressed="${document.documentElement.dataset.theme === 'light'}">${t('set.light')}</button><button class="ctx" data-theme-set="dark" aria-pressed="${document.documentElement.dataset.theme === 'dark'}">${t('set.dark')}</button></div>`],
    [t('set.lang'), `<p>${t('set.langP')}</p>`],
    [t('set.admin'), `<p>${t('set.adminP')}</p>`],
  ].map(([h, b]) => `<section class="set"><h3>${h}</h3><div>${b}</div></section>`).join('') + `<div style="margin-top:22px"><button class="pill">${t('set.signout')}</button></div>`
}

// Inbox zero: plain typography (03). 03's ink bloom is cut in this combination: the Tageslinse is
// the one WebGL object, and a second canvas on the same screen would break the one-canvas rule.
function renderZero() {
  if (bodyEl.querySelector(':scope > .zero')) return
  bodyEl.innerHTML = '<div class="zero"></div>'
}

// ───────────────────────────── margin ─────────────────────────────
const C_follow = (x) => parseTw(x.scheduled || x.wait)
function todayPanel(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled)
  const days = C.daysBetween(store.lastReview, TODAY)
  const w = waitingSplit(L)
  const follow = [...w.due, ...w.soon].slice(0, 3)
  const p = ui.shown
  // on Nächste the lens sits in the page head, so the margin carries only its numbers
  const slot = ui.view !== 'next' ? lensSlot(isPhone() ? 64 : 72, 'in-margin') : ''
  const followSec = ui.view === 'waiting' && !ui.query ? '' : `<section class="msec">${eyebrow(t('m.follow'), w.due.length ? t('m.followToday', { n: w.due.length }) : '')}
      ${follow.length ? follow.map((x) => { const f = C.followInfo(x); return `<button class="mrow" data-open="${x.id}"><span class="t">${f.due ? '<span class="ring-mark"></span>&nbsp; ' : ''}${C.esc(x.description)}</span><span class="m">${f.due ? (f.key === TODAY ? t('due.today') : t('m.since', { d: C.dm(C_follow(x)) })) : C.day(C_follow(x))}</span></button>` }).join('') : `<p class="mnote">${t('m.followNone')}</p>`}
    </section>`
  const unsent = store.failed.length ? `<section class="msec">${eyebrow(t('sync.title'), store.failed.length)}
      ${store.failed.map((f) => `<div class="mrow unsentrow"><span class="t">${C.esc(f.label || f.path)}</span><span class="m">${t('sync.unsent')}</span></div>`).join('')}
      <div style="margin-top:12px"><button class="pill" data-retry="">${t('sync.retry')}</button></div></section>` : ''
  return `${unsent}<section class="msec today-sec">${eyebrow(t('m.today'), C.longDay(NOW))}
      ${slot ? `<div class="lensline">${slot}<div class="lensread"><span class="big">${t('lens.of', { done: p.done, total: p.total })}</span><span class="mono mute">${t('lens.sub')}${p.extra ? t('lens.extra', { n: p.extra }) : ''}</span></div></div>` : ''}
      <ul class="donelist">${L.doneToday.map((x) => `<li><span class="desc"><span class="txt">${C.esc(x.description)}</span>${C.strikeSVG(x.id)}</span><span class="m">${x.end ? C.hm(parseTw(x.end)) : t('done.now')}</span></li>`).join('')}</ul>
    </section>
    ${followSec}
    <section class="msec">${eyebrow(t('list.projects'))}
      ${stalled.length ? stalled.map((x) => `<button class="mrow" data-project="${C.esc(x.name)}"><span class="t"><span class="ring-mark"></span>&nbsp; ${C.esc(x.name)}</span><span class="m">${t('proj.stalled')}</span></button>`).join('')
        : `<p class="mnote">${t('m.projOk', { n: ov.filter((x) => x.status === 'active').length })}</p>`}
    </section>
    <section class="msec">${eyebrow(t('nav.review'))}
      <p class="mnote">${t('m.reviewLast', { d: C.dayOfKey(store.lastReview) })}${days ? t('m.reviewAgo', { n: days }) : t('m.reviewToday')}</p>
      ${days >= 7 ? `<div style="margin-top:12px"><button class="pill" data-go="review">${t('m.reviewStart')} <kbd>g</kbd><kbd>r</kbd></button></div>` : ''}
    </section>`
}

function clarifyPanel(x, L) {
  const ov = store.projectOverview().filter((p) => p.status === 'active')
  const notes = x.annotations.length ? `<ul class="notes">${x.annotations.map((a) => `<li><span class="m">${C.dm(parseTw(a.entry))}</span><span>${C.esc(a.description)}</span></li>`).join('')}</ul>` : ''
  const on = (k) => ui.step === k || (k === 'project' && ['projctx', 'newproject'].includes(ui.step))
  const choice = (key, k, lab, why, cls = '') => `<button class="choice ${cls} ${on(key) ? 'on' : ''}" data-clarify="${key}"><kbd>${k}</kbd><span class="lab">${lab}</span><span class="why">${why}</span></button>`
  const ctxBtns = (attr) => CONTEXTS.map((c, i) => `<button class="ctx" ${attr}="${c}"><kbd>${i + 1}</kbd>${c}</button>`).join('')
  const ctxSub = ui.step === 'ctx' ? `<div class="subchoices"><p class="subq">${t('cl.whereQ')}</p>${ctxBtns('data-ctxto')}</div>` : ''
  const followSub = ui.step === 'follow' ? `<div class="subchoices"><p class="subq">${t('cl.followQ')}</p>${C.followOptions().map((o, i) => `<button class="ctx" data-follow="${o.day}"><kbd>${i + 1}</kbd>${C.esc(o.label)}<span class="sub-h">${C.esc(o.hint)}</span></button>`).join('')}</div>` : ''
  const projSub = ui.step === 'project'
    ? `<div class="subchoices">${ov.map((p, i) => `<button class="ctx" data-proj="${C.esc(p.name)}"><kbd>${i + 1}</kbd>${C.esc(p.name)}</button>`).join('')}<button class="ctx new" data-act="newproj"><kbd>n</kbd>${t('cl.newProject')}</button></div>`
    : ui.step === 'projctx'
      ? `<div class="subchoices"><p class="subq">${t('cl.projCtxQ', { p: C.esc(ui.stepProject) })}</p>${ctxBtns('data-projctx')}</div>`
      : ui.step === 'newproject'
        ? `<div class="subchoices newproj"><input id="newproj" placeholder="${t('proj.newPh')}" aria-label="${t('proj.newPh')}" maxlength="100"><span class="mono mute err" id="newprojerr" aria-live="polite">${t('cl.newProjHint')}</span></div>`
        : ''
  return `<div class="mhead">${eyebrow(t('cl.title'), t('cl.left', { n: L.inbox.length }))}<span class="mono mute">ID ${x.uuid.slice(-8)}</span></div>
    <h2 class="title">${C.esc(x.description)}</h2>
    <div class="mono mute">${t('row.captured', { d: C.entryInfo(x) })}</div>${notes}
    ${x.sync === 'failed' ? `<p class="unsent block"><span>${t('sync.unsent')}</span> · <button data-retry="">${t('sync.retry')}</button></p>` : ''}
    <div class="question">${t('cl.q')}</div>
    ${choice('ctx', 'a', t('cl.next'), t('cl.nextWhy'))}${ctxSub}
    ${choice('follow', 'w', t('list.waiting'), t('cl.waitWhy'))}${followSub}
    ${choice('someday', 'v', t('list.someday'), t('cl.somedayWhy'))}
    ${choice('project', 'p', t('cl.project'), t('cl.projectWhy'))}${projSub}
    ${choice('done', 'x', t('cl.done'), t('cl.doneWhy'))}
    ${choice('delete', 'Entf', t('cl.delete'), t('cl.deleteWhy'), 'danger')}
    <p class="mnote keyhints"><span><kbd>j</kbd> <kbd>k</kbd> ${t('cl.k.move')}</span><span><kbd>e</kbd> ${t('cl.k.edit')}</span><span><kbd>s</kbd> ${t('inbox.stack')}</span><span><kbd>z</kbd> ${t('cl.k.undo')}</span></p>`
}

function filedPanel(L) {
  const log = store.clarified
  return `<section class="msec">${eyebrow(t('m.filed'), log.length)}
      ${log.length ? `<ul class="filed">${log.slice(-8).reverse().map((x) => `<li><span class="t">${C.esc(x.description)}</span><span class="m">→ ${C.esc(t(x.label.k, x.label.v))}</span></li>`).join('')}</ul>` : `<p class="mnote">${t('m.filedNone')}</p>`}
    </section>` + todayPanel(L)
}

function detailPanel(x) {
  const list = listOf(x)
  const due = C.dueInfo(x)
  const ctx = contextsOf(x)
  const dueKey = x.due ? dayKey(parseTw(x.due)) : ''
  const others = store.lists().open.filter((o) => o.id !== x.id).slice(0, 12)
  const opt = (on, attrs, label) => `<button class="ctx" ${attrs} aria-pressed="${on}">${label}</button>`
  const planned = x.scheduled && !isWaiting(x) && dayOf(x.scheduled) <= TODAY
  const more = ui.more ? `
    <div class="field"><label for="f-sched">${t('d.follow')}</label><div class="val"><input id="f-sched" type="date" value="${x.scheduled ? dayKey(parseTw(x.scheduled)) : ''}"></div></div>
    <div class="field"><label for="f-wait">${t('d.defer')}</label><div class="val"><input id="f-wait" type="date" value="${x.wait ? dayKey(parseTw(x.wait)) : ''}"> <span class="mono mute">${t('d.deferHint')}</span></div></div>
    <div class="field"><label for="f-until">${t('d.until')}</label><div class="val"><input id="f-until" type="date"></div></div>
    <div class="field"><span class="lab">${t('d.recur')}</span><div class="opts">${['daily', 'weekly', 'monthly', 'yearly'].map((r) => opt(false, '', t(`d.recur.${r}`))).join('')}</div></div>
    <div class="field"><span class="lab">${t('d.dep')}</span><div class="val"><select class="dep">${`<option>${t('d.depNone')}</option>`}${others.map((o) => `<option>${C.esc(o.description)}</option>`).join('')}</select></div></div>` : ''
  return `<div class="mhead">${eyebrow(t('d.title'), t(`status.${list}`))}<button class="mclose" data-act="close"><kbd>Esc</kbd> ${t('close')}</button></div>
    <h2 class="title" id="dtitle" data-id="${x.id}" spellcheck="false">${C.esc(x.description)}</h2>
    <div class="mono mute">ID ${x.uuid.slice(-8)} · ${t('row.captured', { d: C.entryInfo(x) })}</div>
    <div class="livebar">${x.start ? `<i class="pulse"></i>${t('d.runningSince', { t: C.sinceStart(x) })}` : `<span>${t('d.notStarted')}</span>`}<button class="pill" data-act="start">${x.start ? t('d.pause') : t('d.start')} <kbd>s</kbd></button></div>
    <div class="field"><span class="lab">${t('d.list')}</span><div class="opts">${[['next', 'list.next'], ['waiting', 'list.waiting'], ['someday', 'list.someday']].map(([k, l]) => opt(list === k, `data-list="${k}"`, t(l))).join('')}</div></div>
    ${ui.needCtx === x.id ? `<p class="needctx"><span class="ring-mark"></span>${t('d.needCtx')}</p>` : ''}
    <div class="field ${ui.needCtx === x.id ? 'ask' : ''}"><span class="lab">${t('d.context')}</span><div class="opts">${CONTEXTS.map((c) => opt(ctx.includes(c), `data-setctx="${c}"`, c)).join('')}</div></div>
    <div class="field"><span class="lab">${t('d.project')}</span><div class="val">${x.project ? `<button data-project="${C.esc(x.project)}" class="ulink">${C.esc(x.project)}</button>` : `<span class="mute">${t('d.noProject')}</span>`}</div></div>
    ${isNext(x) ? `<div class="field"><span class="lab">${t('d.today')}</span><div class="opts">${opt(!!planned, 'data-act="plan"', planned ? t('d.plannedOn') : t('d.plannedOff'))}<kbd>t</kbd></div></div>` : ''}
    <div class="field"><label for="f-due">${t('d.due')}</label><div class="val"><input id="f-due" type="date" value="${dueKey}"> ${due && ['overdue', 'today'].includes(due.tone) ? `<span class="m ${due.tone}">${due.tone === 'overdue' ? t('status.overdue') : t('due.today')}</span>` : ''}</div></div>
    <div class="field"><span class="lab">${t('d.prio')}</span><div class="opts">${[['H', 'd.prioH'], ['M', 'd.prioM'], ['L', 'd.prioL']].map(([k, l]) => opt(x.priority === k, `data-prio="${k}"`, t(l))).join('')}</div></div>
    ${more}
    <div class="field"><span class="lab">${t('d.more')}</span><div class="more">${ui.more ? `<button data-act="more">${t('d.less')}</button>` : ['d.follow', 'd.defer', 'd.until', 'd.recur', 'd.dep'].map((k) => `<button data-act="more">${t(k)}</button>`).join(' · ')}</div></div>
    <section class="msec">${eyebrow(t('d.notes'), x.annotations.length)}
      <ul class="notes">${x.annotations.map((a) => `<li><span class="m">${C.dm(parseTw(a.entry))}</span><span>${C.esc(a.description)}</span></li>`).join('')}</ul>
      <input class="noteadd" id="noteadd" placeholder="${t('d.notePh')}" aria-label="${t('d.notePh')}">
    </section>
    <div class="detail-actions"><button class="pill action" data-act="done-open">${t('d.check')} <kbd>x</kbd></button><button class="pill" data-act="delete-open">${t('cl.delete')} <kbd>Entf</kbd></button></div>`
}

function tocPanel(L) {
  const ov = store.projectOverview()
  const stalled = ov.filter((p) => p.stalled).length
  const item = (v, label, count, extra = '') => `<button class="mrow big" data-go="${v}"><span class="t">${label}</span><span class="m">${count}${extra}</span></button>`
  return `<div class="mhead">${C.LOCKUP}<button class="mclose" data-act="close">${t('close')}</button></div>
    <label class="search toc-search"><span class="sr">${t('search.ph')}</span><input id="tocsearch" type="search" placeholder="${t('search.all')}" autocomplete="off" enterkeyhint="search" value="${C.esc(ui.query)}"></label>
    <div style="margin-top:6px">${item('inbox', t('list.inbox'), L.inbox.length)}${item('next', t('list.next'), L.next.length)}${item('waiting', t('list.waiting'), L.waiting.length)}
    ${item('projects', t('list.projects'), ov.filter((p) => p.status === 'active').length, stalled ? ` · ${t('proj.stalled')}` : '')}${item('someday', t('list.someday'), L.someday.length)}
    ${item('review', t('nav.review'), C.daysBetween(store.lastReview, TODAY) >= 7 ? t('nav.due') : '')}${item('all', t('nav.all'), '')}${item('settings', t('nav.settings'), '')}</div>` + `<div style="margin-top:28px">${todayPanel(L)}</div>`
}

function planPanel(name) {
  const p = store.projects.find((x) => x.name === name)
  const plan = p.plan
  if (!plan) return `${eyebrow(t('plan.title'), name)}<h2 class="title">${t('plan.none')}</h2><p class="mnote" style="margin-top:8px">${t('plan.noneP')}</p><div style="margin-top:16px"><button class="pill">${t('plan.start')}</button></div>` + `<div style="margin-top:30px">${todayPanel(store.lists())}</div>`
  return `<div class="plan">${eyebrow(t('plan.title'), name, t('plan.natural'))}
    <h4><span class="num">01</span> ${t('plan.why')}</h4><p>${C.esc(plan.purpose)}</p><p class="mute" style="margin-top:6px;font-size:13px">${C.esc(plan.principles)}</p>
    <h4><span class="num">02</span> ${t('plan.vision')}</h4><p class="accent" style="font-size:16px">${C.esc(plan.vision)}</p>
    <h4><span class="num">03</span> ${t('plan.ideas')}</h4><div class="ideas">${plan.brainstorm.map((b) => `<span>${C.esc(b)}</span>`).join('')}</div>
    <h4><span class="num">04</span> ${t('plan.organize')} <span class="mute">· Alt ↑ ↓</span></h4>
    <ol>${plan.organized.map((o, i) => `<li><span>${C.esc(o)}</span><span style="display:flex;gap:8px"><button data-plan-up="${i}" aria-label="${t('plan.up')}">↑</button><button data-plan-todo="${i}">${t('plan.toNext')}</button></span></li>`).join('')}</ol>
    <h4><span class="num">05</span> ${t('plan.actions')}</h4><p class="mute" style="font-size:13px">${t('plan.actionsP')}</p></div>`
}

let marginKey = ''
function renderMargin(L) {
  let key, htmlStr
  const openT = ui.open && store.get(ui.open)
  if (ui.toc) { key = 'toc'; htmlStr = tocPanel(L) }
  else if (ui.today && !openT) { key = 'today-panel'; htmlStr = `<div class="mhead"><span></span><button class="mclose" data-act="close"><kbd>Esc</kbd> ${t('close')}</button></div><div style="margin-top:6px">${todayPanel(L)}</div>` }
  else if (openT && openT.status === 'pending' && !store.holdOf(openT.id)?.kind?.match(/done|delete/)) { key = `d:${openT.id}`; htmlStr = detailPanel(openT) }
  else if (ui.view === 'inbox' && L.inbox.length && ui.inboxMode === 'list' && !ui.query) {
    const x = store.get(ui.focus) && isInbox(store.get(ui.focus)) ? store.get(ui.focus) : L.inbox[0]
    key = `c:${x.id}`; htmlStr = clarifyPanel(x, L)
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
  const unsent = store.failed.length
  const htmlStr = `<a class="brand" href="#next" aria-label="Agentic Reach runway">${C.MARK}<span>Agentic Reach</span></a>
    <div class="product">// runway</div>
    <nav class="nav" aria-label="${t('nav.lists')}">
      ${item('inbox', t('list.inbox'), L.inbox.length, 'i')}${item('next', t('list.next'), L.next.length, 'n', miniLens(ui.shown.level))}${item('waiting', t('list.waiting'), L.waiting.length, 'w')}
      ${item('projects', t('list.projects'), ov.filter((p) => p.status === 'active').length, 'p', stalled ? `<span class="ring-mark" title="${t('proj.stalled')}"></span>` : '')}${item('someday', t('list.someday'), L.someday.length, 'v')}
      <div class="nav-gap"></div>
      ${item('review', t('nav.review'), reviewDue ? t('nav.due') : '', 'r', reviewDue ? '<span class="ring-mark"></span>' : '')}${item('all', t('nav.all'), '', 'a')}${item('settings', t('nav.settings'), '', ',')}
    </nav>
    <div class="rail-foot">${unsent ? `<button class="unsent-foot" data-retry="" aria-label="${t('sync.n', { n: unsent })} · ${t('sync.retry')}" title="${t('sync.retry')}">${t('sync.n', { n: unsent })} · ${t('sync.retryShort')}</button>` : ''}<span>uli · ${t('stand', { t: store.stand })}</span><button data-act="palette"><kbd>⌘K</kbd> ${t('pal.title')}</button><button data-act="keys"><kbd>?</kbd> ${t('keys.title')}</button></div>`
  if (rail.dataset.html !== htmlStr) { rail.innerHTML = htmlStr; rail.dataset.html = htmlStr }
  const cur2 = ['inbox', 'next', 'waiting'].includes(cur) ? cur : 'more'
  const pb = `<nav class="tabs" aria-label="${t('nav.lists')}">
      <button data-go="inbox" ${cur2 === 'inbox' ? 'aria-current="page"' : ''}><span class="l">${t('list.inbox')} <span class="n">${L.inbox.length || ''}</span></span></button>
      <button data-go="next" ${cur2 === 'next' ? 'aria-current="page"' : ''}><span class="l">${t('list.next')}</span></button>
      <button data-go="waiting" ${cur2 === 'waiting' ? 'aria-current="page"' : ''}><span class="l">${t('list.waiting')}</span></button>
      <button class="more ${unsent ? 'warn' : ''}" data-act="toc" aria-label="${t('nav.more')}" ${cur2 === 'more' ? 'aria-current="page"' : ''}>···</button></nav>`
  if (phonebar.dataset.html !== pb) { phonebar.innerHTML = pb; phonebar.dataset.html = pb }
}

function renderTopline() {
  const b = $('#back', toplineEl)
  const h = ui.view === 'project' ? `<button class="mclose" data-go="projects">← ${t('list.projects')}</button>` : ''
  if (b.innerHTML !== h) b.innerHTML = h
  $('#todaybtn')?.setAttribute('aria-pressed', String(!!ui.today))
}

// ───────────────────────────── render ─────────────────────────────
function render() {
  const L = store.lists(ui.ctx)
  const view = ui.query ? 'search' : ui.view
  const zeroView = view === 'inbox' && !L.inbox.length
  const stackView = view === 'inbox' && !zeroView && ui.inboxMode === 'stack'
  const dock = isNarrow() && !isPhone() && ui.view === 'inbox' && !ui.query && L.inbox.length > 0 && !ui.toc && !stackView
  app.classList.toggle('dock', dock)
  app.classList.toggle('stackmode', stackView)
  app.dataset.view = view

  renderRail(L)
  renderTopline()
  renderHead(view, L)
  if (zeroView) renderZero()
  else if (stackView) {
    if (bodyEl.firstElementChild !== stageEl) { bodyEl.replaceChildren(stageEl); stack.setVisible(true) } else stack.render()
  } else {
    if (bodyEl.firstElementChild === stageEl) { stack.setVisible(false); bodyEl.replaceChildren() }
    if (['next', 'inbox', 'waiting', 'someday', 'all', 'project', 'search'].includes(view)) renderList(view, L)
    else if (view === 'projects') renderProjects()
    else if (view === 'review') renderReview(L)
    else if (view === 'settings') renderSettings()
  }
  if (!stackView && bodyEl.firstElementChild !== stageEl) bodyEl.dataset.view = view
  renderMargin(L)
  app.classList.toggle('panel-open', !dock && !!(ui.toc || ui.today || (ui.open && store.get(ui.open)) || (isPhone() && ui.view === 'inbox' && ui.inboxMode === 'list' && ui.sheetClarify && L.inbox.length)))
  document.title = `${ui.query ? t('search.title') : (ui.view === 'project' ? ui.project : t(`title.${ui.view}`))} · runway`
  lens.sync()
}

// ───────────────────────────── progress (the lens) ─────────────────────────────
function syncProgress({ animate = true } = {}) {
  if (ui.flights) return
  const p = store.progress()
  const changed = p.level !== ui.shown.level || p.total !== ui.shown.total || p.extra !== ui.shown.extra
  ui.shown = p
  if (changed) lens.setLevel(p.level, { animate })
}

// The signature (graft from 01): a planned todo is struck in coral ink (03), and a coral bead runs
// along a thread from its ring into the lens; the level rises when it lands. Only todos that count
// for today fly; anything else is struck and counted as "zusätzlich".
const easeOut = (k) => 1 - (1 - k) ** 3
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  return (x) => {
    let k = x
    for (let i = 0; i < 6; i++) { const f = ((ax * k + bx) * k + cx) * k - x; const d = (3 * ax * k + 2 * bx) * k + cx; if (Math.abs(d) < 1e-6) break; k -= f / d }
    k = clamp(k)
    return ((ay * k + by) * k + cy) * k
  }
}
const easePull = bezierEase(0.55, 0, 0.25, 1)
function flyToLens(ringEl, after) {
  const E = lens.entry()
  if (!E) return Promise.resolve()
  const r = ringEl.getBoundingClientRect()
  const P0 = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  // route: out of the ring into the left gutter, up beside the rows, then along the free band above
  // the head (like a taxiway) and a short hook down into the glass. It never crosses a row's text.
  const gx = P0.x - 28
  const eb = $('#head .eyebrow')?.getBoundingClientRect()
  const yc = Math.min(E.y - 18, eb ? eb.top - 14 : E.y - 18)
  const r1 = 14
  const d = `M${P0.x},${P0.y} C${P0.x - 8},${P0.y - 12} ${gx},${P0.y - 4} ${gx},${P0.y - 26}`
    + ` L${gx},${yc + r1} Q${gx},${yc} ${gx + r1},${yc}`
    + ` L${E.x - 34},${yc} Q${E.x - 4},${yc} ${E.x},${E.y}`
  const svg = $('#flight')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  const len = path.getTotalLength()
  const bead = document.createElement('div')
  bead.className = 'bead'
  document.body.appendChild(bead)
  const T_DRAW = 260 * ui.slow, T_START = 120 * ui.slow, T_FLY = 600 * ui.slow
  const t0 = performance.now()
  return new Promise((resolve) => {
    const frame = (now) => {
      const el = now - t0
      const drawn = easeOut(clamp(el / T_DRAW)) * len
      const kb = easePull(clamp((el - T_START) / T_FLY))
      const s = kb * len
      path.style.strokeDasharray = `${Math.max(0, drawn - s)} ${len * 2}`
      path.style.strokeDashoffset = `${-s}`
      const p = path.getPointAtLength(s)
      bead.style.transform = `translate(${p.x}px, ${p.y}px)`
      bead.style.opacity = el >= T_START - 30 ? '1' : '0'
      if (kb < 1) { requestAnimationFrame(frame); return }
      bead.remove(); path.remove()
      lens.drop(after.level, 6 / ((E.size || 104) / 104)).then(resolve)
    }
    requestAnimationFrame(frame)
  })
}

function labelFor(to, opts = {}) {
  const [k, a] = String(to).split(/:(.*)/s)
  if (k === 'next') return t('filed.next', { ctx: a })
  if (k === 'waiting') return opts.followUp ? t('filed.waitingOn', { day: opts.followUp }) : t('filed.waiting')
  if (k === 'project') return t('filed.project', { p: a, ctx: opts.ctx })
  return t(`filed.${k === 'delete' ? 'deleted' : k}`)
}

// complete = a coral ink strike, then the line leaves (03); planned todos also send a bead (01)
async function complete(id, mode = 'done', to = null, opts = {}) {
  const x = store.get(id)
  if (!x || busy.has(x.id) || x.status !== 'pending') return
  busy.add(x.id)
  const els = $$(`.row[data-id="${x.id}"]`, bodyEl)
  const fast = reduced()
  let flight = null
  if (mode === 'done' && countsToday(x) && !fast && els.length && lens.entry()) {
    const p = store.progress()
    const after = { ...p, done: p.done + 1, planned: p.planned - 1, level: p.total ? (p.done + 1) / p.total : 0 }
    ui.flights += 1
    flight = flyToLens(els[0].querySelector('.ring'), after).then(() => { ui.flights -= 1; syncProgress(); render(); const c = $('.lens-cap'); c?.classList.remove('roll'); void c?.offsetWidth; c?.classList.add('roll') })
  }
  if (els.length) {
    els.forEach((el) => {
      el.classList.add(mode === 'delete' ? 'is-deleted' : mode === 'filed' ? 'is-filed' : 'is-struck')
      const st = el.querySelector('.stamp')
      if (mode === 'filed') st.textContent = `→ ${labelFor(to, opts)}`
      if (mode === 'delete') st.textContent = t('filed.deleted')
    })
    focusAfter(x.id)
    await C.sleep((fast ? 160 : mode === 'filed' ? 520 : 640) * (flight ? ui.slow : 1))
    els.forEach((el) => { el.style.height = el.offsetHeight + 'px'; void el.offsetHeight; el.classList.add('is-gone') })
    await C.sleep(fast ? 0 : 190)
  } else focusAfter(x.id)
  busy.delete(x.id)
  if (to) {
    store.clarify(x.id, to, opts)
    if (mode === 'filed') notify(`→ ${labelFor(to, opts)}`, { undo: () => { store.undoClarify(x.id); ui.focus = x.id; render() }, detail: x.description })
  } else if (mode === 'delete') store.remove(x.id)
  else store.complete(x.id)
  for (const k of [...rowCache.keys()]) if (k.endsWith(':' + x.id)) rowCache.delete(k)
  ui.step = null; ui.stepProject = null
  render()
  return flight
}
// Every route into Nächste asks for a context, Warten auf asks for a follow-up day (graft from 05).
function clarify(id, to, opts = {}) {
  const x = store.get(id)
  if (!x) return
  const [k, a] = String(to).split(/:(.*)/s)
  if (ui.view === 'inbox' && ui.inboxMode === 'stack' && bodyEl.firstElementChild === stageEl) return stack.clarify(id, to)
  ui.focus = x.id
  if (k === 'next' && !a) { ui.step = 'ctx'; render(); return }
  if (k === 'project' && !opts.ctx) { ui.step = 'projctx'; ui.stepProject = a; render(); return }
  if (k === 'waiting' && !('followUp' in opts)) {
    if (a !== undefined) opts = { followUp: a }
    else { ui.step = 'follow'; render(); return }
  }
  if (k === 'waiting') to = 'waiting'
  if (k === 'delete') return complete(id, 'delete', 'delete')
  if (k === 'done') return complete(id, 'done', 'done')
  return complete(id, 'filed', to, opts)
}
// The stack has already flown the card into its tray; this only writes and offers Rückgängig.
function fileFromStack(id, to, opts = {}) {
  const x = store.get(id)
  if (!x) return
  store.clarify(id, to, opts)
  if (!['done', 'delete'].includes(to)) notify(`→ ${labelFor(to, opts)}`, { undo: () => { store.undoClarify(id); stack.returnCard(id); render() }, detail: x.description })
}

function capture(text) {
  const x = store.capture(text)
  if (!x) return null
  render()
  return x
}

// notice with the 6 s undo window (03), plus "Erneut senden" for a write the server did not take (02)
let noticeTimer = 0
function notify(text, { undo = null, detail = '', retry = false } = {}) {
  clearTimeout(noticeTimer)
  noticeEl.classList.remove('show')
  void noticeEl.offsetWidth
  noticeEl.innerHTML = `<span class="what">${C.esc(text)}${detail ? `<span class="dim"> · ${C.esc(detail)}</span>` : ''}</span>${undo ? `<button class="undo" data-act="undo">${t('undo')} <kbd>z</kbd></button>` : ''}${retry ? `<button class="undo" data-retry="">${t('sync.retry')}</button>` : ''}${undo ? '<span class="timer"></span>' : ''}`
  noticeEl._undo = undo
  noticeEl.classList.add('show')
  noticeTimer = setTimeout(() => { noticeEl.classList.remove('show'); noticeEl._undo = null }, retry ? 9000 : 6000)
}
function undo() {
  const f = noticeEl._undo
  if (!f) return
  f()
  noticeEl._undo = null
  noticeEl.classList.remove('show')
}
store.subscribe((why, d) => {
  if (why === 'capture') { const x = store.get(d.id); notify(t('n.captured'), { undo: () => { store.uncapture(x.id); render() }, detail: x.description }) }
  if (why === 'done') { const x = store.get(d.id); notify(t('n.done', { d: x.description }), { undo: () => store.undo(x.id) }) }
  if (why === 'delete') { const x = store.get(d.id); notify(t('n.deleted', { d: x.description }), { undo: () => store.undo(x.id) }) }
  if (why === 'failed') notify(t('n.failed', { d: d.op.label || d.op.path }), { retry: true })
  if (why === 'sync') notify(t('n.synced'))
  if (why === 'review') notify(t('n.review'))
  if (why === 'plan') notify(d.on ? t('n.planned') : t('n.unplanned'), { undo: () => store.togglePlanned(d.id), detail: store.get(d.id).description })
  syncProgress()
  render()
})

// ───────────────────────────── command palette (graft from 04) ─────────────────────────────
let palItems = [], palSel = 0
function commands() {
  const L = store.lists()
  const f = store.get(ui.focus)
  const go = (v, key, k) => ({ label: t('pal.goto', { v: t(key) }), hint: k, group: 'nav', run: () => show(v) })
  const c = [
    { label: t('capture.new'), hint: 'n', group: 'act', run: () => captureInput.focus() },
    ...(f && f.status === 'pending' && !isInbox(f) ? [
      { label: t('pal.check', { d: f.description }), hint: 'x', group: 'act', run: () => complete(f.id) },
      ...(isNext(f) && !(f.due && dayOf(f.due) <= TODAY) ? [{ label: store.isPlanned(f) && f.scheduled ? t('pal.unplan', { d: f.description }) : t('pal.plan', { d: f.description }), hint: 't', group: 'act', run: () => store.togglePlanned(f.id) }] : []),
    ] : []),
    ...(L.inbox.length ? [{ label: t('pal.clarify', { n: L.inbox.length }), hint: 'g i', group: 'act', run: () => show('inbox') },
      { label: ui.inboxMode === 'stack' ? t('pal.toList') : t('pal.toStack'), hint: 's', group: 'act', run: () => { if (ui.view !== 'inbox') show('inbox'); toggleMode() } }] : []),
    ...(store.failed.length ? [{ label: t('pal.retry', { n: store.failed.length }), group: 'act', run: () => store.retry() }] : []),
    go('inbox', 'list.inbox', 'g i'), go('next', 'list.next', 'g n'), go('waiting', 'list.waiting', 'g w'), go('projects', 'list.projects', 'g p'),
    go('someday', 'list.someday', 'g v'), go('review', 'nav.review', 'g r'), go('all', 'nav.all', 'g a'), go('settings', 'nav.settings', 'g ,'),
    ...CONTEXTS.map((x, i) => ({ label: t('pal.ctx', { c: x }), hint: String(i + 1), group: 'ctx', run: () => { if (ui.view !== 'next') show('next'); setCtx(x) } })),
    { label: t('pal.ctx', { c: t('ctx.none') }), hint: '6', group: 'ctx', run: () => { if (ui.view !== 'next') show('next'); setCtx(NO_CTX) } },
    { label: t('pal.ctxOff'), hint: '0', group: 'ctx', run: () => { if (ui.view !== 'next') show('next'); setCtx(null) } },
    { label: t('pal.theme', { v: t('set.light') }), group: 'look', run: () => setTheme('light') },
    { label: t('pal.theme', { v: t('set.dark') }), group: 'look', run: () => setTheme('dark') },
    { label: t('pal.theme', { v: t('set.system') }), group: 'look', run: () => setTheme('') },
    { label: t('keys.title'), hint: '?', group: 'look', run: () => toggleKeys(true) },
  ]
  return c
}
function openPalette() { ui.palOpen = true; paletteEl.classList.add('open'); $('#pal-input').value = ''; palSel = 0; renderPalette(); $('#pal-input').focus() }
function closePalette() { ui.palOpen = false; paletteEl.classList.remove('open') }
function renderPalette() {
  const raw = $('#pal-input').value.trim()
  const q = raw.toLowerCase()
  const cmds = commands().filter((c) => !q || c.label.toLowerCase().includes(q))
  const found = q ? store.lists().open.filter((x) => x.description.toLowerCase().includes(q)).slice(0, 5)
    .map((x) => ({ label: x.description, sub: [t(`status.${listOf(x)}`), x.project, contextsOf(x).join(' ')].filter(Boolean).join(' · '), group: 'todo', run: () => openTask(x.id) })) : []
  const projs = q ? store.projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 3)
    .map((p) => ({ label: p.name, sub: t('proj.one'), group: 'proj', run: () => show('project', { project: p.name }) })) : []
  palItems = [...cmds.slice(0, q ? 6 : 12), ...found, ...projs]
  if (q) palItems.push({ label: t('pal.capture', { q: raw }), hint: '↵', group: 'new', run: () => capture(raw) })
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1))
  let lastGroup = null
  $('#pal-list').innerHTML = palItems.map((c, i) => {
    const head = c.group !== lastGroup ? `<div class="pal-group">${t(`pal.g.${c.group}`)}</div>` : ''
    lastGroup = c.group
    return `${head}<button class="pal-item ${i === palSel ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === palSel}"><span class="pal-l">${C.esc(c.label)}${c.sub ? `<small>${C.esc(c.sub)}</small>` : ''}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ''}</button>`
  }).join('') || `<div class="pal-empty">${t('pal.nothing')}</div>`
  $('#pal-list .pal-item.on')?.scrollIntoView({ block: 'nearest' })
}
function paletteKey(ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); closePalette() }
  else if (ev.key === 'ArrowDown') { ev.preventDefault(); palSel = (palSel + 1) % palItems.length; renderPalette() }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); palSel = (palSel - 1 + palItems.length) % palItems.length; renderPalette() }
  else if (ev.key === 'Enter') { ev.preventDefault(); const c = palItems[palSel]; closePalette(); c?.run() }
}
$('#pal-input').addEventListener('input', () => { palSel = 0; renderPalette() })
$('#pal-input').addEventListener('keydown', paletteKey)
paletteEl.addEventListener('click', (ev) => { const b = ev.target.closest('.pal-item'); if (b) { const c = palItems[+b.dataset.i]; closePalette(); c.run() } else if (ev.target === paletteEl) closePalette() })

function setTheme(v) {
  if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme
  lens.setBackground()
  render()
}

// ───────────────────────────── actions ─────────────────────────────
function show(view, { project = null } = {}) {
  if (view === 'project') { ui.project = project; ui.addOpen = false }
  if (ui.view !== view || view === 'project') { ui.focus = null; ui.step = null }
  ui.view = view
  ui.open = null; ui.toc = false; ui.today = false; ui.projAdd = false; ui.query = ''; ui.needCtx = null
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
  for (const s of sectionsFor(view, L)) if (s.tasks?.length) return s.tasks[0].id
  return null
}
function setCtx(c) { ui.ctx = c || null; render() }
function toggleMode(force) {
  ui.inboxMode = force || (ui.inboxMode === 'stack' ? 'list' : 'stack')
  ui.step = null
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
    render(); $('.proj.focus')?.scrollIntoView({ block: 'nearest' }); return
  }
  const ids = visibleRowIds()
  if (!ids.length) return
  const i = ids.indexOf(ui.focus)
  ui.focus = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + d))]
  ui.step = null
  if (ui.open) ui.open = ui.focus
  render()
  $('.row.focus', bodyEl)?.scrollIntoView({ block: 'nearest' })
}
function focusAfter(id) {
  const ids = visibleRowIds()
  const i = ids.indexOf(id)
  const next = ids[i + 1] ?? ids[i - 1] ?? null
  if (ui.focus === id) ui.focus = next
  if (ui.open === id) ui.open = null
}
function openTask(id) {
  const x = store.get(id)
  if (!x) return
  ui.toc = false
  if (isInbox(x) && x.status === 'pending') {
    if (ui.view !== 'inbox') show('inbox')
    ui.focus = x.id; ui.open = null; ui.sheetClarify = true
    if (ui.inboxMode === 'stack') stack.pin(x.id)
  } else { ui.focus = x.id; ui.open = x.id; ui.more = false }
  render()
}
function setList(id, list) {
  const x = store.get(id)
  if (list === 'next' && !contextsOf(x).length) { ui.needCtx = id; render(); return } // never guess: ask for the context first
  ui.needCtx = null
  moveWithUndo(id, list)
}
// a list move goes out at once; Rückgängig sends the exact inverse (tags and, out of Warten auf, the follow-up day)
function moveWithUndo(id, list) {
  const inv = store.setList(id, list)
  if (inv) notify(t('n.moved', { list: t(`list.${list}`) }), { undo: () => { store.undoMove(id, inv); render() }, detail: store.get(id).description })
}
function setContext(id, c) {
  store.setContext(id, c)
  if (ui.needCtx === id) { ui.needCtx = null; moveWithUndo(id, 'next') }
}

// ───────────────────────────── events ─────────────────────────────
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act], [data-go], [data-ctx], [data-clarify], [data-ctxto], [data-follow], [data-proj], [data-projctx], [data-open], [data-project], [data-list], [data-setctx], [data-prio], [data-focus], [data-plan-todo], [data-plan-up], [data-pstatus], [data-mode], [data-retry], [data-theme-set], [data-addctx]')
  if (e.target === app && app.classList.contains('panel-open')) { ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; render(); return }
  const row = e.target.closest('.list .row[data-id]')
  if (!a && row) {
    const id = Number(row.dataset.id)
    const x = store.get(id)
    ui.focus = id; ui.step = null
    if (isInbox(x)) { ui.open = null; ui.sheetClarify = true } else { ui.open = id; ui.more = false }
    render(); return
  }
  if (!a || a.closest('#palette')) return
  const d = a.dataset
  if (d.retry !== undefined) { store.retry(d.retry || undefined); render(); return }
  if (d.act === 'done' && row) return complete(Number(row.dataset.id))
  if (d.go) { show(d.go); return }
  if (d.mode) return toggleMode(d.mode)
  if (d.themeSet !== undefined) return setTheme(d.themeSet)
  if (d.ctx !== undefined) return setCtx(d.ctx || null)
  if (d.clarify) return clarifyKey(d.clarify)
  if (d.ctxto) return clarify(currentInboxId(), `next:${d.ctxto}`)
  if (d.follow !== undefined) return clarify(currentInboxId(), 'waiting', { followUp: d.follow })
  if (d.proj) { ui.step = 'projctx'; ui.stepProject = d.proj; render(); return }
  if (d.projctx) return clarify(currentInboxId(), `project:${ui.stepProject}`, { ctx: d.projctx })
  if (d.addctx) { ui.addCtx = d.addctx; render(); $('#inlineadd input')?.focus(); return }
  if (d.open) return openTask(Number(d.open))
  if (d.project && !d.list) return show('project', { project: d.project })
  if (d.list) return setList(ui.open, d.list)
  if (d.setctx) return setContext(ui.open, d.setctx)
  if (d.prio) { store.setPriority(ui.open, d.prio); return }
  if (d.focus === 'capture') { captureInput.focus(); return }
  if (d.planTodo) { ui.addOpen = true; render(); const inp = $('#inlineadd input'); if (inp) { inp.value = store.projects.find((x) => x.name === ui.project).plan.organized[Number(d.planTodo)]; inp.focus() } return }
  if (d.planUp) { const p = store.projects.find((x) => x.name === ui.project); const i = Number(d.planUp); if (i > 0) { const o = p.plan.organized; [o[i - 1], o[i]] = [o[i], o[i - 1]]; render() } return }
  if (d.pstatus) return setProjectStatus(ui.project, d.pstatus)
  switch (d.act) {
    case 'close': ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; ui.needCtx = null; render(); break
    case 'today': ui.today = !ui.today; ui.open = null; render(); break
    case 'clear-search': clearSearch(); break
    case 'newproj': newProjectStep(); break
    case 'projadd': openProjAdd(); break
    case 'start': store.toggleStart(ui.open); break
    case 'plan': store.togglePlanned(ui.open); break
    case 'more': ui.more = !ui.more; render(); break
    case 'done-open': { const id = ui.open; ui.open = null; render(); complete(id); break }
    case 'delete-open': { const id = ui.open; ui.open = null; render(); complete(id, 'delete'); break }
    case 'undo': undo(); break
    case 'keys': toggleKeys(); break
    case 'palette': openPalette(); break
    case 'toc': ui.toc = !ui.toc; render(); break
    case 'toggle-done': ui.showDone = !ui.showDone; render(); break
    case 'review-check': { const s = Number(d.step); ui.reviewChecked.has(s) ? ui.reviewChecked.delete(s) : ui.reviewChecked.add(s); render(); break }
    case 'review-done': store.recordReview(); break
    case 'add-next': openInlineAdd(); break
  }
})
const currentInboxId = () => { const L = store.lists(); const x = store.get(ui.focus); return x && isInbox(x) ? x.id : L.inbox[0]?.id }
function clarifyKey(k) {
  const id = currentInboxId()
  if (!id) return
  if (['ctx', 'follow', 'project'].includes(k)) { ui.step = ui.step === k || (k === 'project' && ui.step === 'projctx') ? null : k; render(); return }
  clarify(id, k)
}
function openInlineAdd() { ui.addOpen = true; ui.addCtx = ui.addCtx || null; render(); $('#inlineadd input')?.focus() }
function newProjectStep() { ui.step = 'newproject'; render(); $('#newproj')?.focus() }
function openProjAdd() { ui.projAdd = true; render(); $('#projadd input')?.focus() }
function clearSearch() {
  ui.query = ''
  searchInput.value = ''
  const ts = $('#tocsearch'); if (ts) ts.value = ''
  render()
}
function setProjectStatus(name, status) {
  const prev = store.setProjectStatus(name, status)
  if (!prev) return
  notify(t(`n.proj.${status}`, { p: name }), { undo: () => { store.setProjectStatus(name, prev); render() } })
  render()
}
function submitProjectName(input, then) {
  const res = store.createProject(input.value.trim())
  if (res.error) {
    const err = input.parentElement.querySelector('.err')
    if (err) { err.textContent = t(res.error); err.classList.add('bad') }
    return
  }
  then(res.name)
}
// a project's next action needs a context too: 1-5 while typing with Alt, or a click on a chip
function submitInlineAdd(input) {
  const v = input.value.trim()
  if (!v) { ui.addOpen = false; headEl.dataset.key = ''; render(); return }
  if (!ui.addCtx) { const err = input.parentElement.querySelector('.err'); err.textContent = t('proj.addNeedCtx'); err.classList.add('bad'); return }
  store.addToProject(ui.project, v, ui.addCtx)
  notify(t('n.nextAdded', { d: v, ctx: ui.addCtx }))
  input.blur(); ui.addOpen = false; headEl.dataset.key = ''; render()
}

marginEl.addEventListener('input', (e) => {
  if (e.target.id === 'tocsearch') { ui.query = e.target.value.trim(); ui.open = null; render() }
})
marginEl.addEventListener('keydown', (e) => {
  if (e.target.id === 'tocsearch' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); ui.toc = false; render(); scrollEl.scrollTop = 0; window.scrollTo(0, 0) }
  if (e.target.id === 'newproj') {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ui.step = 'project'; marginEl.dataset.html = ''; render() }
    if (e.key === 'Enter') { e.preventDefault(); submitProjectName(e.target, (name) => { e.target.blur(); ui.step = 'projctx'; ui.stepProject = name; marginEl.dataset.html = ''; render() }) }
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
marginEl.addEventListener('transitionend', (e) => { if (e.target === marginEl) lens.sync() })
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
  }
})
headEl.addEventListener('keydown', (e) => {
  if (!e.target.closest('#inlineadd')) return
  if (e.altKey && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); ui.addCtx = CONTEXTS[Number(e.code.slice(5)) - 1]; $$('#inlineadd [data-addctx]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.addctx === ui.addCtx))); return }
  if (e.key === 'Enter') submitInlineAdd(e.target)
  if (e.key === 'Escape') { ui.addOpen = false; headEl.dataset.key = ''; e.target.blur(); render() }
})

captureForm.addEventListener('submit', (e) => {
  e.preventDefault()
  if (capture(captureInput.value)) captureInput.value = ''
  try { localStorage.removeItem('rw06-draft') } catch { /* private mode */ }
})
captureInput.addEventListener('input', () => { try { localStorage.setItem('rw06-draft', captureInput.value) } catch { /* ignore */ } })
captureInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') captureInput.blur() })
try { const d = localStorage.getItem('rw06-draft'); if (d) captureInput.value = d } catch { /* ignore */ }

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
    keysEl.innerHTML = `<div class="keys" role="dialog" aria-modal="true" aria-label="${t('keys.title')}">${eyebrow(t('keys.title'))}<h2 class="display" style="font-size:36px;margin-top:10px">${C.heading('keys')}</h2>
      <div class="cols"><div><h4>${t('keys.g.all')}</h4><dl>${row(t('keys.palette'), '⌘', 'K')}${row(t('keys.new'), 'n')}${row(t('keys.search'), '/')}${row(t('keys.undo'), 'z')}${row(t('keys.title'), '?')}${row(t('keys.close'), 'Esc')}</dl>
      <h4>${t('keys.g.lists')}</h4><dl>${row(t('list.inbox'), 'g', 'i')}${row(t('list.next'), 'g', 'n')}${row(t('list.waiting'), 'g', 'w')}${row(t('list.projects'), 'g', 'p')}${row(t('list.someday'), 'g', 'v')}${row(t('nav.review'), 'g', 'r')}${row(t('nav.all'), 'g', 'a')}</dl></div>
      <div><h4>${t('keys.g.rows')}</h4><dl>${row(t('keys.move'), 'j', 'k')}${row(t('keys.open'), '⏎')}${row(t('keys.check'), 'x')}${row(t('keys.plan'), 't')}${row(t('keys.edit'), 'e')}${row(t('keys.start'), 's')}${row(t('keys.delete'), 'Entf')}${row(t('keys.ctx'), '0', '–', '6')}</dl>
      <h4>${t('keys.g.inbox')}</h4><dl>${row(t('keys.cl.next'), 'a', '1–5')}${row(t('keys.cl.wait'), 'w', '1–4')}${row(t('list.someday'), 'v')}${row(t('keys.cl.proj'), 'p', '1–9')}${row(t('cl.done'), 'x')}${row(t('keys.cl.mode'), 's')}${row(t('keys.cl.stack'), '1', '–', '5')}</dl></div></div></div>`
  }
}
keysEl.addEventListener('click', (e) => { if (e.target === keysEl) toggleKeys(false) })

let gPending = 0
document.addEventListener('keydown', (e) => {
  const tgt = e.target
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.palOpen ? closePalette() : openPalette(); return }
  if (ui.palOpen) return
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
  const L = store.lists()
  const inInbox = ui.view === 'inbox' && !ui.query && L.inbox.length > 0
  if (inInbox && k === 's') { e.preventDefault(); return toggleMode() }
  if (inInbox && ui.inboxMode === 'stack' && k !== 'g' && k !== 'z' && k !== 'n' && k !== '?' && k !== '/' && stack.key(e)) { e.preventDefault(); return }
  if (inInbox && ui.inboxMode === 'list') {
    if ((ui.step === 'ctx' || ui.step === 'projctx') && /^[1-5]$/.test(k)) {
      e.preventDefault()
      const c = CONTEXTS[Number(k) - 1]
      return ui.step === 'ctx' ? clarify(currentInboxId(), `next:${c}`) : clarify(currentInboxId(), `project:${ui.stepProject}`, { ctx: c })
    }
    if (ui.step === 'follow' && /^[1-4]$/.test(k)) { e.preventDefault(); return clarify(currentInboxId(), 'waiting', { followUp: C.followOptions()[Number(k) - 1].day }) }
    if (ui.step === 'project' && k === 'n') { e.preventDefault(); return newProjectStep() }
    if (ui.step === 'project' && /^[1-9]$/.test(k)) {
      const p = store.projectOverview().filter((x) => x.status === 'active')[Number(k) - 1]
      if (p) { e.preventDefault(); ui.step = 'projctx'; ui.stepProject = p.name; render(); return }
    }
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
    case 'x': if (ui.focus && ui.view !== 'projects') { e.preventDefault(); inInbox ? clarify(currentInboxId(), 'done') : complete(ui.focus) } return
    case 'Backspace': case 'Delete': if (ui.focus) { e.preventDefault(); inInbox ? clarify(currentInboxId(), 'delete') : complete(ui.focus, 'delete') } return
    case 'e': if (ui.focus) { e.preventDefault(); ui.open = ui.focus; render(); editTitle() } return
    case 's': if (ui.focus && !inInbox) store.toggleStart(ui.focus); return
    case 't': if (ui.focus && !inInbox) store.togglePlanned(ui.focus); return
    case 'z': undo(); return
    case 'd': if (ui.view === 'all') { ui.showDone = !ui.showDone; render() } return
    case 'Escape':
      if (ui.step) { ui.step = ui.step === 'projctx' ? 'project' : null; render(); return }
      if (ui.addOpen) { ui.addOpen = false; render(); return }
      if (ui.projAdd) { ui.projAdd = false; render(); return }
      if (ui.open || ui.toc || ui.today || ui.sheetClarify) { ui.open = null; ui.toc = false; ui.today = false; ui.sheetClarify = false; render(); return }
      if (ui.query) { ui.query = ''; searchInput.value = ''; render() }
      return
  }
  if (inInbox && ui.inboxMode === 'list') {
    const map = { a: 'ctx', w: 'follow', v: 'someday', p: 'project' }
    if (map[k]) { e.preventDefault(); clarifyKey(map[k]) }
    return
  }
  if (ui.view === 'next' && /^[0-6]$/.test(k)) setCtx(k === '0' ? null : k === '6' ? NO_CTX : CONTEXTS[Number(k) - 1])
})

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { lens.setBackground(); render() })
let resizeRaf = 0
addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { headEl.dataset.key = ''; render(); stack.layout() }) })
scrollEl.addEventListener('scroll', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => lens.sync()) }, { passive: true })
addEventListener('scroll', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => lens.sync()) }, { passive: true })

// ───────────────────────────── boot + test hook ─────────────────────────────
function resolve(id) {
  if (id == null) return null
  const x = store.get(Number(id)) || store.get(id) || store.tasks.find((y) => y.description.toLowerCase().includes(String(id).toLowerCase()))
  return x?.id ?? null
}
const until = async (f, ms = 6000) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < ms) await C.sleep(50) }
window.proto = {
  show: (view) => show(view),
  filter: (context) => { if (!['next', 'all'].includes(ui.view)) show('next'); setCtx(context === 'ohne Kontext' ? NO_CTX : context) },
  capture: (text) => capture(text),
  open: (id) => openTask(resolve(id)),
  complete: (id) => complete(resolve(id)),
  clarify: (id, to) => { const x = resolve(id); if (store.get(x) && ui.view !== 'inbox') show('inbox'); return clarify(x, to) },
  // A planned todo flies into the lens: "3 von 7" becomes "4 von 7". For a still image the moment runs
  // at a quarter of its speed; the promise resolves while the bead is entering the glass.
  async signature({ slow = 4 } = {}) {
    if (ui.view !== 'next') show('next')
    if (!reduced()) { lens.load(); await until(() => lens.state === 'ready' || lens.state === 'off') }
    await C.sleep(150)
    ui.slow = slow
    const x = store.get(resolve('Steuerberatung zurückrufen'))
    const f = complete(x.id)
    f.then?.((fl) => fl && fl.then(() => { ui.slow = 1 }))
    await C.sleep(300 * slow)
  },
  stack: () => { show('inbox'); toggleMode('stack') },
  lift: async () => { show('inbox'); toggleMode('stack'); await C.sleep(300); await stack.lift() },
  palette: (q = '') => { openPalette(); if (q) { $('#pal-input').value = q; renderPalette() } },
  network: (up) => { store.net.up = !!up; if (up) store.retry(); render() },
  theme: (v) => setTheme(v),
  store, ui, calls: store.calls,
  get lens() { return { state: lens.state, frames: lens.frames, level: lens.level, caption: lensCaption(ui.shown) } },
  get stackFrames() { return stack.frames },
}

const hash = decodeURIComponent(location.hash.slice(1))
if (hash.startsWith('projekt/')) show('project', { project: hash.slice(8) })
else show(['inbox', 'next', 'waiting', 'projects', 'someday', 'review', 'all', 'settings'].includes(hash) ? hash : 'next')
const params = new URLSearchParams(location.search)
if (params.get('task')) openTask(resolve(params.get('task'))) // the Android handoff, honoured
lens.setLevel(ui.shown.level, { animate: false })
