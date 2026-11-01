// m4 Gesten: one phone screen. The same class renders the interactive phone and every still frame.
// Gestures (each with a visible equivalent and an accessibility action):
//   swipe right on a row  -> Abhaken (6 s hold, "Erledigt · Rückgängig")     = tap the ring
//   swipe left on a row   -> row actions (Bearbeiten/Löschen, Details/Löschen) = tap the row (pinned menu / Custom Tab)
//                            failed rows open the pinned menu sheet instead (Erneut senden, Bearbeiten und erneut senden, Löschen)
//   long press on a row   -> multi-select (Abhaken, Löschen for many)          = Mehr -> Auswählen
//   pull down at the top  -> Aktualisieren, as today (refresh only)            = Stand hh:mm, refreshed on open

import { Store, CHIPS, NOW, statusOf, day, dm, wdm, TODAY } from './store.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const HEAD = {
  inbox: ['Inbox', 'Was ist <em>neu</em>'],
  next: ['Nächste', 'Was jetzt <em>zählt</em>'],
  waiting: ['Warten auf', 'Worauf du <em>wartest</em>'],
}
const KEYS = ['qwertzuiopü', 'asdfghjklöä', 'yxcvbnm']

export class Phone {
  constructor(el, opts = {}) {
    this.el = el
    this.live = !!opts.live
    this.store = opts.store || new Store()
    this.s = {
      tab: 'inbox', filter: null, kb: false, notice: null, open: null, selected: null, pull: 0,
      menu: null, more: false, ctab: null, edit: null, hint: false, offline: false, stand: NOW,
      swipe: null, clarify: null, left: false, inboxNew: false, tips: 0, banners: null,
    }
    this.build()
    if (opts.state) Object.assign(this.s, opts.state)
    if (opts.setup) opts.setup(this)
    this.render()
    if (!this.live) el.setAttribute('inert', '')
  }

  build() {
    this.el.classList.add('scr')
    this.el.innerHTML = `
      <div class="sb" aria-hidden="true"><span>9:41</span><span class="cam"></span><span class="sys"><span class="sig"><i></i><i></i><i></i><i></i></span><span class="bat"></span></span></div>
      <header class="hd"></header>
      <div class="list"><div class="pull" aria-hidden="true"><span></span></div><div class="rows"></div></div>
      <div class="stack">
        <div class="banners"></div>
        <div class="notice" role="status" aria-live="polite"></div>
        <div class="chips" role="group" aria-label="Kontext"></div>
        <div class="selbar"></div>
        <nav class="tabs" role="tablist"></nav>
        <form class="cap" autocomplete="off">
          <div class="editbar"><b>Todo bearbeiten</b><button type="button" class="pill quiet" data-act="editcancel">Abbrechen</button></div>
          <div class="fwrap"><input class="field" aria-label="Neues Todo" placeholder="Neues Todo" enterkeyhint="done"><button class="go" type="submit" aria-label="In die Inbox">+</button></div>
        </form>
      </div>
      <div class="kbd" aria-hidden="true"><div class="sugg"><span>und</span><span>die</span><span>ich</span></div>${KEYS.map((r, i) => `<div class="kr">${i === 2 ? '<i class="w">⇧</i>' : ''}${[...r].map((k) => `<i>${k}</i>`).join('')}${i === 2 ? '<i class="w">⌫</i>' : ''}</div>`).join('')}<div class="kr"><i class="w">?123</i><i>,</i><i class="sp">Leerzeichen</i><i>.</i><i class="w ent">↵</i></div></div>
      <div class="gest" aria-hidden="true"><i></i></div>
      <div class="scrim"></div>
      <div class="pop" role="menu"></div>
      <div class="ctab" role="dialog" aria-label="Details im Browser"></div>`
    this.$ = (sel) => this.el.querySelector(sel)
    this.field = this.$('.field')
    if (!this.live) return
    this.$('.cap').addEventListener('submit', (e) => { e.preventDefault(); this.submit() })
    this.field.addEventListener('focus', () => { if (!this.s.kb) { this.s.kb = true; this.render() } })
    this.el.addEventListener('click', (e) => this.onClick(e))
    const rows = this.$('.list')
    rows.addEventListener('pointerdown', (e) => this.down(e))
    rows.addEventListener('pointermove', (e) => this.move(e))
    rows.addEventListener('pointerup', (e) => this.up(e))
    rows.addEventListener('pointercancel', () => this.cancel())
    rows.addEventListener('keydown', (e) => this.key(e))
    rows.addEventListener('contextmenu', (e) => { if (e.target.closest('.row')) e.preventDefault() })
  }

