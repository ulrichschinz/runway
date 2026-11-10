// M5 "Überall": one render function per surface, all fed by one state, so the family stays
// consistent: a capture in the phone updates the widget, the notification and the counts.

import { CONTEXTS, CTX_MAP, freshTasks, inbox, due, next, waiting, rowOf } from './model.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const MARK = '../../shared/brand/logos/mark-color.svg'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const TAB_LABEL = { inbox: 'Inbox', next: 'Nächste', waiting: 'Warten auf' }
const TITLE = { inbox: 'Erst mal <em>rein</em>', next: 'Was <em>jetzt</em> geht', waiting: 'Liegt bei <em>anderen</em>' }

// ── State ──────────────────────────────────────────────
const S = {
  tasks: freshTasks(), tab: 'inbox', ctx: '@computer', wctx: '@computer', ime: true, draft: '',
  notice: null, offline: false, menu: null, ctab: null, edit: null, stand: '09:41', seq: 0,
}

// ── Pieces ─────────────────────────────────────────────
const statusbar = (o = {}) => `<div class="statusbar"><span>9:41</span><span class="cam"></span><span class="sys">${
  o.offline ? '<span class="mono" style="font-size:11px;font-weight:400">kein Netz</span>' : ''}<span class="sig${o.offline ? ' off' : ''}"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:11px"></i></span><span class="bat"></span></span></div>`

const KEYS = ['qwertzuiop', 'asdfghjklö']
export const keyboard = (sug = ['Proof', 'Probe', 'Prospekt']) => `<div class="kbd" aria-hidden="true">
  <div class="sug">${sug.map((s) => `<span>${s}</span>`).join('')}</div>
  ${KEYS.map((r) => `<div class="kr">${[...r].map((k) => `<i class="k" data-k="${k}">${k}</i>`).join('')}</div>`).join('')}
  <div class="kr"><i class="k fn">⇧</i>${[...'yxcvbnm'].map((k) => `<i class="k" data-k="${k}">${k}</i>`).join('')}<i class="k fn" data-k="back">⌫</i></div>
  <div class="kr"><i class="k fn">?123</i><i class="k" data-k=",">,</i><i class="k sp" data-k=" ">Deutsch</i><i class="k" data-k=".">.</i><i class="k en" data-k="enter">↵</i></div>
  <div class="nav"><i></i></div></div>`

function rowHtml(r, o = {}) {
  return `<div class="row${r.overdue ? ' overdue' : ''}${r.fresh ? ' fresh' : ''}${o.done === r.id ? ' done' : ''}" data-row="${r.id}" role="listitem" aria-label="${esc(r.a11y)}">
    <button class="ring" data-act="tick" data-id="${r.id}" aria-label="Abhaken: ${esc(r.text)}"></button>
    <div class="body"><div class="txt" ${o.list === 'inbox' ? 'data-testtag="inbox-row-text"' : ''}>${esc(r.text)}<span class="strike"></span></div><div class="meta">${r.meta}</div></div></div>`
}
const sec = (label, n) => `<div class="sec"><span class="eyebrow"><span class="slash">//</span><span>${label}</span><span class="sep">·</span><span>${n}</span></span></div>`

function listHtml(st, o) {
  const T = st.tasks
  if (st.tab === 'inbox') {
    const rows = inbox(T)
    if (!rows.length) return '<div class="empty"><em>Leer.</em>Inbox ist leer</div>'
    return `<div role="list">${rows.map((t) => rowHtml(rowOf(t, 'inbox'), { ...o, list: 'inbox' })).join('')}</div>`
  }
  if (st.tab === 'next') {
    const d = due(T)
    const n = next(T, st.ctx)
    return `${sec('Fällig', d.length)}<h3 class="sr">Fällig</h3><div role="list">${d.length ? d.map((t) => rowHtml(rowOf(t, 'next'), o)).join('') : '<div class="empty">Nichts fällig</div>'}</div>
      ${sec('Nächste Aktionen', n.length)}<div role="list">${n.length ? n.map((t) => rowHtml(rowOf(t, 'next'), o)).join('') : '<div class="empty">Keine nächsten Aktionen</div>'}</div>`
  }
  const w = waiting(T)
  return w.length ? `<div role="list">${w.map((t) => rowHtml(rowOf(t, 'waiting'), o)).join('')}</div>` : '<div class="empty">Du wartest auf nichts</div>'
}

