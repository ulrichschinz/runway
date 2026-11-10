// m2 · Jetzt — one rule set, one renderer, every phone frame on the board drawn from it.
// The first phone ([data-frame="main"]) is interactive and drives window.proto.

import { TASKS, buckets, tagParts, parseTw } from '../../shared/data/tasks.js'

// ── Demo mapping: shared contexts -> Android's preset (@home @computer @work @business) ──
const MAP = { '@computer': '@computer', '@anrufe': '@business', '@zuhause': '@home', '@unterwegs': '@home', '@buero': '@work' }
const CHIPS = [null, '@home', '@computer', '@work', '@business'] // null = Alle
const TODAYK = '20261031'
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const HOLD_MS = 6000

function demoTasks() {
  return TASKS.map((t) => {
    const c = JSON.parse(JSON.stringify(t))
    c.id = String(c.id)
    c.tags = [...new Set(tagParts(t).map((p) => MAP[p] || p))]
    // One follow-up day so the board can show the "Nachhaken" state (the shared data has none).
    if (c.description.startsWith('Rückmeldung Vermieter')) c.scheduled = '20261030T080000Z'
    return c
  })
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const day = (tw) => (tw ? tw.slice(0, 8) : null)
const ctxOf = (t) => t.tags.filter((p) => p.startsWith('@'))
const has = (t, tag) => t.tags.includes(tag)
function fmt(tw, withDay = true) {
  const d = parseTw(tw)
  const s = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`
  return withDay ? `${WD[d.getUTCDay()]} ${s}` : s
}
const idOf = (t) => (t.local ? `lokal ${t.uuid.slice(-8)}` : `ID ${t.uuid.slice(-8)}`)
const followDay = (t) => day(t.scheduled)
// Predictable order for the three Jetzt slots: running first, then the earliest due date,
// then priority H, then urgency. The row meta shows the reason (läuft · date · Prio H).
const rank = (a, b) => (!!b.start - !!a.start) || ((a.due || 'z').localeCompare(b.due || 'z')) || ((b.priority === 'H') - (a.priority === 'H')) || (b.urgency - a.urgency)

let localN = 0

class Model {
  constructor(o = {}) {
    Object.assign(this, {
      view: 'jetzt', ctx: '@computer', kbd: false, draft: '', notice: null, tasks: demoTasks(), local: [],
      held: new Set(), online: true, stand: '09:41', menu: null, mehr: false, ct: null, edit: null, enter: new Set(),
      fs: 1,
    }, o)
  }
  open() { return this.tasks.filter((t) => t.status === 'pending' && !this.held.has(t.id)) }
  lists() {
    const open = this.open()
    const b = buckets(open)
    const due = open.filter((t) => t.due && day(t.due) <= TODAYK && !has(t, 'waiting') && !has(t, 'someday'))
      .sort((a, c) => a.due.localeCompare(c.due))
    const dueIds = new Set(due.map((t) => t.id))
    // Android's lenient rule: the context, or no context at all. Fällig is never filtered.
    const ok = (t) => !this.ctx || ctxOf(t).includes(this.ctx) || ctxOf(t).length === 0
    const next = b.next.filter((t) => !dueIds.has(t.id) && ok(t)).sort(rank)
    const inbox = [...this.local.filter((l) => !this.held.has(l.id)), ...b.inbox]
      .sort((a, c) => c.entry.localeCompare(a.entry))
    const waiting = b.waiting.sort((a, c) => {
      const fa = followDay(a) && followDay(a) <= TODAYK, fc = followDay(c) && followDay(c) <= TODAYK
      return (fc - fa) || (a.wait || 'z').localeCompare(c.wait || 'z')
    })
    const nachhaken = waiting.filter((t) => followDay(t) && followDay(t) <= TODAYK).length
    return { due, next, inbox, waiting, nachhaken }
  }
  find(id) { return this.tasks.find((t) => t.id === String(id)) || this.local.find((l) => l.id === String(id)) }
}

// ── Rendering ──────────────────────────────────────────────────────────────────────────
function sb(m, { dark = false } = {}) {
  return `<div class="sb"><span>9:41</span><span class="cam"></span><span class="sys"><span class="sig${m && !m.online ? ' off' : ''}"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px"></i></span><span class="bat"></span></span></div>`
}

function row(t, kind, m) {
  const meta = []
  let status = 'Nächste', cls = ''
  if (kind === 'inbox') {
    status = 'Inbox'
    if (t.local && t.sync === 'queued') { status = 'wartet auf Netz'; meta.push('<span>wartet auf Netz</span>') }
    if (t.local && t.sync === 'failed') { status = 'Nicht gesendet'; meta.push('<span class="fail">Nicht gesendet</span>') }
  } else if (kind === 'waiting') {
    const f = followDay(t)
    if (f && f <= TODAYK) {
      status = 'Nachhaken fällig'; cls = 'follow'
      meta.push(`<span class="nh">${f === TODAYK ? 'Nachhaken heute' : `Nachhaken seit ${fmt(t.scheduled, false)}`}</span>`)
    } else {
      status = 'Wartet'
      if (t.wait) meta.push(`<span>Wiedervorlage ${fmt(t.wait)}</span>`)
      else meta.push(`<span>seit ${fmt(t.entry, false)}</span>`)
    }
    if (t.project) meta.push(`<span>${esc(t.project)}</span>`)
  } else {
    const d = day(t.due)
    if (d && d < TODAYK) { status = 'überfällig'; cls = 'overdue'; meta.push(`<span class="od">überfällig ${fmt(t.due, false)}</span>`) }
    else if (d === TODAYK) { status = 'fällig heute'; cls = 'today'; meta.push('<span>fällig heute</span>') }
    if (t.start) meta.push('<span class="run">läuft</span>')
    if (d && d > TODAYK) meta.push(`<span>${fmt(t.due)}</span>`)
    if (t.priority === 'H') meta.push('<span>Prio H</span>')
    // Jetzt at large font keeps only the reason (überfällig · läuft · date · Prio H), so more of the top 3 fits.
    const lean = m.view === 'jetzt' && m.fs > 1.2
    if (t.project && !lean) meta.push(`<span>${esc(t.project)}</span>`)
    if (!lean && (kind !== 'jetzt' || !m.ctx)) meta.push(`<span>${esc(ctxOf(t).join(' '))}</span>`)
  }
  if (m.enter.has(t.id)) cls += ' enter'
  const sw = m.swipe === t.id ? ' style="--sx:132px"' : ''
  if (sw) cls += ' swiping'
  const menu = m.menu === t.id ? inboxMenu(t) : ''
  return `<div class="row ${cls}" role="listitem" aria-label="${esc(t.description)}, ${status}, ${idOf(t)}" data-id="${t.id}"${sw}>${sw ? '<span class="under" aria-hidden="true">Abhaken</span>' : ''}
    <button class="ring" data-act="tick" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"><span></span></button>
    <div class="txt" data-act="row" data-id="${t.id}" data-kind="${kind}"><div class="d">${esc(t.description)}</div>${meta.length ? `<div class="m">${meta.join('')}</div>` : ''}</div>${menu}</div>`
}

function inboxMenu(t) {
  const items = t.local && t.sync === 'failed'
    ? [['retry', 'Erneut senden'], ['edit', 'Bearbeiten und erneut senden'], ['del', 'Löschen']]
    : [['edit', 'Bearbeiten'], ['del', 'Löschen']]
  return `<div class="menu" role="menu">${items.map(([a, l]) => `<button role="menuitem" data-act="menu-${a}" data-id="${t.id}">${l}</button>`).join('')}</div>`
}

function top(m, label, count) {
  const stand = m.stand ? `Stand ${m.stand}` : 'Noch nicht geladen'
  return `<div class="top"><span class="t"><span class="sl">//</span> ${label}${count != null ? ` · ${count}` : ''} · <span class="stand">${stand}</span>${m.online ? '' : '<span class="stale" title="nicht aktuell"></span>'}</span><button class="mehr" data-act="mehr" aria-label="Mehr">⋮</button></div>${m.mehr ? `<div class="menu mehrmenu" role="menu"><div class="who">Angemeldet als uli</div><button role="menuitem" data-act="mehr">Widget hinzufügen</button><button role="menuitem" data-act="mehr">Protokoll exportieren</button><button role="menuitem" data-act="mehr">Abmelden</button></div>` : ''}${banners(m)}${m.pull ? '<div class="pull" role="status" aria-label="Aktualisiert"><span class="pr"></span><span>aktualisiert · Stand 09:41</span></div>' : ''}`
}

// Pinned banners (inventory 6: "neu einrichten", "Altes Konto: N nicht gesendet" + "Verwerfen"):
// one hairline band each, directly under the top line, on every tab.
function banners(m) {
  if (!m.banners) return ''
  return m.banners.map((b) => `<div class="banner" role="status"><span class="bd"></span><span class="bt">${esc(b.text)}</span>${b.act ? `<button data-act="banner">${esc(b.act)}</button>` : ''}</div>`).join('')
}

function viewJetzt(m, L) {
  const top3 = L.next.slice(0, 3)
  const rest = L.next.length - top3.length
  const ctxName = m.ctx || 'alle Kontexte'
  return `${top(m, m.fs > 1.2 ? 'jetzt' : 'jetzt · Sa 31.10.')}
    <div class="jstack">
    <h2 class="sec"><span class="sl">//</span> <span class="h">Fällig</span> <span>· ${L.due.length}</span></h2>
    <div role="list">${L.due.length ? L.due.map((t) => row(t, 'due', m)).join('') : '<div class="empty">Nichts fällig</div>'}</div>
    <h2 class="h2"><span>Als <em>Nächstes</em></span><button class="ctxbtn" data-act="ctxopen" aria-expanded="${!!m.ctxOpen}" aria-label="Kontext: ${esc(m.ctx || 'Alle')}, ändern"><span>${esc(m.ctx || 'Alle')} <i aria-hidden="true">▾</i></span></button></h2>
    ${m.ctxOpen ? `<div class="chips inl" role="group" aria-label="Kontext">${chipButtons(m)}</div>` : ''}
    <div role="list">${top3.length ? top3.map((t) => row(t, 'jetzt', m)).join('') : `<div class="empty">Keine nächsten Aktionen in ${esc(ctxName)}. <em>Frei.</em></div>`}</div>
    <button class="morelink" data-act="view" data-v="next">${rest > 0 ? `${rest} weitere in ${esc(ctxName)}` : 'Alle nächsten Aktionen'} <span class="sl">→</span></button>
    </div>`
}
function viewInbox(m, L) {
  return `${top(m, 'Inbox', L.inbox.length)}
    <div role="list">${L.inbox.length ? L.inbox.map((t) => row(t, 'inbox', m)).join('') : '<div class="empty">Inbox ist leer. <em>Gut so.</em></div>'}</div>`
}
function viewNext(m, L) {
  return `${top(m, 'Nächste')}
    <h2 class="sec"><span class="sl">//</span> <span class="h">Fällig</span> <span>· ${L.due.length}</span></h2>
    <div role="list">${L.due.length ? L.due.map((t) => row(t, 'due', m)).join('') : '<div class="empty">Nichts fällig</div>'}</div>
    <h2 class="sec" style="margin-top:22px"><span class="sl">//</span> <span class="h">Nächste Aktionen</span> <span>· ${esc(m.ctx || 'Alle')} · ${L.next.length}</span></h2>
    <div role="list">${L.next.length ? L.next.map((t) => row(t, 'next', m)).join('') : '<div class="empty">Keine nächsten Aktionen</div>'}</div>`
}
function viewWaiting(m, L) {
  return `${top(m, 'Warten auf', L.waiting.length)}
    <div role="list">${L.waiting.length ? L.waiting.map((t) => row(t, 'waiting', m)).join('') : '<div class="empty">Du wartest auf nichts</div>'}</div>`
}

function chipButtons(m) {
  return CHIPS.map((c) => `<button class="chip" data-act="chip" data-c="${c || ''}" aria-pressed="${m.ctx === c}"><span>${c || 'Alle'}</span></button>`).join('')
}
// Chip row in the band only on Nächste (pinned there, P08). On Jetzt the context sits in the heading,
// away from the capture field, so the field never reads as "capture into @ctx" (PLAN.md:35).
function chips(m) {
  return `<div class="chips" role="group" aria-label="Kontext">${chipButtons(m)}</div>`
}
function tabs(m, L) {
  const t = (v, label, extra = '') => `<button class="tab" role="tab" data-act="view" data-v="${v}" aria-selected="${m.view === v}"><span>${label}</span>${extra}</button>`
  return `<nav class="tabs" role="tablist">${t('jetzt', 'Jetzt')}${t('inbox', 'Inbox', `<span class="n">${L.inbox.length}</span>`)}${t('next', 'Nächste')}${t('waiting', 'Warten auf', `<span class="n">${L.waiting.length}</span>${L.nachhaken ? '<span class="dot" title="Nachhaken fällig"></span>' : ''}`)}</nav>`
}
function field(m) {
  const lab = m.edit ? `<div class="editlab"><span>// Todo bearbeiten</span><button data-act="edit-cancel">Abbrechen</button></div>` : ''
  const caret = m.static && m.kbd ? '<span class="caret"></span>' : ''
  const input = m.static
    ? `<span style="flex:1;display:flex;align-items:center;min-height:54px">${m.draft ? esc(m.draft) : `<span style="color:var(--mute)">Neues Todo</span>`}${caret}</span>`
    : `<input aria-label="${m.edit ? 'Beschreibung' : 'Neues Todo'}" placeholder="Neues Todo" enterkeyhint="send" autocomplete="off" value="${esc(m.draft)}">`
  return `${lab}<div class="field${m.kbd ? ' focus' : ''}${m.draft ? ' has' : ''}"><div class="inp">${input}<button class="send" data-act="send" aria-label="${m.edit ? 'Speichern' : 'In Inbox'}">↵</button></div></div>`
}
function notice(n) {
  if (!n) return ''
  const left = n.left ?? 1
  return `<div class="notice" role="status"><span class="nt">${esc(n.text)}</span>${n.undo ? '<button data-act="undo">Rückgängig</button>' : ''}${n.undo ? `<i class="tl${n.run ? ' run' : ''}" style="--left:${left};--dur:${(n.dur || HOLD_MS) / 1000}s"></i>` : ''}</div>`
}
export function keyboard(sug = ['Proof', 'Druckerei', 'Rückruf']) {
  const r = (keys, cls = '') => `<div class="kr ${cls}">${keys.map((k) => {
    if (k === '⇧' || k === '⌫') return `<span class="k w" data-act="key" data-k="${k}">${k}</span>`
    if (k === '?123') return `<span class="k w">?123</span>`
    if (k === ' ') return `<span class="k sp" data-act="key" data-k=" ">Deutsch</span>`
    if (k === '↵') return `<span class="k w" data-act="send">↵</span>`
    return `<span class="k" data-act="key" data-k="${k}">${k}</span>`
  }).join('')}</div>`
  return `<div class="kb" aria-hidden="true"><div class="sug">${sug.map((s) => `<span>${s}</span>`).join('')}</div>
    ${r('qwertzuiopü'.split(''))}${r('asdfghjklöä'.split(''), '')}${r(['⇧', ...'yxcvbnm'.split(''), '⌫'])}${r(['?123', ',', ' ', '.', '↵'])}
    <div class="gest"><i></i></div></div>`
}

function renderApp(m) {
  const L = m.lists()
  const body = { jetzt: viewJetzt, inbox: viewInbox, next: viewNext, waiting: viewWaiting }[m.view](m, L)
  const showChips = m.view === 'next'
  const ct = m.ct ? `<div class="ct"><div class="bar"><button data-act="ct-close" aria-label="Schließen">✕</button><span class="url">runway.agentic-reach.com${esc(m.ct)}</span></div><div class="pg"><b>Details im Web</b>Die Web-App öffnet das Todo als Custom Tab. Zurück führt an dieselbe Stelle in der App.</div></div>` : ''
  return `${sb(m)}<div class="body v-${m.view}${m.notice && m.view !== 'jetzt' ? ' withnotice' : ''}" data-act="body">${body}</div>
    <div class="band">${notice(m.notice)}${showChips ? chips(m) : ''}${tabs(m, L)}${field(m)}</div>
    ${m.kbd && !m.realKb ? keyboard(m.sug) : '<div class="gest"><i></i></div>'}${ct}`
}

// ── Interactive phone ──────────────────────────────────────────────────────────────────
function mount(el, m, interactive) {
  m.static = !interactive
  if (m.fs !== 1) el.style.setProperty('--fs', m.fs)
  const draw = () => {
    el.innerHTML = renderApp(m)
    m.enter.clear()
    if (interactive && m.kbd) {
      const inp = el.querySelector('input')
      if (inp && !m.noFocus) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length) }
    }
  }
  m.draw = draw
  draw()
  if (!interactive) return m

  let timer = null
  const setNotice = (n) => {
    clearTimeout(timer)
    m.notice = n
    if (n) timer = setTimeout(() => { if (n.onEnd) n.onEnd(); if (m.notice === n) { m.notice = null; draw() } }, n.dur || HOLD_MS)
  }
  const topIds = () => m.lists().next.slice(0, 3).map((t) => t.id)

  m.tick = (id) => {
    id = String(id)
    const t = m.find(id)
    if (!t || m.held.has(id)) return
    const before = topIds()
    m.held.add(id)
    m.menu = null
    topIds().forEach((x) => { if (!before.includes(x)) m.enter.add(x) })
    const n = { text: 'Erledigt', undo: () => { m.held.delete(id) }, run: true,
      onEnd: () => { if (m.held.has(id)) { m.held.delete(id); if (t.local) m.local = m.local.filter((l) => l !== t); else t.status = 'completed' } } }
    setNotice(n)
    draw()
  }
  m.capture = (text) => {
    const desc = String(text).trim().replace(/\s+/g, ' ').slice(0, 500)
    if (!desc) return
    localN += 1
    const id = `L${localN}`
    const item = { id, uuid: `local-0000-${String(localN).padStart(8, '0')}`, description: desc, local: true,
      sync: m.online ? 'sending' : 'queued', entry: `20261031T2359${String(localN).padStart(2, '0')}Z`, tags: [], status: 'pending' }
    m.local.push(item)
    if (m.online) setTimeout(() => { if (item.sync === 'sending') { item.sync = 'sent'; m.draw() } }, 700)
    setNotice({ text: 'In Inbox ✓', undo: () => { m.local = m.local.filter((l) => l !== item) }, run: true })
    m.draft = ''
    draw()
  }
  m.undo = () => { if (m.notice && m.notice.undo) { m.notice.undo(); m.notice.onEnd = null; setNotice(null); draw() } }

  // Swipe right across a row checks off (pinned); a mostly vertical drag never does.
  let sw = null, swallow = false
  el.addEventListener('pointerdown', (e) => {
    const r = e.target.closest('.row[data-id]')
    if (r && !e.target.closest('.ring, .menu')) sw = { r, x: e.clientX, y: e.clientY, dx: 0 }
  })
  el.addEventListener('pointermove', (e) => {
    if (!sw) return
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { sw.r.style.removeProperty('--sx'); sw = null; return }
    sw.dx = Math.max(0, dx)
    if (sw.dx > 6) { sw.r.classList.add('dragging'); sw.r.style.setProperty('--sx', `${sw.dx}px`) }
  })
  const swEnd = () => {
    if (!sw) return
    const { r, dx } = sw
    sw = null
    r.classList.remove('dragging'); r.style.removeProperty('--sx')
    if (dx > 6) swallow = true
    if (dx > 96) m.tick(r.dataset.id)
  }
  el.addEventListener('pointerup', swEnd)
  el.addEventListener('pointercancel', swEnd)

  el.addEventListener('click', (e) => {
    if (swallow) { swallow = false; return }
    const a = e.target.closest('[data-act]')
    const act = a && a.dataset.act
    if (act !== 'mehr' && m.mehr) { m.mehr = false }
    if (!act || act === 'body') {
      if (e.target.closest('.body') && !e.target.closest('button')) { m.menu = null; if (m.kbd && m.view !== 'inbox') { m.kbd = false } else if (m.kbd) { m.kbd = false } draw() }
      return
    }
    if (act === 'tick') m.tick(a.dataset.id)
    else if (act === 'undo') m.undo()
    else if (act === 'view') { m.view = a.dataset.v; m.menu = null; m.kbd = m.view === 'inbox' || (m.view === 'jetzt' && m.kbd); draw() }
    else if (act === 'ctxopen') { m.ctxOpen = !m.ctxOpen; draw() }
    else if (act === 'chip') { m.ctx = a.dataset.c || null; m.ctxOpen = false; try { localStorage.setItem('m2-jetzt-ctx', m.ctx || '') } catch {} ; const L = m.lists(); L.next.slice(0, 3).forEach((t) => m.enter.add(t.id)); draw() }
    else if (act === 'send') { if (m.edit) saveEdit(); else m.capture(el.querySelector('input')?.value || m.draft) }
    else if (act === 'key') {
      const k = a.dataset.k
      m.draft = k === '⌫' ? m.draft.slice(0, -1) : k === '⇧' ? m.draft : m.draft + k
      draw()
    } else if (act === 'row') {
      const kind = a.dataset.kind
      if (kind === 'inbox') { m.menu = m.menu === a.dataset.id ? null : a.dataset.id; draw() }
      else { const t = m.find(a.dataset.id); m.ct = `/${kind === 'waiting' ? 'waiting' : 'next'}?task=${t.uuid}`; draw() }
    } else if (act === 'menu-del') {
      const id = a.dataset.id, t = m.find(id)
      m.held.add(id); m.menu = null
      setNotice({ text: 'Gelöscht', undo: () => m.held.delete(id), run: true, onEnd: () => { if (m.held.has(id)) { if (t.local) m.local = m.local.filter((l) => l !== t); else t.status = 'deleted' } } })
      draw()
    } else if (act === 'menu-edit') { const t = m.find(a.dataset.id); m.edit = t.id; m.draft = t.description; m.menu = null; m.kbd = true; draw() }
    else if (act === 'menu-retry') { const t = m.find(a.dataset.id); t.sync = m.online ? 'sending' : 'queued'; m.menu = null; setNotice({ text: m.online ? 'Wird gesendet' : 'Wartet auf Netz', dur: 2500 }); draw() }
    else if (act === 'edit-cancel') { m.edit = null; m.draft = ''; draw() }
    else if (act === 'mehr') { m.mehr = !m.mehr; draw() }
    else if (act === 'ct-close') { m.ct = null; draw() }
  })
  function saveEdit() {
    const t = m.find(m.edit)
    const v = (el.querySelector('input')?.value || '').trim()
    if (t && v) t.description = v
    m.edit = null; m.draft = ''
    setNotice({ text: 'Gespeichert', dur: 2500 })
    draw()
  }
  el.addEventListener('focusin', (e) => { if (e.target.matches('input') && !m.kbd) { m.kbd = true; m.noFocus = false; draw() } })
  el.addEventListener('input', (e) => {
    if (!e.target.matches('input')) return
    m.draft = e.target.value
    e.target.closest('.field').classList.toggle('has', !!m.draft)
  })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); if (m.edit) saveEdit(); else m.capture(e.target.value) }
    if (e.key === 'Escape') { if (m.ct) m.ct = null; else if (m.kbd) m.kbd = false; else if (m.view !== 'jetzt') m.view = 'jetzt'; draw() }
  })
  return m
}

