<script setup>
/**
 * The page's top line on wide screens (06 `.topline`): the `/` search field, "Befehle ⌘K" and
 * Stand. The field writes the shared query (`searchQuery`); the list page shows the hits. `Esc` in
 * the field ends the search, `⏎` or `↓` hand over to the hits (`enter`).
 *
 * `focus()` is exposed for the `/` key.
 */
import { ref } from 'vue'
import { paletteKeyHint, paletteMod, searchQuery } from '../composables/useCommands.js'
import { t } from '../shared/i18n.js'

defineProps({
  /** whether this page shows search hits; without, the line has no field */
  searchable: { type: Boolean, default: false },
  stand: { type: String, default: '' },
})
const emit = defineEmits(['palette', 'enter'])

const input = ref(null)

function onKey(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    searchQuery.value = ''
    input.value.blur()
  } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    input.value.blur()
    emit('enter')
  }
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="topline">
    <label v-if="searchable" class="search">
      <span class="sr">{{ t('search.ph') }}</span>
      <input
        ref="input" v-model="searchQuery" type="search" :placeholder="t('search.ph')" autocomplete="off"
        enterkeyhint="search" @keydown="onKey"
      >
      <kbd aria-hidden="true">/</kbd>
    </label>
    <button type="button" class="palbtn" :aria-keyshortcuts="paletteMod === '⌘' ? 'Meta+K' : 'Control+K'" @click="emit('palette')">
      <span>{{ t('pal.title') }}</span><kbd aria-hidden="true">{{ paletteKeyHint }}</kbd>
    </button>
    <span v-if="stand" class="stand">{{ t('stand', { t: stand }) }}</span>
  </div>
</template>

<style scoped>
.topline { display: flex; align-items: center; gap: 18px; justify-content: flex-end; height: 32px; margin-bottom: 26px; }
.search {
  display: flex; align-items: center; gap: 10px; flex: 0 1 260px; min-width: 0; height: 32px;
  border-bottom: 1px solid var(--rw-rule-strong); transition: border-color var(--rw-dur-fast);
}
.search:focus-within { border-bottom-color: var(--rw-marker); }
.search input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--rw-text); font: inherit; font-size: 14px;
  -webkit-appearance: none; appearance: none;
}
.search input::-webkit-search-cancel-button { display: none; }
.search input::placeholder { color: var(--rw-soft); }
/* 06: the field's focus is the caret and the 1 px yellow line */
.search input:focus-visible { outline: 0; }
.palbtn, .stand {
  /* the field gives way on a narrow page; "Stand 16:24" and "Befehle ⌘K" never wrap */
  display: inline-flex; flex: none; align-items: center; gap: 8px; min-height: 32px; white-space: nowrap;
  font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.palbtn:hover { color: var(--rw-text); }
</style>
