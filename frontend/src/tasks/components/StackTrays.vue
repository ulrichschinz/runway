<script setup>
/**
 * The card stack's trays (06 `stack.js renderTrays`, `combo.css .tray*`; plan M10, brief 0057):
 * the question, the trays as hairline boxes with their key and count, and the key hints. A step
 * turns them into its answers; "Neues Projekt" turns them into a name field and Zurück. Shows only
 * what it is given (`stackTrays`) and reports a tap; the stack does the rest.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '../../shared/i18n.js'
import { stackQuestion, trayName } from '../../shared/stackSteps.js'

const props = defineProps({
  /** `stackTrays()` for the open step */
  trays: { type: Array, required: true },
  /** `{step, project}` */
  state: { type: Object, required: true },
  /** a message key: why the typed project name cannot be taken */
  nameError: { type: String, default: '' },
  /** touch or phone: no key hints, the tap-or-drag hint instead */
  compact: { type: Boolean, default: false },
  /** the tray under a dragged card */
  target: { type: String, default: null },
})
const emit = defineEmits(['pick', 'name'])

/** `[before, emphasised, after]`, or the first question as plain text; joined, the trays' group name. */
const question = computed(() => stackQuestion(props.state))
const naming = computed(() => props.state.step === 'newproject')
const keyed = computed(() => props.trays.filter((tr) => tr.key && tr.to !== 'back').length)
/** The key hints: `[[keys, what], …]` (06 `stack.keys`, `stack.keys.step`). */
const hints = computed(() => {
  if (props.compact || naming.value) return []
  return props.state.step ? t('stack.keys.step', { n: Math.min(9, keyed.value) }) : t('stack.keys')
})
const cols = computed(() => {
  if (naming.value) return null
  const n = props.trays.length
  return n <= 6 ? n : Math.ceil(n / 2)
})

const box = ref(null)
const nameInput = ref(null)

/** Enter takes the name, Esc goes back to the projects; an IME's own Enter is left alone. */
function onNameKey(event) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('name', event.target.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('pick', 'back')
  }
}

watch(naming, (on) => {
  if (on) nextTick(() => nameInput.value?.focus())
})

/** A drop lands where it lands: the trays' boxes in order, for `trayAt`. */
function boxes() {
  return [...(box.value?.querySelectorAll('[data-to]') ?? [])].map((el) => ({ to: el.dataset.to, el, rect: el.getBoundingClientRect() }))
}
const elOf = (to) => box.value?.querySelector(`[data-to="${CSS.escape(to)}"]`) ?? null

/** The tray a card just went into gives a little under its weight (06 `bump`). */
function bump(to) {
  const el = elOf(to)
  if (!el) return
  el.classList.remove('accept')
  void el.offsetWidth
  el.classList.add('accept')
}

/**
 * The focus on the first tray, so the keyboard and screen readers follow a step. The page moves
 * only when that tray is out of sight (a short window, 200 % zoom), and then clear of the dock.
 */
function focusFirst() {
  nextTick(() => {
    const el = box.value?.querySelector('.tray')
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  })
}

defineExpose({ boxes, elOf, bump, focusFirst })
</script>

<template>
  <div class="stack-trays">
    <!-- shown once: screen readers hear it as the trays' group name -->
    <p class="stack-q" aria-hidden="true">
      <span class="slash">//</span>
      <span>{{ question[0] }}<b>{{ question[1] }}</b>{{ question[2] }}</span>
    </p>
    <div
      ref="box" class="trays" :class="[state.step ? `is-step is-${state.step}` : '', { 'is-newproject': naming }]"
      :style="cols ? { '--cols': cols } : null" role="group" :aria-label="question.join('')"
    >
      <label v-if="naming" class="tray-new">
        <input
          ref="nameInput" :placeholder="t('proj.newPh')" :aria-label="t('proj.newPh')" maxlength="100" autocomplete="off"
          enterkeyhint="done" :aria-invalid="!!nameError || undefined" aria-describedby="stack-name-hint" @keydown="onNameKey"
        >
        <span id="stack-name-hint" class="err" :class="{ bad: nameError }" aria-live="polite">{{ nameError ? t(nameError) : t('stack.newProjHint') }}</span>
      </label>
      <button
        v-for="tr in trays" :key="tr.to" type="button" class="tray" :data-to="tr.to"
        :class="[`tray-${tr.to.replace(/[^a-z]/g, '')}`, { 'mono-label': tr.mono, target: target === tr.to }]"
        :aria-label="trayName(tr)"
        @click="emit('pick', tr.to)"
      >
        <span class="tray-top"><kbd v-if="tr.key" aria-hidden="true">{{ tr.key }}</kbd><span v-if="tr.n != null" class="tray-n">{{ tr.n }}</span></span>
        <span class="tray-label">{{ tr.label }}</span>
        <span class="tray-hint">{{ tr.hint }}</span>
      </button>
    </div>
    <p v-if="compact && !state.step" class="stack-hint">{{ t('stack.keys.touch') }}</p>
    <p v-else-if="hints.length" class="stack-hint">
      <template v-for="([keys, what], i) in hints" :key="i">
        <span v-if="i" class="dot" aria-hidden="true">·</span>
        <span class="pair"><kbd v-for="(k, j) in keys.split(/(–| oder )/)" :key="j" :class="{ plain: k === '–' || k === ' oder ' }">{{ k }}</kbd> {{ what }}</span>
      </template>
    </p>
  </div>
