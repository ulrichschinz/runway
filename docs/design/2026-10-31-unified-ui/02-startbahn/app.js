// Startbahn: web prototype. Plain ES modules, no build step. In the real app each render*
// function becomes a Vue component (README "Web build plan").
import {
  store, sel, act, outbox, net, dueLabel, followUpLabel, contextsOf, nowLabel, tierOf, projectNameError,
  isOverdue, followUpDue, day, ddmm, listOf, isOpen, hhmm, CONTEXTS, TODAY,
} from './model.js'
import { createField } from './field.js'
import { t, getLang, setLang, applyStatic } from './i18n.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const phone = () => matchMedia('(max-width: 760px)').matches
const wide = () => matchMedia('(min-width: 1181px)').matches
// The field shows where it adds a place: Inbox, Nächste, Warten auf on wide screens; on a
// phone only Nächste (on Inbox and Warten auf it would repeat the list).
const fieldViews = () => (phone() ? ['next'] : ['next', 'inbox', 'waiting'])
const T = (key, vars) => `<span data-i18n="${key}">${esc(t(key, vars))}</span>`

const G = {
  check: '<svg viewBox="0 0 20 20"><path d="M5.2 10.4l3.1 3.1 6.5-7"/></svg>',
  x: '<svg viewBox="0 0 20 20"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>',
  search: '<svg class="glyph" viewBox="0 0 20 20"><circle cx="8.6" cy="8.6" r="4.9"/><path d="M12.3 12.3l3.6 3.6"/></svg>',
}

const ui = {
  view: 'next', project: null, projTab: 'aufgaben', sel: null, openId: null, ctxPick: false, projPick: false,
  lastCapture: null, palette: null, planDrafts: {}, planDirty: {}, planNext: null, planAdded: {},
  keyShown: false, keyAsk: false, mcpTab: 'Claude Code', projError: null, newProjError: null,
}
const field = createField($('#field'), { reduced, layout: { horizon: 0.3, safeTop: 52 } })
let fieldView = null

// ---------- labels that depend on the language ----------
const wdFmt = { de: new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' }), en: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short' }) }
const dmy = (d) => (getLang() === 'en' ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ddmm(d))
function dueText(task) {
  const d = dueLabel(task)
  if (!d || getLang() === 'de') return d
  const date = day(task.due)
  const wd = wdFmt.en.format(new Date(`${date}T12:00:00Z`))
  const text = d.tone === 'over' ? `overdue since ${dmy(date)}` : d.tone === 'today' ? 'due today' : d.text === 'fällig morgen' ? 'due tomorrow' : `due ${wd} ${dmy(date)}`
  return { ...d, text }
}
function followText(task) {
  const f = followUpLabel(task)
  if (getLang() === 'de') return f
  const raw = task.scheduled || task.wait
  const date = raw ? day(raw) : null
  const text = f.tone === 'none' ? 'no follow-up date' : date < TODAY ? `follow up since ${dmy(date)}` : date === TODAY ? 'follow up today' : `follow up ${dmy(date)}`
  return { ...f, text }
}

// ---------- small renderers ----------
const count = (n) => `<span class="count">${n}</span>`
const metaHtml = (task, { project = true, ctx = true } = {}) => {
  const d = dueText(task)
  const parts = []
  if (task.sync === 'failed') parts.push(`<span class="unsent">${T('meta.unsent')}</span><button class="btn xs" data-retry="capture-${task.id}">${T('act.retry')}</button>`)
  if (task.start) parts.push(`<span class="run"><span class="ring-y"></span>${esc(t('meta.running', { t: hhmm(task.start) }))}</span>`)
  if (d) parts.push(`<span class="due ${d.tone}">${esc(d.text)}</span>`)
  if (project && task.project) parts.push(`<span>${esc(task.project)}</span>`)
  if (ctx && contextsOf(task).length) parts.push(`<span class="ctx">${esc(contextsOf(task).join(' '))}</span>`)
  if (task.priority === 'H') parts.push(`<span class="prio">${T('meta.prioH')}</span>`)
  return parts.join('')
}
const checkBtn = (task) => `<button class="check ${isOverdue(task) ? 'over' : ''}" data-check="${task.id}" aria-label="${esc(t('act.checkLabel', { task: task.description }))}">${G.check}</button>`
function row(task, extra = '') {
  return `<li class="row ${ui.sel === task.id ? 'sel' : ''} ${task.fresh ? 'fresh' : ''}" data-id="${task.id}" data-flip="${task.id}">
    ${checkBtn(task)}
    <div class="row-title">${esc(task.description)}</div>
    <div class="meta">${extra || metaHtml(task)}</div>
  </li>`
}
const section = (key, n, inner, cls = '') => `<section class="section ${cls}"><h2 class="section-h">${T(key)}${n != null ? ` <span class="n">${n}</span>` : ''}</h2><ul class="rows">${inner}</ul></section>`
const ctxChips = (name, current, numbered = true) => [`<button type="button" class="chip mono" data-${name}="" aria-pressed="${!current}">${numbered ? '<span class="n">0</span>' : ''}${esc(t('clarify.noCtx'))}</button>`,
  ...CONTEXTS.map((c, i) => `<button type="button" class="chip mono" data-${name}="${c}" aria-pressed="${current === c}">${numbered ? `<span class="n">${i + 1}</span>` : ''}${c}</button>`)].join('')

// A next step for a project: text plus a context (chips, keys Alt+0–5, or "@kontext" in the text).
// Default: no context. Never a hidden default like @computer.
function addNextForm(project, { primary = false, key = 'project.addNext' } = {}) {
  return `<form class="addnext" data-addnext="${esc(project)}" data-ctx="">
    <div class="inline-add"><input name="t" placeholder="${esc(t(key))}" aria-label="${esc(t(key))}" autocomplete="off"><button class="btn sm ${primary ? 'primary' : ''}" type="submit">${T('act.toNext')}</button></div>
    <div class="ctxrow" role="group" aria-label="${esc(t('filter.label'))}"><span class="eyebrow">${T('filter.label')}</span>${ctxChips('actx', null)}<span class="hint">${T('project.ctxHint')}</span></div>
  </form>`
}

// ---------- sidebar, phone tabs, network line ----------
function renderSide() {
  const c = sel.counts()
  // lamps: coral only where time presses (due, follow-up due); ink for "something to look at"
  const items = [
    ['inbox', 'nav.inbox', c.inbox, c.inbox ? 'ink' : ''],
    ['next', 'nav.next', c.next, c.due ? 'on' : ''],
    ['waiting', 'nav.waiting', c.waiting, c.followUps ? 'on' : 'wait'],
    ['projects', 'nav.projects', c.projects, c.stalled ? 'ink' : ''],
    ['someday', 'nav.someday', c.someday, ''],
  ]
  const cur = (v) => (ui.view === v || (v === 'projects' && ui.view === 'project') ? 'aria-current="page"' : '')
  $('#nav').innerHTML = items.map(([v, key, n, lamp]) =>
    `<a class="navi" href="#${v}" data-go="${v}" data-nav="${v}" ${cur(v)}><span class="lamp ${lamp}" aria-hidden="true"></span>${T(key)}<span class="n">${n}</span></a>`).join('')
  $('#ctx-nav').innerHTML = `<h2>${T('nav.contexts')}</h2>` + sel.contexts().map((x) =>
    `<a class="sidei" href="#next" data-ctx="${x.name}" ${ui.view === 'next' && store.filter === x.name ? 'aria-current="page"' : ''}><span class="ctx">${x.name}</span><span class="n">${x.count}</span></a>`).join('')
  $('#more-nav').innerHTML = `<h2>${T('nav.more')}</h2>` + [
    ['tickler', 'nav.tickler', c.tickler],
    ['done', 'nav.done', t('side.today', { n: c.doneToday })],
    ['review', 'nav.review', t('side.reviewAgo')],
    ['settings', 'nav.settings', ''],
  ].map(([v, key, n]) => `<a class="sidei" href="#${v}" data-go="${v}" ${cur(v)}>${T(key)}<span class="n">${esc(n)}</span></a>`).join('')
  $('#side-foot').innerHTML = `<span class="avatar" aria-hidden="true">U</span><span>uli</span>` + (c.failed
    ? `<button class="stand unsent" data-retry title="${esc(t('act.retry'))}">${esc(t('side.unsent', { n: c.failed }))}</button>`
    : `<span class="stand"><span class="dot live" aria-hidden="true"></span>${esc(t('side.stand', { t: nowLabel() }))}</span>`)
}
function renderPtabs() {
  const c = sel.counts()
  const tab = (v, key, n) => `<button class="ptab" data-go="${v}" ${ui.view === v ? 'aria-current="page"' : ''}>${T(key)}<span class="n">${n}</span></button>`
  const more = !['inbox', 'next', 'waiting'].includes(ui.view)
  $('#ptabs').innerHTML = tab('inbox', 'nav.inbox', c.inbox) + tab('next', 'nav.next', c.next) + tab('waiting', 'nav.waiting', c.waiting) +
    `<button class="ptab" data-more ${more ? 'aria-current="page"' : ''}>${T('nav.more')}</button><button class="ptab icon" data-search aria-label="${esc(t('nav.search'))}">${G.search}</button>`
}
function renderNetbar() {
  const n = store.failed.length
  const el = $('#netbar')
  el.hidden = !n
  el.innerHTML = n ? `<span class="dot" aria-hidden="true"></span><span>${esc(t('side.unsent', { n }))}</span><button class="btn xs" data-retry>${T('act.retry')}</button>` : ''
}

