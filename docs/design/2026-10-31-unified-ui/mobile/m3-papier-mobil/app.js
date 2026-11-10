// Papier mobil: one renderer for every phone on the board. The first phone is live
// (tabs, capture, tick off, undo, filter, row menu, Custom Tab); the others are the same
// renderer with a fixed state. window.proto drives the live phone.

import { TASKS, TODAY, contextsOf, parseTw } from '../../shared/data/tasks.js'

// ── Data: the shared demo set, mapped onto Android's preset contexts ─────────────────────
// Android ships @home @computer @work @business (no editor). Mapping used for the demo:
// @anrufe, @buero -> @work · @zuhause, @unterwegs -> @home · @computer stays, except tasks of
// the two customer projects, which become @business.
export const CHIPS = ['Alle', '@home', '@computer', '@work', '@business']
const MAP = { '@computer': '@computer', '@anrufe': '@work', '@buero': '@work', '@zuhause': '@home', '@unterwegs': '@home' }
const BUSINESS = new Set(['Angebot-Pilotkunde', 'Website-Relaunch'])
// Demo addition: one waiting item has a passed follow-up date, so "Nachhaken" can be shown.
const FOLLOW = { 'Rückmeldung Vermieter zur Kaution': '20261030T080000Z' }

function derive() {
  return TASKS.map((t) => {
    const tags = t.tags.flatMap((x) => String(x).split(',').map((s) => s.trim()))
    let ctx = [...new Set(contextsOf(t).map((c) => MAP[c] || c))]
    if (BUSINESS.has(t.project) && ctx.length) ctx = ['@business']
    const kind = t.status === 'completed' ? 'done'
      : tags.includes('waiting') ? 'waiting'
      : tags.includes('someday') ? 'someday'
      : (!t.project && ctx.length === 0) ? 'inbox' : 'next'
    return {
      id: t.id, uuid: t.uuid, desc: t.description, project: t.project, ctx, kind,
      due: t.due ? parseTw(t.due) : null, follow: FOLLOW[t.description] ? parseTw(FOLLOW[t.description]) : (t.wait ? parseTw(t.wait) : null),
      entry: parseTw(t.entry), end: t.end ? parseTw(t.end) : null, start: !!t.start, urgency: t.urgency, sync: null,
    }
  })
}

