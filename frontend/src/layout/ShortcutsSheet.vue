<script setup>
/**
 * The `?` sheet (06 `toggleKeys`, plan M9): every key of the new UI, generated from the one command
 * table (`shortcutSheet`), so a key the keymap knows is never missing here. `Esc`, `?`, "schließen"
 * or a click beside it closes it, and the focus goes back where it was (also when ⌘K swaps it for
 * the palette: it gives the focus back as it unmounts).
 *
 * It is a modal (`useModal`): no page key acts behind it. The dialog itself takes the focus when
 * its text is clicked, so its keys stay its own.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { paletteMod, useModal } from '../composables/useCommands.js'
import { COMMANDS, shortcutSheet } from '../shared/commands.js'
import { t } from '../shared/i18n.js'

const props = defineProps({
  /** where the focus goes back to (the frame's, captured before the sheet opened) */
  returnTo: { type: Object, default: null },
})
const emit = defineEmits(['close'])
useModal()

const groups = shortcutSheet(COMMANDS, paletteMod)
/** 06's two columns: everywhere and the lists, then the rows and the Inbox. */
const columns = [groups.slice(0, 2), groups.slice(2)]
const heading = t('h.keys')
const closer = ref(null)
const dialog = ref(null)
const before = props.returnTo ?? document.activeElement

onMounted(() => closer.value.focus())

function giveBack() {
  if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
}

function close() {
  emit('close')
  giveBack()
}

// Closed from outside (⌘K opens the palette in its place): the focus is still in here.
onBeforeUnmount(() => {
  if (dialog.value?.contains(document.activeElement)) giveBack()
})

function onKey(event) {
  if (event.key === 'Escape' || event.key === '?') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') {
    // the one control in here: the focus stays on it (or goes back to it from the dialog)
    event.preventDefault()
    closer.value.focus()
  }
}
</script>

<template>
  <div class="scrim" @click.self="close">
    <div
      ref="dialog" class="keys" role="dialog" aria-modal="true" :aria-label="t('keys.title')" tabindex="-1"
      @keydown="onKey"
    >
      <div class="top">
        <p class="eyebrow"><span class="slash" aria-hidden="true">//</span> {{ t('keys.title') }}</p>
        <button ref="closer" type="button" class="close" @click="close">
          {{ t('close') }} <kbd aria-hidden="true">Esc</kbd>
        </button>
      </div>
      <h2 class="display">{{ heading[0] }}<em>{{ heading[1] }}</em>{{ heading[2] }}</h2>
      <div class="cols">
        <div v-for="(column, c) in columns" :key="c">
          <template v-for="group in column" :key="group.group">
            <h3>{{ t(group.group) }}</h3>
            <dl>
              <div v-for="row in group.rows" :key="row.label">
                <dt>{{ t(row.label) }}</dt>
                <dd><kbd v-for="k in row.keys" :key="k">{{ k }}</kbd></dd>
              </div>
            </dl>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px;
  background: var(--rw-scrim); animation: rw-fade var(--rw-dur-base) var(--rw-ease);
}
.keys:focus { outline: 0; }
.keys {
  width: min(760px, 100%); max-height: calc(100% - 48px); overflow: auto; overscroll-behavior: contain; padding: 28px 32px 30px;
  background: var(--rw-surface); color: var(--rw-text); border: 1px solid var(--rw-rule);
  border-radius: var(--rw-radius-lg); box-shadow: var(--ar-shadow-xl);
}
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.eyebrow { margin: 0; font-family: var(--rw-font-mono); font-size: var(--rw-type-eyebrow-size); letter-spacing: var(--rw-type-eyebrow-tracking); color: var(--rw-mute); }
.slash { color: var(--rw-action); }
.close {
  display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px; margin-right: -10px;
  border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute);
}
.close:hover { color: var(--rw-text); }
.display { margin: 10px 0 0; font-size: 36px; line-height: 1.05; font-weight: 500; letter-spacing: -0.02em; }
em { font-family: var(--rw-font-serif); font-style: italic; font-weight: 300; color: var(--rw-accent); letter-spacing: -0.02em; }
.cols { display: grid; grid-template-columns: 1fr 1fr; column-gap: 40px; margin-top: 18px; }
h3 { margin: 18px 0 4px; font-family: var(--rw-font-mono); font-size: 11px; font-weight: 400; color: var(--rw-mute); }
dl { margin: 0; }
dl div {
  display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 7px 0;
  border-bottom: 1px solid var(--rw-rule); font-size: 13.5px;
}
dd { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; margin: 0; }
/* the sheet names keys even on a touch screen, where kbd hints are hidden elsewhere */
dd kbd { display: inline-flex; }
@keyframes rw-fade { from { opacity: 0; } }
@media (max-width: 760px) {
  .keys { padding: 22px 20px 24px; }
  .cols { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .scrim { animation: none; } }
</style>
