<script setup>
/**
 * The Inbox as a card stack (06 `stack.js`, `card.js`, `combo.css .stack-*`; plan M10, brief
 * 0057): the touch Klären mode, and an optional mode on desktop. The top card is real text on a
 * paper card (when it was captured, its first note up to four lines, its project if any), with
 * up to three cards below; the next item's text shows on the first one only where the top card
 * has uncovered it. Below, the trays (`StackTrays.vue`).
 *
 * The card is dragged or flicked into a tray with a finger, a pen or a mouse (`trayAt`), a tray is
 * tapped, or a key chooses it (the page's keymap calls `choose`). Choosing writes first (the page's
 * `choose` prop files through the store); the card that leaves is a copy that flies into the tray
 * while the next card rises, so no input waits for an animation. A tray that needs one more answer
 * holds the card, lifted, while the trays turn into the answers. With reduced motion nothing
 * animates. `e` edits the text on the card (Enter saves, Esc cancels), `→` skips the card.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ErrorRow from '../../layout/ui/ErrorRow.vue'
import { trayAt } from '../../shared/gestures.js'
import { t } from '../../shared/i18n.js'
import { stackQuestion, trayOfFiling } from '../../shared/stackSteps.js'
import { useGtdStore } from '../stores/gtd.js'
import { cardFrames, createCardSpring } from '../useCardSpring.js'
import StackTrays from './StackTrays.vue'

const props = defineProps({
  /** the cards, top first (`useCardStack().order`) */
  cards: { type: Array, required: true },
  /** cards filed since the stack was shown, for "2 von 5" */
  processed: { type: Number, default: 0 },
  /** when the top card was captured (`entryInfo`): "heute 08:12" */
  captured: { type: String, default: '' },
  /** `{step, project}` */
  state: { type: Object, required: true },
  /** `stackTrays()` */
  trays: { type: Array, required: true },
  nameError: { type: String, default: '' },
  /** touch or phone: the tap-or-drag hint, no key caps */
  compact: { type: Boolean, default: false },
  /** prefers-reduced-motion: nothing animates */
  reduced: { type: Boolean, default: false },
  /** `(to) => 'filed'|'step'|null`: the page files or opens a step (`useCardStack().pick`) */
  pick: { type: Function, required: true },
  /** `() => boolean`: the top card goes to the bottom (`useCardStack().skip`) */
  skipCard: { type: Function, required: true },
})
const emit = defineEmits(['rename', 'name', 'retry'])
const gtd = useGtdStore()

const top = computed(() => props.cards[0] ?? null)
const next = computed(() => props.cards[1] ?? null)
const total = computed(() => props.processed + props.cards.length)
const note = computed(() => top.value?.annotations?.[0]?.description ?? '')
const unders = computed(() => Math.min(3, Math.max(0, props.cards.length - 1)))
const live = computed(() => {
  if (!top.value) return ''
  if (props.state.step) return `${top.value.description}: ${stackQuestion(props.state).join('')}`
  return t('stack.sr', { i: props.processed + 1, n: total.value, d: top.value.description })
})

const slot = ref(null)
const face = ref(null)
const nextFace = ref(null)
const ghosts = ref(null)
const traysView = ref(null)
const text = ref(null)
/** the tray under a dragged card */
const target = ref(null)
const editing = ref(false)
let card = null

const motion = () => !props.reduced && !!card

onMounted(() => {
  card = createCardSpring({ slot: slot.value, face: face.value, nextFace: nextFace.value })
  card.setDepth(props.cards.length - 1)
  card.layout()
  window.addEventListener('resize', onResize)
  // Development only: the frames the cards have drawn, for the "0 frames at rest" check (plan §5).
  if (import.meta.env.DEV) window.__runway = { ...window.__runway, stack: { get frames() { return cardFrames() } } }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  card?.dispose()
  card = null
  for (const g of liveGhosts) g.drop()
})
const onResize = () => card?.layout()
watch(() => props.cards.length, (n) => card?.setDepth(n - 1))

/** Copies on their way into a tray. */
const liveGhosts = new Set()

/** A copy of the card where it is now, to fly away while the real card shows the next item. */
function makeGhost() {
  if (!motion() || !face.value || !ghosts.value) return null
  const el = face.value.cloneNode(true)
  el.classList.add('ghost')
  el.classList.remove('grabbing')
  el.setAttribute('aria-hidden', 'true')
  el.removeAttribute('tabindex')
  el.inert = true
  el.style.width = `${face.value.offsetWidth}px`
  el.style.height = `${face.value.offsetHeight}px`
  ghosts.value.appendChild(el)
  const spring = createCardSpring({ slot: slot.value, face: el })
  spring.setPose(card.pose())
  const ghost = {
    fly(rect, vel) {
      spring.throwTo(rect, vel, () => ghost.drop())
    },
    drop() {
      liveGhosts.delete(ghost)
      spring.dispose()
      el.remove()
    },
  }
  liveGhosts.add(ghost)
  return ghost
}

