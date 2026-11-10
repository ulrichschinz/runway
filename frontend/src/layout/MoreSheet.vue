<script setup>
/**
 * "Mehr" on the phone (m3: a menu opening upward from the tab row): the search over all lists
 * (06 `tocsearch`, on a page that shows hits), every view that is not a tab, the command palette,
 * the colour scheme and Abmelden. Typing searches at once; `⏎` closes the sheet over the hits and asks the page to put the cursor on
 * the first (`enter`). Esc, a tap outside, focus leaving it or Tab past its last entry closes it; focus starts
 * on the first entry and goes back to "···" (PhoneDock), so the keyboard is never trapped.
 */
import { computed, onMounted, ref } from 'vue'
import { searchQuery } from '../composables/useCommands.js'
import { MORE_ITEMS, navKeyOf } from '../shared/navigation.js'
import { t } from '../shared/i18n.js'

const props = defineProps({
  view: { type: String, default: null },
  counts: { type: Object, required: true },
  flags: { type: Object, required: true },
  failedCount: { type: Number, default: 0 },
  themeChoice: { type: String, required: true },
  /** the page shows search hits: the sheet starts with the search field */
  searchable: { type: Boolean, default: false },
  /** opened by `/`: the focus starts in the search field */
  focusSearch: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'theme', 'signout', 'retry', 'palette', 'enter'])

const THEMES = [['system', 'set.system'], ['light', 'set.light'], ['dark', 'set.dark']]
const current = computed(() => navKeyOf(props.view))
const sheet = ref(null)

const FOCUSABLE = 'input, a, button'

onMounted(() => sheet.value?.querySelector(props.focusSearch ? 'input' : 'a, button')?.focus())

function onSearchKey(event) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  emit('close', { refocus: false })
  emit('enter')
}

function onFocusOut(event) {
  if (event.relatedTarget && !sheet.value?.contains(event.relatedTarget)) emit('close', { refocus: false })
}

// Tab past the last entry would leave the page (relatedTarget null, so focusout cannot tell) and
// later cycle back into the open sheet under the scrim: close it there and return to "···".
function onTab(event) {
  const all = sheet.value?.querySelectorAll(FOCUSABLE)
  if (all?.length && event.target === all[all.length - 1]) {
    event.preventDefault()
    emit('close')
  }
}

function note(key) {
  if (key === 'projects') return [props.counts.projects, props.flags.stalled ? t('proj.stalled') : ''].filter((x) => x !== '' && x != null).join(' · ')
  if (key === 'someday') return props.counts.someday
  if (key === 'review') return props.flags.reviewDue ? t('nav.due') : ''
  return ''
}
</script>

<template>
  <div class="scrim" aria-hidden="true" @click="emit('close')" />
  <div
    ref="sheet" class="sheet" role="dialog" :aria-label="t('nav.more')"
    @keydown.esc.stop="emit('close')" @keydown.tab.exact="onTab" @focusout="onFocusOut"
  >
    <label v-if="searchable" class="search">
      <span class="sr">{{ t('search.ph') }}</span>
      <input
        v-model="searchQuery" type="search" :placeholder="t('search.all')" autocomplete="off" enterkeyhint="search"
        @keydown="onSearchKey"
      >
    </label>
    <nav :aria-label="t('nav.more')">
      <RouterLink
        v-for="item in MORE_ITEMS" :key="item.key" :to="item.to" class="item"
        :aria-current="current === item.key ? 'page' : undefined" @click="emit('close', { refocus: false })"
      >
        <span>{{ t(item.label) }}</span><span class="m">{{ note(item.key) }}</span>
      </RouterLink>
    </nav>
    <button type="button" class="item" @click="emit('palette')">{{ t('pal.title') }}</button>
    <button v-if="failedCount" type="button" class="item unsent" @click="emit('retry')">
      {{ t('sync.n', { n: failedCount }) }} · {{ t('sync.retry') }}
    </button>
    <hr>
    <div class="themes" role="group" :aria-label="t('set.look')">
      <span class="lab" aria-hidden="true">{{ t('set.look') }}</span>
      <button
        v-for="[value, key] in THEMES" :key="value" type="button" class="ctx"
        :aria-pressed="themeChoice === value" @click="emit('theme', value)"
      >{{ t(key) }}</button>
    </div>
    <hr>
    <button type="button" class="item" @click="emit('signout')">{{ t('set.signout') }}</button>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 40; background: var(--rw-scrim); }
.sheet {
  position: absolute; right: 10px; bottom: calc(100% + 8px); z-index: 41; min-width: 250px; max-width: calc(100vw - 20px);
  max-height: 70dvh; overflow: auto; padding: 6px 0;
  background: var(--rw-surface); color: var(--rw-text); border: 1px solid var(--rw-rule);
  border-radius: var(--rw-radius-md); box-shadow: var(--ar-shadow-lg);
}
.search { display: flex; align-items: center; margin: 6px 18px 4px; height: 48px; border-bottom: 1px solid var(--rw-rule-strong); }
.search:focus-within { border-bottom-color: var(--rw-marker); }
.search input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--rw-text); font: inherit; font-size: 16px;
  -webkit-appearance: none; appearance: none;
}
.search input::-webkit-search-cancel-button { display: none; }
.search input::placeholder { color: var(--rw-soft); }
.search input:focus-visible { outline: 0; }
.item {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 48px;
  padding: 0 18px; font-size: 15px; text-align: left;
}
.item:hover { background: var(--rw-press); }
/* inside the scrolling sheet an outer focus ring would be clipped */
.item:focus-visible { outline-offset: -2px; }
.item[aria-current='page'] { font-weight: 500; }
.m { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); font-weight: 400; }
.unsent { color: var(--rw-overdue); }
hr { border: 0; border-top: 1px solid var(--rw-rule); margin: 4px 0; }
.themes { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 18px; }
.lab { width: 100%; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.ctx {
  min-height: 48px; padding: 0 14px; border-radius: var(--rw-radius-pill); border: 1px solid var(--rw-rule);
  font-family: var(--rw-font-mono); font-size: 12px; color: var(--rw-mute);
}
.ctx[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
</style>