  // ───────────────────────── render ─────────────────────────
  render() {
    const s = this.s
    const L = this.store.lists(s.filter)
    const c = this.store.counts()
    const sel = !!s.selected
    this.el.classList.toggle('kb', s.kb)
    this.el.classList.toggle('sel-mode', sel)
    this.el.classList.toggle('editing', !!s.edit)
    this.el.classList.toggle('left', s.left)
    this.el.classList.toggle('on-next', s.tab === 'next')

    // header: one eyebrow line; the display line only when the keyboard is down
    const [name, disp] = HEAD[s.tab]
    const n = s.tab === 'inbox' ? L.inbox.length : s.tab === 'next' ? L.due.length + L.next.length : L.waiting.length
    this.$('.hd').innerHTML = `
      <div class="eb"><span class="l"><span class="slash">//</span><span>${name}</span><span class="sep">·</span><span>${n}</span>${s.tab === 'next' && s.filter ? `<span class="sep">·</span><span>${s.filter}</span>` : ''}</span>
      <span class="r">${s.offline ? '<span class="off"><i class="ring-mark"></i>offline</span>' : ''}<span class="stand">Stand ${s.stand}</span></span></div>
      ${n <= 4 ? `<h1 class="disp">${disp}</h1>` : ''}`

    // rows
    let html = ''
    if (s.hint) html += this.hintHTML()
    if (s.tab === 'inbox') {
      html += L.inbox.length ? L.inbox.map((t) => this.rowHTML(t, 'inbox')).join('') : '<p class="empty">Inbox ist leer</p>'
    } else if (s.tab === 'next') {
      html += `<div class="sec"><span class="slash">//</span><h2>Fällig</h2><span class="n">${L.due.length}</span></div>`
      html += L.due.length ? L.due.map((t) => this.rowHTML(t, 'next')).join('') : '<p class="empty">Nichts fällig</p>'
      html += `<div class="sec"><span class="slash">//</span><h2>Nächste Aktionen</h2><span class="n">${L.next.length}</span></div>`
      html += L.next.length ? L.next.map((t) => this.rowHTML(t, 'next')).join('') : '<p class="empty">Keine nächsten Aktionen</p>'
    } else {
      html += L.waiting.length ? L.waiting.map((t) => this.rowHTML(t, 'waiting')).join('') : '<p class="empty">Du wartest auf nichts</p>'
    }
    this.$('.rows').innerHTML = html

    // pull band
    const pull = this.$('.pull')
    pull.style.height = `${s.pull}px`
    pull.querySelector('span').textContent = s.pull >= 64 ? '↻  Loslassen: aktualisieren' : '↓  weiterziehen'

    // swipe preview (stills and signature)
    if (s.swipe) {
      const row = this.$(`.row[data-id="${s.swipe.id}"]`)
      if (row) this.paintSwipe(row, s.swipe.dx)
    }
    if (s.open) {
      const row = this.$(`.row[data-id="${s.open}"]`)
      if (row) this.paintSwipe(row, -this.actW(row), true)
    }

    // notice
    const nt = this.$('.notice')
    if (s.notice) {
      nt.innerHTML = `<div class="nl"><span class="nt">${esc(s.notice.text)}</span>${s.notice.sub ? `<span class="nx">${esc(s.notice.sub)}</span>` : ''}${s.notice.undo ? '<button class="undo" data-act="undo">Rückgängig</button>' : ''}</div>${s.notice.tip ? `<div class="tip"><span class="slash">//</span> ${esc(s.notice.tip)}</div>` : ''}${s.notice.undo ? '<i class="line"></i>' : ''}`
      nt.classList.add('on')
    } else { nt.classList.remove('on'); nt.innerHTML = '' }

    // banners (pinned texts; rare, so they sit in the stack above the notice, where Verwerfen is reachable)
    this.$('.banners').innerHTML = (s.banners || []).map((b) => b === 'setup'
      ? '<div class="banner"><i class="ring-mark"></i><span>Zugang abgelaufen. Bitte neu einrichten.</span><button class="pill" data-act="noop">Einrichten</button></div>'
      : `<div class="banner"><i class="bang"></i><span>Altes Konto: ${b.old} nicht gesendet</span><button class="pill" data-act="noop">Verwerfen</button></div>`).join('')

    // chips (Nächste only, in the thumb zone)
    this.$('.chips').innerHTML = s.tab === 'next' ? CHIPS.map((ch) => {
      const on = (ch === 'Alle' && !s.filter) || ch === s.filter
      return `<button class="chip" data-act="chip" data-chip="${ch}" aria-pressed="${on}">${ch}</button>`
    }).join('') : ''

    // selection bar
    this.$('.selbar').innerHTML = sel ? `<span class="k"><b>${s.selected.size}</b> ausgewählt</span>
      <button class="pill action" data-act="seldone">Abhaken</button><button class="pill" data-act="seldel">Löschen</button><button class="pill quiet" data-act="selend">Fertig</button>` : ''

    // tabs
    // the tab's text node is exactly the label; the count is a separate badge node (Compose: BadgedBox outside the Tab's merged semantics)
    const tab = (id, label, count, fresh) => `<button class="tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${s.tab === id}"><span class="tl">${label}</span>${count != null ? `<span class="tc${fresh ? ' new' : ''}" aria-hidden="true">${count}</span>` : ''}</button>`
    this.$('.tabs').innerHTML = tab('inbox', 'Inbox', c.inbox, s.inboxNew && s.tab !== 'inbox') + tab('next', 'Nächste') + tab('waiting', 'Warten auf') +
      '<button class="tab more" data-act="more" aria-label="Mehr" aria-haspopup="menu">⋮</button>'

    // field
    this.field.setAttribute('aria-label', s.edit ? 'Beschreibung' : 'Neues Todo')
    this.field.placeholder = s.edit ? 'Beschreibung' : 'Neues Todo'
    if (s.draft != null && !this.live) this.field.value = s.draft

    // popover menus
    const pop = this.$('.pop')
    if (s.menu) {
      const t = this.store.get(s.menu.id)
      const items = t.out === 'Nicht gesendet' ? [['resend', 'Erneut senden'], ['editresend', 'Bearbeiten und erneut senden'], ['delete', 'Löschen']] : [['edit', 'Bearbeiten'], ['delete', 'Löschen']]
      pop.innerHTML = `<div class="who">${esc(t.description)}</div>` + items.map(([a, l]) => `<button role="menuitem" data-act="${a}" data-id="${t.id}"${a === 'delete' ? ' class="del"' : ''}>${l}</button>`).join('')
      pop.style.cssText = `display:block; left:12px; right:12px; bottom:${this.$('.stack').offsetHeight + (s.kb ? this.$('.kbd').offsetHeight : 0) + 22 + 8}px; top:auto`
      pop.classList.add('sheet')
    } else if (s.more) {
      pop.innerHTML = `<div class="who">Angemeldet als uli</div>
        <button role="menuitem" data-act="select">Auswählen</button>
        <button role="menuitem" data-act="hint">Gesten zeigen</button>
        <button role="menuitem" data-act="hand">${s.left ? 'Daumen rechts' : 'Daumen links'}</button>
        <button role="menuitem" data-act="noop">Widget hinzufügen</button>
        <button role="menuitem" data-act="noop">Protokoll exportieren</button>
        <button role="menuitem" data-act="noop">Abmelden</button>`
      pop.style.cssText = `display:block; right:12px; bottom:${this.$('.stack').offsetHeight + (s.kb ? this.$('.kbd').offsetHeight : 0) - 52}px; top:auto`
      pop.classList.remove('sheet')
    } else { pop.style.display = 'none'; pop.innerHTML = '' }

    // Custom Tab (details live on the web)
    const ct = this.$('.ctab')
    if (s.ctab) {
      ct.innerHTML = `<div class="cbar"><button class="x" data-act="ctabclose" aria-label="Schließen">✕</button><div><b>runway</b><span>runway.agentic-reach.com${esc(s.ctab.path)}</span></div></div>
        <div class="cbody"><div class="eb"><span class="slash">//</span><span>Details im Web</span></div><h3>${esc(s.ctab.title)}</h3><p>Die Web-App öffnet diesen Todo im Custom Tab. Zurück führt an dieselbe Stelle der Liste.</p><i></i><i></i><i class="s"></i></div>`
      ct.classList.add('on')
    } else ct.classList.remove('on')
    this.$('.scrim').classList.toggle('on', !!(s.ctab || s.menu))
  }

