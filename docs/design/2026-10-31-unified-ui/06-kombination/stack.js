// The Inbox card stack (graft from 05's stack.js): the touch Klären mode and the optional "Stapel"
// mode on desktop. The card is DOM with CSS 3D springs (card.js, unchanged from 05); WebGL is not
// involved. Every gesture has a key and a button; input never waits for an animation.
// Drawn in 03's language: paper card, hairline trays, mono keycaps, no icon set.
//
// Five trays, keys 1-5. A destination that needs one more answer turns the trays into that answer
// (graft "never guess metadata"): Nächste -> context 1-5; Warten auf -> follow-up day 1-4;
// Projekt (p) -> project 1-9, then its first action's context. "Zurück" is 0 or Esc.
// Nothing is written until the last answer is given; the writes are the same rules.js moves the
// two-key panel sends.

import { createCard } from './card.js'
import { t } from './i18n.js'
import { esc, entryInfo, followOptions } from './common.js'
import { CONTEXTS, contextsOf } from './store.js'

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

export function createStack(o) {
  const { store, root } = o
  const motionOK = () => (o.motion ? o.motion() : true)
  const compact = () => (typeof o.compact === 'function' ? o.compact() : !!o.compact)
  root.innerHTML = `<div class="stack-wrap"><div class="stack-slot"></div></div>
    <p class="stack-q" aria-hidden="true"></p>
    <div class="trays" role="group" aria-label="${esc(t('stack.trays'))}"></div>
    <p class="stack-hint"></p><p class="sr" aria-live="polite" id="stacksr"></p>`
  const slot = root.querySelector('.stack-slot')
  const traysEl = root.querySelector('.trays')
  const hintEl = root.querySelector('.stack-hint')
  const qEl = root.querySelector('.stack-q')
  const srEl = root.querySelector('#stacksr')

  // three paper cards below the top one; the first carries the next item's text
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
  let step = null // { kind: 'ctx' | 'follow' | 'project' | 'projctx', options, project }
  let visible = false, processed = 0
  const skipped = new Set()
  let pinned = null
  const history = [] // { id, to } for Rückgängig (the card flies back out of its tray)

  const TRAYS = () => [
    { to: 'next', key: '1', label: t('list.next'), hint: t('stack.hint.next') },
    { to: 'waiting', key: '2', label: t('list.waiting'), hint: t('stack.hint.waiting') },
    { to: 'someday', key: '3', label: t('list.someday'), hint: t('stack.hint.someday') },
    { to: 'done', key: '4', label: t('stack.done'), hint: t('stack.hint.done') },
    { to: 'delete', key: '5', label: t('stack.delete'), hint: t('stack.hint.delete') },
  ]
  const BACK = () => ({ to: 'back', key: '0', label: t('stack.back'), hint: t('stack.hint.back') })

  function order() {
    const ids = store.lists().inbox.map((x) => x.id)
    let o2 = [...ids.filter((i) => !skipped.has(i)), ...ids.filter((i) => skipped.has(i))]
    if (pinned && o2.includes(pinned)) o2 = [pinned, ...o2.filter((i) => i !== pinned)]
    return o2.map((i) => store.get(i))
  }
  const current = () => order()[0] || null
  const trayEl = (to) => traysEl.querySelector(`[data-to="${CSS.escape(to)}"]`)

  function stepOptions(kind) {
    if (kind === 'ctx' || kind === 'projctx') {
      const L = store.lists()
      return CONTEXTS.map((c, i) => ({ to: `ctx:${c}`, key: String(i + 1), label: c, hint: t(`ctxhint.${c.slice(1)}`), n: L.ctxCount[c], mono: true }))
    }
    if (kind === 'follow') return followOptions().map((f, i) => ({ to: `day:${f.day}`, key: String(i + 1), label: f.label, hint: f.hint }))
    if (kind === 'project') {
      // after review: the last option (at most 9) creates a project (before, only the panel's `p n` could)
      const ps = store.projectOverview().filter((p) => p.status === 'active').slice(0, 8)
        .map((p, i) => ({ to: `proj:${p.name}`, key: String(i + 1), label: p.name, hint: t('stack.projNext', { n: p.next }) }))
      return [...ps, { to: 'newproj', key: String(ps.length + 1), label: t('cl.newProject'), hint: t('stack.hint.newProj') }]
    }
    return []
  }

  const trayHTML = (tr, count) => `<button class="tray tray-${tr.to.replace(/[^a-z]/g, '')}${tr.mono ? ' mono-label' : ''}" data-to="${esc(tr.to)}" aria-label="${esc(tr.label)} (${esc(t('stack.key', { k: tr.key }))})">
      <span class="tray-top"><kbd>${tr.key}</kbd>${count != null ? `<span class="tray-n">${count}</span>` : ''}</span>
      <span class="tray-label">${esc(tr.label)}</span>
      <span class="tray-hint">${esc(tr.hint)}</span>
    </button>`

  function renderTrays() {
    if (mode === 'step' && step.kind === 'newproject') {
      traysEl.className = 'trays is-step is-newproject'
      traysEl.style.setProperty('--cols', '1')
      traysEl.innerHTML = `<label class="tray-new"><span class="sr">${esc(t('proj.newPh'))}</span><input id="stacknewproj" placeholder="${esc(t('proj.newPh'))}" maxlength="100" autocomplete="off" enterkeyhint="done"><span class="mono mute err" aria-live="polite">${esc(t('stack.newProjHint'))}</span></label>${trayHTML(BACK(), null)}`
      qEl.innerHTML = `<span class="slash">//</span> ${t('stack.q.newProj')}`
      hintEl.innerHTML = ''
      return
    }
    if (mode === 'step') {
      const all = [...step.options, BACK()]
      traysEl.className = `trays is-step is-${step.kind}`
      traysEl.style.setProperty('--cols', String(all.length <= 6 ? all.length : Math.ceil(all.length / 2)))
      traysEl.innerHTML = all.map((tr) => trayHTML(tr, tr.n ?? null)).join('')
      const q = step.kind === 'ctx' ? t('stack.q.ctx') : step.kind === 'follow' ? t('stack.q.follow')
        : step.kind === 'project' ? t('stack.q.project') : t('stack.q.projctx', { p: step.project })
      qEl.innerHTML = `<span class="slash">//</span> ${q}`
      hintEl.innerHTML = compact() ? '' : t('stack.keys.step', { n: Math.min(9, step.options.length) })
      return
    }
    traysEl.className = 'trays'
    traysEl.style.removeProperty('--cols')
    const L = store.lists()
    const n = { next: L.next.length, waiting: L.waiting.length, someday: L.someday.length, done: L.doneToday.length, delete: null }
    traysEl.innerHTML = TRAYS().map((tr) => trayHTML(tr, n[tr.to])).join('')
    qEl.innerHTML = `<span class="slash">//</span> ${t('stack.q.what')}`
    hintEl.innerHTML = compact() ? t('stack.keys.touch') : t('stack.keys')
  }

  function faceHTML(x, i, total) {
    const note = x.annotations[0]?.description
    return `<div class="face-top"><span class="eyebrow"><span class="slash">//</span><span>${esc(t('stack.captured', { d: entryInfo(x) }))}</span></span><span class="face-n">${t('stack.count', { i: i + 1, n: total })}</span></div>
      <p class="face-text" data-id="${x.id}" spellcheck="false">${esc(x.description)}</p>
      ${note ? `<p class="face-note"><span class="mono">¶</span> ${esc(note)}</p>` : '<p class="face-note"></p>'}
      ${x.sync === 'failed' ? `<p class="unsent"><span>${t('sync.unsent')}</span> · <button data-retry="">${t('sync.retry')}</button></p>` : ''}
      <div class="face-tools">
        <button class="ctx" data-face="project">${t('stack.tool.project')} <kbd>p</kbd></button>
        <button class="ctx" data-face="edit">${t('stack.tool.edit')} <kbd>e</kbd></button>
        <button class="ctx" data-face="skip">${t('stack.tool.skip')} <kbd>→</kbd></button>
      </div>`
  }

  function render() {
    const items = order()
    const top = items[0]
    root.classList.toggle('is-empty', !top)
    root.classList.toggle('is-step', mode === 'step')
    if (top) {
      face.innerHTML = faceHTML(top, processed, processed + items.length)
      srEl.textContent = mode === 'step' ? `${top.description}: ${qEl.textContent}` : t('stack.sr', { i: processed + 1, n: processed + items.length, d: top.description })
    } else {
      face.innerHTML = ''
      srEl.textContent = t('h.inboxEmpty').join('')
      card.reset()
    }
    face.classList.toggle('held', mode === 'step')
    const nx = items[1]
    nextFace.innerHTML = nx ? `<div class="face-top"><span class="eyebrow"><span class="slash">//</span><span>${t('stack.nextUp')}</span></span></div><p class="face-text">${esc(nx.description)}</p>` : ''
    renderTrays()
    card.setDepth(Math.max(0, items.length - 1))
    if (o.onChange) o.onChange(items.length)
  }

  function bump(to) {
    const el = trayEl(to)
    if (!el) return
    el.classList.remove('accept'); void el.offsetWidth; el.classList.add('accept')
  }

  /** Fly the card into a tray, then commit, let the next card rise and bump the destination tray. */
  function sendTo(bumpTo, el, vel, commit) {
    const c = M()
    const land = () => {
      mode = 'idle'; step = null
      commit()
      render()
      bump(bumpTo)
      if (c && visible && current()) c.rise()
    }
    if (c && visible && el) { mode = 'flying'; c.throwTo(el.getBoundingClientRect(), vel, land) } else land()
  }
  function done(x, to) {
    processed++
    history.push({ id: x.id, to })
    if (pinned === x.id) pinned = null
    skipped.delete(x.id)
  }

  function act(to, vel) {
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (mode === 'step') return
    const x = current()
    if (!x) return
    if (to === 'next') return openStep('ctx')
    if (to === 'waiting') return openStep('follow')
    if (to === 'project') return openStep('project')
    sendTo(to, trayEl(to), vel, () => { o.file(x.id, to); done(x, to) })
  }

  function openStep(kind, project = null) {
    mode = 'step'
    step = { kind, options: stepOptions(kind), project }
    render()
    const c = M()
    if (c && visible) c.hold()
    if (visible) traysEl.querySelector('.tray')?.focus({ preventScroll: true })
  }

  /** Answer the open step: 'ctx:@x' | 'day:YYYY-MM-DD' | 'day:' | 'proj:Name' | 'back'. */
  function answer(to, vel) {
    const x = current()
    if (!x || mode !== 'step') return
    if (to === 'back') return cancel()
    const el = trayEl(to)
    if (!el) return
    const kind = step.kind
    if (kind === 'project' && to === 'newproj') { openStep('newproject'); traysEl.querySelector('#stacknewproj')?.focus({ preventScroll: true }); return }
    if (kind === 'project') return openStep('projctx', to.slice(5))
    if (kind === 'ctx') return sendTo(to, el, vel, () => { o.file(x.id, `next:${to.slice(4)}`); done(x, to) })
    if (kind === 'projctx') { const p = step.project; return sendTo(to, el, vel, () => { o.file(x.id, `project:${p}`, { ctx: to.slice(4) }); done(x, to) }) }
    if (kind === 'follow') return sendTo(to, el, vel, () => { o.file(x.id, 'waiting', { followUp: to.slice(4) }); done(x, to) })
  }

  function cancel() {
    if (mode !== 'step') return
    const back = ['projctx', 'newproject'].includes(step.kind) ? 'project' : null
    if (back) return openStep(back)
    mode = 'idle'; step = null
    render()
    const c = M()
    if (c) c.back()
    if (visible) traysEl.querySelector('.tray')?.focus({ preventScroll: true })
  }

  function skip() {
    const x = current()
    if (!x || mode === 'step') return
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (order().length < 2) return
    const s = slot.getBoundingClientRect()
    const land = () => { skipped.add(x.id); if (pinned === x.id) pinned = null; mode = 'idle'; render(); if (c && visible) c.rise() }
    if (c && visible) { mode = 'flying'; c.throwTo({ left: s.right - s.width * 0.35, top: s.bottom - 20, width: s.width * 0.55, height: 30 }, { vx: 400, vy: 200 }, land) } else land()
  }

  function edit() {
    const p = face.querySelector('.face-text')
    if (!p || mode !== 'idle') return
    p.contentEditable = 'true'
    p.focus()
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false)
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r)
  }
  face.addEventListener('keydown', (e) => {
    const p = e.target.closest?.('.face-text[contenteditable="true"]')
    if (!p) return
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      if (e.key === 'Enter') store.rename(Number(p.dataset.id), p.textContent)
      p.contentEditable = 'false'
      render()
    }
  })

  // ---------------- pointer: drag, flick, tap (05) ----------------
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
    traysEl.querySelectorAll('.tray.target').forEach((x) => x !== el && x.classList.remove('target'))
    if (el) el.classList.add('target')
  }
  face.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, [contenteditable="true"]') || !current()) return
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
    if (b.dataset.face === 'project') act('project')
    if (b.dataset.face === 'edit') edit()
    if (b.dataset.face === 'skip') skip()
  })
  traysEl.addEventListener('keydown', (e) => {
    if (e.target.id !== 'stacknewproj') return
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const res = store.createProject(e.target.value.trim())
    if (res.error) { const err = e.target.parentElement.querySelector('.err'); err.textContent = t(res.error); err.classList.add('bad'); return }
    openStep('projctx', res.name)
  })
  traysEl.addEventListener('click', (e) => {
    if (e.target.closest('.tray-new')) return
    const el = e.target.closest('.tray')
    if (!el) return
    if (mode === 'step') answer(el.dataset.to)
    else act(el.dataset.to)
  })

  function key(e) {
    if (!visible) return false
    if (mode === 'step') {
      if (e.key === 'Escape' || e.key === '0' || e.key === 'Backspace') { cancel(); return true }
      if (/^[1-9]$/.test(e.key)) { const opt = step.options.find((x) => x.key === e.key); if (opt) answer(opt.to); return true }
      return false
    }
    if (/^[1-5]$/.test(e.key)) { act(TRAYS()[Number(e.key) - 1].to); return true }
    if (e.key === 'p') { act('project'); return true }
    if (e.key === 'e') { edit(); return true }
    if (e.key === 'ArrowRight' || e.key === 'l') { skip(); return true }
    if (e.key === 'Delete') { act('delete'); return true }
    if (e.key === 'x') { act('done'); return true }
    return false
  }

  /** Rückgängig: the card comes back out of its tray onto the stack. */
  function returnCard(id) {
    const i = history.findLastIndex((h) => h.id === id)
    if (i < 0) { render(); return }
    const [last] = history.splice(i, 1)
    const c = M()
    if (mode === 'flying' && c) c.finishNow()
    if (mode === 'step') { mode = 'idle'; step = null }
    processed = Math.max(0, processed - 1)
    pinned = last.id
    render()
    const el = trayEl(last.to) || trayEl(last.to.startsWith('ctx:') ? 'next' : last.to.startsWith('day:') ? 'waiting' : 'next')
    if (c && visible) { if (el) c.returnFrom(el.getBoundingClientRect()); else c.rise() }
  }

  return {
    render, key, current, act, answer, cancel, returnCard,
    get mode() { return mode },
    get step() { return step ? step.kind : null },
    get frames() { return card.frames },
    layout() { card.layout() },
    setVisible(v) {
      if (visible === v) { render(); return }
      visible = v
      mode = 'idle'; step = null
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
    /** proto.clarify for the stack: to = 'next:@ctx' | 'waiting[:YYYY-MM-DD]' | 'someday' | 'done' | 'delete' */
    clarify(id, to) {
      const x = store.get(id)
      if (!x) return false
      if (current()?.id !== x.id) { pinned = x.id; render() }
      const wait = M() && visible ? 420 : 0
      const [k, arg] = String(to).split(/:(.*)/s)
      if (k === 'next') { act('next'); if (arg) setTimeout(() => answer(`ctx:${arg}`), wait) }
      else if (k === 'waiting') { act('waiting'); setTimeout(() => answer(`day:${arg || ''}`), wait) }
      else act(k)
      return true
    },
    /** Grab the top card, drag it towards Nächste and let go: the trays turn into the contexts. */
    async lift() {
      const c = M()
      if (!c || !current()) { act('next'); return }
      const s = slot.getBoundingClientRect()
      const tr = trayEl('next').getBoundingClientRect()
      const x0 = s.left + s.width * 0.55, y0 = s.top + s.height * 0.55
      const x1 = tr.left + tr.width * 0.5, y1 = tr.top - 10
      c.grab(x0, y0)
      mode = 'drag'
      const T = 420, t0 = performance.now()
      await new Promise((res) => {
        const f = (now) => {
          const k = Math.min(1, (now - t0) / T), ease = k * k * (3 - 2 * k)
          c.drag(x0 + (x1 - x0) * ease * 0.55, y0 + (y1 - y0) * ease * 0.5 - Math.sin(k * Math.PI) * 24)
          mark(k > 0.5 ? trayEl('next') : null)
          if (k < 1) requestAnimationFrame(f); else res()
        }
        requestAnimationFrame(f)
      })
      mark(null)
      c.release()
      mode = 'idle'
      act('next', { vx: 0, vy: 0 })
    },
  }
}