// ── Dates (Europe/Berlin) ───────────────────────────────────────────────────────────────
const TZ = { timeZone: 'Europe/Berlin' }
const fKey = new Intl.DateTimeFormat('en-CA', { ...TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const fDM = new Intl.DateTimeFormat('de-DE', { ...TZ, day: '2-digit', month: '2-digit' })
const fWd = new Intl.DateTimeFormat('de-DE', { ...TZ, weekday: 'short' })
const fHM = new Intl.DateTimeFormat('de-DE', { ...TZ, hour: '2-digit', minute: '2-digit' })
const key = (d) => fKey.format(d)
const dm = (d) => { const s = fDM.format(d); return s.endsWith('.') ? s : s + '.' }
const wd = (d) => fWd.format(d).replace('.', '')
const hm = (d) => fHM.format(d)
const YESTERDAY = '2026-10-30'
const NOW = '09:41'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function dueInfo(t) {
  if (!t.due) return null
  const k = key(t.due)
  if (k < TODAY) return { text: `überfällig ${dm(t.due)}`, tone: 'over', status: 'überfällig' }
  if (k === TODAY) return { text: 'fällig heute', tone: 'today', status: 'fällig heute' }
  return { text: `${wd(t.due)} ${dm(t.due)}`, tone: '', status: null }
}
function followInfo(t) {
  if (t.follow) {
    const k = key(t.follow)
    if (k <= TODAY) return { text: k === TODAY ? 'Nachhaken heute' : `Nachhaken seit ${dm(t.follow)}`, due: true }
    return { text: `Wiedervorlage ${wd(t.follow)} ${dm(t.follow)}`, due: false }
  }
  return { text: `wartet seit ${dm(t.entry)}`, due: false }
}
const whenText = (t) => { const k = key(t.entry); return k === TODAY ? hm(t.entry) : k === YESTERDAY ? 'gestern' : dm(t.entry) }
const idText = (t) => t.local ? `lokal ${t.uuid.slice(-8)}` : `ID ${t.uuid.slice(-8)}`

// ── Lists, by Android's rules ───────────────────────────────────────────────────────────
function lists(tasks, ctx) {
  const open = tasks.filter((t) => t.kind !== 'done' && !t.gone)
  const inbox = open.filter((t) => t.kind === 'inbox').sort((a, b) => b.entry - a.entry)
  const faellig = open.filter((t) => t.due && key(t.due) <= TODAY).sort((a, b) => a.due - b.due)
  const allNext = open.filter((t) => t.kind === 'next').sort((a, b) => b.urgency - a.urgency)
  // Android's lenient rule: the context, or no context at all
  // Declared deviation: a due +next task shows once, under "Fällig", not again under "Nächste Aktionen".
  const dueIds = new Set(faellig.map((t) => t.id))
  const next = (ctx === 'Alle' ? allNext : allNext.filter((t) => t.ctx.includes(ctx) || t.ctx.length === 0)).filter((t) => !dueIds.has(t.id))
  const waiting = open.filter((t) => t.kind === 'waiting').sort((a, b) => {
    const fa = followInfo(a).due ? 0 : 1, fb = followInfo(b).due ? 0 : 1
    return fa - fb || (a.follow || a.entry) - (b.follow || b.entry)
  })
  const doneToday = tasks.filter((t) => t.kind === 'done' && t.end && key(t.end) === TODAY).length
  return { inbox, faellig, next, allNext, waiting, doneToday }
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#3D2B5C" stroke-width="1.4" fill="none" opacity="0.55"><line x1="32" y1="14" x2="47.588" y2="23"/><line x1="47.588" y1="23" x2="47.588" y2="41"/><line x1="47.588" y1="41" x2="32" y2="50"/><line x1="32" y1="50" x2="16.412" y2="41"/><line x1="16.412" y1="41" x2="16.412" y2="23"/><line x1="16.412" y1="23" x2="32" y2="14"/><line x1="32" y1="32" x2="32" y2="14"/><line x1="32" y1="32" x2="47.588" y2="23"/><line x1="32" y1="32" x2="47.588" y2="41"/><line x1="32" y1="32" x2="32" y2="50"/><line x1="32" y1="32" x2="16.412" y2="41"/><line x1="32" y1="32" x2="16.412" y2="23"/></g><circle cx="32" cy="32" r="3.6" fill="#3D2B5C"/><circle cx="47.588" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="47.588" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="50" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="41" r="2.8" fill="#3D2B5C"/><circle cx="16.412" cy="23" r="2.8" fill="#3D2B5C"/><circle cx="32" cy="14" r="4.4" fill="#FF7A6B"/><circle cx="51.588" cy="19.000" r="2" fill="#F4C84A"/></svg>`

const rnd = (seed) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280
function strikeSVG(id) {
  const r = rnd(Number(String(id).replace(/\D/g, '').slice(-6) || 7) * 7919 + 13)
  const y0 = 6.2 + (r() - 0.5) * 1.4, y3 = 5.4 + (r() - 0.5) * 1.6, c1 = 5 + (r() - 0.5) * 2.2, c2 = 6.4 + (r() - 0.5) * 2.2
  return `<svg class="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M0.6 ${y0.toFixed(2)} C 30 ${c1.toFixed(2)}, 62 ${c2.toFixed(2)}, 99.4 ${y3.toFixed(2)}"/></svg>`
}
// Strichliste: four upright strokes, the fifth a coral stroke across them.
function tallySVG(n, fresh = -1) {
  const r = rnd(4242), parts = []
  let x = 2
  for (let i = 0; i < n; i++) {
    const f = i === fresh ? ' fresh' : ''
    if (i % 5 === 4) { parts.push(`<path class="five${f}" pathLength="1" d="M${x - 30} 15 L${x - 3} 4"/>`); x += 8 }
    else { const tl = (r() - 0.5) * 2; parts.push(`<path class="${f.trim()}" pathLength="1" d="M${(x + tl).toFixed(1)} 2.5 L${(x - tl * 0.4).toFixed(1)} 16.5"/>`); x += 6 }
  }
  const w = Math.max(x, 8)
  return `<svg class="tally" width="${w}" height="19" viewBox="0 0 ${w} 19" aria-hidden="true">${parts.join('')}</svg>`
}

const HEAD = {
  inbox: ['Was ist ', 'das', '?'],
  inboxEmpty: ['Inbox ist ', 'leer', '.'],
  next: ['Was jetzt ', 'zählt', ''],
  waiting: ['Worauf du ', 'wartest', ''],
}
const VIEWNAME = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf' }

function rowHTML(t, kind, st) {
  const cls = ['row']
  const meta = []
  let status = 'Nächste'
  let when = ''
  if (kind === 'inbox') {
    status = t.sync === 'net' ? 'wartet auf Netz' : t.sync === 'failed' ? 'Nicht gesendet' : 'Inbox'
    if (t.sync === 'net') meta.push('<span class="sync">wartet auf Netz</span>')
    if (t.sync === 'failed') meta.push('<span class="sync failed">Nicht gesendet</span>')
    when = t.sync ? '' : whenText(t)
  } else if (kind === 'waiting') {
    const f = followInfo(t)
    status = f.due ? 'Nachhaken fällig' : 'Wartet'
    meta.push(f.due ? `<span class="follow">${esc(f.text)}</span>` : `<span>${esc(f.text)}</span>`)
    if (t.project) meta.push(`<span>${esc(t.project)}</span>`)
  } else {
    const d = dueInfo(t)
    if (d && d.tone === 'over') cls.push('overdue')
    if (d && d.tone === 'today') cls.push('today')
    if (d) { status = d.status || 'Nächste'; meta.push(`<span class="${d.tone === 'over' ? 'over' : 'due'}">${esc(d.text)}</span>`) }
    if (t.start) meta.push('<span class="run">läuft</span>')
    if (t.project) meta.push(`<span>${esc(t.project)}</span>`)
    if (t.ctx.length && (st.ctx === 'Alle' || kind === 'faellig')) meta.push(`<span>${esc(t.ctx.join(' '))}</span>`)
    if (t.failedDone) { meta.unshift('<span class="sync failed">Abhaken nicht gesendet</span>') }
  }
  if (meta.length) cls.push('has-m')
  if (st.struck === t.id) cls.push('struck', 'freeze')
  if (st.menuFor === t.id) cls.push('menu-open')
  const label = `${t.desc}, ${status}, ${idText(t)}`
  // The ring sits at the trailing edge on the phone (declared deviation from the web's leading ring):
  // that is where the right thumb lands. Swipe right still checks off from anywhere on the row.
  return `<div class="${cls.join(' ')}" data-id="${t.id}" data-kind="${kind === 'faellig' ? 'next' : kind}" role="listitem" aria-label="${esc(label)}">`
    + `<span class="txt" data-testtag="inbox-row-text">${esc(t.desc)}</span>`
    + `<span class="when">${esc(when)}</span>`
    + `<span class="m">${meta.join('')}</span>`
    + `<button class="ring" data-act="done" aria-label="${esc('Abhaken: ' + t.desc)}"></button>`
    + strikeSVG(t.id)
    + `</div>`
}

const BANNERS = {
  oldAccount: `<div class="banner"><div class="bt"><b>Altes Konto: 2 nicht gesendet</b><span>Sie gehen raus, sobald du dich mit dem alten Konto anmeldest.</span></div><button class="pill line">Verwerfen</button></div>`,
  rekey: `<button class="banner err"><span class="bt"><b>Key abgelehnt – neu einrichten</b></span><span class="arr" aria-hidden="true">→</span></button>`,
  connected: `<div class="banner ok"><div class="bt"><b>Verbunden als uli</b></div></div>`,
}

function headHTML(st, L) {
  const n = st.view === 'inbox' ? L.inbox.length : st.view === 'next' ? L.next.length : L.waiting.length
  const eb = [`<span class="slash">//</span><span>${VIEWNAME[st.view]}</span>`]
  if (st.view === 'next' && st.ctx !== 'Alle') eb.push(`<span class="sep">·</span><span>${esc(st.ctx)}</span>`)
  eb.push(`<span class="sep">·</span><span>${n}</span>`)
  if (st.view === 'waiting') { const due = L.waiting.filter((t) => followInfo(t).due).length; if (due) eb.push(`<span class="sep">·</span><span>${due} Nachhaken</span>`) }
  const h = HEAD[st.view === 'inbox' && !L.inbox.length ? 'inboxEmpty' : st.view]
  // The heading folds away while the keyboard is up (every tab), when the list is scrolled, and
  // always at font scale >= 1.3 (CSS: .big). The eyebrow already names the list.
  const showH1 = !st.kbd
  return `<div class="top"><div class="eyebrow">${eb.join('')}</div>`
    + `<div class="meta"><span class="stand${st.stale ? ' stale' : ''}">Stand ${esc(st.stand || NOW)}</span>${st.offline ? '<span class="offl">kein Netz</span>' : ''}</div></div>`
    + (showH1 ? `<div class="hline"><h1>${esc(h[0])}<em>${esc(h[1])}</em>${esc(h[2])}</h1>`
      + `<span class="tallyrow" title="heute erledigt">${tallySVG(L.doneToday, st.freshTally ? L.doneToday - 1 : -1)}<span class="sr">heute erledigt: </span>${L.doneToday}</span></div>` : '')
    + (st.banner ? st.banner.map((b) => BANNERS[b]).join('') : '')
    + (st.pull ? '<div class="pull" aria-hidden="true"><i></i><span>loslassen lädt neu</span></div>' : '')
}

function listHTML(st, L) {
  const out = []
  if (st.view === 'inbox') {
    if (!L.inbox.length) out.push('<p class="empty">Nichts offen. <em>Gut so</em>.</p>')
    out.push('<div role="list" aria-label="Inbox">' + L.inbox.map((t) => rowHTML(t, 'inbox', st)).join('') + '</div>')
  } else if (st.view === 'next') {
    out.push(`<div class="sec"><span class="slash">//</span><span>Fällig</span><span class="sep">·</span><span>${L.faellig.length}</span></div>`)
    out.push(L.faellig.length ? '<div role="list" aria-label="Fällig">' + L.faellig.map((t) => rowHTML(t, 'faellig', st)).join('') + '</div>' : '<p class="empty">Nichts fällig</p>')
    out.push(`<div class="sec"><span class="slash">//</span><span>Nächste Aktionen</span>${st.ctx !== 'Alle' ? `<span class="sep">·</span><span>${esc(st.ctx)}</span>` : ''}<span class="sep">·</span><span>${L.next.length}</span></div>`)
    out.push(L.next.length ? '<div role="list" aria-label="Nächste Aktionen">' + L.next.map((t) => rowHTML(t, 'next', st)).join('') + '</div>' : '<p class="empty">Keine nächsten Aktionen</p>')
  } else {
    const due = L.waiting.filter((t) => followInfo(t).due), rest = L.waiting.filter((t) => !followInfo(t).due)
    if (!L.waiting.length) out.push('<p class="empty">Du wartest auf nichts</p>')
    if (due.length) {
      out.push(`<div class="sec"><span class="slash">//</span><span>Nachhaken</span><span class="sep">·</span><span>${due.length}</span></div>`)
      out.push('<div role="list">' + due.map((t) => rowHTML(t, 'waiting', st)).join('') + '</div>')
    }
    if (rest.length) {
      out.push(`<div class="sec"><span class="slash">//</span><span>Wartet</span><span class="sep">·</span><span>${rest.length}</span></div>`)
      out.push('<div role="list">' + rest.map((t) => rowHTML(t, 'waiting', st)).join('') + '</div>')
    }
  }
  return out.join('')
}

function chipsHTML(st) {
  if (st.view !== 'next') return ''
  return CHIPS.map((c) => `<button class="chip" data-chip="${c}" aria-pressed="${st.ctx === c}">${c}</button>`).join('')
}
function tabsHTML(st, L) {
  const t = (v, n) => `<button class="tab tab-${v}" role="tab" data-tab="${v}" aria-selected="${st.view === v}"><span class="l">${VIEWNAME[v]}<span class="n">${n}</span></span></button>`
  return t('inbox', L.inbox.length) + t('next', L.allNext.length) + t('waiting', L.waiting.length)
    + `<button class="tab more" data-act="more" aria-label="Mehr">···</button>`
}
function noticeHTML(n) {
  if (!n) return ''
  return `<span class="msg">${esc(n.text)}${n.detail ? `<span class="d"> · ${esc(n.detail)}</span>` : ''}</span>${n.undo ? '<button data-act="undo">Rückgängig</button>' : ''}`
}
const KBD = `<div class="kbd" aria-hidden="true"><div class="sugg"><span>Proof</span><span>Probe</span><span>Prüfung</span></div>`
  + ['q w e r t z u i o p ü', 'a s d f g h j k l ö ä'].map((r) => `<div class="r">${r.split(' ').map((k) => `<i>${k}</i>`).join('')}</div>`).join('')
  + `<div class="r"><i class="w">⇧</i>${'y x c v b n m'.split(' ').map((k) => `<i>${k}</i>`).join('')}<i class="w">⌫</i></div>`
  + `<div class="r"><i class="w">?123</i><i>,</i><i class="sp">Deutsch</i><i>.</i><i class="w ent">↵</i></div><div class="gb"></div></div>`

const STATUSBAR = (st) => `<div class="statusbar"><span>9:41</span><span class="cam"></span><span class="sys">${st.offline ? '<span class="airplane">Flugmodus</span>' : ''}<span class="sig${st.offline ? ' off' : ''}"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:11px"></i></span><span class="bat"></span></span></div>`

function captureHTML(st, live) {
  if (st.edit) {
    return `<div class="editbar"><b>Todo bearbeiten</b><button class="pill quiet" data-act="editcancel">Abbrechen</button><button class="pill action" data-act="editsave">Speichern</button></div>`
      + `<form class="field focus" data-form="edit" autocomplete="off"><input aria-label="Beschreibung" placeholder="Beschreibung" value="${esc(st.edit.text)}"></form>`
  }
  if (live) return `<form class="field" data-form="capture" autocomplete="off"><input aria-label="Neues Todo" placeholder="Neues Todo" enterkeyhint="done"><button class="go" type="submit" aria-label="In die Inbox" disabled>+</button></form>`
  const v = st.draft
  return `<div class="field${st.kbd ? ' focus' : ''}">${v ? `<span class="val">${esc(v)}</span><span class="caret"></span><span style="flex:1"></span>` : `<span class="ph">Neues Todo</span>`}<span class="go"${v ? '' : ' style="background:transparent;color:var(--rw-soft);box-shadow:inset 0 0 0 1px var(--rw-rule)"'}>+</span></div>`
}

function menuHTML(st, L, rowTop) {
  if (st.menuFor) {
    const t = L.inbox.find((x) => x.id === st.menuFor)
    if (!t) return ''
    const items = t.sync === 'failed'
      ? ['Erneut senden', 'Bearbeiten und erneut senden', 'Löschen']
      : ['Bearbeiten', 'Löschen']
    const top = Math.max(60, Math.min(rowTop ?? 300, 560))
    return `<div class="scrim" data-act="closemenu" style="background:transparent"></div><div class="menu" role="menu" style="right:14px;top:${top}px">`
      + items.map((i) => `<button role="menuitem" data-menu="${i}">${i}</button>`).join('') + '</div>'
  }
  if (st.more) {
    return `<div class="scrim" data-act="closemenu" style="background:transparent"></div><div class="menu" role="menu" style="right:10px;bottom:${st.moreBottom ?? 136}px">`
      + `<div class="info">Angemeldet als uli</div><hr>`
      + `<button class="weblink" role="menuitem" data-web="/projects">Projekte im Web</button>`
      + `<button class="weblink" role="menuitem" data-web="/someday">Irgendwann im Web</button><hr>`
      + `<button role="menuitem">Widget hinzufügen</button><button role="menuitem">Protokoll exportieren</button><button role="menuitem">Abmelden</button></div>`
  }
  return ''
}

function ctabHTML(st, tasks) {
  if (!st.ctab) return ''
  const t = tasks.find((x) => x.id === st.ctab.id)
  const url = t ? `runway.agentic-reach.com/${t.kind === 'waiting' ? 'waiting' : 'next'}?task=${t.uuid}` : `runway.agentic-reach.com${st.ctab.path}`
  const body = t
    ? `<div class="eyebrow"><span class="slash">//</span><span>${t.kind === 'waiting' ? 'Warten auf' : 'Nächste'}</span></div><h2>${esc(t.desc)}</h2>`
      + `<dl><dt>Projekt</dt><dd>${esc(t.project || 'keins')}</dd><dt>Kontext</dt><dd>${esc(t.ctx.join(' ') || '–')}</dd>${t.due ? `<dt>Fällig</dt><dd>${esc(wd(t.due) + ' ' + dm(t.due))}</dd>` : ''}</dl>`
      + `<p>Die Web-App im Custom Tab: hier wird geklärt, geplant und bearbeitet. Zurück bringt dich an dieselbe Stelle.</p>`
    : `<div class="eyebrow"><span class="slash">//</span><span>${st.ctab.path === '/projects' ? 'Projekte' : 'Irgendwann'}</span></div><h2>${st.ctab.path === '/projects' ? 'Was du <em>bewegst</em>' : 'Später, <em>vielleicht</em>'}</h2><p>Die Web-App im Custom Tab. Auf dem Telefon nur zum Nachsehen.</p>`
  return `<div class="ctab" role="dialog" aria-label="Details im Browser"><div class="bar"><button data-act="ctabclose" aria-label="Schließen">×</button><div class="url"><b>runway</b><span>${esc(url)}</span></div><button aria-label="Menü des Browsers">⋮</button></div><div class="page">${body}</div></div>`
}

// Full screen markup for a phone in a given state.
function screenHTML(st, tasks, live = false) {
  const L = lists(tasks, st.ctx)
  return STATUSBAR(st)
    + `<header class="head" data-part="head">${headHTML(st, L)}</header>`
    + `<main class="list" data-part="list">${listHTML(st, L)}</main>`
    + `<div class="zone" data-part="zone">`
    + `<div class="notice" data-part="notice" role="status" aria-live="polite"${st.notice ? '' : ' hidden'}>${noticeHTML(st.notice)}</div>`
    + `<div class="chips" data-part="chips"${st.view === 'next' && !st.kbd ? '' : ' hidden'} role="group" aria-label="Kontext">${chipsHTML(st)}</div>`
    + `<nav class="tabs" data-part="tabs" role="tablist">${tabsHTML(st, L)}</nav>`
    + `<div class="capture" data-part="capture">${captureHTML(st, live)}</div>`
    + `</div>`
    + `<div data-part="kbd"${st.kbd ? '' : ' hidden'}>${KBD}</div>`
    + `<div class="gesture" data-part="gesture"${st.kbd ? ' hidden' : ''}><i></i></div>`
    + `<div data-part="overlay">${menuHTML(st, L, st.menuTop)}${ctabHTML(st, tasks)}</div>`
}

const device = (inner, { dark = false, fs = 1, label = '' } = {}) =>
  `<div class="device static${dark ? ' theme-dark' : ''}${fs > 1 ? ' big' : ''}" style="--fs:${fs}" role="img" aria-label="${esc(label)}"><div class="screen" aria-hidden="true">${inner}</div></div>`

// ── Static frames ──────────────────────────────────────────────────────────────────────
function staticPhone(st, mut, opts) {
  const tasks = derive()
  if (mut) mut(tasks)
  return device(screenHTML({ ctx: 'Alle', ...st }, tasks), opts)
}
const byDesc = (tasks, d) => tasks.find((t) => t.desc === d)
let localSeq = 0
function localTask(desc, sync, minsAgo = 5) {
  localSeq += 1
  const entry = new Date(Date.UTC(2026, 9, 31, 8, 41 - minsAgo))
  return { id: 'L' + localSeq, uuid: 'lokal-' + (0x3fa29c10 + localSeq * 7777).toString(16), local: !!sync, desc, project: null, ctx: [], kind: 'inbox', due: null, follow: null, entry, start: false, urgency: 0, sync }
}

// Glance widget. Every tappable thing (chip, "+", ring cell) is a 48 x 48 dp cell; the visual
// chip and ring are smaller inside it. Text and one vector "+" only.
function widgetHTML({ dark = false, chip = '@work', badge = 0, max = 5 } = {}) {
  const tasks = derive()
  const L = lists(tasks, chip)
  const rows = [...L.faellig, ...L.next]
  const shown = rows.slice(0, max)
  const k = rows.length - shown.length
  const r = shown.map((t) => { const d = dueInfo(t); return `<div class="wr${d && d.tone === 'over' ? ' over' : ''}"><span class="d">${esc(t.desc)}</span>${d && d.tone === 'over' ? '<span class="mk">überfällig</span>' : ''}<span class="wring" role="button" aria-label="${esc('Abhaken: ' + t.desc)}"><i></i></span></div>` }).join('')
  const left = k > 0 ? `<span class="more">+${k} weitere</span>` : `<span>alles für ${esc(chip)}</span>`
  const right = badge ? `<span class="badge">${badge === 1 ? 'Nicht gesendet' : badge + ' nicht gesendet'}</span>` : '<span>Stand 09:41</span>'
  return `<div class="widget${dark ? ' dark' : ''}"><div class="wh"><span class="sl">//</span><span class="t">Inbox ${L.inbox.length + badge} · fällig ${L.faellig.length}</span><span class="wchip" role="button"><span>${esc(chip)}</span></span><span class="wplus" role="button" aria-label="+ Todo"><span>+</span></span></div>${r}`
    + `<div class="wf">${left}${right}</div></div>`
}
const APPS = `<div class="apps"><div class="app"><span class="ic"></span>Kalender</div><div class="app"><span class="ic"></span>Mail</div><div class="app"><span class="ic me">${MARK}</span>runway</div><div class="app"><span class="ic"></span>Kamera</div></div>`
const HOMEFOOT = `<div class="search"></div><div class="dock"><span class="ic"></span><span class="ic"></span><span class="ic"></span><span class="ic"></span></div></div><div class="gesture" style="position:relative;z-index:1"><i style="background:rgba(251,246,238,.7)"></i></div>`

function homeWidget(dark) {
  return `${STATUSBAR({})}<div class="wall"></div><div class="home">`
    + `<div class="clock">9:41</div><div class="date">Samstag, 31. Oktober</div>`
    + widgetHTML({ dark }) + APPS + HOMEFOOT
}

// Second widget state: chip "Alle", overflow "+K weitere" and the unsent badge; below it, the
// system fallback a broken widget shows.
function homeWidgetStates() {
  return `${STATUSBAR({})}<div class="wall"></div><div class="home" style="padding-top:14px">`
    + widgetHTML({ chip: 'Alle', badge: 2 })
    + `<div class="wfail"><span>Widget konnte nicht angezeigt werden</span><span class="wbtn" role="button">Widget neu laden</span></div>`
    + '<div style="flex:1"></div>' + HOMEFOOT
}

// Long press on the launcher icon: the two pinned shortcuts.
function homeShortcuts() {
  return `${STATUSBAR({})}<div class="wall"></div><div class="home">`
    + `<div class="clock">9:41</div><div class="date">Samstag, 31. Oktober</div>`
    + `<div class="shortcuts" role="menu"><div class="sc"><span class="si">+</span>Neues Todo</div><div class="sc"><span class="si in">≡</span>Inbox</div><div class="sc mute"><span class="si">i</span>App-Info</div></div>`
    + APPS.replace('class="app"><span class="ic me"', 'class="app pressed"><span class="ic me"') + HOMEFOOT
}

// Setup (P03): read at the top, the form in the thumb zone.
function setupScreen() {
  return `${STATUSBAR({})}<div class="setup"><div class="sh"><span class="mk">${MARK}</span><div class="eyebrow"><span class="slash">//</span><span>runway</span><span class="sep">·</span><span>by Agentic Reach</span></div>`
    + `<h1>runway <em>einrichten</em></h1><p>Einmal anmelden. Danach bleibt nur der API-Key auf dem Telefon, im Keystore.</p></div>`
    + `<div class="sf"><label class="fl"><span>Benutzername</span><span class="field focus"><span class="val">uli</span><span class="caret"></span></span></label>`
    + `<label class="fl"><span>Passwort</span><span class="field"><span class="val dots">••••••••••</span></span></label>`
    + `<button class="pill action wide">Anmelden</button>`
    + `<div class="alt"><button class="pill line">Key einfügen</button><button class="pill quiet">Erweitert</button></div>`
    + `<p class="srv">Server-URL erscheint unter „Erweitert“, vorbelegt mit runway.agentic-reach.com/api</p></div></div><div class="gesture"><i></i></div>`
}

// After setup: "Verbunden als", then once the tile hint (P03).
function hintScreen() {
  const tasks = derive()
  const inner = screenHTML({ view: 'inbox', ctx: 'Alle', kbd: false, banner: ['connected'] }, tasks)
  const dlg = `<div class="scrim"></div><div class="dialog" role="dialog"><div class="eyebrow"><span class="slash">//</span><span>Kachel</span></div>`
    + `<h3>Zieh die Kachel <span class="tl">+ Todo</span> in die erste Reihe</h3>`
    + `<p>Dann erfasst du mit einem Wisch und einem Tipp, auch auf dem Sperrbildschirm.</p><div class="db"><button class="pill action">OK</button></div></div>`
  return inner + dlg
}

function tileOverlay() {
  return `${STATUSBAR({})}<div class="qs"><div class="bright"></div><div class="tiles">`
    + `<div class="tile"><svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9.2 16.4a4 4 0 0 1 5.6 0"/></svg><span>Internet<small>verbunden</small></span></div>`
    + `<div class="tile"><svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg><span>Bluetooth<small>aus</small></span></div>`
    + `<div class="tile todo"><svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg><span>+ Todo<small>runway</small></span></div>`
    + `<div class="tile"><svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6h-4zM10 9h4v12h-4z"/></svg><span>Taschenlampe<small>aus</small></span></div>`
    + `</div></div><div class="ovl"><div class="card">`
    + `<div class="notice" role="status"><span class="msg">In Inbox ✓<span class="d"> · Angebot an Focke nachfassen</span></span><button>Rückgängig</button></div>`
    + `<div class="field focus"><span class="val">Steuerbescheid ablegen</span><span class="caret"></span><span style="flex:1"></span><span class="go">+</span></div>`
    + `<div class="closebar"><button class="pill quiet">Schließen</button></div></div>${KBD}</div>`
}

function shareTarget() {
  return `${STATUSBAR({})}<div class="webpage"><div class="k">example.org · Artikel</div><h4>Agenten-Evaluation: ein Leitfaden</h4><p>Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Kriterien, Stichproben.</p><div class="ph"></div><p>Wer Agenten einsetzt, braucht eine Prüfung, die zum eigenen Alltag passt.</p></div>`
    + `<div class="ovl" style="z-index:2"><div class="sharesheet" style="margin:0 0 10px;border-radius:22px"><div class="k">Teilen</div><div class="targets"><div class="me"><div class="ic">${MARK}</div>runway</div><div><div class="ic"></div>Notizen</div><div><div class="ic"></div>Nachricht</div><div><div class="ic"></div>Kopieren</div></div></div>`
    + `<div class="sharecard"><div class="eyebrow"><span class="slash">//</span><span>Teilen</span><span class="sep">·</span><span>in die Inbox</span></div><h4>Agenten-Evaluation: ein Leitfaden</h4>`
    + `<div class="note">https://example.org/agenten-evaluation-leitfaden · Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Erfolgskriterien, Stichproben.</div>`
    + `<button class="pill action">In Inbox</button><div class="gesture"><i></i></div></div></div>`
}

function quickClarify() {
  const tasks = derive()
  const st = { view: 'inbox', ctx: 'Alle', kbd: false }
  const t = byDesc(tasks, 'Rechnung Druckerei prüfen')
  const inner = screenHTML(st, tasks)
  const sheet = `<div class="scrim"></div><div class="ovl" style="background:transparent;z-index:7"><div class="card" style="padding:16px 0 4px;box-shadow:var(--ar-shadow-xl)">`
    + `<div style="padding:0 20px 6px"><span class="optiontag">Option · braucht Ulis Entscheidung</span></div>`
    + `<div style="padding:8px 20px 2px;font-size:18px;font-weight:500;letter-spacing:-0.015em">${esc(t.desc)}</div>`
    + `<div class="qc"><div class="lab">// Nächste · ein Tipp · Inbox 5 → 4</div>${['Nächste', '@home', '@computer', '@work', '@business'].map((c) => `<span class="chip">${c}</span>`).join('')}`
    + `<div class="lab">// oder</div><span class="chip">Warten auf</span><span class="chip">Irgendwann</span><span class="chip">Löschen</span></div>`
    + `<div style="padding:0 16px 4px;display:flex;justify-content:space-between;gap:8px"><span class="pill quiet">Bearbeiten</span><span class="pill action">Im Web klären ↗</span></div><div class="gesture"><i></i></div></div></div>`
  return device(inner + sheet, { label: 'Option: Schnell klären' })
}

// ── The live phone ─────────────────────────────────────────────────────────────────────
const live = {
  tasks: derive(),
  st: { view: 'inbox', ctx: 'Alle', kbd: true, notice: null, menuFor: null, more: false, ctab: null, edit: null, freshTally: false },
  el: null,
  noticeTimer: 0,
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const part = (p) => live.el.querySelector(`[data-part="${p}"]`)

function render({ keepCapture = true } = {}) {
  const { st, tasks } = live
  const L = lists(tasks, st.ctx)
  part('head').innerHTML = headHTML(st, L)
  const scroll = part('list').scrollTop
  part('list').innerHTML = listHTML(st, L)
  part('list').scrollTop = scroll
  const n = part('notice')
  if (st.notice) { const was = !n.hidden; n.hidden = false; n.innerHTML = noticeHTML(st.notice); if (!was && !reduced()) { n.classList.remove('enter'); void n.offsetWidth; n.classList.add('enter') } } else n.hidden = true
  part('chips').hidden = st.view !== 'next' || st.kbd // chips step aside while the IME is up
  part('chips').innerHTML = chipsHTML(st)
  part('tabs').innerHTML = tabsHTML(st, L)
  if (!keepCapture) { part('capture').innerHTML = captureHTML(st, true); bindForm() }
  part('kbd').hidden = !st.kbd
  part('gesture').hidden = st.kbd
  part('overlay').innerHTML = menuHTML(st, L, st.menuTop) + ctabHTML(st, tasks)
  if (!st.kbd && live.el.contains(document.activeElement) && document.activeElement.matches('input')) document.activeElement.blur()
  st.freshTally = false
}

function notify(n) {
  clearTimeout(live.noticeTimer)
  live.st.notice = n
  live.noticeTimer = setTimeout(() => { live.st.notice = null; render() }, 6000)
}

function show(view) {
  if (!VIEWNAME[view]) { // Projekte, Irgendwann: web only, in a Custom Tab
    live.st.ctab = { path: view === 'projects' ? '/projects' : '/someday' }; render(); return
  }
  Object.assign(live.st, { view, kbd: view === 'inbox', menuFor: null, more: false, ctab: null })
  part('list').scrollTop = 0; part('head').classList.remove('folded')
  render()
  if (view === 'inbox') focusField()
}
function focusField() { const i = live.el.querySelector('[data-form] input'); if (i) i.focus({ preventScroll: true }) }

function capture(text) {
  const desc = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 500)
  if (!desc) return
  const t = localTask(desc, 'net', 0)
  t.entry = new Date(Date.UTC(2026, 9, 31, 8, 41, live.tasks.length))
  live.tasks.push(t)
  notify({ text: 'In Inbox ✓', undo: () => { t.gone = true } })
  render()
  setTimeout(() => { t.sync = null; t.local = false; t.uuid = '7c1e0000-0000-4000-8000-' + String(9000 + live.tasks.length).padStart(12, '0'); render() }, 900)
}

function complete(id, { viaSwipe = false } = {}) {
  const t = live.tasks.find((x) => String(x.id) === String(id))
  if (!t || t.kind === 'done' || t.gone) return
  const rowEl = live.el.querySelector(`.row[data-id="${t.id}"]`)
  const finish = () => {
    const prev = t.kind
    t.kind = 'done'; t.end = new Date(Date.UTC(2026, 9, 31, 8, 41))
    live.st.freshTally = true
    notify({ text: 'Erledigt', detail: t.desc, undo: () => { t.kind = prev; t.end = null } })
    render()
  }
  if (!rowEl || reduced()) { finish(); return }
  rowEl.classList.remove('swiping', 'armed'); rowEl.style.removeProperty('--dx')
  rowEl.classList.add('struck')
  setTimeout(() => {
    // collapse every copy of the row (a due +next task sits in both sections)
    live.el.querySelectorAll(`.row[data-id="${t.id}"]`).forEach((r) => { r.style.maxHeight = r.offsetHeight + 'px'; void r.offsetHeight; r.classList.add('collapse') })
    setTimeout(finish, 120)
  }, viaSwipe ? 60 : 170)
}

function undo() {
  const n = live.st.notice
  if (n && n.undo) n.undo()
  clearTimeout(live.noticeTimer)
  live.st.notice = null
  render()
}

function bindForm() {
  const form = live.el.querySelector('[data-form]')
  if (!form) return
  const input = form.querySelector('input'), go = form.querySelector('.go')
  input.addEventListener('focus', () => { if (!live.st.kbd) { live.st.kbd = true; render() } })
  input.addEventListener('input', () => { if (go) go.disabled = !input.value.trim() })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (form.dataset.form === 'edit') { saveEdit(input.value); return }
    if (!input.value.trim()) return
    capture(input.value); input.value = ''; if (go) go.disabled = true; input.focus({ preventScroll: true })
  })
}
function saveEdit(v) {
  const t = live.tasks.find((x) => x.id === live.st.edit.id)
  if (t && v.trim()) t.desc = v.trim()
  live.st.edit = null
  render({ keepCapture: false })
}

function bindLive() {
  const el = live.el
  let drag = null, swallow = false
  el.addEventListener('click', (e) => {
    if (swallow) { swallow = false; e.preventDefault(); return }
    const a = e.target.closest('[data-act],[data-tab],[data-chip],[data-menu],[data-web]')
    const row = e.target.closest('.row')
    if (a) {
      if (a.dataset.tab) { show(a.dataset.tab); return }
      if (a.dataset.chip) { live.st.ctx = a.dataset.chip; render(); return }
      if (a.dataset.web) { live.st.more = false; live.st.ctab = { path: a.dataset.web }; render(); return }
      if (a.dataset.menu) {
        const id = live.st.menuFor, t = live.tasks.find((x) => x.id === id), m = a.dataset.menu
        live.st.menuFor = null
        if (m === 'Löschen') { t.gone = true; notify({ text: 'Gelöscht', undo: () => { t.gone = false } }); render() }
        else if (m === 'Erneut senden') { t.sync = 'net'; render() }
        else { live.st.edit = { id, text: t.desc }; live.st.kbd = true; render({ keepCapture: false }); focusField() }
        return
      }
      const act = a.dataset.act
      if (act === 'done') { const r = a.closest('.row'); complete(r.dataset.id); return }
      if (act === 'undo') { undo(); return }
      if (act === 'more') {
        live.st.more = !live.st.more; live.st.menuFor = null
        if (live.st.kbd) { live.st.kbd = false; document.activeElement?.blur(); render() }
        const tabs = part('tabs').getBoundingClientRect(), box = el.getBoundingClientRect()
        live.st.moreBottom = Math.round(box.bottom - tabs.top + 4)
        render(); return
      }
      if (act === 'closemenu') { live.st.menuFor = null; live.st.more = false; render(); return }
      if (act === 'ctabclose') { live.st.ctab = null; render(); return }
      if (act === 'editcancel') { live.st.edit = null; render({ keepCapture: false }); return }
      if (act === 'editsave') { saveEdit(el.querySelector('[data-form="edit"] input').value); return }
    }
    if (row) {
      const id = isNaN(+row.dataset.id) ? row.dataset.id : +row.dataset.id
      if (row.dataset.kind === 'inbox') {
        const top = row.getBoundingClientRect().bottom - el.getBoundingClientRect().top
        live.st.menuFor = id; live.st.menuTop = top + 112 > el.clientHeight - 140 ? top - row.offsetHeight - 104 : top
        if (live.st.kbd) live.st.kbd = false
        render(); return
      }
      live.st.ctab = { id }; render(); return
    }
    if (e.target.closest('.list') && live.st.kbd) { live.st.kbd = false; document.activeElement?.blur(); render() }
  })
  // swipe right = check off (past 35 % of the row, min 96 dp); vertical never checks off
  el.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.row')
    if (!row || e.target.closest('.ring')) return
    drag = { row, x: e.clientX, y: e.clientY, on: false, w: row.offsetWidth }
  })
  el.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (!drag.on && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return }
    if (!drag.on && dx > 10) { drag.on = true; drag.row.classList.add('swiping'); try { drag.row.setPointerCapture(e.pointerId) } catch {} }
    if (drag.on) {
      const d = Math.max(0, dx)
      drag.row.style.setProperty('--dx', d + 'px')
      drag.row.classList.toggle('armed', d > Math.max(96, drag.w * 0.35))
    }
  })
  const end = () => {
    if (!drag) return
    const { row, on } = drag
    drag = null
    if (!on) return
    swallow = true
    setTimeout(() => { swallow = false }, 50)
    if (row.classList.contains('armed')) complete(row.dataset.id, { viaSwipe: true })
    else { row.classList.remove('swiping'); row.style.removeProperty('--dx') }
  }
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  // the heading folds into the eyebrow once the list scrolls (more rows for the thumb)
  part('list').addEventListener('scroll', (e) => {
    const y = e.target.scrollTop
    const h = part('head')
    if (y > 24 && !h.classList.contains('folded')) h.classList.add('folded')
    else if (y === 0 && h.classList.contains('folded')) h.classList.remove('folded')
  }, { passive: true })
  bindForm()
}