</template>

<style scoped>
.stack-trays { display: flex; flex-direction: column; align-items: center; width: 100%; }
.stack-q { margin: 0 0 12px; font-size: 15px; color: var(--rw-mute); display: flex; gap: 8px; align-items: baseline; }
.stack-q .slash { font-family: var(--rw-font-mono); color: var(--rw-action); }
.stack-q b { color: var(--rw-text); font-weight: 500; }
.trays { display: grid; grid-template-columns: repeat(var(--cols, 5), minmax(0, 1fr)); gap: 10px; width: 100%; position: relative; z-index: 2; }
.tray {
  min-height: 96px; border-radius: var(--rw-radius-lg); background: transparent; border: 1px solid var(--rw-rule-strong);
  padding: 11px 12px 10px; display: grid; grid-template-rows: auto 1fr auto; text-align: left; position: relative; min-width: 0;
  scroll-margin: 16px 0 84px; /* clear of the capture line below */
  transition: transform var(--rw-dur-base) var(--rw-ease), background var(--rw-dur-fast), border-color var(--rw-dur-fast), box-shadow var(--rw-dur-base);
}
.tray:hover { background: var(--rw-hover); border-color: var(--rw-text); }
.tray.target { border-color: var(--rw-text); background: var(--rw-focus); transform: translateY(-3px); box-shadow: inset 0 -2px 0 var(--rw-marker); }
.tray.accept { animation: rw-accept 420ms var(--rw-ease); }
@keyframes rw-accept { 0% { transform: translateY(-3px); } 30% { transform: translateY(2px) scale(1.03, 0.95); } 100% { transform: none; } }
.tray-top { display: flex; justify-content: space-between; align-items: center; min-height: 18px; }
.tray-n { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.tray-label {
  align-self: end; font-size: 15px; font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tray.mono-label .tray-label { font-family: var(--rw-font-mono); font-size: 13px; font-weight: 400; letter-spacing: 0; }
.tray-hint {
  font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; margin-top: 2px;
}
/* no hint (a context of the user's own): the line stays, so every name sits on the same line */
.tray-hint:empty::before { content: '\a0'; }
/* project names and their hint get a second line before they are cut (the phone wraps its own way, below) */
@media (min-width: 761px) {
  .trays.is-project .tray-label, .trays.is-project .tray-hint {
    white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  }
  .trays.is-project .tray { row-gap: 4px; }
  .trays.is-project .tray-label { line-height: 1.2; }
}
.tray-next { border-color: var(--rw-text); }
.tray-delete, .tray-back { border-style: dashed; }
.tray-delete .tray-label, .tray-back .tray-label { color: var(--rw-mute); }
.trays.is-step .tray { animation: rw-trayin 240ms var(--rw-ease) backwards; }
.trays.is-step .tray:nth-child(2) { animation-delay: 20ms; }
.trays.is-step .tray:nth-child(3) { animation-delay: 40ms; }
.trays.is-step .tray:nth-child(4) { animation-delay: 60ms; }
.trays.is-step .tray:nth-child(5) { animation-delay: 80ms; }
.trays.is-step .tray:nth-child(n+6) { animation-delay: 100ms; }
@keyframes rw-trayin { from { transform: translateY(8px); opacity: 0; } }
.trays.is-newproject { grid-template-columns: minmax(0, 1fr) 120px; }
.tray-new {
  display: grid; gap: 8px; align-content: center; padding: 10px 14px; border: 1px solid var(--rw-text);
  border-radius: var(--rw-radius-lg); min-height: 60px;
}
.tray-new input {
  border: 0; outline: 0; background: transparent; font-size: 17px; border-bottom: 1px solid var(--rw-marker); padding: 4px 0; min-width: 0;
}
.tray-new .err { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.tray-new .err.bad { color: var(--rw-overdue); }
kbd {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 10.5px; line-height: 1; color: var(--rw-mute);
}
kbd.plain { border: 0; min-width: 0; padding: 0 2px; }
.stack-hint {
  margin: 16px 0 0; font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute);
  display: flex; gap: 5px 8px; align-items: center; flex-wrap: wrap; justify-content: center; text-align: center;
}
.pair { display: inline-flex; align-items: center; gap: 4px; }
.dot { color: var(--rw-soft); }
@media (prefers-reduced-motion: reduce) {
  .tray, .tray.accept, .trays.is-step .tray { animation: none; transition: none; }
}
@media (hover: none) { .tray-top kbd { display: none; } }
@media (max-width: 760px) {
  .trays { gap: 6px; }
  .tray {
    min-height: 92px; padding: 8px 3px; text-align: center; justify-items: center; align-content: center;
    grid-template-rows: auto auto; gap: 6px; scroll-margin-bottom: 136px; /* the phone dock */
  }
  .tray-top kbd, .tray-hint, .tray-n { display: none; }
  .tray-top { justify-content: center; min-height: 0; }
  .tray-label {
    font-size: 12.5px; line-height: 1.15; align-self: auto; max-width: 100%; white-space: normal; hyphens: auto;
    -webkit-hyphens: auto; overflow-wrap: anywhere;
  }
  .trays.is-step { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .trays.is-step .tray { min-height: 60px; }
  .trays.is-newproject { grid-template-columns: minmax(0, 1fr) 96px; }
  .stack-q { font-size: 14px; }
  .tray-new input { font-size: 16px; }
}
</style>