/** Back where it belongs after a gesture or a choice that filed nothing: held in a step, else at rest. */
function settle() {
  if (!motion()) return
  if (props.state.step) card.hold()
  else card.back()
}

/**
 * A tray chosen: by a key (the page), a tap, or a drop with the hand's velocity.
 * @returns {'filed'|'step'|null}
 */
function choose(to, vel = { vx: 0, vy: 0 }) {
  if (editing.value || !top.value) return null
  const rect = traysView.value?.elOf(to)?.getBoundingClientRect()
  const ghost = rect ? makeGhost() : null
  const hadFocus = slot.value?.closest('.card-stack')?.contains(document.activeElement)
  const result = props.pick(to)
  if (result === 'filed') {
    card?.reset()
    if (ghost) ghost.fly(rect, vel)
    nextTick(() => {
      if (motion() && top.value) card.rise()
      traysView.value?.bump(trayOfFiling(to))
      if (hadFocus || document.activeElement === document.body) face.value?.focus({ preventScroll: true })
    })
    return result
  }
  ghost?.drop()
  nextTick(() => {
    settle()
    if (result === 'step' && props.state.step && props.state.step !== 'newproject') traysView.value?.focusFirst()
    else if (result === 'step') face.value?.focus({ preventScroll: true })
  })
  return result
}

/** `→`: the card flies off to the bottom of the stack and the next one rises. */
function skip() {
  if (editing.value || props.state.step) return false
  const s = slot.value?.getBoundingClientRect()
  const ghost = s ? makeGhost() : null
  if (!props.skipCard()) {
    ghost?.drop()
    return false
  }
  card?.reset()
  ghost?.fly({ left: s.right - s.width * 0.35, top: s.bottom - 20, width: s.width * 0.55, height: 30 }, { vx: 400, vy: 200 })
  nextTick(() => {
    if (motion() && top.value) card.rise()
  })
  return true
}

/** Rückgängig: the card is back on top; it flies out of the tray it went into. */
function returnFrom(tray) {
  nextTick(() => {
    const rect = traysView.value?.elOf(tray)?.getBoundingClientRect()
    if (motion() && rect) card.returnFrom(rect)
    else card?.reset()
  })
}

// ── `e`: the text, edited on the card ───────────────────────────────────────────────
let editingId = null
function edit() {
  if (!top.value || props.state.step || editing.value) return
  editingId = top.value.uuid
  editing.value = true
  nextTick(() => {
    const p = text.value
    if (!p) return
    p.focus()
    const range = document.createRange()
    range.selectNodeContents(p)
    range.collapse(false)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
}
function endEdit(save) {
  if (!editing.value) return
  const p = text.value
  const value = (p?.textContent ?? '').replace(/\s+/g, ' ').trim()
  editing.value = false
  if (save && value && editingId) emit('rename', editingId, value)
  // The text node goes back to what the store holds (a save shows once the store has it).
  if (p && top.value) p.textContent = top.value.description
  editingId = null
  nextTick(() => face.value?.focus({ preventScroll: true }))
}
function onTextKey(event) {
  if (event.isComposing) return
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    endEdit(event.key === 'Enter')
  }
}
// Another card on top (an undo elsewhere): an edit in progress ends unsaved. The same capture under
// the uuid the server just gave it is not another card.
watch(() => top.value?.uuid, (now, before) => {
  if (editing.value && !(now && before && gtd.uuidNow(before) === now)) endEdit(false)
})

// ── drag and flick (06 `stack.js` pointer handlers) ─────────────────────────────────
let drag = null
const velocityOf = (samples) => {
  const s0 = samples[0]
  const s1 = samples[samples.length - 1]
  const dt = Math.max(1, s1.t - s0.t) / 1000
  return { vx: (s1.x - s0.x) / dt, vy: (s1.y - s0.y) / dt }
}
function hovered(x, y, vel, release) {
  const boxes = traysView.value?.boxes() ?? []
  const i = trayAt(boxes.map((b) => b.rect), x, y, vel, release)
  return i >= 0 ? boxes[i].to : null
}
function onDown(event) {
  if (editing.value || !top.value || event.button > 0) return
  if (event.target.closest('button, [contenteditable="true"]')) return
  event.preventDefault()
  card?.finishNow()
  try {
    face.value.setPointerCapture(event.pointerId)
  } catch {
    // not capturable: the face still gets the events it gets
  }
  const now = performance.now()
  drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, moved: false, samples: [{ x: event.clientX, y: event.clientY, t: now }] }
  if (motion()) card.grab(event.clientX, event.clientY)
  face.value.classList.add('grabbing')
}
function onMove(event) {
  if (!drag || event.pointerId !== drag.id) return
  const dx = event.clientX - drag.x0
  const dy = event.clientY - drag.y0
  if (Math.hypot(dx, dy) > 6) drag.moved = true
  const now = performance.now()
  drag.samples.push({ x: event.clientX, y: event.clientY, t: now })
  while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift()
  if (motion()) card.drag(event.clientX, event.clientY, velocityOf(drag.samples))
  else face.value.style.transform = `translate(${dx}px, ${dy}px)`
  target.value = hovered(event.clientX, event.clientY)
}
function onUp(event) {
  if (!drag || event.pointerId !== drag.id) return
  const d = drag
  drag = null
  face.value.classList.remove('grabbing')
  if (!motion()) face.value.style.transform = ''
  target.value = null
  const last = d.samples[d.samples.length - 1]
  const vel = performance.now() - last.t < 120 ? velocityOf(d.samples) : { vx: 0, vy: 0 }
  const to = d.moved && event.type === 'pointerup' ? hovered(event.clientX, event.clientY, vel, true) : null
  if (motion()) card.release()
  if (!to || !choose(to, vel)) settle()
}