  rowHTML(t, list) {
    const s = this.s
    const status = statusOf(t, list)
    const label = `${t.description}, ${status}, ${t.local ? 'lokal' : 'ID'} ${t.uuid.slice(-8)}`
    const overdue = list === 'next' && status === 'überfällig'
    const selected = s.selected && s.selected.has(t.id)
    let meta = ''
    if (list === 'inbox') {
      if (t.out) meta = `<span class="m ${t.out === 'Nicht gesendet' ? 'fail' : 'wait'}"><i class="${t.out === 'Nicht gesendet' ? 'bang' : 'ring-mark'}"></i>${t.out}</span>`
    } else if (list === 'next') {
      const bits = []
      if (overdue) bits.push(`<span class="ov">überfällig ${dm(t.due)}</span>`)
      else if (t.due && day(t.due) === TODAY) bits.push('<span class="today">fällig heute</span>')
      else if (t.due) bits.push(wdm(t.due))
      if (t.start) bits.push('<span class="live"><i></i>läuft</span>')
      if (t.project) bits.push(esc(t.project))
      bits.push(t.ctx.join(' '))
      meta = `<span class="m">${bits.join('<span class="sep"> · </span>')}</span>`
    } else {
      const bits = []
      if (t.scheduled && day(t.scheduled) <= TODAY) bits.push(`<span class="follow"><i class="ring-mark"></i>Nachhaken ${day(t.scheduled) === TODAY ? 'heute' : 'seit ' + dm(t.scheduled)}</span>`)
      else if (t.scheduled) bits.push(`Wiedervorlage ${dm(t.scheduled)}`)
      if (t.project) bits.push(esc(t.project))
      meta = `<span class="m">${bits.join('<span class="sep"> · </span>')}</span>`
    }
    // failed rows have no tray: swipe left opens the pinned menu sheet (Erneut senden, Bearbeiten und erneut senden, Löschen)
    const acts = list === 'inbox' ? [['edit', 'Bearbeiten'], ['delete', 'Löschen']] : [['details', 'Details'], ['delete', 'Löschen']]
    const open = s.open === t.id
    const clar = s.clarify && s.clarify.id === t.id
    return `<div class="row${overdue ? ' overdue' : ''}${selected ? ' selected' : ''}${open ? ' open' : ''}${t.fresh ? ' fresh' : ''}${list === 'waiting' && status === 'Nachhaken fällig' ? ' follow' : ''}" data-id="${t.id}" data-list="${list}">
      <div class="u-done" aria-hidden="true"><span class="ck">✓</span><span>Abhaken</span></div>
      <div class="u-acts">${acts.map(([a, l]) => `<button class="pill${a === 'delete' ? ' del' : ''}" data-act="${a}" data-id="${t.id}"${open ? '' : ' tabindex="-1"'}>${l}</button>`).join('')}</div>
      <div class="face">
        ${s.selected ? `<span class="selbox${selected ? ' on' : ''}" aria-hidden="true"></span>` : ''}
        <button class="hit" data-act="row" aria-label="${esc(label)}"${s.selected ? ` aria-pressed="${selected}" aria-description="${selected ? 'ausgewählt' : 'nicht ausgewählt'}"` : ''}><span class="d">${esc(t.description)}</span>${meta}</button>
        <button class="ring" data-act="tick" data-id="${t.id}" aria-label="Abhaken: ${esc(t.description)}"${s.selected ? ' disabled aria-hidden="true" tabindex="-1"' : ''}></button>
      </div>
      ${clar ? this.clarifyHTML(t) : ''}
    </div>`
  }

