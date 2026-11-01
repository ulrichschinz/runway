// M1 Daumenzone: one Phone class renders every phone frame on the board. The frame marked
// data-main is the interactive one that window.proto drives. No 3D, no canvas, no WebGL.
//
// Round 2 (after review): lists are ordered by reach, not by reading order. What matters most
// sits next to the dock: in Nächste the "Fällig" section is the last one, overdue right above
// the chips; in the Inbox the newest capture sits right above the field; in Warten auf the
// follow-ups sit lowest. Long lists open scrolled to their bottom end.

import { TASKS, TODAY, tagParts, parseTw } from '../../shared/data/tasks.js'

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const STAND = '09:41'
export const CHIPS = ['Alle', '@home', '@computer', '@work', '@business']
const PULL = 72 // dp a pull has to travel before release refreshes

// The demo data uses web contexts; the Android app has the preset @home @computer @work @business.
const CTX_MAP = { '@computer': '@computer', '@anrufe': '@business', '@zuhause': '@home', '@unterwegs': '@home', '@buero': '@work' }
// Android reads the follow-up day of a waiting todo from `scheduled` (inventory 1.5); the demo has none.
const FOLLOW = { 'Feedback von Nora zum Logo-Entwurf': '2026-10-29', 'Rückmeldung Vermieter zur Kaution': '2026-10-31', 'Unterschrift Pilotkunde': '2026-11-07' }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const dayOf = (tw) => tw ? parseTw(tw).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) : null
const dm = (day) => { const [, m, d] = day.split('-'); return `${d}.${m}.` }
const wdm = (day) => { const [y, m, d] = day.split('-').map(Number); return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${dm(day)}` }
const nextMinute = (hm) => { const [h, m] = hm.split(':').map(Number); const t = h * 60 + m + 1; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.4 5.6 10.3 11.5 3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

let localN = 0
function seed() {
  return TASKS.map((t) => {
    const parts = tagParts(t)
    const ctx = [...new Set(parts.filter((p) => p.startsWith('@')).map((p) => CTX_MAP[p] || p))]
    return { ...t, tags: parts.filter((p) => !p.startsWith('@')), ctx, follow: FOLLOW[t.description] || null, sync: null, local: false }
  })
}
function localTask(description, sync = null) {
  localN += 1
  const hex = (0xa1b2c300 + localN).toString(16)
  return { id: null, uuid: `local-${hex}`, description, status: 'pending', project: null, tags: [], ctx: [], due: null, start: null,
    entry: `20261031T9${String(localN).padStart(5, '0')}Z`, follow: null, sync, local: true, annotations: [] }
}

// Lists in priority order (most important first). The phone draws them reversed, so the most
// important row ends up next to the dock; the widget draws them as they are.
function lists(tasks, filter) {
  const open = tasks.filter((t) => t.status === 'pending')
  const has = (t, tag) => t.tags.includes(tag)
  const inbox = open.filter((t) => !t.project && !t.ctx.length && !has(t, 'waiting') && !has(t, 'someday'))
    .sort((a, b) => (a.entry < b.entry ? 1 : -1))
  const nextAll = open.filter((t) => t.ctx.length && !has(t, 'waiting') && !has(t, 'someday')).sort((a, b) => b.urgency - a.urgency)
  // lenient rule (Android today): the chosen context or no context at all
  const next = filter === 'Alle' ? nextAll : nextAll.filter((t) => t.ctx.includes(filter) || !t.ctx.length)
  const due = open.filter((t) => t.due && dayOf(t.due) <= TODAY).sort((a, b) => (dayOf(a.due) < dayOf(b.due) ? -1 : 1))
  const waiting = open.filter((t) => has(t, 'waiting')).sort((a, b) => {
    const fa = a.follow && a.follow <= TODAY ? 0 : 1, fb = b.follow && b.follow <= TODAY ? 0 : 1
    return (fa - fb) || ((a.follow || '9') < (b.follow || '9') ? -1 : 1)
  })
  return { inbox, next, nextAll, due, waiting }
}
const rev = (a) => [...a].reverse()

function rowInfo(t, kind) {
  const meta = []
  let status = 'Inbox', cls = ''
  if (kind === 'inbox') {
    if (t.sync === 'net') { status = 'wartet auf Netz'; meta.push('<span>wartet auf Netz</span>') }
    if (t.sync === 'failed') { status = 'Nicht gesendet'; meta.push('<span class="err">Nicht gesendet</span>') }
    if (t.sync === 'setup') { status = 'wartet auf Setup'; meta.push('<span>wartet auf Setup</span>') }
  } else if (kind === 'next' || kind === 'due') {
    status = 'Nächste'
    const d = dayOf(t.due)
    if (d && d < TODAY) { status = 'überfällig'; cls = 'overdue'; meta.push(`<span class="od">überfällig ${dm(d)}</span>`) }
    else if (d === TODAY) { status = 'fällig heute'; meta.push('<span>fällig heute</span>') }
    else if (d) meta.push(`<span>${wdm(d)}</span>`)
    if (t.start) meta.push('<span class="live">läuft</span>')
    if (t.project) meta.push(`<span>${esc(t.project)}</span>`)
    if (t.ctx.length) meta.push(`<span>${t.ctx.join(' ')}</span>`)
    if (t.sync === 'failed') meta.push('<span class="err">Abhaken nicht gesendet</span>')
  } else if (kind === 'waiting') {
    status = 'Wartet'
    if (t.follow && t.follow <= TODAY) {
      status = 'Nachhaken fällig'; cls = 'follow'
      meta.push(`<span class="fu">${t.follow === TODAY ? 'Nachhaken heute' : `Nachhaken seit ${dm(t.follow)}`}</span>`)
    } else if (t.follow) meta.push(`<span>Wiedervorlage ${dm(t.follow)}</span>`)
    if (t.project) meta.push(`<span>${esc(t.project)}</span>`)
  }
  const id = t.local ? `lokal ${t.uuid.slice(-8)}` : `ID ${t.uuid.slice(-8)}`
  return { label: `${t.description}, ${status}, ${id}`, meta: meta.join(''), cls }
}

const HEADS = {
  inbox: { name: 'Inbox', h: 'Kopf <em>frei</em>' },
  next: { name: 'Nächste', h: 'Was jetzt <em>zählt</em>' },
  waiting: { name: 'Warten auf', h: 'Was <em>andere</em> tun' },
}

const KEYS = ['qwertzuiopü', 'asdfghjklöä', '⇧yxcvbnm⌫']
const kbHTML = () => `<div class="sug"><span>Rückruf</span><span>Rechnung</span><span>Idee</span></div>
  ${KEYS.map((r) => `<div class="kr">${[...r].map((k) => `<button tabindex="-1" class="${k === '⇧' || k === '⌫' ? 'w' : ''}" data-key="${k}">${k}</button>`).join('')}</div>`).join('')}
  <div class="kr"><button tabindex="-1" class="w" data-key="">?123</button><button tabindex="-1" data-key=",">,</button><button tabindex="-1" class="sp" data-key=" ">Deutsch</button><button tabindex="-1" data-key=".">.</button><button tabindex="-1" class="w ent" data-key="↵" aria-label="Fertig">↵</button></div>`

const NARROW = innerWidth <= 640

export class Phone {
  constructor(host, opts = {}) {
    this.o = { tab: 'inbox', filter: 'Alle', kbd: false, hand: 'right', fs: 1, offline: false, stand: STAND, ...opts }
    // At phone width the page is the phone: no drawn keyboard, so the keyboard state follows real focus.
    this.narrow = !!this.o.main && NARROW
    if (this.narrow) this.o.kbd = false
    this.tasks = seed()
    this.tab = this.o.tab
    this.filter = this.o.filter
    this.kbd = !!this.o.kbd
    this.hand = this.o.hand
    this.stand = this.o.stand
    this.offline = !!this.o.offline
    this.banners = this.o.banners || []
    this.editing = null
    this.fb = 0 // distance of the scroll position from the bottom end; 0 = anchored at the dock
    this.build(host)
    this.render()
  }

  build(host) {
    const s = document.createElement('div')
    s.className = 'screen'
    if (this.o.theme) s.dataset.theme = this.o.theme
    s.style.setProperty('--fs', this.o.fs)
    if (this.o.fs > 1.2) s.classList.add('big')
    if (this.o.kbd && !this.o.main) s.classList.add('ff') // static frame: the drawn keyboard implies a focused field
    s.innerHTML = `
      <div class="statusbar"><span>9:41</span><span class="cam"></span><span class="sys">${this.offline ? '<span>offline</span>' : ''}<span class="sig${this.offline ? ' off' : ''}"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:11px"></i></span><span class="bat"></span></span></div>
      <header class="head" data-r="head"></header>
      <div class="content" data-r="content">
        <div class="pull" data-r="pull" aria-hidden="true"><span data-r="pulltxt"></span><i></i></div>
        <div class="stack" data-r="stack"><div class="title" data-r="title"></div><div class="list" role="list" data-r="list"></div></div>
      </div>
      <div class="dock" data-r="dock">
        <div class="notice" role="status" aria-live="polite" data-r="notice"></div>
        <div class="banners" data-r="banners"></div>
        <div class="outline" data-r="outline"></div>
        <div class="chips" role="group" aria-label="Kontext" data-r="chips"></div>
        <nav class="tabs" role="tablist" data-r="tabs"></nav>
        <div class="editbar"><b data-r="edittitle">Todo bearbeiten</b><button class="pill quiet" data-act="editcancel">Abbrechen</button><button class="pill action" data-act="editsave">Speichern</button></div>
        <form class="fieldrow" autocomplete="off" data-r="form"><label class="field" data-reach="Neues Todo"><input data-r="input" aria-label="Neues Todo" placeholder="Neues Todo" enterkeyhint="done"><button class="go" type="submit" aria-label="In die Inbox" data-reach="Senden">+</button></label></form>
      </div>
      <div class="kb" data-r="kb" aria-hidden="true">${kbHTML()}</div>
      <div class="gesture"><i></i></div>
      <div class="scrim" data-r="scrim"></div>
      <div class="sheet" role="dialog" aria-modal="true" data-r="sheet"></div>
      <div class="ctab" role="dialog" aria-label="Details im Browser" data-r="ctab"></div>`
    host.appendChild(s)
    this.s = s
    this.r = Object.fromEntries([...s.querySelectorAll('[data-r]')].map((e) => [e.dataset.r, e]))
    this.wire()
  }

  get L() { return lists(this.tasks, this.filter) }

  // keep the list anchored at the dock whenever its size or the dock's size changes
  anchor() { const c = this.r.content; c.scrollTop = Math.max(0, c.scrollHeight - c.clientHeight - this.fb) }

  render() {
    const { s, r } = this
    const L = this.L
    s.dataset.view = this.tab
    s.dataset.hand = this.hand
    s.classList.toggle('kbd', this.kbd)
    s.classList.toggle('editing', !!this.editing)
    // head: read-only eyebrow with Stand, always at the top
    const H = HEADS[this.tab]
    r.head.innerHTML = `<div class="eyebrow"><span class="slash">//</span><span>${H.name}</span><span>·</span><span class="stand${this.fresh ? ' fresh' : ''}">Stand ${this.stand}</span></div>`
    // title: heading and summary sit directly above the list, so a short list never floats away from its heading
    let sum = ''
    if (this.tab === 'inbox') {
      const old = L.inbox.filter((t) => !t.local).map((t) => dayOf(t.entry)).sort()[0]
      sum = `${L.inbox.length} Todos${old ? ` · ältestes ${dm(old)}` : ''} · neueste unten`
    } else if (this.tab === 'next') sum = `${L.due.length} fällig · ${L.next.length} Aktionen${this.filter !== 'Alle' ? ` · ${this.filter} und ohne Kontext` : ''}`
    else sum = `${L.waiting.filter((t) => t.follow && t.follow <= TODAY).length} zum Nachhaken · ${L.waiting.length} offen`
    r.title.innerHTML = `<h1>${H.h}</h1><div class="sum">${sum}</div>`
    // list, drawn in reach order: the most important row lands next to the dock
    const row = (t, kind) => {
      const i = rowInfo(t, kind)
      return `<div class="row ${i.cls}" role="listitem" tabindex="0" aria-label="${esc(i.label)}" data-uuid="${t.uuid}" data-kind="${kind}">
        <div class="main"><div class="txt">${esc(t.description)}</div>${i.meta ? `<div class="meta">${i.meta}</div>` : ''}</div>
        <button class="ring" aria-label="Abhaken: ${esc(t.description)}" data-act="done" data-reach="Abhaken">${CHECK}</button></div>`
    }
    let html = ''
    if (this.tab === 'inbox') html = L.inbox.length ? rev(L.inbox).map((t) => row(t, 'inbox')).join('') : '<div class="empty">Inbox ist leer</div>'
    if (this.tab === 'next') {
      html = `<div class="sec" role="heading" aria-level="2">Nächste Aktionen<span>· ${L.next.length}</span></div>`
        + (L.next.length ? rev(L.next).map((t) => row(t, 'next')).join('') : '<div class="empty">Keine nächsten Aktionen</div>')
        + `<div class="sec due" role="heading" aria-level="2">Fällig<span>· ${L.due.length}</span></div>`
        + (L.due.length ? rev(L.due).map((t) => row(t, 'due')).join('') : '<div class="empty">Nichts fällig</div>')
    }
    if (this.tab === 'waiting') html = L.waiting.length ? rev(L.waiting).map((t) => row(t, 'waiting')).join('') : '<div class="empty">Du wartest auf nichts</div>'
    r.list.innerHTML = html
    // banners: one 48 dp line each, inside the dock (no reach exception for "Verwerfen")
    r.banners.innerHTML = this.banners.map((b) => {
      if (b === 'connected') return '<div class="bn ok"><span class="slash">//</span><span>Verbunden als uli</span></div>'
      if (b === 'rekey') return '<button class="bn err" data-act="rekey" data-reach="neu einrichten"><span>Key abgelehnt – neu einrichten</span><span class="go-r">›</span></button>'
      if (b === 'old') return '<div class="bn"><span>Altes Konto: 2 nicht gesendet</span><button class="bb" data-act="discard" data-reach="Verwerfen">Verwerfen</button></div>'
      if (b === 'old-ask') return '<div class="bn ask"><span>2 Todos endgültig verwerfen?</span><button class="bb" data-act="discard-no">Abbrechen</button><button class="bb err" data-act="discard-yes" data-reach="Verwerfen">Verwerfen</button></div>'
      return ''
    }).join('')
    // outbox line, right above the chips and tabs
    const cnt = (k) => this.tasks.filter((t) => t.status === 'pending' && t.sync === k).length
    const net = cnt('net'), failed = cnt('failed'), setup = cnt('setup')
    const bits = []
    if (net) bits.push(`<span>${net} wartet auf Netz</span>`)
    if (setup) bits.push(`<span>${setup} wartet auf Setup</span>`)
    if (failed) bits.push(`<button class="err" data-act="failed" data-reach="Nicht gesendet">${failed} Nicht gesendet</button>`)
    r.outline.innerHTML = bits.length && this.tab === 'inbox' ? `<span class="slash">//</span>${bits.join('<span>·</span>')}` : ''
    // chips (Nächste only), just above the tabs
    r.chips.style.display = this.tab === 'next' ? '' : 'none'
    r.chips.innerHTML = CHIPS.map((c) => `<button class="chip" aria-pressed="${c === this.filter}" data-chip="${c}" data-reach="${c}"><span>${c}</span></button>`).join('')
    // tabs
    const tab = (id, label, n) => `<button class="tab" role="tab" aria-selected="${this.tab === id}" data-tab="${id}" data-reach="${label}"><span>${label}</span><span class="n">${n}</span></button>`
    r.tabs.innerHTML = tab('inbox', 'Inbox', L.inbox.length) + tab('next', 'Nächste', L.nextAll.length) + tab('waiting', 'Warten auf', L.waiting.length)
      + '<button class="tab more" aria-label="Mehr" data-act="more" data-reach="Mehr">···</button>'
    this.anchor()
  }

  wire() {
    const { s, r } = this
    r.form.addEventListener('submit', (e) => { e.preventDefault(); this.editing ? this.saveEdit() : this.capture(r.input.value) })
    r.input.addEventListener('focus', () => { if (!this.kbd) { this.kbd = true; this.render() } })
    // at phone width the real keyboard closes on blur; delayed so a tap on a tab or ring lands first
    r.input.addEventListener('blur', () => {
      if (!this.narrow) return
      setTimeout(() => { if (document.activeElement !== r.input && this.kbd && !this.editing) { this.kbd = false; this.render() } }, 160)
    })
    // keep focus (and the keyboard) when tapping a key, a ring or Rückgängig
    s.addEventListener('mousedown', (e) => { if (e.target.closest('.kb, .ring, .notice, .go, .chip, [data-act="editsave"]')) e.preventDefault() })
    r.kb.addEventListener('click', (e) => {
      const k = e.target.closest('[data-key]')?.dataset.key
      if (k == null) return
      if (k === '↵') return this.editing ? this.saveEdit() : this.capture(r.input.value)
      if (k === '⌫') r.input.value = r.input.value.slice(0, -1)
      else if (k !== '⇧') r.input.value += r.input.value.length === 0 ? k.toUpperCase() : k
    })
    s.addEventListener('click', (e) => {
      if (this.swiped) { this.swiped = false; return }
      const t = e.target
      const tabB = t.closest('[data-tab]')
      if (tabB) return this.show(tabB.dataset.tab)
      const chip = t.closest('[data-chip]')
      if (chip && !chip.closest('.sheet')) return this.setFilter(chip.dataset.chip)
      const act = t.closest('[data-act]')?.dataset.act
      const row = t.closest('.row')
      if (act === 'done' && row) return this.complete(row.dataset.uuid)
      if (act) return this.action(act, t.closest('[data-act]'))
      if (t.closest('[data-r="scrim"]')) return this.closeSheets()
      if (row) return this.open(row.dataset.uuid)
      if (t.closest('[data-r="content"]') || t.closest('[data-r="head"]')) { // tap beside: keyboard down, draft kept
        if (this.kbd) { this.kbd = false; r.input.blur(); this.render() }
      }
    })
    s.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('row')) this.open(e.target.dataset.uuid)
      if (e.key === 'Escape') this.closeSheets()
    })
    // only a scroll the person caused moves the anchor; layout changes (fonts, notice, rows) keep it
    for (const ev of ['wheel', 'touchstart', 'keydown']) r.content.addEventListener(ev, () => { this.user = true }, { passive: true })
    r.content.addEventListener('scroll', () => { if (!this.user) return; const c = r.content; this.fb = Math.max(0, c.scrollHeight - c.scrollTop - c.clientHeight) }, { passive: true })
    if ('ResizeObserver' in window) new ResizeObserver(() => this.anchor()).observe(r.stack), new ResizeObserver(() => this.anchor()).observe(r.content)
    this.wireSwipe()
    this.wirePull()
  }

  // swipe right = check off, armed past 35 % of the width (min 96 dp)
  wireSwipe() {
    let st = null
    this.r.list.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.row')
      if (!row || e.target.closest('.ring')) return
      st = { row, x: e.clientX, y: e.clientY, on: false, w: row.offsetWidth }
    })
    this.r.list.addEventListener('pointermove', (e) => {
      if (!st) return
      const dx = e.clientX - st.x, dy = e.clientY - st.y
      if (!st.on) {
        if (Math.abs(dy) > 10) { st = null; return }
        if (dx > 10 && dx > Math.abs(dy)) { st.on = true; st.row.setPointerCapture(e.pointerId); st.row.classList.add('swiping') }
        else return
      }
      const d = Math.max(0, dx)
      st.row.style.setProperty('--dx', `${d}px`)
      st.row.classList.toggle('armed', d >= Math.max(0.35 * st.w, 96))
    })
    const end = () => {
      if (!st) return
      const { row, on } = st
      st = null
      if (!on) return
      this.swiped = true
      setTimeout(() => { this.swiped = false }, 0)
      row.classList.remove('swiping')
      if (row.classList.contains('armed')) this.complete(row.dataset.uuid)
      else { row.classList.add('settle'); row.style.setProperty('--dx', '0px'); setTimeout(() => row.classList.remove('settle'), 200) }
    }
    this.r.list.addEventListener('pointerup', end)
    this.r.list.addEventListener('pointercancel', end)
  }

  // pull down anywhere in the content area (the empty band included) while the list is at its
  // top end: a 1 px yellow line fills, release past 72 dp refreshes. No spinner; "Stand" updates.
  wirePull() {
    const c = this.r.content
    let p = null
    c.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ring') || c.scrollTop > 0) return
      p = { x: e.clientX, y: e.clientY, on: false, d: 0 }
    })
    c.addEventListener('pointermove', (e) => {
      if (!p) return
      const k = 412 / this.s.getBoundingClientRect().width
      const dx = (e.clientX - p.x) * k, dy = (e.clientY - p.y) * k
      if (!p.on) {
        if (dy > 10 && dy > Math.abs(dx)) p.on = true
        else if (Math.abs(dx) > 10 || dy < -10) { p = null; return }
        else return
      }
      p.d = Math.max(0, dy)
      this.pullShow(p.d)
    })
    const end = () => {
      if (!p) return
      const { on, d } = p
      p = null
      if (!on) return
      this.swiped = true
      setTimeout(() => { this.swiped = false }, 0)
      this.pullShow(0)
      if (d >= PULL) this.refresh()
    }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
    c.addEventListener('pointerleave', end)
  }

  pullShow(d) {
    const { pull, pulltxt } = this.r
    pull.classList.toggle('on', d > 0)
    pull.classList.toggle('armed', d >= PULL)
    pull.style.setProperty('--p', Math.min(1, d / PULL))
    pulltxt.textContent = d >= PULL ? 'Loslassen: aktualisieren' : 'Ziehen: aktualisieren'
  }

  refresh() {
    if (this.offline) return this.notice(`Kein Netz · Stand ${this.stand}`)
    this.stand = nextMinute(this.stand)
    this.fresh = true; this.render()
    clearTimeout(this.ft); this.ft = setTimeout(() => { this.fresh = false; this.render() }, 1200)
  }

  find(uuid) { return this.tasks.find((t) => t.uuid === uuid || String(t.id) === String(uuid) || t.description === uuid) }

  show(tab) {
    if (!HEADS[tab]) return
    this.tab = tab
    this.closeSheets(false)
    // Inbox opens with the field focused; Nächste and Warten auf without keyboard (contract).
    // At phone width the real keyboard only comes with a tap into the field.
    if (this.o.main && !this.narrow) {
      this.kbd = tab === 'inbox'
      if (tab === 'inbox') this.r.input.focus({ preventScroll: true }); else this.r.input.blur()
    } else if (tab !== 'inbox') { this.kbd = false; this.r.input.blur() }
    this.fb = 0
    this.render()
  }

  setFilter(c) { this.filter = CHIPS.includes(c) ? c : 'Alle'; this.fb = 0; this.render() }

  // the notice takes its own line at the top of the dock: it pushes the list up instead of covering a row
  notice(text, undo, { hold = false, ms = 6000 } = {}) {
    const n = this.r.notice
    clearTimeout(this.nt)
    n.innerHTML = `<span class="what">${esc(text)}</span>${undo ? '<button class="undo" data-act="undo" data-reach="Rückgängig">Rückgängig</button>' : ''}${undo ? '<i class="timer"></i>' : ''}`
    n.classList.remove('show', 'hold'); void n.offsetWidth
    n.classList.add('show')
    if (hold) n.classList.add('hold')
    this.undoFn = undo
    if (!hold) this.nt = setTimeout(() => { n.classList.remove('show'); this.undoFn = null }, undo ? ms : 4000)
    this.anchor()
  }

  capture(text) {
    const d = String(text || '').replace(/\s+/g, ' ').trim()
    if (!d) return null
    const t = localTask([...d].slice(0, 500).join(''), this.offline ? 'net' : null)
    this.tasks.push(t)
    this.r.input.value = ''
    this.fb = 0
    this.render()
    this.notice('In Inbox ✓', () => { this.tasks = this.tasks.filter((x) => x !== t); this.render() })
    return t.uuid
  }

  complete(uuid) {
    const t = this.find(uuid)
    if (!t || t.status !== 'pending') return false
    const el = this.r.list.querySelector(`.row[data-uuid="${t.uuid}"]`)
    const finish = () => {
      t.status = 'held' // held 6 s in the outbox, then sent; Rückgängig takes it back
      this.render()
      this.notice(`Erledigt: ${t.description}`, () => { t.status = 'pending'; this.render() })
    }
    if (el && !REDUCED) {
      el.classList.remove('armed'); el.classList.add('done')
      el.style.height = `${el.offsetHeight}px`
      setTimeout(() => { el.classList.add('gone') }, 120)
      setTimeout(finish, 300)
    } else finish()
    return true
  }

  open(uuid) {
    const t = this.find(uuid)
    if (!t) return
    this.kbd = false; this.r.input.blur(); this.render()
    const row = this.r.list.querySelector(`.row[data-uuid="${t.uuid}"]`)
    if (row?.dataset.kind === 'inbox' || (!row && this.L.inbox.includes(t))) return this.menu(t)
    // Nächste / Warten auf: partial Custom Tab from the bottom, on the web route with the uuid
    const path = t.tags.includes('waiting') ? 'waiting' : 'next'
    this.r.ctab.innerHTML = `<div class="bar"><button class="x" aria-label="Schließen" data-act="close">×</button><span class="url">runway.agentic-reach.com/${path}?task=${t.uuid}</span></div>
      <div class="body"><div class="eyebrow"><span class="slash">//</span><span>Web · Details</span></div><h3>${esc(t.description)}</h3>
      <p>${t.project ? `Projekt ${esc(t.project)}. ` : ''}${t.ctx.join(' ')}</p><p>Die Web-App öffnet als Custom Tab in halber Höhe. Wischen nach unten oder Zurück schließt ihn.</p></div>`
    this.r.ctab.classList.add('on'); this.r.scrim.classList.add('on')
  }

  menu(t, { option = false } = {}) {
    this.cur = t
    const failed = t.sync === 'failed'
    const items = failed
      ? [['resend', 'Erneut senden'], ['edit', 'Bearbeiten und erneut senden'], ['delete', 'Löschen', 'danger']]
      : [['edit', 'Bearbeiten'], ['delete', 'Löschen', 'danger']]
    const opt = option ? `<div class="optbox"><div class="eyebrow"><span class="slash">//</span><span>Option · braucht Ulis Entscheidung</span></div>
        <div class="eyebrow" style="color:var(--rw-text)"><span>Nach Nächste, mit Kontext</span></div>
        <div class="chips">${CHIPS.slice(1).map((c) => `<button class="chip" data-act="opt" data-to="next:${c}"><span>${c}</span></button>`).join('')}</div>
        <button class="it" data-act="opt" data-to="waiting">Warten auf<span class="k">fragt nach dem Tag</span></button>
        <button class="it" data-act="opt" data-to="someday">Irgendwann</button></div>` : ''
    this.r.sheet.innerHTML = `<div class="grab"></div><div class="st"><div class="eyebrow"><span class="slash">//</span><span>${failed ? 'Nicht gesendet' : 'Inbox'}</span></div><div class="t">${esc(t.description)}</div></div>
      ${items.map(([a, l, c]) => `<button class="it ${c || ''}" data-act="${a}" data-reach="${l}">${l}</button>`).join('')}${opt}`
    this.r.sheet.classList.add('on'); this.r.scrim.classList.add('on')
  }

  more() {
    this.r.sheet.innerHTML = `<div class="grab"></div><div class="st"><div class="eyebrow"><span class="slash">//</span><span>Mehr</span></div></div>
      <div class="it static">Angemeldet als uli</div>
      <button class="it" data-act="noop">Widget hinzufügen</button>
      <button class="it" data-act="noop">Protokoll exportieren</button>
      <div class="it static" style="color:var(--rw-text)">Daumen<span class="seg" role="group" aria-label="Daumen"><button data-act="hand" data-h="left" aria-pressed="${this.hand === 'left'}">links</button><button data-act="hand" data-h="right" aria-pressed="${this.hand === 'right'}">rechts</button></span></div>
      <button class="it danger" data-act="noop">Abmelden</button>`
    this.r.sheet.classList.add('on'); this.r.scrim.classList.add('on')
  }

  // one-time hint right after setup, as a sheet from the bottom ("OK" on the thumb side)
  tileHint() {
    this.r.sheet.innerHTML = `<div class="grab"></div><div class="st"><div class="eyebrow"><span class="slash">//</span><span>Einmalig</span></div>
      <div class="t">Zieh die Kachel + Todo in die erste Reihe</div>
      <p class="sp">Dann erreichst du das Feld von überall mit einem Wisch und einem Tap, auch auf dem Sperrbildschirm.</p></div>
      <div class="qsmini" aria-hidden="true"><span>Internet</span><span class="on">+ Todo</span><span>Bluetooth</span><span>Taschenlampe</span></div>
      <div class="sheetact"><button class="pill action" data-act="close" data-reach="OK">OK</button></div>`
    this.r.sheet.classList.add('on'); this.r.scrim.classList.add('on')
  }

  closeSheets(render = true) {
    this.r.sheet.classList.remove('on'); this.r.ctab.classList.remove('on'); this.r.scrim.classList.remove('on')
    if (render) this.render()
  }

  action(act, el) {
    const t = this.cur
    if (act === 'undo') { const f = this.undoFn; this.undoFn = null; this.r.notice.classList.remove('show'); f && f(); this.anchor(); return }
    if (act === 'more') { this.kbd = false; this.r.input.blur(); this.render(); return this.more() }
    if (act === 'close' || act === 'noop') return this.closeSheets()
    if (act === 'hand') { this.hand = el.dataset.h; this.more(); return this.render() }
    if (act === 'failed') { const f = this.tasks.find((x) => x.sync === 'failed' && x.status === 'pending'); return f && this.menu(f) }
    if (act === 'rekey') return this.notice('Öffnet runway einrichten')
    if (act === 'discard') { this.banners = this.banners.map((b) => (b === 'old' ? 'old-ask' : b)); return this.render() }
    if (act === 'discard-no') { this.banners = this.banners.map((b) => (b === 'old-ask' ? 'old' : b)); return this.render() }
    if (act === 'discard-yes') { this.banners = this.banners.filter((b) => b !== 'old-ask'); this.render(); return this.notice('2 Todos verworfen') }
    if (act === 'delete' && t) {
      this.closeSheets(); t.status = 'held'; this.render()
      return this.notice('Gelöscht', () => { t.status = 'pending'; this.render() })
    }
    if (act === 'resend' && t) { t.sync = this.offline ? 'net' : null; this.closeSheets(); return this.notice(this.offline ? 'Wartet auf Netz' : 'Gesendet') }
    if (act === 'edit' && t) {
      this.closeSheets(false); this.editing = t
      this.r.edittitle.textContent = t.sync === 'failed' ? 'Bearbeiten und erneut senden' : 'Todo bearbeiten'
      this.r.input.setAttribute('aria-label', 'Beschreibung'); this.r.input.value = t.description
      this.kbd = true; this.render(); this.r.input.focus({ preventScroll: true }); return
    }
    if (act === 'editcancel') return this.endEdit()
    if (act === 'editsave') return this.saveEdit()
    if (act === 'opt' && t) {
      const to = el.dataset.to
      this.closeSheets()
      t.status = 'held'; this.render()
      return this.notice(to.startsWith('next') ? `Nach Nächste ${to.slice(5)}` : to === 'waiting' ? 'Nach Warten auf' : 'Nach Irgendwann', () => { t.status = 'pending'; this.render() })
    }
  }

  saveEdit() {
    const d = this.r.input.value.replace(/\s+/g, ' ').trim()
    if (d && this.editing) { this.editing.description = d; if (this.editing.sync === 'failed') this.editing.sync = this.offline ? 'net' : null }
    this.endEdit()
  }
  endEdit() { this.editing = null; this.r.input.value = ''; this.r.input.setAttribute('aria-label', 'Neues Todo'); this.render() }

  // Thumb reach: distance of every tap target from the thumb pivot of a one-handed grip.
  // Easy is a ring band, not a disc: closer than 120 dp to the pivot the thumb has to curl in
  // (the bottom corner on the thumb side), which counts as stretch.
  reach() {
    const box = this.s.getBoundingClientRect()
    const k = 412 / box.width
    const px = this.hand === 'left' ? -18 : 430, py = 830
    const seen = new Set()
    return [...this.s.querySelectorAll('[data-reach]')].filter((el) => el.offsetParent && el.closest('.screen') === this.s).map((el) => {
      const b = el.getBoundingClientRect()
      const x = (b.left + b.width / 2 - box.left) * k, y = (b.top + b.height / 2 - box.top) * k
      if (y < 0 || y > 915) return null
      // only what a finger can actually hit (not rows scrolled out of the content area)
      const c = el.closest('[data-r="content"]')?.getBoundingClientRect()
      if (c && (b.top + b.height / 2 < c.top || b.top + b.height / 2 > c.bottom)) return null
      const rr = Math.round(Math.hypot(x - px, y - py))
      const label = el.dataset.reach
      const key = label === 'Abhaken' ? `${label}${Math.round(y)}` : label
      if (seen.has(key)) return null
      seen.add(key)
      const zone = rr < 120 ? 'Strecken' : rr <= 400 ? 'leicht' : rr <= 500 ? 'Strecken' : 'schwer'
      const row = el.closest('.row')
      return { label, what: row ? row.querySelector('.txt').textContent : undefined, x: Math.round(x), y: Math.round(y), r: rr, zone }
    }).filter(Boolean)
  }

  showReach(on = true) {
    this.s.querySelector('.reach')?.remove()
    if (!on) return
    const pts = this.reach()
    const px = this.hand === 'left' ? -18 : 430, py = 830
    const easy = pts.filter((p) => p.zone === 'leicht').length
    const rings = pts.filter((p) => p.label === 'Abhaken')
    const dot = (p) => p.zone === 'leicht' ? `<circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--rw-text)" stroke="var(--rw-bg)" stroke-width="2"/>`
      : p.zone === 'Strecken' ? `<circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--rw-bg)" stroke="var(--rw-text)" stroke-width="2"/>`
        : `<path d="M${p.x - 5} ${p.y - 5}l10 10M${p.x + 5} ${p.y - 5}l-10 10" stroke="var(--rw-overdue)" stroke-width="2.4"/>`
    const d = document.createElement('div')
    d.className = 'reach'
    d.innerHTML = `<svg viewBox="0 0 412 915" width="100%" height="100%" aria-hidden="true">
      <circle cx="${px}" cy="${py}" r="500" fill="var(--rw-select)" opacity="0.25"/>
      <circle cx="${px}" cy="${py}" r="400" fill="var(--rw-select)" opacity="0.5"/>
      <circle cx="${px}" cy="${py}" r="120" fill="var(--rw-bg)" opacity="0.55"/>
      <circle cx="${px}" cy="${py}" r="400" fill="none" stroke="var(--ar-yellow)" stroke-width="2"/>
      <circle cx="${px}" cy="${py}" r="500" fill="none" stroke="var(--rw-text)" stroke-width="1" stroke-dasharray="4 5" opacity="0.5"/>
      <circle cx="${px}" cy="${py}" r="120" fill="none" stroke="var(--rw-text)" stroke-width="1" stroke-dasharray="4 5" opacity="0.5"/>
      ${pts.map(dot).join('')}</svg>
      <div class="lbl"><b>// Reichweite, rechter Daumen</b><br>${easy} von ${pts.length} Zielen leicht (120-400 dp vom Daumenansatz), Haken: ${rings.filter((p) => p.zone === 'leicht').length} von ${rings.length}.<br>● leicht · ○ Strecken (&lt; 120 oder ≤ 500 dp) · × schwer</div>`
    this.s.appendChild(d)
    return pts
  }
}

