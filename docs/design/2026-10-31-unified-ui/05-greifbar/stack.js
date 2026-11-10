// Greifbar: the Inbox card stack ("Klären"). Shared by the web and the Android prototype.
// The DOM owns state, text, trays and keys. The card itself is DOM with CSS 3D motion (card.js);
// WebGL is not involved. Every gesture has a key and a button; input never waits for an animation.
//
// Steps: some destinations need one more answer before the item can leave the Inbox.
//   Nächste     -> "wo erledigst du das?"  every context, keys 1-9
//   Warten auf  -> "wann nachhaken?"        morgen, Freitag, nächste Woche, ohne Datum (writes `scheduled`)
//   Zurückstellen (T, chip on the card) -> "bis wann?" (writes `wait`, the tickler)
// During a step the card stays on the stack, lifted a little; the trays turn into the options plus
// "Zurück" (0, Esc, Android Back). Nothing is written until the step is answered.
import { TRAYS, BACK_TRAY, trayHTML, stackFaceHTML, dateOptions, berlinMorning, dayText, icon, esc } from './ui.js'
import { createCard } from './card.js'

const CTX_HINT = { '@computer': 'am Rechner', '@anrufe': 'Telefon', '@zuhause': 'daheim', '@unterwegs': 'unterwegs', '@buero': 'im Büro' }
const LABEL = { next: 'Nächste', waiting: 'Warten auf', someday: 'Irgendwann', done: 'Erledigt', delete: 'Gelöscht' }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