  hintHTML() {
    return `<div class="hint" role="note">
      <div class="eb"><span class="l"><span class="slash">//</span><span>Gesten</span><span class="sep">·</span><span>einmal gezeigt</span></span></div>
      <dl>
        <div><dt><b>→</b> nach rechts wischen</dt><dd>Abhaken<small>oder Kreis antippen</small></dd></div>
        <div><dt><b>←</b> nach links wischen</dt><dd>Aktionen<small>oder Zeile antippen</small></dd></div>
        <div><dt><b>•</b> lange drücken</dt><dd>mehrere<small>oder Mehr · Auswählen</small></dd></div>
      </dl>
      <button class="pill action" data-act="hintok">Verstanden</button>
    </div>`
  }

  clarifyHTML(t) {
    const c = this.s.clarify
    return `<div class="clar">
      <div class="eb"><span class="l"><span class="slash">//</span><span>Kurz klären</span><span class="sep">·</span><span>Option</span></span></div>
      <div class="outs">${['Nächste', 'Warten auf', 'Irgendwann'].map((o) => `<button class="pill${c.to === o ? ' on' : ''}">${o}</button>`).join('')}</div>
      ${c.to === 'Nächste' ? `<div class="ask">Welcher Kontext? <span>ohne Kontext keine Nächste</span></div><div class="outs">${CHIPS.slice(0, 4).map((ch) => `<button class="chip">${ch}</button>`).join('')}</div>` : ''}
    </div>`
  }