// ── Board ──────────────────────────────────────────────────────────────────────────────
function mount() {
  // live phone
  const host = document.getElementById('live')
  host.innerHTML = `<div class="device" aria-label="runway, bedienbar"><div class="screen">${screenHTML(live.st, live.tasks, true)}</div></div>`
  live.el = host.querySelector('.screen')
  bindLive()
  // Pinned: on every open the field is focused and the keyboard is up.
  requestAnimationFrame(() => focusField())

  const F = (id, html) => { const n = document.getElementById(id); if (n) n.innerHTML = html }
  const moreInbox = (tasks) => tasks.push(
    localTask('Ölwechsel Termin ausmachen', null, 30), localTask('Zahnarzt Rechnung einreichen', null, 50),
    localTask('Idee: Kundenstimmen auf der Website', null, 70), localTask('Fahrradschloss ersetzen', null, 95),
    localTask('Buch von Jana zurückgeben', null, 130))
  F('f-inbox', staticPhone({ view: 'inbox', kbd: true, draft: 'Rückruf Druckerei wegen Proof' }, moreInbox, { label: 'Inbox mit offener Tastatur' }))
  F('f-next', staticPhone({ view: 'next', ctx: '@work' }, null, { label: 'Nächste, gefiltert auf @work' }))
  F('f-waiting', staticPhone({ view: 'waiting', pull: true }, null, { label: 'Warten auf, beim Ziehen zum Neuladen' }))
  F('f-undo', staticPhone({ view: 'next', ctx: '@computer', struck: 8, freshTally: true, notice: { text: 'Erledigt', detail: 'Belege Oktober hochladen', undo: true } },
    (tasks) => { tasks.push({ ...byDesc(tasks, 'Wochenplan aufschreiben'), id: 999, kind: 'done' }) }, { label: 'Abhaken mit Rückgängig' }))
  F('f-offline', (() => {
    const tasks = derive()
    tasks.push(localTask('Rückruf Druckerei wegen Proof', 'net', 3), localTask('Tisch für Freitag reservieren', 'net', 12), localTask('Foto vom Whiteboard abtippen', 'failed', 40))
    const failed = tasks.find((t) => t.sync === 'failed')
    const st = { view: 'inbox', ctx: 'Alle', kbd: false, offline: true, stand: '08:12', stale: true, menuFor: failed.id, menuTop: 306 }
    return device(screenHTML(st, tasks), { label: 'Offline: wartet auf Netz und Nicht gesendet' })
  })())
  F('f-dark', staticPhone({ view: 'next', ctx: 'Alle', banner: ['rekey'] }, null, { dark: true, label: 'Nächste im Dunkelmodus, mit Fehlerkarte' }))
  F('f-widget', device(homeWidget(false), { label: 'Startbildschirm mit Widget' }))
  F('f-tile', device(tileOverlay(), { label: 'Kachel + Todo mit Erfassungsfeld' }))
  F('f-share', device(shareTarget(), { label: 'Teilen an runway' }))
  F('f-widget2', device(homeWidgetStates(), { label: 'Widget: Überlauf, nicht gesendet, Ersatzansicht' }))
  F('f-setup', device(setupScreen(), { label: 'Einrichten' }))
  F('f-hint', device(hintScreen(), { label: 'Nach dem Einrichten: Hinweis zur Kachel' }))
  F('f-next-off', staticPhone({ view: 'next', ctx: '@home', offline: true, stand: '08:12', stale: true, banner: ['oldAccount'] }, null, { label: 'Nächste ohne Netz, mit Karte Altes Konto' }))
  F('f-next-kbd', staticPhone({ view: 'next', ctx: '@work', kbd: true, notice: { text: 'In Inbox ✓', detail: 'Tisch für Freitag reservieren', undo: true } },
    (tasks) => tasks.push(localTask('Tisch für Freitag reservieren', 'net', 0)), { label: 'Nächste mit Tastatur, nach Enter' }))
  F('f-shortcuts', device(homeShortcuts(), { label: 'Verknüpfungen am App-Icon' }))
  F('f-big', staticPhone({ view: 'next', ctx: '@home' }, null, { fs: 1.5, label: 'Nächste bei 150 Prozent Schrift' }))
  F('f-big-inbox', staticPhone({ view: 'inbox', kbd: true, draft: 'Rückruf Druckerei' }, moreInbox, { fs: 1.5, label: 'Inbox mit Tastatur bei 150 Prozent Schrift' }))
  F('f-option', quickClarify())
}

