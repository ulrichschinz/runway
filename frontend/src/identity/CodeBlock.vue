<script setup>
/**
 * A text to copy (06 `.code`): mono on the sunk surface, and "Kopieren" beside it. `shown` is what
 * the screen shows (a key masked, `shownText`), `copy` what the clipboard gets — the text itself,
 * byte for byte; the default slot holds a button before "Kopieren" (the key's "Anzeigen"). `block`
 * keeps line breaks and scrolls (a command, a config); otherwise one line that wraps where it must,
 * so a long command can be read in full on the phone before it is pasted into a shell.
 *
 * The clipboard is missing outside a secure context and can be refused; then it says so instead
 * of "Kopiert", and where the key is masked in the shown text, to show it first (`copyFailedKey`).
 *
 * The button's name starts with its visible word ("Kopieren", then "Kopiert") and names what it
 * copies after it, hidden (WCAG 2.5.3). The answer goes to a status region that is always in the
 * page, so a screen reader hears "Kopiert" and the failure: a region inserted with its text already
 * in it is often not read.
 */
import { nextTick, onBeforeUnmount, ref } from 'vue'
import PillButton from '../layout/ui/PillButton.vue'
import { t } from '../shared/i18n.js'
import { copyFailedKey } from '../shared/settingsRules.js'

const props = defineProps({
  shown: { type: String, required: true },
  copy: { type: String, default: null },
  /** what is copied, for the button's accessible name ("Kopieren (Dein API-Key)") */
  what: { type: String, required: true },
  block: { type: Boolean, default: false },
})

/** '' | 'copied' | 'failed' */
const state = ref('')
let timer = 0

async function doCopy() {
  clearTimeout(timer)
  // empty first, so a second "Kopiert" in a row is announced again
  state.value = ''
  await nextTick()
  try {
    await navigator.clipboard.writeText(props.copy ?? props.shown)
    state.value = 'copied'
  } catch {
    state.value = 'failed'
  }
  timer = setTimeout(() => (state.value = ''), state.value === 'failed' ? 8000 : 2000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="code" :class="{ block }">
    <pre v-if="block" class="text" tabindex="0" :aria-label="what">{{ shown }}</pre>
    <span v-else class="text line">{{ shown }}</span>
    <slot />
    <PillButton quiet class="copy" @click="doCopy">
      {{ state === 'copied' ? t('set.copied') : t('set.copy') }}<span class="vh"> ({{ what }})</span>
    </PillButton>
  </div>
  <p class="msg" role="status"><span v-if="state === 'copied'" class="vh">{{ t('set.copied') }}</span><template v-else-if="state === 'failed'">{{ t(copyFailedKey(shown, copy)) }}</template></p>
</template>

<style scoped>
.code {
  min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 4px 4px 4px 12px; border-radius: var(--rw-radius-sm); background: var(--rw-sunk);
  font-family: var(--rw-font-mono); font-size: 12px; line-height: 1.55; color: var(--rw-text);
}
.code.block { align-items: flex-start; padding-top: 8px; padding-bottom: 8px; }
.text { flex: 1; min-width: 0; margin: 0; font: inherit; }
.line { overflow-wrap: anywhere; padding: 6px 0; }
pre.text { overflow-x: auto; white-space: pre; padding: 2px 0; }
.copy { flex: none; }
.block .copy { margin-top: -4px; }
.msg { margin: 6px 0 0; color: var(--rw-overdue); font-size: 12.5px; }
.msg:empty, .msg:has(> .vh:only-child) { margin: 0; }
.vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
/* the phone: a command gets the whole width, "Kopieren" goes under it */
@media (max-width: 760px) {
  .code.block { flex-direction: column; align-items: stretch; gap: 0; }
  .block .copy { align-self: flex-end; margin-top: 0; }
}
</style>
