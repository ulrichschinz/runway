<script setup>
/**
 * The inline field for a project's next action (06 `.inline-add`, `submitInlineAdd`): its text and
 * its context — a next action needs one (06 open question 6), so `⏎` without one says so and sends
 * nothing. The contexts are the clarify panel's (`contextChoices`); `Alt 1`–`5` picks one while
 * typing, a click picks any. `⏎` hands `{text, ctx}` to the page, `Esc` closes the field.
 *
 * `focus(text)` opens it with a text (plan step 05's "→ Nächste").
 */
import { nextTick, ref } from 'vue'
import { t } from '../shared/i18n.js'

const props = defineProps({
  project: { type: String, required: true },
  /** the contexts to offer, in order */
  contexts: { type: Array, required: true },
})
const emit = defineEmits(['add', 'close'])

const text = ref('')
const ctx = ref(null)
const error = ref('')
const input = ref(null)

async function focus(seed = null) {
  if (seed != null) text.value = seed
  error.value = ''
  await nextTick()
  input.value?.focus()
}

function pick(c) {
  ctx.value = ctx.value === c ? null : c
  error.value = ''
}

function submit() {
  const v = text.value.trim()
  if (!v) {
    emit('close')
    return
  }
  if (!ctx.value) {
    error.value = 'proj.addNeedCtx'
    return
  }
  emit('add', { text: v, ctx: ctx.value })
  text.value = ''
  error.value = ''
}

function onKey(event) {
  if (event.isComposing) return
  if (event.altKey && /^Digit[1-5]$/.test(event.code)) {
    event.preventDefault()
    const c = props.contexts[Number(event.code.slice(5)) - 1]
    if (c) pick(c)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

defineExpose({ focus })
</script>

<template>
  <div class="inline-add" role="group" :aria-label="t('proj.addPh', { p: project })" @keydown.esc.stop="emit('close')">
    <span class="plus" aria-hidden="true">+</span>
    <input
      ref="input" v-model="text" :placeholder="t('proj.addPh', { p: project })" :aria-label="t('proj.addPh', { p: project })"
      maxlength="500" enterkeyhint="done" autocomplete="off" aria-describedby="next-add-hint" @keydown="onKey"
    >
    <span class="ctxs" role="group" :aria-label="t('proj.addCtx')">
      <button
        v-for="(c, i) in contexts" :key="c" type="button" class="ctx" :aria-pressed="ctx === c"
        :title="i < 5 ? `Alt ${i + 1}` : undefined" @click="pick(c)"
      >{{ c }}</button>
    </span>
    <span id="next-add-hint" class="hint" :class="{ bad: error }" aria-live="polite">{{ error ? t(error) : t('proj.addHint') }}</span>
  </div>
</template>

<style scoped>
/* 06 web.css .inline-add, combo.css .addctx */
.inline-add {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 18px; padding: 8px 4px;
  border-bottom: 1px solid var(--rw-rule-strong);
}
/* the marker rule shows the focus, as on the capture line: yellow only while the text field has it */
.inline-add:has(input:focus) { border-bottom-color: var(--rw-marker); }
.plus { font-family: var(--rw-font-mono); color: var(--rw-mute); }
input {
  flex: 1 1 240px; min-width: 0; min-height: 36px; border: 0; outline: 0; background: transparent; color: var(--rw-text);
  font: inherit; font-size: 15px;
}
/* the row's marker rule above shows the focus instead of the focus box */
input:focus-visible { outline: 0; }
input::placeholder { color: var(--rw-soft); }
.ctxs { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.ctx {
  display: inline-flex; align-items: center; min-height: 30px; padding: 0 10px; border: 1px solid var(--rw-rule);
  border-radius: var(--rw-radius-pill); font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute);
}
.ctx:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.ctx[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
.hint { flex: 1 1 100%; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.hint.bad { color: var(--rw-overdue); }
@media (max-width: 760px) {
  .ctx { min-height: 44px; padding: 0 12px; }
}
</style>