  // right: the face follows the finger over the coral track; left: the action tray is revealed between
  // the text and the ring (at most ~45 % of the row). The text column shrinks with it, so the
  // description ellipsizes to one line and the status line and the ring stay visible.
  paintSwipe(row, dx) {
    const w = row.offsetWidth || 412
    const thr = Math.max(w * 0.35, 96)
    row.dataset.dir = dx > 0 ? 'r' : dx < 0 ? 'l' : ''
    row.querySelector('.face').style.transform = dx > 0 ? `translateX(${dx}px)` : ''
    const acts = row.querySelector('.u-acts')
    const aw = acts.offsetWidth
    const reveal = dx < 0 ? Math.min(aw, -dx) : 0
    acts.style.clipPath = dx < 0 ? `inset(0 0 0 ${aw - reveal}px)` : ''
    row.style.setProperty('--tray', `${reveal}px`)
    row.classList.toggle('armed', dx >= thr)
  }

  // ───────────────────────── actions ─────────────────────────
  setTab(tab) {
    this.s.tab = tab; this.s.open = null; this.s.swipe = null; this.s.menu = null; this.s.more = false; this.s.selected = null
    this.s.kb = tab === 'inbox' // pinned: Inbox opens with the keyboard, the others without
    this.render()
    this.$('.list').scrollTop = 0
    if (this.live) { if (tab === 'inbox') this.field.focus({ preventScroll: true }); else this.field.blur() }
  }

  notify(n, ms = 6000) {
    clearTimeout(this.nt)
    this.s.notice = n
    this.render()
    this.nt = setTimeout(() => { this.store.flush(); this.s.notice = null; this.render() }, ms)
  }

  submit() {
    const v = this.field.value
    if (this.s.edit) {
      const t = this.store.get(this.s.edit)
      if (v.trim()) { t.description = v.trim(); this.store.calls.push(`PUT /tasks/${t.uuid} {"description":"${v.trim()}"}`) }
      this.s.edit = null; this.field.value = ''
      this.notify({ text: 'Gespeichert' }, 2500)
      return
    }
    const t = this.store.capture(v)
    if (!t) return
    this.field.value = ''
    t.fresh = true
    // stay where you are (tab and chip kept); the Inbox tab count rises and gets a yellow dot
    if (this.s.tab !== 'inbox') this.s.inboxNew = true
    this.notify({ text: 'In Inbox ✓', sub: this.s.tab !== 'inbox' ? t.description : null, undo: true, capture: t.id })
    setTimeout(() => { t.fresh = false }, 1200)
  }