function onTool(which) {
  if (props.state.step) return
  if (which === 'project') choose('project')
  else if (which === 'edit') edit()
  else skip()
}

defineExpose({ choose, skip, edit, returnFrom })
</script>

<template>
  <div class="card-stack" :class="{ 'is-step': !!state.step, 'is-empty': !top }">
    <div class="stack-wrap">
      <div ref="slot" class="stack-slot">
        <div class="under u2" :hidden="unders < 3" aria-hidden="true" />
        <div class="under u1" :hidden="unders < 2" aria-hidden="true" />
        <div class="under u0" :hidden="unders < 1" aria-hidden="true">
          <div ref="nextFace" class="next-face">
            <template v-if="next">
              <div class="face-top"><span class="eyebrow"><span class="slash">//</span><span>{{ t('stack.nextUp') }}</span></span></div>
              <p class="face-text">{{ next.description }}</p>
            </template>
          </div>
        </div>
        <div
          ref="face" class="stack-face" :class="{ held: !!state.step, editing }" tabindex="-1" role="group"
          :aria-label="top ? top.description : undefined" @pointerdown="onDown" @pointermove="onMove"
          @pointerup="onUp" @pointercancel="onUp" @lostpointercapture="onUp"
        >
          <template v-if="top">
            <div class="face-top">
              <span class="eyebrow"><span class="slash" aria-hidden="true">//</span><span>{{ t('stack.captured', { d: captured }) }}</span></span>
              <span class="face-n">{{ t('stack.count', { i: processed + 1, n: total }) }}</span>
            </div>
            <p
              ref="text" class="face-text" :class="{ open: editing }" :contenteditable="editing ? 'true' : 'false'" spellcheck="false"
              :role="editing ? 'textbox' : undefined" :aria-label="editing ? t('d.titleField') : undefined"
              @keydown="onTextKey" @blur="endEdit(true)" v-text="top.description"
            />
            <p v-if="top.project" class="face-project"><span class="mono">{{ t('stack.tool.project') }}</span> {{ top.project }}</p>
            <p v-if="note" class="face-note"><span class="mono" aria-hidden="true">¶</span> {{ note }}</p>
            <ErrorRow v-if="top.sync === 'failed'" class="unsent" @retry="emit('retry', top.opId)" />
            <div class="face-tools">
              <button type="button" class="tool" :disabled="!!state.step" @click="onTool('project')">{{ t('stack.tool.project') }} <kbd aria-hidden="true">p</kbd></button>
              <button type="button" class="tool" :disabled="!!state.step" @click="onTool('edit')">{{ t('stack.tool.edit') }} <kbd aria-hidden="true">e</kbd></button>
              <button v-if="cards.length > 1" type="button" class="tool" :disabled="!!state.step" @click="onTool('skip')">
                {{ t('stack.tool.skip') }} <kbd aria-hidden="true">→</kbd>
              </button>
            </div>
          </template>
        </div>
        <div ref="ghosts" class="ghosts" aria-hidden="true" />
      </div>
    </div>
    <StackTrays
      ref="traysView" :trays="trays" :state="state" :name-error="nameError" :compact="compact" :target="target"
      @pick="choose" @name="emit('name', $event)"
    />
    <p class="sr" aria-live="polite">{{ live }}</p>
  </div>