// ---------- header ----------
const eyebrow = (key, vars) => `<p class="eyebrow"><span class="slash">//</span> <span data-i18n="${key}">${esc(t(key, vars))}</span></p>`
function head() {
  const c = sel.counts()
  const chip = (ctx, label, n) => `<button class="chip ${ctx ? 'mono' : ''}" data-filter="${ctx || ''}" aria-pressed="${(store.filter || '') === (ctx || '')}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`
  switch (ui.view) {
    case 'next': return `<div>${eyebrow('eyebrow.next', { date: t('date.today') })}<h1>${T('nav.next')} ${count(sel.next().all.length)}</h1></div>
      <div class="chips" role="group" aria-label="${esc(t('filter.label'))}">${chip(null, T('filter.all'))}${sel.contexts().map((x) => chip(x.name, x.name, x.count)).join('')}</div>`
    case 'inbox': {
      const oldest = sel.inbox().at(-1)
      return `<div>${eyebrow('eyebrow.inbox')}<h1>${T('nav.inbox')} ${count(c.inbox)}</h1></div>
      <div class="head-side">${oldest ? `<span class="eyebrow">${esc(t('head.oldest', { d: dmy(day(oldest.entry)) }))}</span>` : ''}</div>`
    }
    case 'waiting': return `<div>${eyebrow('eyebrow.waiting')}<h1>${T('nav.waiting')} ${count(c.waiting)}</h1></div>`
    case 'projects': return `<div>${eyebrow('eyebrow.projects')}<h1>${T('nav.projects')} ${count(c.projects)}</h1></div>
      <div class="head-side">${c.stalled ? `<span class="stalled-tag"><span class="dot"></span>${esc(t('head.stalled', { n: c.stalled }))}</span>` : `<span class="eyebrow">${T('head.allMoving')}</span>`}</div>`
    case 'project': {
      const p = sel.project(ui.project)
      if (!p) return ''
      const seg = (s) => `<button data-pstatus="${s}" aria-pressed="${p.status === s}">${T(`status.${s}`)}</button>`
      return `<div><button class="back" data-go="projects">${T('head.back')}</button><h1>${esc(p.name)}</h1></div>
      <div class="head-side"><div class="status-seg" role="group" aria-label="${esc(t('status.label'))}">${seg('active')}${seg('on_hold')}${seg('done')}</div></div>`
    }
    case 'someday': return `<div>${eyebrow('eyebrow.someday')}<h1>${T('nav.someday')} ${count(c.someday)}</h1></div>`
    case 'tickler': return `<div>${eyebrow('eyebrow.tickler')}<h1>${T('nav.tickler')} ${count(c.tickler)}</h1></div>`
    case 'done': return `<div>${eyebrow('eyebrow.done')}<h1>${T('nav.done')} ${count(sel.done().length)}</h1></div>`
    case 'review': return `<div>${eyebrow('eyebrow.review')}<h1><span>${T('review.a')}<em data-i18n="review.b">${esc(t('review.b'))}</em></span></h1></div>`
    case 'settings': return `<div>${eyebrow('eyebrow.settings')}<h1>${T('nav.settings')}</h1></div>`
    default: return ''
  }
}

function renderStageText() {
  const c = sel.counts()
  const rw = sel.runway()
  let cap = '', tag = '', sr = ''
  if (ui.view === 'next') {
    cap = `<span class="slash">// </span>${T('stage.next')}`
    tag = `<span class="dot" aria-hidden="true"></span>${esc(t('stage.doneToday', { n: c.doneToday }))}`
    sr = t('sr.now', { list: rw.cleared.map((x) => x.description).join(', ') })
  } else if (ui.view === 'inbox') {
    cap = `<span class="slash">// </span>${T('stage.inbox')}`
  } else if (ui.view === 'waiting') {
    cap = `<span class="slash">// </span>${T('stage.waiting')}`
    if (c.followUps) tag = `<span class="ring-c" aria-hidden="true"></span>${T('stage.inner')}`
  }
  $('#stage-cap').innerHTML = cap
  $('#stage-tag').innerHTML = tag
  $('#stage-sr').textContent = sr
}

// ---------- the three cleared cards ----------
function clearedHtml() {
  const { cleared, queue } = sel.runway()
  const cards = cleared.map((task, i) => {
    const d = dueText(task)
    const tier = tierOf(task)
    let st = ''
    if (d && (d.tone === 'over' || d.tone === 'today')) st = `<span class="dot" aria-hidden="true"></span><span class="st over">${esc(d.text)}</span>`
    else if (task.start) st = `<span class="ring-y" aria-hidden="true"></span><span class="st">${esc(t('meta.running', { t: hhmm(task.start) }))}</span>`
    else if (d) st = `${tier === 'soon' ? '<span class="dot hollow" aria-hidden="true"></span>' : ''}<span class="st">${esc(d.text)}</span>`
    else if (task.priority === 'H') st = `<span class="st">${T('card.prioHigh')}</span>`
    else st = `<span class="st">${esc(contextsOf(task).join(' ') || t('card.anywhere'))}</span>`
    // footer: at most two facts, so nothing truncates (a running task shows its due date here)
    const later = task.start && d && d.tone !== 'over' && d.tone !== 'today' ? `<span class="due ${d.tone}">${tier === 'soon' ? '<span class="dot hollow" aria-hidden="true"></span>' : ''}${esc(d.text)}</span>` : ''
    const facts = [later, task.project ? `<span>${esc(task.project)}</span>` : '', contextsOf(task).length ? `<span class="ctx">${esc(contextsOf(task).join(' '))}</span>` : ''].filter(Boolean).slice(0, 2)
    return `<article class="card tier-${tier} ${ui.sel === task.id ? 'sel' : ''}" data-id="${task.id}" data-flip="${task.id}" tabindex="-1">
      <div class="card-top"><span class="rank">0${i + 1}</span>${st}</div>
      <h3 class="card-title">${esc(task.description)}</h3>
      <div class="card-foot"><div class="meta">${facts.join('')}</div>${checkBtn(task)}</div>
    </article>`
  })
  while (cards.length < 3) cards.push(`<div class="card free"><span class="eyebrow">${T('card.free')}</span></div>`)
  // the threshold: a 1px yellow line between the cleared three and the queue (stacked layouts)
  return cards.join('') + (queue.length ? '<div class="threshold" aria-hidden="true"></div>' : '')
}

// ---------- content per view ----------
function contentHtml() {
  switch (ui.view) {
    case 'next': {
      const { due, dueOther, rest } = sel.next()
      const cleared = new Set(sel.runway().cleared.map((x) => x.id))
      const d = due.filter((x) => !cleared.has(x.id)), r = rest.filter((x) => !cleared.has(x.id))
      if (!cleared.size && !dueOther.length) {
        return store.filter
          ? `<p class="empty">${esc(t('empty.nextCtx', { ctx: store.filter }))} <button class="btn sm" data-filter="">${T('empty.showAll')}</button></p>`
          : `<p class="empty">${T('empty.next')}</p>`
      }
      return (d.length ? section('sec.due', d.length, d.map((x) => row(x)).join('')) : '') +
        (dueOther.length ? section('sec.dueOther', dueOther.length, dueOther.map((x) => row(x)).join(''), 'other') : '') +
        section('sec.next', r.length, r.map((x) => row(x)).join('') || `<li class="empty">${T('empty.allUp')}</li>`)
    }
    case 'inbox': {
      const items = sel.inbox()
      if (!items.length) return `<p class="empty">${T('empty.inbox')} <em data-i18n="empty.inboxEm">${esc(t('empty.inboxEm'))}</em></p>`
      const cur = items.find((x) => x.id === ui.sel) || items[0]
      ui.sel = cur.id
      return clarifyHtml(cur) + section('sec.unclear', null, items.map((x) => row(x, x.sync === 'failed' ? metaHtml(x) : `<span>${esc(t('meta.captured', { d: dmy(day(x.entry)) }))}</span>`)).join(''))
    }
    case 'waiting': {
      const items = sel.waiting()
      if (!items.length) return `<p class="empty">${T('empty.waiting')}</p>`
      const mark = (x) => { const f = followText(x); return `<span class="wait-mark ${f.tone}">${esc(f.text)}</span>${x.project ? `<span>${esc(x.project)}</span>` : ''}` }
      const due = items.filter(followUpDue), later = items.filter((x) => !followUpDue(x))
      return (due.length ? section('sec.followUp', due.length, due.map((x) => row(x, `${mark(x)}<button class="btn xs" data-followed="${x.id}">${T('act.followed')}</button>`)).join('')) : '') +
        section('sec.waits', later.length, later.map((x) => row(x, mark(x))).join(''))
    }
    case 'projects': return projectsHtml()
    case 'project': return projectHtml()
    case 'someday': {
      const items = sel.someday()
      const held = sel.projects().filter((p) => p.status === 'on_hold')
      return section('sec.ideas', items.length, items.map((x) => row(x, `${x.project ? `<span>${esc(x.project)}</span>` : ''}<button class="btn xs" data-activate="${x.id}">${T('act.toNext')}</button>`)).join('')) +
        (held.length ? `<section class="section"><h2 class="section-h">${T('sec.heldProjects')} <span class="n">${held.length}</span></h2><div class="proj-grid">${held.map(projCard).join('')}</div></section>` : '')
    }
    case 'tickler': {
      const items = sel.tickler()
      return items.length ? section('sec.reappears', null, items.map((x) => row(x, `<span class="wait-mark later">${esc(t('meta.from', { d: dmy(day(x.wait)) }))}</span>${x.project ? `<span>${esc(x.project)}</span>` : ''}`)).join(''))
        : `<p class="empty">${T('empty.none')}</p>`
    }
    case 'done': {
      const doneRow = (x) => `<li class="row" data-id="${x.id}"><span class="check done" aria-hidden="true">${G.check}</span><div class="row-title">${esc(x.description)}</div><div class="meta"><span>${day(x.end) === TODAY ? hhmm(x.end) : dmy(day(x.end))}</span>${contextsOf(x).length ? `<span class="ctx">${esc(contextsOf(x).join(' '))}</span>` : ''}</div></li>`
      const today = sel.doneToday(), earlier = sel.doneEarlier()
      return section('sec.today', today.length, today.map(doneRow).join('')) +
        section('sec.earlier', earlier.length, earlier.map(doneRow).join('') || `<li class="empty">${T('empty.earlier')}</li>`)
    }
    case 'review': return reviewHtml()
    case 'settings': return settingsHtml()
    default: return ''
  }
}