// ── Static frames ──────────────────────────────────────────────────────────────────────
const MARK = '../../shared/brand/logos/mark-color.svg'

function frameHome() {
  const m = new Model({ ctx: '@computer' })
  const L = m.lists()
  const rows = [...L.due.map((t) => [t, 'überfällig', 'od']), ...L.next.slice(0, 3).map((t) => [t, t.due ? fmt(t.due) : '', 'q'])].slice(0, 4)
  const more = L.due.length + L.next.length - rows.length
  return `${sb(m)}<div class="home">
    <div class="clock">9:41</div><div class="date">Samstag, 31. Oktober</div>
    <div class="wg phone-in" role="group" aria-label="runway Jetzt">
      <div class="wh"><span class="hd"><picture><source srcset="../../shared/brand/logos/mark-mono-light.svg" media="(prefers-color-scheme: dark)"><img src="${MARK}" alt=""></picture>Inbox ${L.inbox.length} · fällig ${L.due.length}</span><button class="wchip"><span>@computer</span></button><button class="plus" aria-label="+ Todo">+</button></div>
      ${rows.map(([t, mk, c]) => `<div class="wr ${c === 'od' ? 'od' : ''}"><span class="ring" aria-label="Abhaken: ${esc(t.description)}"><span></span></span><span class="d">${esc(t.description)}</span><span class="mk ${c}">${mk}</span></div>`).join('')}
      <div class="wf">${more > 0 ? `<a>+${more} weitere</a>` : '<span></span>'}<span class="st">Stand 09:41</span></div>
    </div>
    <div class="shortcut"><div>Neues Todo</div><div>Inbox</div></div>
    <div class="apps"><div><div class="ic"></div>Kalender</div><div><div class="ic rw"><img src="${MARK}" alt=""></div>runway</div><div><div class="ic"></div>Notizen</div><div><div class="ic"></div>Kamera</div></div>
  </div><div class="gest" style="background:var(--ar-plum)"><i style="background:var(--ar-bg)"></i></div>`
}