  complete(ids, via) {
    ids = ids.map(Number)
    const one = ids.length === 1 ? this.store.get(ids[0]) : null
    // taught in context: after a ring tap, at most three times, one line in the notice
    let tip = null
    if (via === 'ring' && this.s.tips < 3) { this.s.tips += 1; tip = 'Tipp: nach rechts wischen geht auch' }
    if (via === 'swipe') this.s.tips = 3
    const go = () => {
      this.store.holdWrite('done', ids)
      this.s.open = null; this.s.selected = null; this.s.swipe = null
      this.notify({ text: 'Erledigt', sub: one ? one.description : `${ids.length} Todos`, undo: true, tip })
    }
    // ring fills coral for 120 ms, then the row leaves (well under the 1 s rule)
    if (!reduced() && ids.length === 1) {
      const row = this.$(`.row[data-id="${ids[0]}"]`)
      if (row) { row.classList.add('ticking'); setTimeout(go, 140); return }
    }
    go()
  }

  remove(ids) {
    this.store.holdWrite('delete', ids.map(Number))
    this.s.open = null; this.s.selected = null; this.s.menu = null
    this.notify({ text: 'Gelöscht', undo: true })
  }

  undo() {
    const n = this.s.notice
    if (n && n.capture) this.store.undoCapture(n.capture)
    else this.store.undo()
    clearTimeout(this.nt)
    this.s.notice = null
    this.render()
  }

  openDetails(t, list) {
    this.s.ctab = { path: `/${list === 'waiting' ? 'waiting' : 'next'}?task=${t.uuid}`, title: t.description }
    this.render()
  }

  onClick(e) {
    if (this.suppress) { this.suppress = false; e.preventDefault(); e.stopPropagation(); return }
    const b = e.target.closest('[data-act]')
    const s = this.s
    if (!b) {
      // tap beside: close popovers and swiped rows; tap on the list closes the keyboard (draft kept)
      if (s.menu || s.more || s.open) { s.menu = null; s.more = false; s.open = null; this.render() }
      else if (s.kb && e.target.closest('.list')) { s.kb = false; this.field.blur(); this.render() }
      return
    }
    const act = b.dataset.act
    const row = b.closest('.row')
    const id = Number(b.dataset.id || (row && row.dataset.id))
    const t = id ? this.store.get(id) : null
    switch (act) {
      case 'tab': this.setTab(b.dataset.tab); break
      case 'menu': this.openMenu(id); break
      case 'chip': s.filter = b.dataset.chip === 'Alle' ? null : b.dataset.chip; this.render(); break
      case 'tick':
        if (s.selected) break // inert while selecting: a tap on the row toggles
        this.complete([id], 'ring'); break
      case 'row':
        if (s.selected) { this.toggleSel(Number(row.dataset.id)); break }
        if (s.open) { s.open = null; this.render(); break }
        if (row.dataset.list === 'inbox') this.openMenu(Number(row.dataset.id))
        else this.openDetails(this.store.get(row.dataset.id), row.dataset.list)
        break
      case 'edit': case 'editresend':
        s.menu = null; s.open = null; s.edit = id; s.kb = true; this.render()
        this.field.value = t.description; this.field.focus({ preventScroll: true }); break
      case 'editcancel': s.edit = null; this.field.value = ''; this.render(); break
      case 'delete': this.remove([id]); break
      case 'resend': t.out = 'wartet auf Netz'; s.open = null; s.menu = null; this.notify({ text: 'Wird erneut gesendet' }, 2500); break
      case 'details': s.open = null; this.openDetails(t, row.dataset.list); break
      case 'undo': this.undo(); break
      case 'more': s.more = !s.more; s.menu = null; this.render(); break
      case 'select': s.more = false; s.selected = new Set(); s.kb = false; this.field.blur(); this.render(); break
      case 'hint': s.more = false; s.hint = true; this.render(); break
      case 'hintok': s.hint = false; this.render(); break
      case 'hand': s.left = !s.left; s.more = false; this.render(); break
      case 'noop': s.more = false; this.render(); break
      case 'seldone': if (s.selected.size) this.complete([...s.selected]); break
      case 'seldel': if (s.selected.size) this.remove([...s.selected]); break
      case 'selend': s.selected = null; this.render(); break
      case 'ctabclose': s.ctab = null; this.render(); break
    }
  }

  openMenu(id) {
    this.s.menu = { id }; this.s.open = null; this.s.more = false
    this.render()
  }

  toggleSel(id) {
    const s = this.s
    s.selected.has(id) ? s.selected.delete(id) : s.selected.add(id)
    this.render()
  }