export function createStack(o) {
  const { store, root } = o
  const motionOK = () => (o.motion ? o.motion() : true)
  const compact = () => (typeof o.compact === 'function' ? o.compact() : !!o.compact)
  const slot = root.querySelector('.stack-slot')
  const traysEl = root.querySelector('.trays')
  const hintEl = root.querySelector('.stack-hint')
  const progEl = root.querySelector('.stack-progress')
  const srEl = root.querySelector('.stack-sr')

  // three paper cards below the top card; the first one carries the next item's text
  const unders = [0, 1, 2].map((i) => { const u = document.createElement('div'); u.className = `under u${i}`; u.setAttribute('aria-hidden', 'true'); return u })
  ;[...unders].reverse().forEach((u) => slot.appendChild(u))
  const nextFace = document.createElement('div')
  nextFace.className = 'next-face'
  unders[0].appendChild(nextFace)
  const face = document.createElement('div')
  face.className = 'stack-face'
  face.tabIndex = -1
  slot.appendChild(face)
  const card = createCard({ slot, face, nextFace, unders })
  const M = () => (motionOK() ? card : null)

  let mode = 'idle' // idle | drag | flying | step
  let step = null // { kind: 'ctx' | 'follow' | 'tickler', options, fresh }
  let visible = false, processed = 0
  const skipped = new Set()
  let pinned = null
  const project = {} // id -> project chosen on the card before it leaves
  const history = [] // { id, to }
  let projMenu = null

  function order() {
    const ids = store.lists().inbox.map((t) => t.id)
    let o2 = [...ids.filter((i) => !skipped.has(i)), ...ids.filter((i) => skipped.has(i))]
    if (pinned && o2.includes(pinned)) o2 = [pinned, ...o2.filter((i) => i !== pinned)]
    return o2.map((i) => store.get(i))
  }
  const current = () => order()[0] || null
  const trayEl = (to) => traysEl.querySelector(`[data-to="${CSS.escape(to)}"]`)

  function stepOptions(kind) {
    if (kind === 'ctx') {
      const next = store.lists().nextAll
      return store.state.contexts.map((ctx, i) => ({ to: `ctx:${ctx}`, label: ctx, icon: 'next', key: i < 9 ? String(i + 1) : '', hint: CTX_HINT[ctx] || 'Kontext',
        n: next.filter((t) => t.tags.join(',').includes(ctx)).length }))
    }
    return dateOptions(kind)
  }

  function renderTrays() {
    if (mode === 'step') {
      const opts = step.options
      const all = [...opts, BACK_TRAY]
      traysEl.className = `trays is-step is-${step.kind}`
      traysEl.style.setProperty('--cols', String(all.length <= 6 ? all.length : Math.ceil(all.length / 2)))
      traysEl.innerHTML = all.map((tr) => trayHTML(tr, tr.n ?? null)).join('')
      const t = current()
      const proj = t && project[t.id]
      const q = step.kind === 'ctx' ? (proj && step.fresh ? `Erste Aktion für ${esc(proj)} · <b>wo erledigst du das?</b>` : 'Nächste · <b>wo erledigst du das?</b>')
        : step.kind === 'follow' ? 'Warten auf · <b>wann nachhaken?</b>' : 'Zurückstellen · <b>bis wann?</b>'
      const keys = `<kbd>1</kbd>–<kbd>${Math.min(9, opts.length)}</kbd> wählen · <kbd>0</kbd> oder <kbd>Esc</kbd> zurück`
      hintEl.innerHTML = `<span class="slash">//</span> ${q}${compact() ? '' : ` · ${keys}`}`
      return
    }
    traysEl.className = 'trays'
    traysEl.style.removeProperty('--cols')
    const c = store.counts()
    const n = { next: c.next, waiting: c.waiting, someday: c.someday, done: c.doneToday, delete: null }
    traysEl.innerHTML = TRAYS.map((tr) => trayHTML(tr, n[tr.to])).join('')
    hintEl.innerHTML = compact()
      ? '<span class="slash">//</span> Wischen oder antippen'
      : '<span class="slash">//</span> Ziehen, werfen oder <kbd>1</kbd>–<kbd>5</kbd> · <kbd>P</kbd> Projekt · <kbd>T</kbd> zurückstellen · <kbd>E</kbd> bearbeiten · <kbd>→</kbd> überspringen · <kbd>Z</kbd> zurück'
  }

  function render() {
    const items = order()
    const top = items[0]
    root.classList.toggle('is-empty', !top)
    root.classList.toggle('is-step', mode === 'step')
    if (top) {
      const chosen = project[top.id]
      face.innerHTML = stackFaceHTML(chosen !== undefined ? { ...top, project: chosen } : top, processed, processed + items.length)
      srEl.textContent = mode === 'step'
        ? `${top.description}: ${step.kind === 'ctx' ? 'Kontext wählen' : step.kind === 'follow' ? 'Nachhaken wählen' : 'Datum wählen'}, 1 bis ${Math.min(9, step.options.length)}, 0 zurück.`
        : `Karte ${processed + 1} von ${processed + items.length}: ${top.description}. Einsortieren mit 1 bis 5.`
    } else {
      face.innerHTML = ''
      srEl.textContent = 'Inbox ist leer.'
      card.reset()
    }
    face.classList.toggle('held', mode === 'step')
    const nx = items[1]
    nextFace.innerHTML = nx ? `<div class="face-top"><span class="eyebrow"><span class="slash">//</span> als Nächstes</span></div><p class="face-text">${esc(nx.description)}</p>` : ''
    if (progEl) progEl.innerHTML = top ? `<span>${processed + 1}</span> von ${processed + items.length}` : `${processed} geklärt`
    renderTrays()
    card.setDepth(Math.max(0, items.length - 1))
    if (o.onChange) o.onChange(items.length)
  }

  function bump(to) {
    const el = trayEl(to)
    if (!el) return
    el.classList.remove('accept'); void el.offsetWidth; el.classList.add('accept')
    const n = el.querySelector('.tray-n')
    if (n) { n.classList.remove('roll'); void n.offsetWidth; n.classList.add('roll') }
  }

  /** Fly the card into a tray, then commit, let the next card rise and bump the destination tray. */
  function sendTo(bumpTo, el, vel, commit, label) {
    const c = M()
    const land = () => {
      commit()
      mode = 'idle'; step = null
      render()
      bump(bumpTo)
      if (c && visible && current()) c.rise()
      if (label && o.toast) o.toast(label, true)
      if (o.announce && label) o.announce(label)
    }
    if (c && visible && el) { mode = 'flying'; c.throwTo(el.getBoundingClientRect(), vel, land) } else land()
  }
  const projOpt = (t) => (project[t.id] !== undefined ? { project: project[t.id] } : {})
  function done(t, to) {
    processed++
    history.push({ id: t.id, to })
    if (pinned === t.id) pinned = null
    skipped.delete(t.id)
  }

  function act(to, vel) {
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (mode === 'step') return
    const t = current()
    if (!t) return
    closeProjMenu()
    if (to === 'next') return openStep('ctx')
    if (to === 'waiting') return openStep('follow')
    if (to === 'tickler') return openStep('tickler')
    sendTo(to, trayEl(to), vel, () => { store.clarify(t.id, to, projOpt(t)); done(t, to) },
      to === 'done' ? 'Erledigt' : to === 'delete' ? 'Gelöscht' : `Einsortiert: ${LABEL[to]}`)
  }

  function openStep(kind, fresh = false) {
    mode = 'step'
    step = { kind, options: stepOptions(kind), fresh }
    render()
    const c = M()
    if (c && visible) c.hold()
    // focus follows the question for keyboard and screen-reader users
    if (visible) traysEl.querySelector('.tray')?.focus({ preventScroll: true })
  }

  /** Answer the open step by the option's data-to value ('ctx:@x', 'date:YYYY-MM-DD', 'date:', 'back'). */
  function answer(to, vel) {
    const t = current()
    if (!t || mode !== 'step') return
    if (to === 'back') return cancel()
    const el = trayEl(to)
    if (!el) return
    const kind = step.kind
    if (kind === 'ctx') {
      const ctx = to.slice(4)
      return sendTo(to, el, vel, () => { store.clarify(t.id, `next:${ctx}`, projOpt(t)); done(t, 'next') }, `Einsortiert: Nächste · ${ctx}`)
    }
    const day = to.slice(5)
    const tw = day ? berlinMorning(day) : null
    if (kind === 'follow') {
      return sendTo(to, el, vel, () => { store.clarify(t.id, 'waiting', { ...projOpt(t), scheduled: tw }); done(t, 'waiting') },
        `Einsortiert: Warten auf${day ? ` · nachhaken ${dayText(day)}` : ''}`)
    }
    return sendTo(to, el, vel, () => { store.clarify(t.id, 'tickler', { ...projOpt(t), wait: tw }); done(t, 'tickler') }, `Zurückgestellt bis ${dayText(day)}`)
  }

  function cancel() {
    if (mode !== 'step') return
    mode = 'idle'; step = null
    render()
    const c = M()
    if (c) c.back()
    if (visible) traysEl.querySelector('.tray')?.focus({ preventScroll: true })
  }

  function skip() {
    const t = current()
    if (!t || mode === 'step') return
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (order().length < 2) return
    const s = slot.getBoundingClientRect()
    const land = () => { skipped.add(t.id); if (pinned === t.id) pinned = null; mode = 'idle'; render(); if (c && visible) c.rise() }
    if (c && visible) { mode = 'flying'; c.throwTo({ left: s.right - s.width * 0.35, top: s.bottom - 20, width: s.width * 0.55, height: 30 }, { vx: 400, vy: 200 }, land) } else land()
  }

  // ---------------- project menu on the card: pick one, none, or create one ----------------
  function closeProjMenu() { if (projMenu) { projMenu.remove(); projMenu = null } }
  function openProjMenu() {
    const t = current()
    if (!t || mode !== 'idle') return
    closeProjMenu()
    const ps = store.projects().filter((p) => p.status === 'active')
    projMenu = document.createElement('div')
    projMenu.className = 'menu proj-menu'
    projMenu.setAttribute('role', 'menu')
    projMenu.innerHTML = '<p class="eyebrow"><span class="slash">//</span> Zu welchem Projekt?</p>' +
      ps.map((p, i) => `<button role="menuitem" data-proj="${esc(p.name)}"><kbd>${i < 9 ? i + 1 : ''}</kbd>${esc(p.name)}</button>`).join('') +
      '<button role="menuitem" data-proj=""><kbd>0</kbd>Kein Projekt</button>' +
      `<button role="menuitem" data-newproj class="m-new"><kbd>N</kbd>Neues Projekt …</button>`
    const r = slot.getBoundingClientRect()
    const host = o.menuHost || document.body
    const hr = host.getBoundingClientRect()
    projMenu.style.left = `${Math.max(8, Math.min(r.left - hr.left + 24, hr.width - 268))}px`
    projMenu.style.top = `${Math.max(8, r.top - hr.top + Math.min(r.height - 40, 110))}px`
    host.appendChild(projMenu)
    projMenu.addEventListener('click', (e) => {
      if (e.target.closest('[data-newproj]')) return newProjectForm()
      const b = e.target.closest('[data-proj]')
      if (!b) return
      project[t.id] = b.dataset.proj || null
      closeProjMenu(); render()
    })
    projMenu.querySelector('button')?.focus({ preventScroll: true })
  }
  /** "Neues Projekt …": name it, the card joins it, and its first next action needs a context. */
  function newProjectForm() {
    const t = current()
    if (!projMenu || !t) return
    projMenu.innerHTML = `<form class="np-form"><p class="eyebrow"><span class="slash">//</span> Neues Projekt</p>
      <input class="field" name="n" placeholder="Name des Projekts" aria-label="Name des Projekts" maxlength="100" autocomplete="off">
      <p class="np-err" role="alert"></p><p class="np-hint"><kbd>↵</kbd> anlegen · <kbd>Esc</kbd> zurück</p></form>`
    const f = projMenu.querySelector('form')
    f.addEventListener('submit', (e) => {
      e.preventDefault()
      const res = store.createProject(f.n.value)
      if (res.error) { f.querySelector('.np-err').textContent = res.error; return }
      project[t.id] = res.project.name
      closeProjMenu()
      if (o.toast) o.toast(`Projekt angelegt: ${res.project.name}`, false)
      openStep('ctx', true)
    })
    f.n.focus()
  }

  // ---------------- pointer: drag, flick, tap ----------------
  let drag = null
  function trayAt(x, y, v = { vx: 0, vy: 0 }, release = false) {
    const els = [...traysEl.querySelectorAll('.tray')]
    const px = x + v.vx * 0.12, py = y + v.vy * 0.12
    for (const el of els) {
      const r = el.getBoundingClientRect(), m = release ? 30 : 22
      if (px > r.left - m && px < r.right + m && py > r.top - m && py < r.bottom + m) return el
    }
    const speed = Math.hypot(v.vx, v.vy)
    if (release && speed > 650) {
      let best = null, bestA = 0.42
      for (const el of els) {
        const r = el.getBoundingClientRect()
        const dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y
        const a = Math.acos(clamp((dx * v.vx + dy * v.vy) / (Math.hypot(dx, dy) * speed), -1, 1))
        if (a < bestA) { bestA = a; best = el }
      }
      return best
    }
    return null
  }
  function mark(el) {
    traysEl.querySelectorAll('.tray.target').forEach((t) => t !== el && t.classList.remove('target'))
    if (el) el.classList.add('target')
  }
  face.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || !current()) return
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    e.preventDefault()
    face.setPointerCapture(e.pointerId)
    drag = { x0: e.clientX, y0: e.clientY, was: mode, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }
    if (c) c.grab(e.clientX, e.clientY)
    face.classList.add('grabbing')
  })
  face.addEventListener('pointermove', (e) => {
    if (!drag) return
    const c = M()
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0
    if (Math.hypot(dx, dy) > 6) drag.moved = true
    const now = performance.now()
    drag.samples.push({ x: e.clientX, y: e.clientY, t: now })
    while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift()
    if (c) c.drag(e.clientX, e.clientY)
    else face.style.transform = `translate(${dx}px, ${dy}px)`
    mark(trayAt(e.clientX, e.clientY))
  })
  const end = (e) => {
    if (!drag) return
    const c = M()
    const d = drag; drag = null
    face.classList.remove('grabbing')
    const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1]
    const dt = Math.max(1, s1.t - s0.t) / 1000
    const v = performance.now() - s1.t < 120 ? { vx: (s1.x - s0.x) / dt, vy: (s1.y - s0.y) / dt } : { vx: 0, vy: 0 }
    const el = d.moved ? trayAt(e.clientX, e.clientY, v, true) : null
    mark(null)
    if (!c) face.style.transform = ''
    const settleBack = () => { if (c) { if (mode === 'step') c.hold(); else c.back() } }
    if (!d.moved) {
      settleBack()
      if (d.was === 'idle' && o.onOpen) o.onOpen(current().id)
      return
    }
    if (!el) return settleBack()
    if (c) c.release()
    const to = el.dataset.to
    if (mode === 'step') answer(to, v)
    else act(to, v)
  }
  face.addEventListener('pointerup', end)
  face.addEventListener('pointercancel', end)
  face.addEventListener('click', (e) => {
    const b = e.target.closest('[data-face]')
    if (!b || mode === 'step') return
    const t = current()
    if (b.dataset.face === 'project') openProjMenu()
    if (b.dataset.face === 'edit' && t && o.onOpen) o.onOpen(t.id)
    if (b.dataset.face === 'skip') skip()
    if (b.dataset.face === 'tickler') act('tickler')
  })
  traysEl.addEventListener('click', (e) => {
    const el = e.target.closest('.tray')
    if (!el) return
    if (mode === 'step') answer(el.dataset.to)
    else act(el.dataset.to)
  })

  function key(e) {
    if (!visible) return false
    if (projMenu) {
      if (e.key === 'Escape') { if (projMenu.querySelector('form')) openProjMenu(); else closeProjMenu(); return true }
      if (projMenu.querySelector('form')) return false
      if (e.key === 'n' || e.key === 'N') { newProjectForm(); return true }
      if (/^[0-9]$/.test(e.key)) {
        const bs = projMenu.querySelectorAll('[data-proj]')
        const b = e.key === '0' ? bs[bs.length - 1] : bs[Number(e.key) - 1]
        if (b) b.click()
        return true
      }
      return false
    }
    if (mode === 'step') {
      if (e.key === 'Escape' || e.key === '0' || e.key === 'Backspace') { cancel(); return true }
      if (/^[1-9]$/.test(e.key)) { const opt = step.options[Number(e.key) - 1]; if (opt) answer(opt.to); return true }
      return false
    }
    if (/^[1-5]$/.test(e.key)) { act(TRAYS[Number(e.key) - 1].to); return true }
    if (e.key === 'p' || e.key === 'P') { openProjMenu(); return true }
    if (e.key === 't' || e.key === 'T') { act('tickler'); return true }
    if ((e.key === 'e' || e.key === 'E') && current() && o.onOpen) { o.onOpen(current().id); return true }
    if (e.key === 'ArrowRight' || e.key === 'l') { skip(); return true }
    return false
  }

  /** Undo the last stack action with the card flying back out of its tray. */
  function undo() {
    const last = history[history.length - 1]
    const u = store.peekUndo()
    if (!last || !u || !u.snap || u.snap.id !== last.id) return false
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (mode === 'step') cancel()
    history.pop()
    store.undoLast()
    processed = Math.max(0, processed - 1)
    pinned = last.id
    render()
    const el = trayEl(last.to)
    if (c && visible) { if (el) c.returnFrom(el.getBoundingClientRect()); else c.rise() }
    if (o.toast) o.toast('Zurück in der Inbox', false)
    return true
  }

  return {
    render, key, undo, current, act, answer, cancel,
    get mode() { return mode === 'step' ? 'choosing' : mode },
    get step() { return step ? step.kind : null },
    get frames() { return card.frames },
    get menuOpen() { return !!projMenu },
    closeMenu: closeProjMenu,
    layout() { card.layout() },
    setVisible(v) {
      visible = v
      // leaving Klären (Back, a tab, another view) always ends an open step and drops the menu
      mode = 'idle'; step = null
      closeProjMenu()
      card.reset()
      if (v) processed = 0
      render()
      card.layout()
    },
    pin(id) {
      if (mode !== 'idle' || current()?.id === id) return
      pinned = id; skipped.delete(id); render()
      const c = M(); if (c && visible) c.rise()
    },
    /** proto.clarify(id, to) for the item on top: to = 'next:@ctx' | 'waiting[:YYYY-MM-DD]' | 'someday' | 'done' | 'delete' */
    clarify(id, to) {
      const t = store.get(id)
      if (!t) return false
      if (current()?.id !== t.id) { pinned = t.id; render() }
      const wait = M() && visible ? 520 : 0
      if (to.startsWith('next')) {
        act('next')
        const ctx = to.split(':')[1]
        if (ctx) setTimeout(() => answer(`ctx:${ctx}`), wait)
      } else if (to.startsWith('waiting')) {
        act('waiting')
        setTimeout(() => answer(`date:${to.split(':')[1] || ''}`), wait)
      } else act(to)
      return true
    },
    /** The signature moment: grab, drag towards Nächste, flick; the card is held on the stack while the trays become contexts. */
    async signature({ pick = true } = {}) {
      const c = M()
      const t = current()
      if (!t) return
      if (!c) { act('next'); if (pick) setTimeout(() => answer('ctx:@computer'), 2600); return }
      const s = slot.getBoundingClientRect()
      const tr = trayEl('next').getBoundingClientRect()
      const x0 = s.left + s.width * 0.55, y0 = s.top + s.height * 0.55
      const x1 = tr.left + tr.width * 0.5, y1 = tr.top - 10
      c.grab(x0, y0)
      mode = 'drag'
      const T = 420, t0 = performance.now()
      await new Promise((res) => {
        const stepF = (now) => {
          const k = Math.min(1, (now - t0) / T), e = k * k * (3 - 2 * k)
          c.drag(x0 + (x1 - x0) * e * 0.7, y0 + (y1 - y0) * e * 0.62 - Math.sin(k * Math.PI) * 30)
          mark(k > 0.5 ? trayEl('next') : null)
          if (k < 1) requestAnimationFrame(stepF); else res()
        }
        requestAnimationFrame(stepF)
      })
      mark(null)
      c.release()
      mode = 'idle'
      act('next', { vx: (x1 - x0) * 2.2, vy: (y1 - y0) * 1.4 })
      if (pick) setTimeout(() => { if (mode === 'step') answer('ctx:@computer') }, 2600)
    },
  }
}