function frameTile() {
  return `${sb(null)}<div class="qs">
    <div class="bright"></div>
    <div class="tiles">
      <div class="tile"><span class="gl">·</span><span>Internet<small>WLAN</small></span></div>
      <div class="tile"><span class="gl">·</span><span>Bluetooth<small>aus</small></span></div>
      <div class="tile on"><span class="gl">+</span><span>+ Todo<small>runway</small></span></div>
      <div class="tile"><span class="gl">·</span><span>Taschenlampe<small>aus</small></span></div>
    </div></div>
    <div class="dim"></div>
    <div class="ovl">
      <div class="row-close"><button>Schließen</button></div>
      <div class="notice" role="status"><span class="nt">In Inbox ✓</span><button>Rückgängig</button><i class="tl" style="--left:.55"></i></div>
      ${field({ static: true, kbd: true, draft: 'Rückruf Druckerei wegen Proof' })}
    </div>${keyboard()}`
}

function frameShare() {
  return `${sb(null)}<div class="web">
    <div class="src">example.org · Artikel</div>
    <h4>Agenten-Evaluation: ein Leitfaden</h4>
    <p>Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Kriterien, Stichproben. Ein Vorgehen in vier Schritten, mit Beispielen aus kleinen Teams.</p>
    <p>Erstens: Aufgaben sammeln, die heute Zeit kosten. Zweitens: festlegen, woran man Erfolg erkennt.</p>
    <div class="scrim"></div>
    <div class="card">
      <div class="ey"><span class="sl">//</span> Teilen · in die Inbox</div>
      <h5>Agenten-Evaluation: ein Leitfaden</h5>
      <div class="note">https://example.org/agenten-evaluation-leitfaden · Wie man misst, ob ein Agent im Alltag hilft: Aufgaben, Kriterien, Stichproben.</div>
      <button class="pill">In Inbox</button>
      <div class="foot">Link als Notiz · geht auch offline</div>
    </div></div><div class="gest" style="background:var(--bg)"><i></i></div>`
}