// ── Android-only surfaces ─────────────────────────────────────

function widget(host) {
  const tasks = seed()
  const max = Number(host.dataset.rows || 4)
  let chip = 'Alle', undo = null
  const draw = () => {
    const L = lists(tasks, chip)
    const due = L.due.filter((t) => t.status === 'pending')
    const rows = [...due, ...L.next.filter((t) => !due.includes(t))]
    const shown = rows.slice(0, max)
    host.querySelector('.wid').innerHTML = `
      <div class="wh"><button class="t" aria-label="Neu laden">Inbox ${L.inbox.length} · fällig ${due.length}</button>
        <button class="chip" data-wchip aria-label="Kontext ${chip}"><span>${chip}</span></button></div>
      ${shown.map((t) => { const d = dayOf(t.due); const od = d && d < TODAY; return `<div class="wr ${od ? 'od' : ''} ${t.status === 'held' ? 'done' : ''}"><span class="d">${esc(t.description)}</span>${od ? '<span class="m">überfällig</span>' : d === TODAY ? '<span class="m today">heute</span>' : ''}<button class="ring" aria-label="Abhaken: ${esc(t.description)}" data-wdone="${t.uuid}">${CHECK}</button></div>` }).join('')}
      <div class="wf">${undo ? `<span>Erledigt</span><button class="undo" data-wundo>Rückgängig</button>` : `<button class="more">+${Math.max(0, rows.length - shown.length)} weitere</button><span>·</span><span>Stand ${STAND}</span>`}<span class="sp"></span><button class="plus" aria-label="+ Todo">+</button></div>`
  }
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-wchip]')) { chip = CHIPS[(CHIPS.indexOf(chip) + 1) % CHIPS.length]; return draw() }
    const d = e.target.closest('[data-wdone]')
    if (d) {
      const t = tasks.find((x) => x.uuid === d.dataset.wdone); t.status = 'held'
      clearTimeout(undo); undo = setTimeout(() => { undo = null; draw() }, 5500)
      return draw()
    }
    if (e.target.closest('[data-wundo]')) { tasks.forEach((t) => { if (t.status === 'held') t.status = 'pending' }); clearTimeout(undo); undo = null; draw() }
  })
  draw()
}