mount()

window.proto = {
  show,
  filter(context) {
    const c = context == null ? 'Alle' : (CHIPS.includes(context) ? context : (MAP[context] || 'Alle'))
    Object.assign(live.st, { view: 'next', ctx: c, kbd: false, ctab: null, menuFor: null }); render()
  },
  capture(text) { if (live.st.view !== 'inbox') show('inbox'); capture(text) },
  open(id) { const t = live.tasks.find((x) => String(x.id) === String(id)); if (!t) return; if (t.kind === 'inbox') { live.st.view = 'inbox'; live.st.menuFor = t.id; live.st.menuTop = 300 } else live.st.ctab = { id: t.id }; render() },
  complete(id) { const t = live.tasks.find((x) => String(x.id) === String(id)); if (!t) return; const v = t.kind === 'inbox' ? 'inbox' : t.kind === 'waiting' ? 'waiting' : 'next'; if (live.st.view !== v) { Object.assign(live.st, { view: v, kbd: false }); render() } complete(id) },
  // Clarifying is not on the phone (PLAN.md non-goal). This applies what the web would do, so
  // the lists can be checked after a refresh.
  clarify(id, to) {
    const t = live.tasks.find((x) => String(x.id) === String(id)); if (!t) return
    if (to === 'delete') t.gone = true
    else if (to === 'waiting') t.kind = 'waiting'
    else if (to === 'someday') t.kind = 'someday'
    else if (String(to).startsWith('next')) { t.kind = 'next'; const c = String(to).split(':')[1]; if (c) t.ctx = [MAP[c] || c] }
    render()
  },
  signature() { Object.assign(live.st, { view: 'next', ctx: 'Alle', kbd: false }); render(); const L = lists(live.tasks, 'Alle'); const t = L.faellig[0] || L.next[0]; if (t) complete(t.id) },
  undo,
  state: () => ({ ...live.st, notice: live.st.notice ? live.st.notice.text : null }),
}