function frameOption() {
  const m = new Model({ view: 'inbox', static: true })
  const L = m.lists()
  const t = L.inbox[1]
  return `${sb(m)}<div class="body" style="opacity:.45">${viewInbox(m, L)}</div>
    <div class="sheet">
      <div class="optband">Option · braucht Ulis Entscheidung</div>
      <div class="ey"><span class="sl">//</span> Kurz klären · 1 von ${L.inbox.length}</div>
      <h5>${esc(t.description)}</h5>
      <div class="grp">Nächste in</div>
      <div class="opts"><button class="ctx">@home</button><button class="ctx">@computer</button><button class="ctx">@work</button><button class="ctx">@business</button></div>
      <div class="grp">oder</div>
      <div class="opts"><button>Warten auf</button><button>Irgendwann</button><button>Erledigt</button><button>Löschen</button></div>
      <a class="web-l">Projekt, Datum, Notiz: im Web klären <span class="sl">→</span></a>
    </div><div class="gest" style="background:var(--bg)"><i></i></div>`
}

const FRAMES = {
  inbox: () => {
    const m = new Model({ view: 'inbox', kbd: true, draft: 'Rückruf Druck', sug: ['Druckerei', 'Druck', 'Drucker'] })
    m.local.push({ id: 'L91', uuid: 'local-0000-00000091', description: 'Folien für den Workshop am Donnerstag', local: true, sync: 'sent', entry: '20261031T094000Z', tags: [], status: 'pending' })
    m.notice = { text: 'In Inbox ✓', undo: true, left: 0.7 }
    return m
  },
  next: () => new Model({ view: 'next', ctx: '@business' }),
  waiting: () => new Model({ view: 'waiting' }),
  tick: () => {
    const m = new Model({ view: 'jetzt', ctx: '@home' })
    m.held.add('16') // "Paket bei der Post abholen"
    m.enter.add('13')
    m.notice = { text: 'Erledigt', undo: true, left: 0.62 }
    return m
  },
  offline: () => {
    const m = new Model({ view: 'inbox', online: false, stand: '09:12', menu: 'L82' })
    m.local.push({ id: 'L81', uuid: 'local-0000-00000081', description: 'Rückruf Druckerei wegen Proof', local: true, sync: 'queued', entry: '20261031T093000Z', tags: [], status: 'pending' })
    m.local.push({ id: 'L82', uuid: 'local-0000-00000082', description: 'Fotos vom Whiteboard sichern', local: true, sync: 'failed', entry: '20261031T091500Z', tags: [], status: 'pending' })
    return m
  },
  dark: () => new Model({ view: 'jetzt', kbd: true, ctx: '@computer' }),
  next150: () => new Model({ view: 'next', ctx: '@business', fs: 1.5 }),
  banners: () => new Model({ view: 'inbox', banners: [
    { text: 'Anmeldung abgelaufen, bitte neu einrichten', act: 'Einrichten' },
    { text: 'Altes Konto: 2 nicht gesendet', act: 'Verwerfen' },
  ] }),
  gestures: () => new Model({ view: 'next', ctx: '@computer', pull: true, swipe: '7' }),
  big: () => new Model({ view: 'jetzt', kbd: true, ctx: '@computer', fs: 1.5 }),
}