// the tile overlay has no send button: the keyboard's action key sends (contract: field, notice, Rückgängig, Schließen)
function tileOverlay(host) {
  const f = host.querySelector('form'), inp = host.querySelector('input'), note = host.querySelector('.onote')
  const send = () => {
    if (!inp.value.trim()) return
    const v = inp.value; inp.value = ''
    note.innerHTML = '<span>In Inbox ✓</span><button class="undo" type="button">Rückgängig</button>'
    note.querySelector('button').onclick = () => { inp.value = v; note.innerHTML = '' }
  }
  f.addEventListener('submit', (e) => { e.preventDefault(); send() })
  host.querySelector('[data-key="↵"]')?.addEventListener('click', send)
}

function share(host) {
  const b = host.querySelector('.big')
  b.addEventListener('click', () => { b.textContent = 'In Inbox ✓'; setTimeout(() => { b.textContent = 'In Inbox' }, 2000) })
}

// ── Board ─────────────────────────────────────────────────────

document.querySelectorAll('[data-kb]').forEach((k) => { k.innerHTML = kbHTML() })
const phones = []
let main = null
for (const host of document.querySelectorAll('[data-phone]')) {
  const o = JSON.parse(host.dataset.phone || '{}')
  const p = new Phone(host, o)
  phones.push(p)
  if (o.main) main = p
  // static states for the frames that show a moment
  if (o.state === 'tick') {
    const t = p.find('Steuerberatung zurückrufen'); t.status = 'held'; p.render()
    p.notice('Erledigt: Steuerberatung zurückrufen', () => { t.status = 'pending'; p.render() }, { hold: true })
    const rows = p.r.list.querySelectorAll('.row[data-kind="next"]')
    const row = rows[rows.length - 1]
    row.classList.add('swiping', 'armed'); row.style.setProperty('--dx', '150px')
  }
  if (o.state === 'offline' || o.state === 'failed') {
    const a = localTask('Angebot Pilotkunde nachfassen', 'failed')
    const b = localTask('Rückruf Druckerei wegen Proof', 'net')
    p.tasks.push(a, b); p.render()
    if (o.state === 'offline') p.notice('In Inbox ✓', () => {}, { hold: true })
    else p.menu(a)
  }
  if (o.state === 'banners') { p.tasks.push(localTask('Proof-Freigabe an Druckerei', 'setup')); p.render() }
  if (o.state === 'hint') p.tileHint()
  if (o.state === 'pull') p.pullShow(96)
  if (o.state === 'option') p.menu(p.find('Rechnung Druckerei prüfen'), { option: true })
  if (o.state === 'more') p.more()
  if (o.reach) p.reachFrame = true
}
document.querySelectorAll('[data-surface="widget"]').forEach(widget)
document.querySelectorAll('[data-surface="tile"]').forEach(tileOverlay)
document.querySelectorAll('[data-surface="share"]').forEach(share)
if (main && !NARROW) main.r.input.focus({ preventScroll: true })
// re-anchor and draw the reach overlay once the fonts have settled the row heights
document.fonts.ready.then(() => requestAnimationFrame(() => {
  phones.forEach((p) => { p.anchor(); if (p.reachFrame) p.showReach(true) })
}))

window.proto = {
  phone: main,
  show: (view) => main.show(view),
  filter: (context) => main.setFilter(context || 'Alle'),
  capture: (text) => main.capture(text),
  open: (id) => main.open(id),
  complete: (id) => main.complete(id),
  // Clarifying is not on the phone (PLAN.md:33-42). The optional quick clarify is shown on its own frame.
  clarify: (id) => { const t = main.find(id); if (t) main.menu(t, { option: true }); return { ok: false, reason: 'Klären ist nicht im Umfang der App; Option-Rahmen zeigt die Erweiterung' } },
  signature: () => main.showReach(!main.s.querySelector('.reach')),
  reach: () => main.reach(),
  refresh: () => main.refresh(),
  hand: (h) => { main.hand = h === 'left' ? 'left' : 'right'; main.render() },
  phones,
}
