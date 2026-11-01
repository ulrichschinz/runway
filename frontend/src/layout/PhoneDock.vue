<script setup>
/**
 * The phone's thumb zone (m3 "ThumbBar", plan D2): in the layout flow at the bottom of the frame,
 * top to bottom the notice, the context chips (Nächste), the tabs `Inbox · Nächste · Warten auf ·
 * ···` and the capture field. Because it is in the flow, a notice pushes the list up instead of
 * covering a row. "···" opens the Mehr sheet upward from the tabs.
 */
import { computed, nextTick, ref } from 'vue'
import MoreSheet from './MoreSheet.vue'
import { DOCK_TABS, dockKeyOf } from '../shared/navigation.js'
import { t } from '../shared/i18n.js'

const props = defineProps({
  view: { type: String, default: null },
  counts: { type: Object, required: true },
  flags: { type: Object, required: true },
  failedCount: { type: Number, default: 0 },
  themeChoice: { type: String, required: true },
})
defineEmits(['theme', 'signout', 'retry'])

const current = computed(() => dockKeyOf(props.view))
const moreOpen = ref(false)
const moreButton = ref(null)

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
    <slot name="chips" />
    <nav class="tabs" :aria-label="t('nav.lists')">
      <RouterLink
        v-for="tab in DOCK_TABS" :key="tab.key" :to="tab.to" class="tab"
        :aria-current="current === tab.key ? 'page' : undefined"
      >
        <span class="l">{{ t(tab.label) }} <span class="n">{{ counts[tab.key] || '' }}</span></span>
      </RouterLink>
      <button
        ref="moreButton" type="button" class="tab more"
        :aria-label="failedCount ? `${t('nav.more')} · ${t('sync.n', { n: failedCount })}` : t('nav.more')"
        :aria-expanded="moreOpen" aria-haspopup="dialog"
        :aria-current="current === 'more' ? 'page' : undefined"
        @click="moreOpen ? closeMore() : (moreOpen = true)"
      >
        <span aria-hidden="true">···</span><span v-if="failedCount" class="warn" aria-hidden="true" />
      </button>
    </nav>
    <slot name="capture" />
    <MoreSheet
      v-if="moreOpen" :view="view" :counts="counts" :flags="flags" :failed-count="failedCount" :theme-choice="themeChoice"
      @close="closeMore" @theme="$emit('theme', $event)" @signout="$emit('signout')" @retry="$emit('retry')"
    />
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
.more { font-family: var(--rw-font-mono); font-size: 16px; letter-spacing: 0.1em; }
.warn { position: absolute; top: 10px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--rw-overdue); }
</style>