  key(e) {
    // keyboard and switch access: the accessibility actions as keys on a focused row
    const row = e.target.closest('.row')
    if (!row) return
    const id = Number(row.dataset.id)
    if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); this.complete([id], 'swipe') }
    if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); this.swipeLeft(id) }
  }

  // ───────────────────────── gestures ─────────────────────────
  down(e) {
    if (e.button > 0) return
    const row = e.target.closest('.row')
    const list = this.$('.list')
    if (e.target.closest('.u-acts') || e.target.closest('.hint')) return
    this.g = { x: e.clientX, y: e.clientY, row, mode: null, top: list.scrollTop <= 0, id: row && Number(row.dataset.id) }
    clearTimeout(this.lp)
    if (row) {
      this.lp = setTimeout(() => {
        if (!this.g || this.g.mode) return
        this.g.mode = 'long'
        if (navigator.vibrate) try { navigator.vibrate(12) } catch {}
        if (!this.s.selected) { this.s.selected = new Set(); this.s.kb = false; this.field.blur() }
        this.s.selected.add(this.g.id)
        this.suppress = true
        this.render()
      }, 450)
    }
  }

  move(e) {
    const g = this.g
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.mode) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2 && g.row && !this.s.selected) {
        g.mode = 'swipe'; clearTimeout(this.lp)
        g.aw = this.actW(g.row)
        g.base = this.s.open === g.id ? -g.aw : 0
        g.row.classList.add('drag')
        try { this.$('.list').setPointerCapture(e.pointerId) } catch {}
      } else if (dy > 10 && Math.abs(dy) > Math.abs(dx) && g.top && !this.s.selected) {
        g.mode = 'pull'; clearTimeout(this.lp)
        try { this.$('.list').setPointerCapture(e.pointerId) } catch {}
      } else if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        g.mode = 'scroll'; clearTimeout(this.lp)
      }
    }
    if (g.mode === 'swipe') {
      let d = g.base + dx
      const min = -g.aw - 24
      if (d < min) d = min + (d - min) * 0.2
      g.dx = d
      const was = g.row.classList.contains('armed')
      this.paintSwipe(g.row, d)
      if (!was && g.row.classList.contains('armed') && navigator.vibrate) try { navigator.vibrate(8) } catch {}
    } else if (g.mode === 'pull') {
      const p = Math.max(0, Math.min(96, dy * 0.6))
      this.s.pull = p
      const pull = this.$('.pull')
      pull.style.height = `${p}px`
      pull.querySelector('span').textContent = p >= 64 ? '↻  Loslassen: aktualisieren' : '↓  weiterziehen'
    }
  }

  up(e) {
    const g = this.g
    this.g = null
    clearTimeout(this.lp)
    if (!g) return
    if (g.mode === 'swipe') {
      this.suppress = true
      setTimeout(() => { this.suppress = false }, 0)
      g.row.classList.remove('drag')
      if (g.row.classList.contains('armed')) { this.complete([g.id], 'swipe'); return }
      if ((g.dx || 0) < -56) { this.swipeLeft(g.id); return }
      this.s.open = null; this.render()
    } else if (g.mode === 'pull') {
      this.suppress = true
      setTimeout(() => { this.suppress = false }, 0)
      const p = this.s.pull
      this.s.pull = 0
      if (p >= 64) {
        this.s.stand = '09:42'; this.render()
      } else this.render()
    } else if (g.mode === 'long') {
      setTimeout(() => { this.suppress = false }, 0)
    }
  }

  cancel() {
    if (this.g && this.g.row) this.g.row.classList.remove('drag')
    this.g = null; clearTimeout(this.lp)
    if (this.s.pull) { this.s.pull = 0 }
    this.render()
  }

  swipeLeft(id) {
    const t = this.store.get(id)
    if (t && t.out === 'Nicht gesendet') return this.openMenu(id) // the pinned menu, not a shortened tray
    this.s.open = id; this.render()
  }

  actW(row) {
    const dir = row.dataset.dir
    row.dataset.dir = 'l'
    const w = row.querySelector('.u-acts').offsetWidth
    row.dataset.dir = dir || ''
    return w
  }
}