function noticeHtml(n, o = {}) {
  if (!n) return ''
  return `<div class="notice" role="status" aria-live="polite"><span class="what">${esc(n.text)}</span>${n.undo ? '<button class="undo" data-act="undo">Rückgängig</button>' : ''}${n.undo ? `<span class="tl ${o.static ? '' : 'run'}" style="${o.tl != null ? `transform:scaleX(${o.tl})` : n.t0 ? `animation-delay:-${Date.now() - n.t0}ms` : ''}"></span>` : ''}</div>`
}

/** The whole app screen for a state. o: { interactive, fieldText, menu, done, tl } */
export function appScreen(st, o = {}) {
  const counts = { inbox: inbox(st.tasks).length, next: next(st.tasks, 'Alle').length + due(st.tasks).length, waiting: waiting(st.tasks).length }
  const field = o.interactive
    ? `<input id="fieldInput" aria-label="${st.edit ? 'Beschreibung' : 'Neues Todo'}" placeholder="${st.edit ? 'Beschreibung' : 'Neues Todo'}" enterkeyhint="done" autocomplete="off" value="${esc(st.draft)}">`
    : o.fieldText ? `<span class="ph typed">${esc(o.fieldText)}<span class="caret"></span></span>` : `<span class="ph" aria-label="Neues Todo">Neues Todo</span>`
  const ctab = st.ctab ? `<div class="ctab" role="dialog" aria-label="Details im Browser"><div class="bar"><button data-act="ctabclose" aria-label="Schließen">×</button><div class="url"><b>runway</b>runway.agentic-reach.com${esc(st.ctab)}</div></div>
      <div class="pg"><div class="eyebrow"><span class="slash">//</span><span>Custom Tab</span><span class="sep">·</span><span>Web-App</span></div><h3>Details im <em>Browser</em></h3><p>Die Web-App öffnet hier das Todo mit allen Feldern. Zurück führt in dieselbe Liste an dieselbe Stelle.</p></div></div>` : ''
  return `${statusbar({ offline: st.offline })}
    <header class="hd"><div class="eyebrow"><span class="slash">//</span><span>${TAB_LABEL[st.tab]}</span><span class="sep">·</span><span class="stand${st.offline ? ' old' : ''}">Stand ${st.stand}</span></div><button class="more" data-act="more" aria-label="Mehr">···</button></header>
    ${st.tab === 'inbox' && st.ime ? '' : `<h2 class="ttl">${TITLE[st.tab]}</h2>`}
    ${o.banners || ''}
    <div class="lw">${o.pull ? '<div class="ptr" aria-hidden="true"><span></span></div>' : ''}<div class="list" data-act="beside">${listHtml(st, o)}</div>${o.newPill ? '<button class="newpill" data-act="totop">↑ Neue Todos oben</button>' : ''}</div>
    <div class="bottom">
      ${st.ime ? '' : noticeHtml(st.notice, o)}
      ${st.tab === 'next' && !st.ime ? `<div class="chips" role="group" aria-label="Kontext">${CONTEXTS.map((c) => `<button class="chip" data-act="ctx" data-c="${c}" aria-pressed="${st.ctx === c}">${c}</button>`).join('')}</div>` : ''}
      <nav class="tabs" role="tablist">${['inbox', 'next', 'waiting'].map((t) => `<button class="tab" role="tab" data-act="tab" data-t="${t}" aria-selected="${st.tab === t}"><span>${TAB_LABEL[t]}</span><span class="n" aria-hidden="true">${counts[t]}</span></button>`).join('')}</nav>
      ${st.ime ? noticeHtml(st.notice, o) : ''}
      ${st.edit ? '<div class="eyebrow" style="padding:6px 22px 4px;justify-content:space-between;display:flex"><span><span class="slash">//</span> Todo bearbeiten</span><button data-act="editcancel" style="min-height:40px;font-family:var(--rw-font-sans);font-size:14px;color:var(--rw-text)">Abbrechen</button></div>' : ''}
      <form class="fieldrow" data-form="capture" autocomplete="off"><div class="field" data-act="focus">${field}<button class="go" data-act="send" aria-label="${st.edit ? 'Speichern' : 'In Inbox'}" type="submit">→</button></div></form>
    </div>
    ${st.ime ? keyboard() : '<div class="gesture"><i></i></div>'}
    ${o.menu || ''}${ctab}`
}

