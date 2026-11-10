<script setup>
/**
 * The command palette (06 `#palette`, 04's palette drawn in 03's language: one sheet, hairlines, no
 * blur; plan M9). Its entries are `paletteItems(query)`: the commands the mounted keymaps hold, read
 * through the one table, and what the search providers find. `↑ ↓` select (wrapping), `⏎` runs,
 * `Esc` or a click on the scrim closes, Tab stays in the field. The focus goes back where it was,
 * then the command runs — so a command that moves the focus (Neues Todo) keeps it. Closed from
 * outside (⌘K again), it gives the focus back as it unmounts.
 *
 * It is a modal (`useModal`): no page key acts behind it. A press on its text or headings keeps
 * the focus in the field, and its keys are handled on the whole dialog.
 *
 * The field is a combobox: the selected entry is its `aria-activedescendant`, the list a listbox
 * whose options sit in one labelled group per heading.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { paletteItems, useModal } from '../composables/useCommands.js'
import { t } from '../shared/i18n.js'

const props = defineProps({
  /** where the focus goes back to; the frame keeps it across a swap from the `?` sheet */
  returnTo: { type: Object, default: null },
})
const emit = defineEmits(['close'])
useModal()

const query = ref('')
const selected = ref(0)
const input = ref(null)
const list = ref(null)
const dialog = ref(null)
const before = props.returnTo ?? document.activeElement

const items = computed(() => paletteItems(query.value))
/** The entries in their groups, in display order; each keeps its index for the selection. */
const groups = computed(() => {
  const out = []
  items.value.forEach((item, i) => {
    if (!out.length || out[out.length - 1].group !== item.group) {
      out.push({ group: item.group, id: `pal-g${out.length}`, head: t(`pal.g.${item.group}`), rows: [] })
    }
    out[out.length - 1].rows.push({ ...item, i })
  })
  return out
})

watch(query, () => {
  selected.value = 0
})
watch([selected, items], async () => {
  selected.value = Math.min(selected.value, Math.max(0, items.value.length - 1))
  await nextTick()
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => input.value.focus())

function giveBack() {
  if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
}

function close() {
  emit('close')
  giveBack()
}

// Closed from outside (⌘K again): the focus is still in here and would fall to <body>.
onBeforeUnmount(() => {
  if (dialog.value?.contains(document.activeElement)) giveBack()
})

/** A press anywhere but the field keeps the focus in the field (an option's click still runs). */
function keepFocus(event) {
  if (event.target !== input.value) event.preventDefault()
}

function run(item) {
  close()
  item?.run()
}

function step(by) {
  const n = items.value.length
  if (n) selected.value = (selected.value + by + n) % n
}

function onKey(event) {
  const actions = {
    Escape: close,
    ArrowDown: () => step(1),
    ArrowUp: () => step(-1),
    Enter: () => run(items.value[selected.value]),
    Tab: () => {},
  }
  const action = !event.isComposing && actions[event.key]
  if (!action) return
  event.preventDefault()
  event.stopPropagation()
  action()
}
</script>

<template>
  <div class="scrim" @click.self="close">
    <div
      ref="dialog" class="palette" role="dialog" aria-modal="true" :aria-label="t('pal.title')" tabindex="-1"
      @keydown="onKey" @mousedown="keepFocus"
    >
      <div class="in">
        <span class="slash" aria-hidden="true">//</span>
        <input
          ref="input" v-model="query" role="combobox" :aria-label="t('pal.title')" :placeholder="t('pal.ph')"
          aria-autocomplete="list" aria-expanded="true" aria-controls="pal-list"
          :aria-activedescendant="items.length ? `pal-${selected}` : undefined"
          autocomplete="off" spellcheck="false" enterkeyhint="go"
        >
        <kbd aria-hidden="true">Esc</kbd>
      </div>
      <div id="pal-list" ref="list" class="list" role="listbox" :aria-label="t('pal.title')">
        <div v-for="g in groups" :key="`${g.group}:${g.id}`" role="group" :aria-labelledby="g.id">
          <div :id="g.id" class="group">{{ g.head }}</div>
          <div
            v-for="row in g.rows" :id="`pal-${row.i}`" :key="`${row.group}:${row.label}:${row.i}`" class="item"
            :class="{ on: row.i === selected }" role="option"
            :aria-selected="row.i === selected" @click="run(row)" @mousemove="selected = row.i"
          >
            <span class="l">{{ row.label }}<small v-if="row.sub">{{ row.sub }}</small></span>
            <kbd v-if="row.hint" aria-hidden="true">{{ row.hint }}</kbd>
          </div>
        </div>
        <div v-if="!groups.length" class="empty">{{ t('pal.nothing') }}</div>
      </div>
      <div class="foot" aria-hidden="true">{{ t('pal.foot') }}</div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed; inset: 0; z-index: 70; display: flex; justify-content: center; align-items: flex-start;
  padding: 14vh 24px 24px; background: var(--rw-scrim); animation: rw-fade var(--rw-dur-base) var(--rw-ease);
}
.palette:focus { outline: 0; }
.palette {
  width: min(620px, 100%); overflow: hidden; background: var(--rw-surface); color: var(--rw-text);
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-lg); box-shadow: var(--ar-shadow-xl);
}
.in { display: flex; align-items: center; gap: 12px; height: 58px; padding: 0 18px; border-bottom: 1px solid var(--rw-rule); }
.slash { font-family: var(--rw-font-mono); font-size: 15px; color: var(--rw-action); }
.in input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--rw-text); font: inherit; font-size: 17px;
}
.in input::placeholder { color: var(--rw-soft); }
.in input:focus-visible { outline: 0; }
.list { max-height: min(420px, 56vh); overflow-y: auto; overscroll-behavior: contain; padding: 6px 8px 8px; }
.group { padding: 10px 10px 4px; font-family: var(--rw-font-mono); font-size: 10.5px; letter-spacing: 0.06em; color: var(--rw-mute); }
.item {
  display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 10px; border-radius: var(--rw-radius-sm);
  font-size: 14px; cursor: pointer;
}
.item.on { background: var(--rw-focus); box-shadow: inset 2px 0 0 var(--rw-accent); }
.l { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
small { margin-left: 10px; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.empty { padding: 18px 12px; color: var(--rw-mute); font-size: 14px; }
.foot { padding: 9px 18px; border-top: 1px solid var(--rw-rule); font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
@keyframes rw-fade { from { opacity: 0; } }
@media (max-width: 760px) {
  .scrim { padding: 10vh 12px 12px; }
  .item { min-height: 48px; }
}
@media (prefers-reduced-motion: reduce) { .scrim { animation: none; } }
</style>