// Clarify card: 1 Nächste (then a context), 2 Warten auf, 3 Irgendwann, 4 Projekt (pick one or
// create one), X Gleich erledigt, ⌫ Löschen. The next item is selected at once.
const projectNameFrom = (s) => s.replace(/^[\p{L}]+:\s*/u, '').replace(/[()"'\\:/?#%]/g, '').replace(/^[+\- ]+/, '').replace(/\s+/g, ' ').trim().slice(0, 60)
function clarifyHtml(task) {
  const active = sel.projects().filter((p) => p.status === 'active').slice(0, 9)
  const ctxs = CONTEXTS.map((c, i) => `<button class="chip mono" data-clarify="${task.id}" data-to="next:${c}"><span class="n">${i + 1}</span>${c}</button>`).join('')
  const projs = active.map((p, i) => `<button class="chip" data-clarify="${task.id}" data-to="project:${esc(p.name)}"><span class="n">${i + 1}</span>${esc(p.name)}</button>`).join('')
  return `<div class="clarify" data-flip="clarify">
    <div class="clarify-q"><div style="min-width:0"><p class="eyebrow">${T('clarify.q')}</p><h3>${esc(task.description)}</h3></div><span class="eyebrow">${dmy(day(task.entry))}</span></div>
    <div class="clarify-opts">
      <button class="opt primary" data-ctxpick="${task.id}" aria-expanded="${ui.ctxPick}"><span class="k">1</span>${T('nav.next')}</button>
      <button class="opt" data-clarify="${task.id}" data-to="waiting"><span class="k">2</span>${T('nav.waiting')}</button>
      <button class="opt" data-clarify="${task.id}" data-to="someday"><span class="k">3</span>${T('nav.someday')}</button>
      <button class="opt" data-projpick="${task.id}" aria-expanded="${ui.projPick}"><span class="k">4</span>${T('clarify.project')}</button>
      <span class="opt-sep" aria-hidden="true"></span>
      <button class="opt" data-clarify="${task.id}" data-to="done"><span class="k">X</span>${T('clarify.done')}</button>
      <button class="opt" data-clarify="${task.id}" data-to="delete"><span class="k">⌫</span>${T('act.delete')}</button>
    </div>
    ${ui.ctxPick ? `<div class="ctxpick"><span class="eyebrow">${T('clarify.where')}</span>${ctxs}<button class="chip" data-clarify="${task.id}" data-to="next">${T('clarify.noCtx')} <span class="n">↵</span></button></div>` : ''}
    ${ui.projPick ? `<div class="ctxpick projpick"><span class="eyebrow">${T('clarify.which')}</span>${projs}
      <form class="newproj" data-newproj="${task.id}" autocomplete="off"><label for="np-in">${T('clarify.newProject')}</label><input id="np-in" name="p" value="${esc(projectNameFrom(task.description))}" aria-describedby="np-err"><button class="btn xs" type="submit">${T('clarify.create')} <kbd>↵</kbd></button></form>
      ${ui.newProjError ? `<p class="form-err" id="np-err">${esc(ui.newProjError)}</p>` : ''}</div>` : ''}
  </div>`
}

function projCard(p) {
  const tasks = sel.projectTasks(p.name)
  const marks = [...tasks.filter((x) => listOf(x) === 'next').map(() => '<i class="n"></i>'),
    ...tasks.filter((x) => listOf(x) === 'waiting').map(() => '<i class="w"></i>'),
    ...tasks.filter((x) => !['next', 'waiting'].includes(listOf(x))).map(() => '<i class="o"></i>')]
  const status = p.stalled ? `<span class="stalled-tag"><span class="dot"></span>${T('project.noNext')}</span>`
    : p.status === 'on_hold' ? `<span class="eyebrow">${T('project.paused')}</span>`
      : `<span class="eyebrow">${esc(t('project.counts', { n: p.next, w: p.waiting }))}</span>`
  return `<button class="proj ${p.stalled ? 'stalled' : ''} ${p.status === 'on_hold' ? 'hold' : ''}" data-proj="${esc(p.name)}" data-flip="p-${esc(p.name)}">
    <h3>${esc(p.name)}</h3><p>${esc(p.outcome) || '&nbsp;'}</p>
    <div class="proj-foot"><div class="mini ${p.next ? '' : 'dark'}" aria-hidden="true">${marks.join('') || '<i class="o"></i>'}</div>${status}</div>
  </button>`
}
function projectsHtml() {
  const ps = sel.projects()
  const active = ps.filter((p) => p.status === 'active'), rest = ps.filter((p) => p.status !== 'active')
  return `<form class="inline-add newproject" data-createproj autocomplete="off"><span class="plus" aria-hidden="true">+</span><input name="p" placeholder="${esc(t('project.new'))}" aria-label="${esc(t('project.new'))}" aria-describedby="cp-err"><button class="btn sm" type="submit">${T('clarify.create')}</button></form>
    ${ui.projError ? `<p class="form-err" id="cp-err">${esc(ui.projError)}</p>` : ''}
    <div class="proj-grid">${active.map(projCard).join('')}</div>` +
    (rest.length ? `<section class="section"><h2 class="section-h">${T('sec.pausedDone')} <span class="n">${rest.length}</span></h2><div class="proj-grid">${rest.map(projCard).join('')}</div></section>` : '')
}

// ---------- project: tasks and the editable plan (Natural Planning: purpose, principles,
// vision, ideas, organize; actions from the ordered steps) ----------
const emptyPlan = () => ({ purpose: '', principles: '', vision: '', brainstorm: [], organized: [] })
function draftOf(name) {
  if (!ui.planDrafts[name]) ui.planDrafts[name] = JSON.parse(JSON.stringify({ ...emptyPlan(), ...(store.plans[name] || {}) }))
  return ui.planDrafts[name]
}
function planHtml(p) {
  const pl = draftOf(p.name)
  const dirty = !!ui.planDirty[p.name]
  const added = ui.planAdded[p.name] || []
  const ta = (k, rows) => `<div class="box"><label class="eyebrow" for="pl-${k}">${T(`plan.${k}`)}</label><textarea id="pl-${k}" data-plan="${k}" rows="${rows}" placeholder="${esc(t(`plan.${k}Hint`))}">${esc(pl[k])}</textarea></div>`
  const ideas = pl.brainstorm.map((s, i) => `<li><span>${esc(s)}</span><button class="btn xs" data-ideaorg="${i}">${T('plan.toOrg')} →</button><button class="x sm" data-idearm="${i}" aria-label="${esc(t('plan.remove'))}">${G.x}</button></li>`).join('')
  const org = pl.organized.map((s, i) => `<li draggable="true" data-org="${i}">
      <span class="grip" title="${esc(t('plan.drag'))}" aria-hidden="true">⋮⋮</span><span class="otext">${esc(s)}</span>
      <span class="oacts"><button class="x sm" data-orgmove="${i}" data-dir="-1" aria-label="${esc(t('plan.up'))}" ${i ? '' : 'disabled'}>↑</button><button class="x sm" data-orgmove="${i}" data-dir="1" aria-label="${esc(t('plan.down'))}" ${i < pl.organized.length - 1 ? '' : 'disabled'}>↓</button>
      ${added.includes(s) ? `<span class="eyebrow">${T('plan.inNext')}</span>` : `<button class="btn xs" data-plannext="${i}" aria-expanded="${ui.planNext === i}">${T('act.toNext')}</button>`}
      <button class="x sm" data-orgrm="${i}" aria-label="${esc(t('plan.remove'))}">${G.x}</button></span>
      ${ui.planNext === i ? `<div class="ctxrow inrow">${ctxChips('pnctx', null)}</div>` : ''}
    </li>`).join('')
  return `<div class="plan">
    ${ta('purpose', 3)}${ta('principles', 3)}
    <div class="box wide"><label class="eyebrow" for="pl-vision">${T('plan.vision')}</label><textarea id="pl-vision" data-plan="vision" rows="2" placeholder="${esc(t('plan.visionHint'))}">${esc(pl.vision)}</textarea></div>
    <div class="box"><p class="eyebrow">${T('plan.ideas')}</p><ul class="ideas">${ideas || `<li class="muted">${T('plan.noIdeas')}</li>`}</ul>
      <form class="inline-add" data-planidea autocomplete="off"><input name="t" placeholder="${esc(t('plan.ideaHint'))}" aria-label="${esc(t('plan.ideaHint'))}"><kbd>↵</kbd></form></div>
    <div class="box"><p class="eyebrow">${T('plan.organize')}</p><ol class="org">${org || `<li class="muted">${T('plan.noOrg')}</li>`}</ol>
      <div class="org-foot"><form class="inline-add" data-planorg autocomplete="off"><input name="t" placeholder="${esc(t('plan.orgHint'))}" aria-label="${esc(t('plan.orgHint'))}"><kbd>↵</kbd></form>
      ${pl.brainstorm.length ? `<button class="btn xs" data-planfrom>${T('plan.fromIdeas')}</button>` : ''}</div></div>
    <div class="plan-foot"><span class="eyebrow plan-state ${dirty ? 'dirty' : ''}">${T(dirty ? 'plan.dirty' : 'plan.saved')}</span><button class="btn primary" data-plansave ${dirty ? '' : 'disabled'}>${T('act.save')}</button></div>
  </div>`
}
function projectHtml() {
  const p = sel.projects().find((x) => x.name === ui.project)
  if (!p) return ''
  const ts = sel.projectTasks(p.name)
  const tab = (k, key) => `<button class="tab" data-ptab="${k}" role="tab" aria-selected="${ui.projTab === k}">${T(key)}${k === 'plan' && ui.planDirty[p.name] ? '<span class="dirty-dot" aria-hidden="true"></span>' : ''}</button>`
  let body = ''
  if (ui.projTab === 'plan') body = planHtml(p)
  else {
    const next = ts.filter((x) => listOf(x) === 'next'), waiting = ts.filter((x) => listOf(x) === 'waiting'), other = ts.filter((x) => !['next', 'waiting'].includes(listOf(x)))
    body = (p.stalled ? `<div class="clarify stuck"><div class="clarify-q"><div><p class="eyebrow">${T('project.stuck')}</p><h3>${T('project.whatNext')}</h3></div></div>${addNextForm(p.name, { primary: true, key: 'project.setNext' })}</div>` : '') +
      section('nav.next', next.length, next.map((x) => row(x, metaHtml(x, { project: false }))).join('') || `<li class="empty">${T('empty.noStep')}</li>`) +
      (waiting.length ? section('nav.waiting', waiting.length, waiting.map((x) => row(x, `<span class="wait-mark ${followText(x).tone}">${esc(followText(x).text)}</span>`)).join('')) : '') +
      (other.length ? section('sec.noList', other.length, other.map((x) => row(x)).join('')) : '') +
      (!p.stalled ? addNextForm(p.name) : '')
  }
  return `<p class="eyebrow" style="margin:0 4px 6px">${T('project.goal')}</p><p class="outcome">${esc(p.outcome) || '&nbsp;'}</p><div class="tabs" role="tablist">${tab('aufgaben', 'project.tasks')}${tab('plan', 'project.plan')}</div>` + body
}

function reviewHtml() {
  const c = sel.counts()
  const step = (n, title, text, view, label, ok, extra = '') => `<div class="step"><span class="num">0${n}</span><div><h4>${T(title)}</h4><p>${esc(text)}</p></div>${ok ? `<span class="eyebrow">${T('review.ok')}</span>` : `<button class="btn sm" data-go="${view}">${T(label)}</button>`}${extra}</div>`
  const stalled = sel.projects().filter((p) => p.stalled)
  const inline = stalled.length ? `<div class="step-more">${stalled.map((p) => `<div class="stalled-item"><button class="pname" data-proj="${esc(p.name)}">${esc(p.name)}</button>${addNextForm(p.name, { key: 'project.setNext' })}</div>`).join('')}</div>` : ''
  return `<div class="review">
    ${step(1, 'review.s1', t('review.s1t', { n: c.inbox }), 'inbox', 'review.s1b', !c.inbox)}
    ${step(2, 'review.s2', t('review.s2t', { n: c.next, d: c.due }), 'next', 'review.s2b')}
    ${step(3, 'review.s3', t('review.s3t', { n: c.followUps }), 'waiting', 'review.s3b', !c.followUps)}
    ${step(4, 'review.s4', c.stalled ? t('head.stalled', { n: c.stalled }) : t('head.allMoving'), 'projects', 'review.s4b', !c.stalled, inline)}
    ${step(5, 'review.s5', t('review.s5t', { n: c.someday }), 'someday', 'review.s2b')}
    <div style="margin-top:8px"><button class="btn primary" data-review>${T('review.finish')}</button></div>
  </div>`
}

function settingsHtml() {
  const key = ui.keyShown ? 'rw_9c41d7e2b6a04f1e8d3a5c7b0e2f3f9a' : 'rw_••••••••••••••••3f9a'
  const snippets = {
    'Claude Code': 'claude mcp add --transport http runway \\\n  https://runway.agentic-reach.com/api/mcp \\\n  --header "X-Api-Key: $RUNWAY_API_KEY"',
    'Claude Desktop': '{ "mcpServers": { "runway": {\n  "url": "https://runway.agentic-reach.com/api/mcp",\n  "headers": { "X-Api-Key": "…" } } } }',
    curl: 'curl -H "X-Api-Key: $RUNWAY_API_KEY" \\\n  https://runway.agentic-reach.com/api/gtd/summary',
  }
  const users = store.users.map((u) => `<li><span>${esc(u.name)}${u.you ? ` <span class="eyebrow">· ${T('set.you')}</span>` : ''}</span><span class="pill-tag">${T(u.role === 'admin' ? 'set.roleAdmin' : 'set.roleUser')}</span>
    ${u.you ? '' : `<button class="btn xs" data-role="${esc(u.name)}" data-to="${u.role === 'admin' ? 'user' : 'admin'}">${T(u.role === 'admin' ? 'set.demote' : 'set.promote')}</button>`}</li>`).join('')
  return `<div class="cards2">
    <div class="box"><h4>${T('set.profile')}</h4><p class="sub">${esc(t('set.role', { u: 'uli' }))}</p>
      <div class="fld"><label for="s-name">${T('set.name')}</label><input id="s-name" value="Uli"></div>
      <div class="fld"><label for="s-mail">${T('set.email')}</label><input id="s-mail" type="email" value="uli@example.org"></div>
      <div class="row-btns"><button class="btn sm" data-saveprofile>${T('act.save')}</button></div></div>
    <div class="box"><h4>${T('set.apiKey')}</h4><div class="code">${key}</div>
      <div class="row-btns"><button class="btn sm" data-keyshow>${T(ui.keyShown ? 'set.hide' : 'set.show')}</button><button class="btn sm" data-keycopy>${T('set.copy')}</button><button class="btn sm" data-keyask>${T('set.regen')}</button></div>
      ${ui.keyAsk ? `<div class="confirm"><p>${T('set.regenAsk')}</p><div class="row-btns"><button class="btn sm dark" data-keyregen>${T('set.regen')}</button><button class="btn sm" data-keycancel>${T('act.cancel')}</button></div></div>` : ''}</div>
    <div class="box"><h4>${T('set.connect')}</h4><ol class="steps">
      <li><span>${T('set.step1')}</span><div class="code">export RUNWAY_API_KEY=${key}\nexport RUNWAY_URL=https://runway.agentic-reach.com</div></li>
      <li><span>${T('set.step2')}</span><div class="code">claude mcp add runway …</div></li>
      <li><span>${T('set.step3')}</span><div class="code">/plugin install runway@agentic-reach</div></li>
      <li><span>${T('set.step4')}</span><div class="code">runway_project: &lt;Projekt&gt;</div></li></ol></div>
    <div class="box"><h4>${T('set.mcp')}</h4><div class="chips start" role="tablist">${Object.keys(snippets).map((k) => `<button class="chip" role="tab" data-mcptab="${k}" aria-pressed="${ui.mcpTab === k}">${k}</button>`).join('')}</div><div class="code">${esc(snippets[ui.mcpTab])}</div></div>
    <div class="box"><h4>${T('set.password')}</h4>
      <div class="fld"><label for="s-pw0">${T('set.pwCurrent')}</label><input id="s-pw0" type="password" autocomplete="current-password"></div>
      <div class="d-grid"><div class="fld"><label for="s-pw1">${T('set.pwNew')}</label><input id="s-pw1" type="password" autocomplete="new-password"></div><div class="fld"><label for="s-pw2">${T('set.pwConfirm')}</label><input id="s-pw2" type="password" autocomplete="new-password"></div></div>
      <div class="row-btns"><button class="btn sm">${T('set.pwChange')}</button></div></div>
    <div class="box"><h4>${T('set.look')}</h4><p class="sub">${T('set.lookSystem')}</p>
      <p class="eyebrow" style="margin:14px 0 8px">${T('set.lang')}</p><div class="chips start"><button class="chip" data-lang="de" aria-pressed="${getLang() === 'de'}">Deutsch</button><button class="chip" data-lang="en" aria-pressed="${getLang() === 'en'}">English</button></div></div>
    <div class="box"><h4>${T('set.admin')}</h4>
      <label class="switch"><input type="checkbox" data-setreg ${store.registration ? 'checked' : ''}><span class="track" aria-hidden="true"></span>${T('set.registration')}</label>
      <p class="eyebrow" style="margin:16px 0 6px">${T('set.users')}</p><ul class="users">${users}</ul></div>
    <div class="box"><h4>${T('nav.signout')}</h4><p class="sub">${T('set.signoutHint')}</p><div class="row-btns"><button class="btn sm" data-signout>${T('nav.signout')}</button></div></div>
  </div>`
}

// ---------- detail panel ----------
function detailHtml(task) {
  const list = listOf(task)
  const ln = { inbox: 'nav.inbox', next: 'nav.next', waiting: 'nav.waiting', someday: 'nav.someday' }[list]
  const dv = (f) => (task[f] ? day(task[f]) : '')
  const lchip = (k, key) => `<button class="chip" data-dlist="${k}" aria-pressed="${list === k}">${T(key)}</button>`
  const cchip = (c) => `<button class="chip mono" data-dctx="${c}" aria-pressed="${contextsOf(task).includes(c)}">${c}</button>`
  const others = sel.open().filter((x) => x.id !== task.id && listOf(x) === 'next').slice(0, 12)
  return `<div class="d-head">${eyebrow('eyebrow.details', { list: ln ? t(ln) : t('detail.onlyProject') })}<button class="x" data-close aria-label="${esc(t('act.close'))}">${G.x}</button></div>
  <div class="d-body">
    <textarea class="d-title" data-dtitle="${task.id}" rows="${task.description.length > 30 ? 2 : 1}" aria-label="${esc(t('detail.description'))}">${esc(task.description)}</textarea>
    <div class="d-actions">
      <button class="btn primary" data-dcheck="${task.id}">${T('act.check')}</button>
      <button class="btn" data-start="${task.id}">${T(task.start ? 'act.pause' : 'act.start')}</button>
      <button class="btn" data-del="${task.id}">${T('act.delete')}</button>
    </div>
    <section class="d-sec"><p class="eyebrow">${T('detail.list')}</p><div class="chips start">${lchip('inbox', 'nav.inbox')}${lchip('next', 'nav.next')}${lchip('waiting', 'nav.waiting')}${lchip('someday', 'nav.someday')}</div></section>
    <section class="d-sec"><p class="eyebrow">${T('detail.context')}</p><div class="chips start">${CONTEXTS.map(cchip).join('')}</div></section>
    <section class="d-sec"><div class="d-grid">
      <div class="fld"><label for="f-proj">${T('detail.project')}</label><input id="f-proj" list="projlist" data-dfield="project" value="${esc(task.project || '')}" placeholder="${esc(t('detail.noProject'))}"><datalist id="projlist">${store.projects.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist></div>
      <div class="fld"><label for="f-prio">${T('detail.prio')}</label><select id="f-prio" data-dfield="priority"><option value="">${esc(t('detail.none'))}</option>${[['H', 'detail.prioH'], ['M', 'detail.prioM'], ['L', 'detail.prioL']].map(([v, k]) => `<option value="${v}" ${task.priority === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select></div>
      <div class="fld"><label for="f-due">${T('detail.due')}</label><input id="f-due" type="date" data-dfield="due" value="${dv('due')}"></div>
      <div class="fld"><label for="f-sch">${T(list === 'waiting' ? 'detail.followUp' : 'detail.begins')}</label><input id="f-sch" type="date" data-dfield="scheduled" value="${dv('scheduled')}"></div>
      <div class="fld"><label for="f-wait">${T('detail.wait')}</label><input id="f-wait" type="date" data-dfield="wait" value="${dv('wait')}"></div>
      <div class="fld"><label for="f-until">${T('detail.until')}</label><input id="f-until" type="date" data-dfield="until" value="${dv('until')}"></div>
      <div class="fld"><label for="f-rec">${T('detail.recur')}</label><select id="f-rec" data-dfield="recur" ${task.due ? '' : `disabled title="${esc(t('detail.recurNeedsDue'))}"`}><option value="">${esc(t('detail.none'))}</option>${['daily', 'weekly', 'monthly', 'yearly'].map((r) => `<option value="${r}" ${task.recur === r ? 'selected' : ''}>${esc(t(`recur.${r}`))}</option>`).join('')}</select></div>
      <div class="fld"><label for="f-dep">${T('detail.dep')}</label><select id="f-dep" data-dfield="depends"><option value="">${esc(t('detail.none'))}</option>${others.map((o) => `<option value="${o.uuid}">${esc(o.description)}</option>`).join('')}</select></div>
    </div></section>
    <section class="d-sec"><p class="eyebrow">${T('detail.notes')}</p>
      <ul class="notes">${task.annotations.map((a) => `<li><time>${dmy(day(a.entry))}</time><span>${esc(a.description)}</span></li>`).join('')}</ul>
      <form class="inline-add" data-dnote="${task.id}"><input name="t" placeholder="${esc(t('detail.noteHint'))}" aria-label="${esc(t('detail.noteHint'))}"><kbd>↵</kbd></form>
    </section>
  </div>
  <div class="d-foot"><span>${esc(t('detail.captured', { d: dmy(day(task.entry)) }))}</span><span>${esc(t('detail.urgency', { u: getLang() === 'de' ? task.urgency.toFixed(1).replace('.', ',') : task.urgency.toFixed(1) }))}</span><span>id ${task.uuid.slice(-8)}</span></div>`
}
function renderDetail() {
  const d = $('#detail')
  const task = ui.openId != null ? sel.byId(ui.openId) : null
  if (!task || !isOpen(task)) {
    d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true
    ui.openId = null
    return
  }
  const focused = document.activeElement && d.contains(document.activeElement) ? document.activeElement.id || document.activeElement.dataset.dtitle : null
  d.innerHTML = detailHtml(task)
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false')
  $('#scrim').hidden = !phone()
  if (focused) (document.getElementById(focused) || d.querySelector('[data-dtitle]'))?.focus()
}
function openDetail(id) {
  const task = sel.byId(id)
  if (!task) return
  ui.openId = task.id; ui.sel = task.id
  render({ quiet: true })
}
function closeDetail() { ui.openId = null; renderDetail() }

// ---------- field snapshot ----------
function snapshot() {
  const rw = sel.runway()
  return {
    cleared: rw.cleared.map((x) => ({ id: x.id, tier: tierOf(x), started: !!x.start })),
    queue: rw.queue.map((x) => ({ id: x.id, tier: tierOf(x) })),
    inbox: sel.inbox().slice().reverse().map((x) => ({ id: x.id, fresh: !!x.fresh })),
    waiting: sel.waiting().map((x) => ({ id: x.id, due: followUpDue(x) })),
    done: sel.doneToday().length,
    dropId: ui.lastCapture,
  }
}
// On wide screens the three lanes sit exactly above the three cards.
function laneGeometry() {
  if (!wide() || ui.view !== 'next') return [null, null]
  const cards = $$('#cleared .card')
  const cl = $('#cleared'), st = $('#stage')
  if (cards.length !== 3) return [null, null]
  const lp = cards.map((c) => cl.offsetLeft + c.offsetLeft + c.offsetWidth / 2 - st.offsetLeft)
  const ty = cl.offsetTop + cards[0].offsetTop - st.offsetTop - 16
  return [lp, ty]
}
let lastLanes = [null, null]

// ---------- FLIP for list changes ----------
function flip(containers, mutate) {
  if (reduced) { mutate(); return }
  const first = new Map()
  for (const c of containers) for (const el of c.querySelectorAll('[data-flip]')) first.set(el.dataset.flip, { r: el.getBoundingClientRect(), c })
  mutate()
  for (const c of containers) for (const el of c.querySelectorAll('[data-flip]')) {
    const was = first.get(el.dataset.flip)
    if (was && was.c !== c && c.id === 'cleared') {
      // the head of the queue enters the threshold from the right, as its node does on the taxiway
      el.animate([{ opacity: 0, transform: 'translateX(56px)' }, { opacity: 1, transform: 'none' }], { duration: 460, delay: 180, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'backwards' })
      continue
    }
    const f = was && was.r
    const l = el.getBoundingClientRect()
    if (!f) { el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', delay: 120 }); continue }
    const dx = f.left - l.left, dy = f.top - l.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.45,0,.2,1)' })
  }
}

// ---------- render ----------
function render(opts = {}) {
  const main = $('#main')
  main.dataset.view = ui.view
  const hasField = fieldViews().includes(ui.view)
  main.dataset.flat = hasField ? '0' : '1'
  renderSide(); renderPtabs(); renderNetbar()
  $('#head').innerHTML = head()
  const mutate = () => {
    $('#cleared').innerHTML = ui.view === 'next' ? clearedHtml() : ''
    $('#content').innerHTML = contentHtml()
  }
  if (opts.flip) flip([$('#cleared'), $('#content')], mutate); else mutate()
  $('#stage').classList.toggle('flat', !hasField)
  renderStageText()
  const lanes = laneGeometry()
  if (lanes[0] || !wide()) lastLanes = lanes // keep the lanes between views on wide screens
  field.relayout(lastLanes[0], lastLanes[1])
  if (hasField && fieldView !== ui.view) { field.setView(ui.view, fieldView !== null && !reduced); fieldView = ui.view }
  field.sync(snapshot(), { animate: !reduced && opts.animate !== false })
  field.setSelected(hasField ? ui.sel : null)
  ui.lastCapture = null
  renderDetail()
}
// While someone types in the content (plan, next-step form, settings), a background event
// only refreshes counts, never the field they are typing in.
const typingInContent = () => { const a = document.activeElement; return !!a && $('#content').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) }

function go(view, extra = {}) {
  if (view === 'projects' || view === 'project') ui.projTab = extra.projTab || 'aufgaben'
  ui.view = view; ui.project = extra.project ?? null; ui.sel = null; ui.ctxPick = false; ui.projPick = false; ui.planNext = null
  ui.openId = null; ui.projError = null; ui.newProjError = null
  render({ animate: true })
  $('#main').scrollTop = 0
  if (!reduced) $('#content').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
  history.replaceState(null, '', view === 'project' && ui.project ? `#projects/${encodeURIComponent(ui.project)}` : `#${view}`)
}

// ---------- actions with feedback ----------
let toastTimer = 0
function toast(msg, { undo = true, retry = false } = {}) {
  const el = $('#toast')
  el.innerHTML = `<span class="msg">${esc(msg)}</span>${retry ? `<button class="undo" data-retry>${T('act.retry')}</button>` : ''}${undo ? `<button class="undo" data-undo>${T('act.undo')} <kbd>Z</kbd></button><span class="bar"></span>` : ''}`
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 6000 : retry ? 8000 : 2600)
}

async function completeTask(id) {
  const task = sel.byId(id)
  if (!task || !isOpen(task)) return
  $$(`[data-check="${task.id}"]`).forEach((b) => b.classList.add('on'))
  const departing = field.depart(task.id)
  if (!reduced) {
    await wait(170)
    $$(`[data-flip="${task.id}"]`).forEach((el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 220, easing: 'cubic-bezier(.55,0,.9,.35)', fill: 'forwards' }))
    await wait(200)
  }
  if (ui.sel === task.id) ui.sel = null
  if (ui.openId === task.id) ui.openId = null
  const evt = act.complete(task.id)
  render({ flip: true })
  bump(evt.before.list)
  toast(evt.stalled ? t('toast.doneStalled', { p: evt.stalled }) : t('toast.done', { task: task.description }))
  if (evt.stalled) bump('projects')
  return departing
}

function capture(text) {
  const evt = act.capture(text)
  if (!evt) return null
  ui.lastCapture = evt.id
  flyToInbox(evt.task.description)
  render({ flip: ui.view === 'inbox' })
  bump('inbox')
  toast(t('toast.inbox'))
  return evt
}
function flyToInbox(text) {
  const target = phone() ? $('.ptab[data-go="inbox"]') : $('.navi[data-nav="inbox"]')
  const src = phone() ? $('#pcapture') : $('#capture')
  if (reduced || !target || !src) return
  const fl = $('#flyer')
  const a = src.getBoundingClientRect(), b = target.getBoundingClientRect()
  fl.textContent = text
  fl.style.left = `${a.left + 40}px`; fl.style.top = `${a.top + 6}px`
  fl.animate([
    { opacity: 1, transform: 'translate(0,0) scale(1)' },
    { opacity: 1, transform: `translate(${(b.left - a.left - 40) * 0.6}px, ${(b.top - a.top) * 0.4 - 18}px) scale(.9)`, offset: 0.55 },
    { opacity: 0, transform: `translate(${b.left - a.left - 40 + 20}px, ${b.top - a.top - 6}px) scale(.55)` },
  ], { duration: 560, easing: 'cubic-bezier(.45,0,.2,1)' })
}
function bump(view) {
  const el = $(`.navi[data-nav="${view}"]`)
  if (!el || reduced) return
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump')
}

async function clarifyTask(id, to) {
  const task = sel.byId(id)
  if (!task || !isOpen(task)) return
  if (to === 'done') return completeTask(id)
  const items = sel.inbox()
  const idx = items.findIndex((x) => x.id === task.id)
  const nextSel = items[idx + 1] || items[idx - 1]
  if (!reduced) {
    $$(`.row[data-flip="${task.id}"]`).forEach((el) => el.classList.add('leaving'))
    await wait(160)
  }
  const evt = to === 'delete' ? act.remove(id, 'clarify') : act.clarify(id, to)
  ui.sel = nextSel ? nextSel.id : null
  ui.ctxPick = false; ui.projPick = false; ui.newProjError = null
  render({ flip: true })
  if (evt.type === 'delete') toast(t('toast.deleted'))
  else {
    const where = {
      next: () => (evt.arg ? t('toast.toNextCtx', { ctx: evt.arg }) : t('toast.toNext')),
      waiting: () => t('toast.toWaiting', { d: dmy(day(evt.task.scheduled)) }),
      someday: () => t('toast.toSomeday'),
      project: () => t('toast.toProject', { p: evt.arg }),
    }[evt.to]
    toast(where ? where() : t('toast.saved'))
    bump(evt.to === 'project' ? 'next' : evt.to)
  }
}
// Inbox item -> new project: the item text becomes the outcome, the item leaves the Inbox.
function clarifyToNewProject(id, name) {
  const task = sel.byId(id)
  if (!task) return
  const res = act.createProject(name, task.description)
  if (res.error) { ui.newProjError = res.error; render(); $('#np-in')?.focus(); return }
  const items = sel.inbox()
  const idx = items.findIndex((x) => x.id === task.id)
  const nextSel = items[idx + 1] || items[idx - 1]
  act.remove(id, 'clarify', { createdProject: res.name })
  ui.sel = nextSel ? nextSel.id : null
  ui.projPick = false; ui.newProjError = null
  render({ flip: true })
  toast(t('toast.projectCreated', { p: res.name }))
  bump('projects')
}

function undo() {
  const evt = act.undo()
  if (!evt) return
  $('#toast').classList.remove('on')
}

function setFilter(ctx) {
  act.setFilter(ctx)
  if (ui.view !== 'next') { go('next'); return }
  render({ flip: true })
}

function savePlan() {
  const name = ui.project
  if (!name) return
  act.savePlan(name, draftOf(name))
  ui.planDirty[name] = false
  render()
  toast(t('toast.planSaved'), { undo: false })
}
function markPlanDirty() {
  ui.planDirty[ui.project] = true
  const st = $('.plan-state'); if (st) { st.textContent = t('plan.dirty'); st.classList.add('dirty') }
  const b = $('[data-plansave]'); if (b) b.disabled = false
  const tab = $('[data-ptab="plan"]'); if (tab && !tab.querySelector('.dirty-dot')) tab.insertAdjacentHTML('beforeend', '<span class="dirty-dot" aria-hidden="true"></span>')
}

// ---------- command palette (search, go to, phone "Mehr") ----------
const DEST = [['inbox', 'nav.inbox'], ['next', 'nav.next'], ['waiting', 'nav.waiting'], ['projects', 'nav.projects'], ['someday', 'nav.someday'], ['tickler', 'nav.tickler'], ['done', 'nav.done'], ['review', 'nav.review'], ['settings', 'nav.settings']]
function openPalette(mode = 'search') {
  const p = $('#palette')
  ui.palette = { mode, q: '', i: 0, items: [] }
  p.innerHTML = `<div class="pal" role="dialog" aria-label="${esc(t(mode === 'menu' ? 'nav.more' : 'nav.search'))}"><div class="pal-in">${G.search}<input id="pal-q" placeholder="${esc(t(mode === 'menu' ? 'pal.where' : 'pal.search'))}" aria-label="${esc(t('nav.search'))}" autocomplete="off"><kbd>Esc</kbd></div><div class="pal-res" id="pal-res"></div></div>`
  p.hidden = false
  $('#pal-q').focus()
  palResults()
}
function closePalette() { $('#palette').hidden = true; ui.palette = null }
function palResults() {
  const P = ui.palette
  const q = P.q.trim().toLowerCase()
  const items = []
  const hl = (s) => { const x = esc(s); if (!q) return x; const i = s.toLowerCase().indexOf(q); return i < 0 ? x : `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + q.length))}</mark>${esc(s.slice(i + q.length))}` }
  if (q) {
    const ln = { inbox: 'nav.inbox', next: 'nav.next', waiting: 'nav.waiting', someday: 'nav.someday' }
    const hits = sel.open().filter((x) => x.description.toLowerCase().includes(q) || (x.project || '').toLowerCase().includes(q) || x.tags.join(' ').toLowerCase().includes(q)).slice(0, 10)
    hits.forEach((x) => items.push({ g: 'pal.todos', html: `<span class="t">${hl(x.description)}</span><span class="l">${ln[listOf(x)] ? esc(t(ln[listOf(x)])) : esc(x.project)}</span>`, run: () => { const l = listOf(x); go(l || 'project', l ? {} : { project: x.project }); ui.sel = x.id; openDetail(x.id) } }))
    store.projects.filter((p) => p.name.toLowerCase().includes(q)).forEach((p) => items.push({ g: 'pal.projects', html: `<span class="t">${hl(p.name)}</span><span class="l">${esc(t('pal.project'))}</span>`, run: () => go('project', { project: p.name }) }))
    CONTEXTS.filter((c) => c.includes(q)).forEach((c) => items.push({ g: 'pal.contexts', html: `<span class="t">${hl(c)}</span><span class="l">${esc(t('pal.filterNext'))}</span>`, run: () => setFilter(c) }))
  }
  DEST.filter(([, k]) => !q || t(k).toLowerCase().includes(q)).forEach(([v, k]) => items.push({ g: 'pal.goto', html: `<span class="t">${hl(t(k))}</span><span class="l">${P.mode === 'menu' ? '' : `G ${v[0].toUpperCase()}`}</span>`, run: () => go(v) }))
  ;[['pal.newProject', () => { go('projects'); $('[data-createproj] input')?.focus() }], ['nav.signout', () => toast(t('nav.signout'), { undo: false })]]
    .filter(([k]) => !q || t(k).toLowerCase().includes(q)).forEach(([k, run]) => items.push({ g: 'pal.actions', html: `<span class="t">${hl(t(k))}</span><span class="l"></span>`, run }))
  if (!items.length) items.push({ g: 'pal.nothing', html: `<span class="t">${esc(t('pal.captureAs', { q: P.q }))}</span><span class="l">↵</span>`, run: () => capture(P.q) })
  P.items = items
  P.i = Math.min(P.i, items.length - 1)
  let g = ''
  $('#pal-res').innerHTML = items.map((it, i) => { const h = it.g !== g ? `<div class="pal-g">${T(it.g)}</div>` : ''; g = it.g; return `${h}<div class="pal-i ${i === P.i ? 'on' : ''}" data-pi="${i}">${it.html}</div>` }).join('')
}
function palRun(i) { const it = ui.palette.items[i]; closePalette(); it?.run() }

// ---------- keyboard ----------
let gPending = 0
function orderedIds() {
  const ids = $$('#cleared .card[data-id], #content .row[data-id]').map((el) => Number(el.dataset.id))
  return [...new Set(ids)]
}
function moveSel(d) {
  const ids = orderedIds()
  if (!ids.length) return
  const i = ids.indexOf(ui.sel)
  ui.sel = ids[Math.max(0, Math.min(ids.length - 1, i < 0 ? 0 : i + d))]
  ui.ctxPick = false; ui.projPick = false
  render({ animate: true })
  $(`[data-id="${ui.sel}"]`)?.scrollIntoView({ block: 'nearest' })
}
// pick a context chip inside a form or row: 0 = none, 1–5 = CONTEXTS
function pickChip(scope, attr, n) {
  const chips = $$(`[data-${attr}]`, scope)
  const c = chips[n]
  if (c) c.click()
}
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase()
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable
  if (ui.palette) {
    if (e.key === 'Escape') { closePalette(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ui.palette.i = (ui.palette.i + (e.key === 'ArrowDown' ? 1 : -1) + ui.palette.items.length) % ui.palette.items.length; palResults(); return }
    if (e.key === 'Enter') { e.preventDefault(); palRun(ui.palette.i); return }
    return
  }
  if (!$('#keys').hidden) { if (e.key === 'Escape' || e.key === '?') $('#keys').hidden = true; return }
  // next-step forms: Alt+0–5 picks the context while typing; plain 0–5 on a focused chip
  const addForm = e.target.closest && e.target.closest('.addnext')
  const digit = /^Digit([0-5])$/.exec(e.code || '')
  if (addForm && digit && (e.altKey || tag === 'button')) { e.preventDefault(); pickChip(addForm, 'actx', Number(digit[1])); return }
  const inrow = e.target.closest && e.target.closest('.ctxrow.inrow')
  if (inrow && digit) { e.preventDefault(); pickChip(inrow, 'pnctx', Number(digit[1])); return }
  if (e.key === 'Escape') {
    if (typing) { e.target.blur(); return }
    if (ui.ctxPick || ui.projPick) { ui.ctxPick = false; ui.projPick = false; render(); return }
    if (ui.openId != null) { closeDetail(); return }
    if (ui.view === 'project') { go('projects'); return }
    return
  }
  if (typing || (e.metaKey && e.key !== 'k') || e.ctrlKey || e.altKey) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openPalette() }
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && ui.view === 'project' && ui.projTab === 'plan') { e.preventDefault(); savePlan() }
    return
  }
  if (e.metaKey && e.key === 'k') { e.preventDefault(); openPalette(); return }
  const k = e.key
  if (gPending && Date.now() - gPending < 900) {
    gPending = 0
    const map = { i: 'inbox', n: 'next', w: 'waiting', p: 'projects', s: 'someday', e: 'done', r: 'review', z: 'tickler' }
    if (map[k]) { e.preventDefault(); go(map[k]) }
    return
  }
  if (k === 'g') { gPending = Date.now(); return }
  if (k === 'n' || k === 'c') { e.preventDefault(); (phone() ? $('#pcapture-input') : $('#capture-input')).focus(); return }
  if (k === '/') { e.preventDefault(); openPalette(); return }
  if (k === '?') { showKeys(); return }
  if (k === 'z' || k === 'u') { undo(); return }
  if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); moveSel(1); return }
  if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); moveSel(-1); return }
  if (ui.view === 'inbox' && ui.sel != null) {
    if (ui.ctxPick) {
      const n = Number(k)
      if (n >= 1 && n <= CONTEXTS.length) { clarifyTask(ui.sel, `next:${CONTEXTS[n - 1]}`); return }
      if (k === 'Enter') { clarifyTask(ui.sel, 'next'); return }
    } else if (ui.projPick) {
      const n = Number(k)
      const active = sel.projects().filter((p) => p.status === 'active')
      if (n >= 1 && n <= Math.min(9, active.length)) { clarifyTask(ui.sel, `project:${active[n - 1].name}`); return }
      if (k === 'Enter') { e.preventDefault(); $('#np-in')?.focus(); return }
    } else {
      if (k === '1') { ui.ctxPick = true; ui.projPick = false; render(); return }
      if (k === '2') { clarifyTask(ui.sel, 'waiting'); return }
      if (k === '3') { clarifyTask(ui.sel, 'someday'); return }
      if (k === '4') { ui.projPick = true; ui.ctxPick = false; render(); return }
      if (k === 'Backspace' || k === 'Delete') { clarifyTask(ui.sel, 'delete'); return }
    }
  }
  if (ui.sel != null) {
    if (k === 'x' || k === ' ') { e.preventDefault(); completeTask(ui.sel); return }
    if (k === 'Enter' || k === 'o') { openDetail(ui.sel); return }
    if (k === 's') { act.toggleStart(ui.sel); return }
    if ((k === 'Backspace' || k === 'Delete') && ui.view !== 'inbox') { act.remove(ui.sel); toast(t('toast.deleted')); return }
  }
  if (ui.view === 'next' && /^[0-5]$/.test(k)) { setFilter(k === '0' ? null : CONTEXTS[Number(k) - 1]) }
})
function showKeys() {
  const rows = [['N', 'keys.new'], ['/', 'keys.search'], ['J K', 'keys.move'], ['X', 'keys.check'], ['↵', 'keys.details'], ['S', 'keys.start'], ['Z', 'keys.undo'], ['G I', 'nav.inbox'], ['G N', 'nav.next'], ['G W', 'nav.waiting'], ['G P', 'nav.projects'], ['G S', 'nav.someday'], ['0–5', 'keys.ctx'], ['1 2 3 4', 'keys.clarify'], ['⌫', 'keys.delete'], ['Esc', 'keys.close']]
  $('#keys').innerHTML = `<div class="pal"><p class="eyebrow"><span class="slash">//</span> ${T('keys.title')}</p><dl>${rows.map(([a, b]) => `<dt>${a.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</dt><dd>${T(b)}</dd>`).join('')}</dl></div>`
  $('#keys').hidden = false
}

// ---------- pointer ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a, [data-id], [data-pi], .scrim, .keys, .palette')
  if (!el) return
  const d = el.dataset
  if (el.classList.contains('scrim')) { closeDetail(); return }
  if (el.id === 'keys') { el.hidden = true; return }
  if (el.id === 'palette') { closePalette(); return }
  if (d.pi != null) { palRun(Number(d.pi)); return }
  if (d.check) { e.stopPropagation(); completeTask(Number(d.check)); return }
  if (d.dcheck) { completeTask(Number(d.dcheck)); return }
  if (d.go) { e.preventDefault(); go(d.go); return }
  if (d.ctx) { e.preventDefault(); act.setFilter(d.ctx); go('next'); return }
  if (d.filter != null) { setFilter(d.filter || null); return }
  if (d.ctxpick) { ui.sel = Number(d.ctxpick); ui.ctxPick = !ui.ctxPick; ui.projPick = false; render(); return }
  if (d.projpick) { ui.sel = Number(d.projpick); ui.projPick = !ui.projPick; ui.ctxPick = false; ui.newProjError = null; render(); return }
  if (d.clarify) { clarifyTask(Number(d.clarify), d.to); return }
  if (d.proj) { go('project', { project: d.proj }); return }
  if (d.ptab) { ui.projTab = d.ptab; ui.planNext = null; render(); return }
  if (d.pstatus) { act.setProjectStatus(ui.project, d.pstatus); return }
  if (d.activate) { const x = sel.byId(d.activate); act.setList(x.id, 'next'); toast(t('toast.toNext'), { undo: false }); return }
  if (d.followed) { e.stopPropagation(); const x = act.followedUp(Number(d.followed)); if (x) toast(t('toast.followed', { d: dmy(day(x.scheduled)) })); return }
  if (d.retry != null) { e.stopPropagation(); outbox.retry(d.retry || undefined); return }
  if (d.actx != null) { e.preventDefault(); const f = el.closest('form'); f.dataset.ctx = d.actx; $$('[data-actx]', f).forEach((c) => c.setAttribute('aria-pressed', String(c === el))); return }
  // plan editing
  if (d.ideaorg != null) { const pl = draftOf(ui.project); const [s] = pl.brainstorm.splice(Number(d.ideaorg), 1); pl.organized.push(s); markPlanDirty(); render(); return }
  if (d.idearm != null) { draftOf(ui.project).brainstorm.splice(Number(d.idearm), 1); markPlanDirty(); render(); return }
  if (d.orgrm != null) { draftOf(ui.project).organized.splice(Number(d.orgrm), 1); ui.planNext = null; markPlanDirty(); render(); return }
  if (d.orgmove != null) { const pl = draftOf(ui.project); const i = Number(d.orgmove), j = i + Number(d.dir); if (j < 0 || j >= pl.organized.length) return; [pl.organized[i], pl.organized[j]] = [pl.organized[j], pl.organized[i]]; ui.planNext = null; markPlanDirty(); render(); $(`[data-orgmove="${j}"][data-dir="${d.dir}"]`)?.focus(); return }
  if (d.planfrom != null) { const pl = draftOf(ui.project); pl.organized.push(...pl.brainstorm.filter((s) => !pl.organized.includes(s))); pl.brainstorm = []; markPlanDirty(); render(); return }
  if (d.plannext != null) { ui.planNext = ui.planNext === Number(d.plannext) ? null : Number(d.plannext); render(); $('.ctxrow.inrow .chip')?.focus(); return }
  if (d.pnctx != null) {
    const s = draftOf(ui.project).organized[ui.planNext]
    act.addNext(ui.project, s, d.pnctx || null)
    ;(ui.planAdded[ui.project] ??= []).push(s)
    ui.planNext = null; render()
    toast(t('toast.nextAdded', { p: ui.project }), { undo: false }); return
  }
  if (d.plansave != null) { savePlan(); return }
  if (d.undo != null) { undo(); return }
  if (d.close != null) { closeDetail(); return }
  if (d.start) { act.toggleStart(Number(d.start)); return }
  if (d.del) { const id = Number(d.del); ui.openId = null; act.remove(id); toast(t('toast.deleted')); return }
  if (d.dlist) { act.setList(ui.openId, d.dlist); return }
  if (d.dctx) { act.toggleContext(ui.openId, d.dctx); return }
  if (d.more != null) { openPalette('menu'); return }
  if (d.search != null) { openPalette(); return }
  if (d.review != null) { toast(t('toast.reviewSaved'), { undo: false }); return }
  // settings
  if (d.lang) { setLang(d.lang); render(); return }
  if (d.mcptab) { ui.mcpTab = d.mcptab; render(); return }
  if (d.keyshow != null) { ui.keyShown = !ui.keyShown; render(); return }
  if (d.keyask != null) { ui.keyAsk = true; render(); return }
  if (d.keycancel != null) { ui.keyAsk = false; render(); return }
  if (d.keyregen != null) { ui.keyAsk = false; render(); toast(t('toast.saved'), { undo: false }); return }
  if (d.keycopy != null || d.saveprofile != null) { toast(t('toast.saved'), { undo: false }); return }
  if (d.role) { act.setRole(d.role, d.to); return }
  if (d.signout != null) { outbox.flush(); toast(t('nav.signout'), { undo: false }); return }
  if (el.id === 'search-btn') { openPalette(); return }
  if (d.id && !el.classList.contains('free')) {
    const id = Number(d.id)
    if (ui.view === 'inbox') { ui.sel = id; ui.ctxPick = false; ui.projPick = false; render(); return }
    openDetail(id)
  }
})
document.addEventListener('input', (e) => {
  if (e.target.id === 'pal-q') { ui.palette.q = e.target.value; ui.palette.i = 0; palResults(); return }
  if (e.target.dataset.plan) { draftOf(ui.project)[e.target.dataset.plan] = e.target.value; markPlanDirty() }
})
document.addEventListener('change', (e) => {
  const f = e.target.dataset.dfield
  if (f && ui.openId != null) {
    const v = e.target.value
    const val = !v ? null : ['due', 'scheduled', 'wait', 'until'].includes(f) ? `${v.replace(/-/g, '')}T110000Z` : v
    act.update(ui.openId, { [f]: val })
  }
  if (e.target.dataset.dtitle) act.update(Number(e.target.dataset.dtitle), { description: e.target.value.replace(/\s+/g, ' ').trim() || sel.byId(e.target.dataset.dtitle).description })
  if (e.target.dataset.setreg != null) act.setRegistration(e.target.checked)
})
document.addEventListener('submit', (e) => {
  e.preventDefault()
  const f = e.target
  if (f.id === 'capture' || f.id === 'pcapture') {
    const inp = f.querySelector('input')
    if (capture(inp.value)) inp.value = ''
    inp.focus()
    return
  }
  if (f.dataset.dnote) { act.annotate(Number(f.dataset.dnote), f.t.value); setTimeout(() => $('[data-dnote] input')?.focus(), 0); return }
  if (f.dataset.addnext) {
    const v = f.t.value.trim()
    if (!v) return
    const task = act.addNext(f.dataset.addnext, v, f.dataset.ctx || null)
    if (task) toast(t('toast.nextAdded', { p: f.dataset.addnext }), { undo: false })
    return
  }
  if (f.dataset.createproj != null) {
    const res = act.createProject(f.p.value)
    if (res.error) { ui.projError = res.error; render(); $('[data-createproj] input').value = f.p.value; $('[data-createproj] input').focus(); return }
    ui.projError = null
    go('project', { project: res.name, projTab: 'plan' })
    toast(t('toast.projectCreated', { p: res.name }), { undo: false })
    $('#pl-purpose')?.focus()
    return
  }
  if (f.dataset.newproj) { clarifyToNewProject(Number(f.dataset.newproj), f.p.value); return }
  if (f.dataset.planidea != null || f.dataset.planorg != null) {
    const v = f.t.value.trim()
    if (!v) return
    draftOf(ui.project)[f.dataset.planidea != null ? 'brainstorm' : 'organized'].push(v)
    markPlanDirty(); render()
    $(f.dataset.planidea != null ? '[data-planidea] input' : '[data-planorg] input')?.focus()
  }
})
// plan "Ordnen": drag and drop (the buttons ↑ ↓ do the same by keyboard)
let dragFrom = null
document.addEventListener('dragstart', (e) => { const li = e.target.closest && e.target.closest('.org li[data-org]'); if (!li) return; dragFrom = Number(li.dataset.org); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging') })
document.addEventListener('dragover', (e) => { if (dragFrom != null && e.target.closest && e.target.closest('.org li[data-org]')) e.preventDefault() })
document.addEventListener('drop', (e) => {
  const li = e.target.closest && e.target.closest('.org li[data-org]')
  if (dragFrom == null || !li) return
  e.preventDefault()
  const pl = draftOf(ui.project), to = Number(li.dataset.org)
  const [s] = pl.organized.splice(dragFrom, 1); pl.organized.splice(to, 0, s)
  dragFrom = null; markPlanDirty(); render()
})
document.addEventListener('dragend', () => { dragFrom = null; $$('.dragging').forEach((x) => x.classList.remove('dragging')) })
$('#capture-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur() })

// Every model change re-renders; the actions above add the motion around it.
store.on((evt) => {
  if (['complete', 'capture', 'clarify', 'filter'].includes(evt.type)) return // rendered by the action itself
  if (evt.type === 'delete' && evt.via === 'clarify') return
  if (evt.type === 'failed') { toast(t('toast.unsent', { task: evt.op.label || '' }), { undo: false, retry: true }) }
  if (typingInContent() || evt.type === 'sync') {
    renderSide(); renderPtabs(); renderNetbar()
    if (evt.type === 'sync' && evt.op.kind === 'capture' && ui.view === 'inbox' && !typingInContent()) render()
    return
  }
  render({ flip: evt.type !== 'update' && evt.type !== 'settings', animate: true })
})
window.addEventListener('resize', () => { render({ animate: false }) })

// ---------- start: route, deep link ?task=<uuid> (fixes the Android handoff) ----------
applyStatic()
document.documentElement.lang = getLang()
outbox.enablePersistence()
const params = new URLSearchParams(location.search)
const [hashView, hashArg] = location.hash.slice(1).split('/')
if (DEST.some(([v]) => v === hashView)) ui.view = hashView
if (hashView === 'projects' && hashArg && sel.project(decodeURIComponent(hashArg))) { ui.view = 'project'; ui.project = decodeURIComponent(hashArg) }
render({ animate: false })
const deep = params.get('task')
if (deep) { const x = store.tasks.find((y) => y.uuid === deep); if (x) { const l = listOf(x); if (l) ui.view = l; openDetail(x.id) } }

// ---------- test hook (shared/README.md) ----------
window.proto = {
  show(view) { go(view === 'project' ? 'projects' : view) },
  filter(context) { setFilter(context || null) },
  capture(text) { return capture(text) },
  open(id) { const x = sel.byId(id); if (!x) return; const l = listOf(x); if (l && l !== ui.view && ['next', 'inbox', 'waiting', 'someday'].includes(l)) go(l); openDetail(id) },
  complete(id) { return completeTask(Number(id)) },
  clarify(id, to) { if (ui.view !== 'inbox') go('inbox'); return clarifyTask(Number(id), to) },
  async signature() {
    if (ui.view !== 'next') go('next')
    closeDetail()
    await field.ready
    await wait(300)
    const first = sel.runway().cleared[0]
    if (!first) return
    completeTask(first.id)
    await wait(reduced ? 50 : 430)
  },
  // helpers beyond the shared hook
  project(name, tab = 'aufgaben') { go('project', { project: name, projTab: tab }) },
  network(up) { net.up = !!up; if (up) outbox.retry() },
  lang(l) { setLang(l); render() },
  pick(which) { if (ui.view !== 'inbox') go('inbox'); ui.ctxPick = which === 'ctx'; ui.projPick = which === 'project'; render() },
  get state() { return { view: ui.view, filter: store.filter, field: field.kind, counts: sel.counts(), lang: getLang() } },
}