// ── System surfaces ──────────────────────────────────
// Two kinds. Ours (branded): the Glance widget and the capture overlay, both drawn by runway.
// The system's (not branded): QS tile, notification shade, launcher popup, lock-screen card.
// Android draws those from a template in system colours; runway only supplies text, a
// monochrome small icon and, via setColor, the tint of the small-icon circle.
function widgetRows(st, max) {
  const d = due(st.tasks)
  const n = next(st.tasks, st.wctx)
  const all = [...d, ...n]
  return { rows: all.slice(0, max), rest: Math.max(0, all.length - max) }
}
/** The one widget "runway Übersicht" 4×3: capture bar on top (the old 4×1 is gone), header, rows, footer. */
export function widgetBig(st, o = {}) {
  const { rows, rest } = widgetRows(st, o.max || 4)
  const stand = st.wloading ? 'lädt …' : `Stand ${st.stand}`
  const foot = o.undo ? `<span class="undo">Erledigt<b>Rückgängig</b></span><span>${stand}</span>`
    : (st.offline || o.unsent) ? `<span class="bad">1 nicht gesendet</span><span>Stand 09:12</span>`
    : `${rest ? `<button class="more" data-act="wmore">+${rest} weitere</button>` : '<span></span>'}<span>${stand}</span>`
  return `<div class="wg" aria-label="runway Übersicht">
    <button class="wcap" data-act="wplus" aria-label="+ Todo"><span class="ph">Neues Todo</span><span class="go" aria-hidden="true">+</span></button>
    <div class="whd"><button class="hd2" data-act="wreload" aria-label="Inbox ${inbox(st.tasks).length} · fällig ${due(st.tasks).length}, neu laden">Inbox ${inbox(st.tasks).length} · fällig ${due(st.tasks).length}</button><button class="wchip" data-act="wctx" aria-label="Kontext ${st.wctx}"><span>${st.wctx}</span></button></div>
    ${rows.map((t) => { const r = rowOf(t, 'next'); const td = !r.overdue && t.due && r.a11y.includes('fällig heute'); return `<div class="wr${r.overdue ? ' od' : ''}"><button class="r" data-act="tick" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"></button><span class="x">${esc(t.description)}</span>${r.overdue ? '<span class="k">überfällig</span>' : td ? '<span class="k td">heute</span>' : ''}</div>` }).join('')}
    <div class="wf">${foot}</div></div>`
}
/** The system's error fallback (res/layout/widget_error.xml), system neutral colours. */
const widgetError = () => `<div class="wg wg-err" aria-label="runway Übersicht"><div class="t">Widget konnte nicht angezeigt werden</div><button class="b">Widget neu laden</button></div>`

const dock = (o = {}) => `<div class="dock"><div class="app"><span class="ic"></span>Telefon</div><div class="app"><span class="ic"></span>Kamera</div><div class="app${o.lift ? ' lift' : ''}"><span class="ic rw"><img src="${MARK}" alt=""></span>runway</div><div class="app"><span class="ic"></span>Chrome</div></div>`
const pinned = () => `<div class="pins"><div class="app"><span class="ic rw sc"><img src="${MARK}" alt=""><i>··</i></span>Warten auf</div><div class="app"><span class="ic"></span>Kalender</div><div class="app"><span class="ic"></span>Notizen</div><div class="app"><span class="ic"></span>Karten</div></div>`

export function homeScreen(st) {
  return `${statusbar()}<div class="wall"><div class="hclock"><div class="t">Samstag, 31. Oktober</div><div class="d">12° · Köln</div></div>
    <div class="widgets"><div>${widgetBig(st)}<div class="wlabel">runway Übersicht · 4×3</div></div></div>
    ${pinned()}${dock()}<div class="gesture"><i></i></div></div>`
}
export function widgetStatesScreen(st) {
  return `${statusbar()}<div class="wall"><div class="widgets" style="padding-top:14px;gap:10px">
    <div>${widgetBig(st, { max: 2, undo: true })}<div class="wlabel">nach dem Abhaken · 5,5 s</div></div>
    <div>${widgetBig({ ...st, offline: true }, { max: 2, unsent: true })}<div class="wlabel">ohne Netz</div></div>
    <div>${widgetError()}<div class="wlabel">Fallback des Systems</div></div></div>
    <div class="gesture" style="margin-top:auto"><i></i></div></div>`
}
// launcher popup: drawn by the launcher; shortcuts carry only an icon, a short and a long label
export function shortcutsScreen(st) {
  return `${statusbar()}<div class="wall"><div class="hclock"><div class="t">Samstag, 31. Oktober</div><div class="d">12° · Köln</div></div>
    <div class="widgets"><div>${widgetBig(st, { max: 2 })}</div></div>
    <div class="dim"></div>
    <div class="popup sysui" role="menu" aria-label="Kurzbefehle">
      <div class="sc"><span class="g c">+</span>Neues Todo</div>
      <div class="sc"><span class="g">↓</span>Inbox</div>
      <div class="sc"><span class="g">→</span>Nächste</div>
      <div class="sc"><span class="g">··</span>Warten auf</div>
      <div class="sc info"><span class="g">i</span>App-Info</div>
    </div>
    <div style="position:relative;z-index:6;margin-top:auto">${dock({ lift: true })}</div><div class="gesture" style="z-index:6"><i></i></div></div>`
}
const smallIcon = () => `<span class="si" aria-hidden="true"><img src="../../shared/brand/logos/mark-mono-dark.svg" alt=""></span>`
/** "Nächste" in the system template: first row as title (the one "Abhaken" acts on), two more as lines. */
function nextNotif(st, o = {}) {
  const { rows } = widgetRows(st, 3)
  const [first, ...more] = rows
  const r0 = first ? rowOf(first, 'next') : null
  if (o.collapsed) {
    return `<div class="nf"><div class="nfh">${smallIcon()}<span>runway · Nächste ${st.wctx} · jetzt</span><span class="chev" aria-label="Maximieren">⌄</span></div>
      <div class="nft">${esc(first?.description || 'Nichts fällig')}</div><div class="nfs">${more.length ? `+${more.length} weitere` : ''}</div></div>`
  }
  return `<div class="nf open"><div class="nfh">${smallIcon()}<span>runway · Nächste ${st.wctx} · jetzt</span><span class="chev" aria-label="Minimieren">⌃</span></div>
    <div class="nft">${esc(first?.description || 'Nichts fällig')}</div>
    <div class="nfs">${r0?.overdue ? 'überfällig' : ''}</div>
    ${more.map((t) => `<div class="nfl">${esc(t.description)}</div>`).join('')}
    ${o.reply ? `<div class="nfr"><span class="ph">${esc(o.reply)}<span class="caret"></span></span><span class="send" aria-label="Senden">➤</span></div>`
      : '<div class="nfa"><span>+ Todo</span><span>Abhaken</span><span>Öffnen</span></div>'}</div>`
}
const qtile = (g, l, sub, on) => `<div class="qt${on ? ' on' : ''}"><span class="g">${g}</span><span>${l}<small>${sub}</small></span></div>`
export function shadeScreen(st) {
  return `${statusbar()}<div class="shade sysui"><div class="qtiles">
      ${qtile('◠', 'Internet', 'verbunden', true)}${qtile('ᛒ', 'Bluetooth', 'aus')}
      ${qtile('+', '+ Todo', 'runway')}${qtile('◐', 'Dunkles Design', 'aus')}</div>
      <div class="nf"><div class="nfh"><span class="si gen" aria-hidden="true">▦</span><span>Kalender · 10:00</span></div><div class="nft">Workshop-Vorbereitung</div></div>
      <div class="sh">Lautlos</div>
      ${nextNotif(st, { collapsed: true })}
      <div class="sclear"><span>Verwalten</span><span>Alle löschen</span></div>
      </div><div class="gesture sysg"><i></i></div>`
}
export function replyScreen(st) {
  return `${statusbar()}<div class="shade sysui" style="padding-top:14px"><div class="sh">Lautlos</div>${nextNotif(st, { reply: 'Angebot Druckerei vergleichen' })}</div>
      ${keyboard(['vergleichen', 'Vergleich', 'vergleiche'])}`
}
export function lockScreen() {
  return `${statusbar()}<div class="lock"><div class="lt">9:41</div><div class="ld">Samstag, 31. Oktober</div>
      <div class="lockntf sysui"><div class="nfh">${smallIcon()}<span>runway</span></div><div class="nt">Inhalt ausgeblendet</div></div>
      <div class="ov" role="dialog" aria-label="Neues Todo">
        <div class="ovtop"><span class="eyebrow"><span class="slash">//</span><span>Neues Todo</span><span class="sep">·</span><span>gesperrt</span></span><span class="pill">Schließen</span></div>
        ${noticeHtml({ text: 'In Inbox ✓', undo: true }, { static: true, tl: 0.67 })}
        <div class="field" style="border-color:var(--rw-text)"><span class="ph typed">Reifen einlagern lass<span class="caret"></span></span><span class="go">→</span></div>
        ${keyboard(['lassen', 'lasse', 'lässt'])}</div></div>`
}
export function shareScreen() {
  return `${statusbar()}<div class="web"><div class="u">example.org/agenten-evaluation</div><h4>Agenten-Evaluation: ein Leitfaden</h4><p>Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Kriterien, Stichproben.</p><p>Wer Agenten einführt, braucht eine Messlatte, bevor der erste Pilot startet.</p>
      <div class="dim" style="z-index:5"></div>
      <div class="share" role="dialog" aria-label="runway"><div class="eyebrow"><span class="slash">//</span><span>Teilen</span><span class="sep">·</span><span>in die Inbox</span></div>
        <div class="st">Agenten-Evaluation: ein Leitfaden</div>
        <div class="sn">https://example.org/agenten-evaluation · Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Kriterien, Stichproben.</div>
        <div class="big">In Inbox</div>
        <div class="row2"><span>Link wird Notiz</span><span>geht auch ohne Netz</span></div></div></div>
      <div class="gesture" style="background:var(--rw-bg)"><i></i></div>`
}

// ── Interactive phone ─────────────────────────────────
let host
let noticeTimer
let commitTimer
const byId = (id) => S.tasks.find((t) => String(t.id) === String(id))

function render() {
  if (!host) return
  const keep = document.activeElement?.id === 'fieldInput'
  const scroll = S._resetScroll ? 0 : host.querySelector('.list')?.scrollTop || 0
  if (S._resetScroll) host.classList.remove('scrolled')
  S._resetScroll = false
  host.classList.toggle('ime', S.ime)
  host.innerHTML = appScreen(S, { interactive: true, menu: menuHtml() })
  const list = host.querySelector('.list')
  if (list) {
    list.scrollTop = scroll
    // the title collapses once the list scrolls, so long lists and 150 % text get the room
    list.addEventListener('scroll', () => host.classList.toggle('scrolled', list.scrollTop > 8), { passive: true })
  }
  const input = host.querySelector('#fieldInput')
  if (S.ime && input && (keep || S._wantFocus)) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length) }
  S._wantFocus = false
  renderSurfaces()
}
function menuHtml() {
  if (S.menu === 'more') {
    return `<div class="scrim" data-act="closemenu"></div><div class="menu" role="menu" style="top:84px;right:12px"><div class="info">Angemeldet als uli</div>
      <button data-act="closemenu">Widget hinzufügen</button><button data-act="closemenu">Protokoll exportieren</button><button data-act="closemenu">Abmelden</button></div>`
  }
  if (S.menu?.row) {
    const t = byId(S.menu.row)
    const failed = t?.net === 'fail'
    return `<div class="scrim" data-act="closemenu" style="background:transparent"></div><div class="menu" role="menu" style="top:${S.menu.y}px;right:16px">${
      failed ? '<button data-act="resend">Erneut senden</button><button data-act="edit">Bearbeiten und erneut senden</button>' : '<button data-act="edit">Bearbeiten</button>'}<button data-act="delete">Löschen</button></div>`
  }
  return ''
}

function showNotice(n) {
  clearTimeout(noticeTimer)
  if (S.notice?.commit) { S.notice.commit(); clearTimeout(commitTimer) }
  n.t0 = Date.now()
  S.notice = n
  render()
  noticeTimer = setTimeout(() => { if (S.notice === n) { n.commit?.(); S.notice = null; render() } }, n.undo ? 6000 : 2500)
}

export function capture(text) {
  const desc = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!desc) return
  S.seq += 1
  const t = { id: 9000 + S.seq, uuid: `local-${String(S.seq).padStart(8, '0')}`, description: desc, status: 'pending', project: null, tags: [], due: null, scheduled: null, wait: null, urgency: 0, entry: `20261031T09${String(41 + S.seq).padStart(2, '0')}00Z`, start: null, annotations: [], local: true, net: S.offline ? 'wait' : null, fresh: true }
  S.tasks.unshift(t)
  setTimeout(() => { t.fresh = false; if (!S.offline) t.local = false }, 2400)
  showNotice({ text: 'In Inbox ✓', undo: () => { S.tasks = S.tasks.filter((x) => x !== t) } })
}

export function complete(id) {
  const t = byId(id)
  if (!t || t.status !== 'pending') return
  const row = host?.querySelector(`[data-row="${t.id}"]`)
  const finish = () => {
    t._held = true
    showNotice({ text: 'Erledigt', undo: () => { t._held = false }, commit: () => { t.status = 'completed'; t._held = false } })
  }
  if (row && !reduced) { row.classList.add('done'); setTimeout(finish, 200) } else finish()
}

function remove(id) {
  const t = byId(id)
  if (!t) return
  t._held = true
  showNotice({ text: 'Gelöscht', undo: () => { t._held = false }, commit: () => { S.tasks = S.tasks.filter((x) => x !== t) } })
}

function undo() {
  const n = S.notice
  if (!n?.undo) return
  n.undo()
  n.commit = null
  clearTimeout(noticeTimer)
  S.notice = null
  render()
}

function setTab(t) {
  S._resetScroll = S.tab !== t
  S.tab = t
  S.ime = t === 'inbox' // Inbox opens with the keyboard, Nächste and Warten auf without
  S._wantFocus = S.ime
  S.menu = null
  render()
}

function submit() {
  if (S.edit) {
    const t = byId(S.edit)
    if (t && S.draft.trim()) t.description = S.draft.trim()
    S.edit = null
    S.draft = ''
    S._wantFocus = true
    showNotice({ text: 'Gespeichert' })
    return
  }
  const text = S.draft
  S.draft = ''
  S._wantFocus = true
  if (S.tab !== 'inbox') S.ime = true
  capture(text)
}

function onClick(e) {
  const el = e.target.closest('[data-act]')
  if (!el || !host.contains(el)) return
  const act = el.dataset.act
  if (act === 'tab') return setTab(el.dataset.t)
  if (act === 'tick') { e.stopPropagation(); return complete(el.dataset.id) }
  if (act === 'undo') return undo()
  if (act === 'ctx') { S.ctx = el.dataset.c; return render() }
  if (act === 'totop') { host.querySelector('.list')?.scrollTo({ top: 0 }); return }
  if (act === 'more') { S.menu = 'more'; return render() }
  if (act === 'closemenu') { S.menu = null; return render() }
  if (act === 'ctabclose') { S.ctab = null; return render() }
  if (act === 'focus') { if (!S.ime) { S.ime = true; S._wantFocus = true; render() } return }
  if (act === 'send') { e.preventDefault(); return submit() }
  if (act === 'edit') { const t = byId(S.menu.row); S.edit = t.id; S.draft = t.description; S.menu = null; S.ime = true; S._wantFocus = true; return render() }
  if (act === 'editcancel') { S.edit = null; S.draft = ''; S._wantFocus = true; return render() }
  if (act === 'delete') { const id = S.menu.row; S.menu = null; return remove(id) }
  if (act === 'resend') { const t = byId(S.menu.row); S.menu = null; if (t) t.net = S.offline ? 'wait' : null; return render() }
  if (act === 'beside') {
    const row = e.target.closest('[data-row]')
    if (row) {
      if (S.tab === 'inbox') { S.menu = { row: row.dataset.row, y: Math.min(row.offsetTop + row.offsetHeight + 20, 640) }; return render() }
      const t = byId(row.dataset.row)
      S.ctab = `/${S.tab === 'next' ? 'next' : 'waiting'}?task=${t.uuid}`
      return render()
    }
    if (S.ime) { S.ime = false; return render() } // tap beside: keyboard closes, draft stays
  }
}

function onKeyboard(e) {
  const k = e.target.closest('[data-k]')
  if (!k || !host.contains(k)) return
  e.preventDefault()
  const key = k.dataset.k
  if (key === 'enter') return submit()
  S.draft = key === 'back' ? S.draft.slice(0, -1) : S.draft + key
  S._wantFocus = true
  render()
}

// swipe right = tick off, past 35 % of the width (at least 96 dp)
function swipe(host) {
  let drag = null
  host.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.row')
    if (!row || e.target.closest('.ring') || S.tab === undefined) return
    drag = { row, x: e.clientX, y: e.clientY, dx: 0, on: false }
  })
  host.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!drag.on && Math.abs(e.clientY - drag.y) > 10) { drag = null; return }
    if (dx > 8) drag.on = true
    if (!drag.on) return
    drag.dx = Math.max(0, dx)
    drag.row.style.setProperty('--dx', `${drag.dx}px`)
    drag.row.classList.toggle('armed', drag.dx > Math.max(96, drag.row.offsetWidth * 0.35))
  })
  const end = () => {
    if (!drag) return
    const { row, on } = drag
    const armed = row.classList.contains('armed')
    drag = null
    if (!on) return
    host.dataset.swiped = '1'
    setTimeout(() => delete host.dataset.swiped, 50)
    if (armed) complete(row.dataset.row)
    else { row.classList.add('settle'); row.style.setProperty('--dx', '0px') }
  }
  host.addEventListener('pointerup', end)
  host.addEventListener('pointercancel', end)
}

// ── Surfaces beside the phone, live from the same state ──
const surfaceHosts = {}
function renderSurfaces() {
  if (surfaceHosts.home) surfaceHosts.home.innerHTML = homeScreen(S)
  if (surfaceHosts.shortcuts) surfaceHosts.shortcuts.innerHTML = shortcutsScreen(S)
  if (surfaceHosts.shade) surfaceHosts.shade.innerHTML = shadeScreen(S)
  if (surfaceHosts.widgets) surfaceHosts.widgets.innerHTML = widgetStatesScreen(S)
}
function onSurfaceClick(e) {
  const el = e.target.closest('[data-act]')
  if (!el) return
  const act = el.dataset.act
  if (act === 'wreload') { // header = reload from the server, the app stays closed
    S.wloading = true; renderSurfaces()
    setTimeout(() => { const d = new Date(); S.stand = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; S.wloading = false; render() }, 600)
    return
  }
  if (act === 'wctx') { S.wctx = CONTEXTS[(CONTEXTS.indexOf(S.wctx) + 1) % CONTEXTS.length]; renderSurfaces() }
  if (act === 'wplus') { S.tab = 'inbox'; S.ime = true; S._wantFocus = true; render() }
  if (act === 'tick') complete(el.dataset.id)
  if (act === 'wmore') { S.ctx = S.wctx; setTab('next') }
}

export function mount(el, surfaces, controls) {
  host = el
  Object.assign(surfaceHosts, surfaces)
  host.addEventListener('click', (e) => { if (host.dataset.swiped) return; onClick(e) })
  host.addEventListener('pointerdown', onKeyboard)
  host.addEventListener('submit', (e) => { e.preventDefault(); submit() })
  host.addEventListener('input', (e) => { if (e.target.id === 'fieldInput') S.draft = e.target.value })
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (S.menu || S.ctab) { S.menu = null; S.ctab = null } else if (S.edit) { S.edit = null; S.draft = '' } else S.ime = false; render() }
  })
  swipe(host)
  for (const h of Object.values(surfaces)) h.addEventListener('click', onSurfaceClick)
  controls?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-demo]')
    if (!b) return
    if (b.dataset.demo === 'offline') {
      S.offline = !S.offline
      b.setAttribute('aria-pressed', S.offline)
      if (!S.offline) S.tasks.forEach((t) => { if (t.net === 'wait') { t.net = null; t.local = false } })
      S.stand = S.offline ? '09:41' : '09:41'
      render()
    }
    if (b.dataset.demo === 'dark') {
      const on = document.documentElement.dataset.theme !== 'dark'
      document.documentElement.dataset.theme = on ? 'dark' : 'light'
      b.setAttribute('aria-pressed', on)
    }
  })
  S._wantFocus = !matchMedia('(max-width: 520px)').matches // no focus-scroll on load at phone width
  render()

  window.proto = {
    show(view) {
      if (TAB_LABEL[view]) return setTab(view)
      S.ctab = `/${view}`; render() // Projekte, Irgendwann: the web app in a Custom Tab
    },
    filter(context) {
      S.ctx = context ? (CTX_MAP[context] || context) : 'Alle'
      if (!CONTEXTS.includes(S.ctx)) S.ctx = 'Alle'
      setTab('next')
    },
    capture(text) { S.tab = 'inbox'; S.ime = true; capture(text) },
    open(id) { const t = byId(id); if (t) { S.ctab = `/${S.tab === 'waiting' ? 'waiting' : 'next'}?task=${t.uuid}`; render() } },
    complete(id) { complete(id) },
    clarify(id, to) { // only through the optional quick-clarify screen (needs Uli's decision)
      const t = byId(id)
      if (!t) return
      const before = [...t.tags]
      if (to === 'delete') return remove(id)
      if (to.startsWith('next:')) t.tags = ['next', CTX_MAP[to.slice(5)] || to.slice(5)]
      else t.tags = [to]
      showNotice({ text: to.startsWith('next:') ? `Nach Nächste · ${t.tags[1]}` : to === 'waiting' ? 'Nach Warten auf' : 'Nach Irgendwann', undo: () => { t.tags = before } })
    },
    signature() { // the family moment: one capture, every surface counts it at once
      S.tab = 'inbox'; S.ime = true
      capture('Rückruf Druckerei wegen Proof')
      document.querySelectorAll('[data-live]').forEach((f) => { f.classList.remove('pulse-once'); void f.offsetWidth; f.classList.add('pulse-once') })
    },
    state: S,
  }
}
