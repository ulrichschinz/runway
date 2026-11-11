<script setup>
/**
 * The phone's thumb zone (m3 "ThumbBar", plan D2): in the layout flow at the bottom of the frame,
 * top to bottom the notice, the context chips (Nächste), the tabs `Inbox · Nächste · Warten auf ·
 * ···` and the capture field. Because it is in the flow, a notice pushes the list up instead of
 * covering a row. "···" opens the Mehr sheet upward from the tabs, with the search and the command
 * palette (plan M9); `openSearch()` opens it with the focus in the search field (the `/` key).
 * Slot `more`: the margin column's panels, which the sheet shows under its entries (plan M12).
 * The frame leaves the chips out while the on-screen keyboard is up (m3, brief 0062).
 */
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import { DOCK_TABS, dockKeyOf } from '../shared/navigation.js'
import { t } from '../shared/i18n.js'

// The Mehr sheet is a chunk of its own (brief 0059: the entry's 130 kB budget while both UIs ship),
// fetched in idle time once the dock is up, so "···" still opens it after the connection drops or a
// redeploy replaced the chunk. An index blind spot (BLIND-FE-002).
const loadMoreSheet = () => import('./MoreSheet.vue')
const MoreSheet = defineAsyncComponent(loadMoreSheet)
onMounted(() => {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
  idle(() => loadMoreSheet().catch(() => {}))
})

const props = defineProps({
  view: { type: String, default: null },
  counts: { type: Object, required: true },
  flags: { type: Object, required: true },
  failedCount: { type: Number, default: 0 },
  themeChoice: { type: String, required: true },
  searchable: { type: Boolean, default: false },
})
const emit = defineEmits(['theme', 'signout', 'retry', 'palette', 'searchEnter'])

const current = computed(() => dockKeyOf(props.view))
const moreOpen = ref(false)
const moreButton = ref(null)
const searchFirst = ref(false)

function openMore(search = false) {
  searchFirst.value = search && props.searchable
  moreOpen.value = true
}

/** "Befehle" in the sheet: the sheet closes, the palette opens (it brings the focus back here). */
function openPalette() {
  moreOpen.value = false
  moreButton.value?.focus()
  emit('palette')
}

defineExpose({ openSearch: () => openMore(true) })

/**
 * `⏎` in the sheet's search: the sheet is gone, the page puts the cursor on the first hit
 * (`searchEnter`, as the top line's field does); without a hit the focus goes back to "···".
 */
async function toHits() {
  await nextTick()
  emit('searchEnter')
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) moreButton.value?.focus()
}

async function closeMore({ refocus = true } = {}) {
  moreOpen.value = false
  if (refocus) {
    await nextTick()
    moreButton.value?.focus()
  }
}
</script>

<template>
  <div class="dock">
    <slot name="notice" />
    <!-- a landmark, so nothing in the dock sits outside one (axe `region`); named apart from the chips' own "Kontext" group -->
    <div v-if="$slots.chips" role="region" :aria-label="t('ctx.region')"><slot name="chips" /></div>
    <nav class="tabs" :aria-label="t('nav.lists')">
      <RouterLink
        v-for="tab in DOCK_TABS" :key="tab.key" :to="tab.to" class="tab"
        :aria-current="current === tab.key ? 'page' : undefined"
      >
        <span class="l">
          {{ t(tab.label) }} <span class="n">{{ counts[tab.key] || '' }}</span>
          <template v-if="tab.key === 'inbox' && flags.inboxDot">
            <span class="dot" aria-hidden="true" /><span class="sr">{{ t('nav.captured') }}</span>
          </template>
        </span>
      </RouterLink>
      <button
        ref="moreButton" type="button" class="tab more" data-more
        :aria-label="failedCount ? `${t('nav.more')} · ${t('sync.n', { n: failedCount })}` : t('nav.more')"
        :aria-expanded="moreOpen" aria-haspopup="dialog"
        :aria-current="current === 'more' ? 'page' : undefined"
        @click="moreOpen ? closeMore() : openMore()"
      >
        <span aria-hidden="true">···</span><span v-if="failedCount" class="warn" aria-hidden="true" />
      </button>
    </nav>
    <slot name="capture" />
    <MoreSheet
      v-if="moreOpen" :view="view" :counts="counts" :flags="flags" :failed-count="failedCount" :theme-choice="themeChoice"
      :searchable="searchable" :focus-search="searchFirst"
      @close="closeMore" @theme="emit('theme', $event)" @signout="emit('signout')" @retry="emit('retry')" @palette="openPalette"
      @enter="toHits"
    >
      <template v-if="$slots.more" #panels><slot name="more" /></template>
    </MoreSheet>
  </div>
</template>

<style scoped>
.dock {
  position: relative; flex: none; background: var(--rw-bg); border-top: 1px solid var(--rw-rule);
  padding-bottom: env(safe-area-inset-bottom);
}
.tabs { display: grid; grid-template-columns: 1fr 1.1fr 1.3fr 48px; height: 52px; padding: 0 4px 0 8px; }
.tab {
  position: relative; display: grid; place-items: center; min-width: 0; min-height: 48px;
  font-size: 15px; color: var(--rw-mute); white-space: nowrap;
}
.tab .l { display: inline-flex; gap: 6px; align-items: baseline; overflow: hidden; max-width: 100%; }
.tab .n { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.tab[aria-current='page'] { color: var(--rw-text); font-weight: 500; }
.tab[aria-current='page']::after {
  content: ''; position: absolute; left: 50%; bottom: 4px; width: 6px; height: 6px; margin-left: -3px;
  border-radius: 50%; background: var(--rw-marker);
}
.dot { align-self: center; width: 6px; height: 6px; border-radius: 50%; background: var(--rw-marker); }
.more { font-family: var(--rw-font-mono); font-size: 16px; letter-spacing: 0.1em; }
.warn { position: absolute; top: 10px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--rw-overdue); }
</style>