</template>

<style scoped>
.card-stack { display: flex; flex-direction: column; align-items: center; padding-top: 6px; }
.card-stack.is-empty { display: none; }
.stack-wrap {
  position: relative; width: 100%; display: flex; justify-content: center; padding-bottom: 34px;
  perspective: 1400px; perspective-origin: 50% 30%; z-index: 3;
}
.stack-slot { width: 560px; max-width: 100%; position: relative; transform-style: preserve-3d; }
.under {
  position: absolute; inset: 0; border-radius: var(--rw-radius-xl); background: var(--rw-surface);
  border: 1px solid var(--rw-rule); box-shadow: var(--ar-shadow-sm); padding: 22px 26px 20px; overflow: hidden;
}
.under.u0 { transform: translateY(12px) scale(0.966); }
.under.u1 { transform: translateY(24px) scale(0.932); }
.under.u2 { transform: translateY(36px) scale(0.898); }
.under[hidden] { display: none; }
.next-face { opacity: 0; }
.next-face .face-text { color: var(--rw-mute); }
.stack-face, .ghosts :deep(.stack-face) {
  position: relative; padding: 22px 26px 20px; display: flex; flex-direction: column; border-radius: var(--rw-radius-xl);
  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
  background: var(--rw-surface); border: 1px solid var(--rw-rule); box-shadow: var(--ar-shadow-lg);
  transform-origin: 50% 50%; outline: none;
}
.stack-face:focus-visible { box-shadow: var(--ar-shadow-lg), 0 0 0 2px var(--rw-text); }
/* in the hand or in flight the card is not "focused" in any way a ring helps with */
.stack-face.lifted:focus-visible:not(.held) { box-shadow: var(--ar-shadow-lg); }
.ghosts { position: absolute; inset: 0; pointer-events: none; transform-style: preserve-3d; }
.ghosts :deep(.stack-face) { position: absolute; top: 0; left: 0; }
.stack-face.lifted { will-change: transform; }
.stack-face::after {
  content: ''; position: absolute; inset: -1px; border-radius: inherit; box-shadow: var(--ar-shadow-xl);
  opacity: var(--lift, 0); pointer-events: none;
}
.stack-face.grabbing { cursor: grabbing; }
.stack-face.held, .stack-face.editing { cursor: default; }
.stack-face.held .face-tools { opacity: 0.4; }
.face-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.eyebrow {
  display: inline-flex; gap: 0.6em; font-family: var(--rw-font-mono); font-size: var(--rw-type-eyebrow-size);
  letter-spacing: var(--rw-type-eyebrow-tracking); color: var(--rw-mute);
}
.slash { color: var(--rw-action); letter-spacing: 0; }
.face-n { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); white-space: nowrap; }
.face-text {
  font-size: 26px; line-height: 1.22; font-weight: 500; letter-spacing: -0.018em; margin: 18px 0 8px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  color: var(--rw-text); outline: none; overflow-wrap: anywhere;
}
.face-text.open {
  display: block; -webkit-line-clamp: unset; user-select: text; -webkit-user-select: text;
  border-bottom: 1px solid var(--rw-marker); cursor: text;
}
.face-project { margin: 0 0 6px; font-size: 14px; }
.face-note {
  margin: 0; color: var(--rw-mute); font-size: 14px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
}
.mono { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); margin-right: 4px; }
.unsent { margin-top: 8px; }
.face-tools { margin-top: 18px; display: flex; gap: 6px; flex-wrap: wrap; transition: opacity var(--rw-dur-base) var(--rw-ease); }
.tool {
  display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 12px;
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute);
  transition: color var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.tool:hover:not(:disabled) { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.tool:disabled { cursor: default; }
.tool kbd {
  display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill); font-family: var(--rw-font-mono); font-size: 10px; line-height: 1;
}
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (hover: none) { .tool kbd { display: none; } }
@media (pointer: coarse) { .tool { min-height: 44px; } }
@media (max-width: 760px) {
  .stack-slot { width: 100%; }
  .stack-wrap { padding-bottom: 42px; }
  .face-text { font-size: 21px; margin-top: 14px; }
  .stack-face, .under { padding: 18px 18px 16px; }
  .tool { min-height: 44px; padding: 0 14px; }
  .tool kbd { display: none; }
}
</style>
