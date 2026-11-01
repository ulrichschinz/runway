<script setup>
/**
 * The capture line (06 `#capture`, plan M6, brief 0052): "Neues Todo", Enter sends it to the
 * Inbox at once and the notice offers "In Inbox ✓ · Rückgängig". It never asks for anything
 * else; the page, its tab and its chip stay as they are.
 *
 * What is typed is the draft (`captureDraft.js`): kept on every keystroke, shown in every
 * tab, and turned into a capture when the page it was typed on goes away (`pagehide`, as
 * Android does when the app leaves the foreground). That capture is sent with keepalive at
 * once; should even that fail, it waits in the stored outbox for the next start.
 *
 * `focus()` is exposed for the `n` key of the page's keymap.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PHONE, useMedia } from '../../composables/useMedia.js'
import { t } from '../../shared/i18n.js'
import { readDraft, saveDraft, takeDraft } from '../captureDraft.js'
import { showNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'

const props = defineProps({
  /** focus the field when the page opens on the phone (the Inbox) */
  focusOnOpen: { type: Boolean, default: false },
})

const gtd = useGtdStore()
const phone = useMedia(PHONE)
const input = ref(null)
const text = ref(readDraft())

function submit() {
  const op = gtd.capture(text.value)
  if (!op) return
  text.value = ''
  saveDraft('')
  showNotice(t('notice.captured'), () => gtd.undo(op))
}

/** Another tab changed the draft: show it here too, so one draft is never captured twice. */
function onStorage(event) {
  if (event.key === 'captureDraft') text.value = readDraft(event.newValue)
}

function onPageHide() {
  const draft = takeDraft()
  if (draft && gtd.captureOnLeave(draft)) text.value = ''
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  window.addEventListener('pagehide', onPageHide)
  if (props.focusOnOpen && phone.value) input.value.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
  window.removeEventListener('pagehide', onPageHide)
})

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <form class="capture" :class="{ phone }" autocomplete="off" @submit.prevent="submit">
    <span class="plus" aria-hidden="true">+</span>
    <input
      ref="input" v-model="text" type="text" enterkeyhint="done"
      :placeholder="t('capture.new')" :aria-label="t('capture.new')"
      @input="saveDraft(text)" @keydown.esc="input.blur()"
    >
    <template v-if="!phone">
      <span class="hint">{{ t('capture.hint') }}</span><kbd aria-hidden="true">n</kbd>
    </template>
  </form>
</template>

<style scoped>
.capture {
  flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 48px 14px;
  border-top: 1px solid var(--rw-rule); background: var(--rw-bg);
}
.capture.phone { padding: 8px 16px 10px; }
.plus {
  flex: none; display: grid; place-items: center; width: 26px; height: 26px; padding-bottom: 2px; border-radius: 50%;
  background: var(--rw-action); color: var(--rw-on-action); font-size: 18px; font-weight: 500; line-height: 1;
}
input {
  flex: 1; min-width: 0; height: 34px; border: 0; border-bottom: 1px solid transparent; outline: 0;
  background: transparent; color: var(--rw-text); font: inherit; font-size: 15.5px;
}
.phone input { height: 48px; font-size: 16px; }
input::placeholder { color: var(--rw-soft); }
/* 06: the field's focus is the caret and a 1 px yellow line, not the page's focus ring */
.capture input:focus-visible { outline: 0; }
input:focus { border-bottom-color: var(--rw-marker); }
.hint { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); white-space: nowrap; }
kbd {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 10.5px; line-height: 1; letter-spacing: 0.02em; color: var(--rw-mute);
}
</style>