for (const el of document.querySelectorAll('[data-frame]')) {
  const f = el.dataset.frame
  if (f === 'main') continue
  if (f === 'home') { el.innerHTML = frameHome(); continue }
  if (f === 'tile') { el.innerHTML = frameTile(); continue }
  if (f === 'share') { el.innerHTML = frameShare(); continue }
  if (f === 'option') { el.innerHTML = frameOption(); continue }
  mount(el, FRAMES[f](), false)
}

// main phone: Jetzt, field focused, keyboard up (as on every app open)
let saved = '@computer'
try { const v = localStorage.getItem('m2-jetzt-ctx'); if (v !== null) saved = v || null } catch {}
const mainEl = document.querySelector('[data-frame="main"]')
// On a real touch phone the system keyboard appears, so the drawn one is left out (no double keyboard).
const realKb = matchMedia('(max-width: 560px) and (pointer: coarse)').matches
const main = mount(mainEl, new Model({ view: 'jetzt', kbd: true, ctx: saved, noFocus: matchMedia('(min-width: 561px)').matches, realKb }), true)

const VIEW = { inbox: 'inbox', next: 'next', waiting: 'waiting', jetzt: 'jetzt' }
window.proto = {
  show(view) {
    if (VIEW[view]) { main.view = VIEW[view]; main.kbd = view === 'inbox' || view === 'jetzt'; main.ct = null }
    else main.ct = `/${view === 'someday' ? 'someday' : 'projects'}` // not on the phone: opens the web
    main.draw()
  },
  filter(context) {
    main.ctx = context ? (MAP[context] || context) : null
    if (main.view !== 'next') main.view = main.view === 'jetzt' ? 'jetzt' : 'next'
    main.draw()
  },
  capture(text) { if (main.view !== 'inbox' && main.view !== 'jetzt') main.view = 'inbox'; main.capture(text) },
  open(id) {
    const t = main.find(id)
    if (t) { main.ct = `/${has(t, 'waiting') ? 'waiting' : 'next'}?task=${t.uuid}`; main.draw() }
  },
  complete(id) { main.tick(id) },
  // Clarifying is not on the phone (PLAN.md non-goal). The hook applies the move as the web would,
  // so the phone shows the result on its next refresh.
  clarify(id, to) {
    const t = main.find(id)
    if (!t) return
    if (to === 'delete') t.status = 'deleted'
    else if (to === 'waiting') t.tags = ['waiting']
    else if (to === 'someday') t.tags = ['someday']
    else if (to.startsWith('next:')) t.tags = [MAP[to.slice(5)] || to.slice(5), 'next']
    main.draw()
  },
  // No 3D signature. The signature moment is the answer itself: tick the first "Als Nächstes"
  // item and the next one moves up, with the undo line running.
  signature() { const t = main.lists().next[0]; if (t) { main.view = 'jetzt'; main.tick(t.id) } },
}
