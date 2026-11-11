<script setup>
/**
 * The new UI's frame (plan M4, brief 0050). It imports no store: everything it shows arrives as
 * props, everything a page shows goes into a slot, and what the person asks of the frame leaves as
 * an event. That is what lets the old `AppShell` cycles (CYCLE-001/002) go in M17.
 *
 * Three layouts (06 `web.css`, m3):
 *   > 1180 px   rail 224 px · page · margin column 376 px
 *   761-1180 px rail 208 px · page (the margin's panels dock here with their milestones)
 *   <= 760 px   page above the bottom dock: notice, chips, tabs, capture, in the layout flow
 *
 * Slots: `head` (eyebrow, heading), default (the page), `chips` (head on wide screens, dock on the
 * phone), `notice` (rendered inside the one `aria-live` region: bottom of the page column, or the
 * dock), `capture` (bottom of the page column, or the dock), `margin` (the margin column's panels,
 * plan M12: the column on wide screens, the Mehr sheet on the phone, nowhere at 761-1180 px), `panel`
 * (a todo's detail, plan M7: it takes the margin column's place on wide screens, docks as a 360 px
 * column beside the page at 761-1180 px, and is a sheet from the bottom on the phone; a tap on the
 * sheet's scrim emits `closePanel`).
 *
 * The frame also owns what every page has (plan M9): the command palette (⌘K / Ctrl+K, the rail's
 * foot, "Befehle" in "···"), the `?` sheet, the `/` search (the top line's field on wide screens,
 * the Mehr sheet on the phone, on a page that shows hits: `searchable`; elsewhere `/` opens the
 * palette, which finds todos too), and a keymap layer with Gehe zu, Darstellung and Erneut senden, which
 * the palette offers like every other command. `searchEnter` asks the page to put the cursor on
 * the first hit. It holds the Tageslinse's bead overlay (plan M11, `lens/BeadFlight.vue`).
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import CommandPalette from './CommandPalette.vue'
import BeadFlight from './lens/BeadFlight.vue'
import MarginColumn from './MarginColumn.vue'
import PhoneDock from './PhoneDock.vue'
import RailNav from './RailNav.vue'
import TopLine from './TopLine.vue'
import { useKeymap } from '../composables/useKeymap.js'
import { PHONE, WIDE, useMedia, useVisualViewport } from '../composables/useMedia.js'
import { paletteKeyAction } from '../shared/commands.js'
import { LISTS, PLACES } from '../shared/navigation.js'

// The `?` sheet is a chunk of its own (brief 0059: the entry's 130 kB budget while both UIs ship,
// after M12 added the margin column), fetched in idle time once the frame is up, so `?` still opens
// it after the connection drops or a redeploy replaced the chunk. An index blind spot (BLIND-FE-002).
const loadShortcutsSheet = () => import('./ShortcutsSheet.vue')
const ShortcutsSheet = defineAsyncComponent(loadShortcutsSheet)
onMounted(() => {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
  idle(() => loadShortcutsSheet().catch(() => {}))
})

const props = defineProps({
  /** the route's view (`meta.view`): marks the current rail entry and dock tab */
  view: { type: String, default: null },
  /** `{inbox, next, waiting, projects, someday}`: the numbers rail and dock show */
  counts: { type: Object, required: true },
  /** `{stalled, reviewDue, inboxDot}`: the yellow rings, and the dot of a capture not yet seen */
  flags: { type: Object, required: true },
  /** "hh:mm" of the last good snapshot, '' before the first */
  stand: { type: String, default: '' },
  offline: { type: Boolean, default: false },
  /** writes that were not sent: the rail's outbox line */
  failedCount: { type: Number, default: 0 },
  user: { type: String, default: '' },
  /** 'system' | 'light' | 'dark', for the Mehr sheet */
  themeChoice: { type: String, default: 'system' },
  /** the accessible name of the `panel` slot's sheet on the phone */
  panelLabel: { type: String, default: '' },
  /** the page shows `/` search hits (the list pages) */
  searchable: { type: Boolean, default: false },
})
const emit = defineEmits(['retry', 'theme', 'signout', 'closePanel', 'searchEnter'])

const router = useRouter()
const phone = useMedia(PHONE)
const wide = useMedia(WIDE)
const viewport = useVisualViewport()

// On the phone the frame is exactly the visual viewport, so the dock sits above the keyboard.
const phoneBox = computed(() =>
  phone.value && viewport.value ? { top: `${viewport.value.top}px`, height: `${viewport.value.height}px` } : null,
)

const palette = ref(false)
const sheet = ref(false)
/** Where the focus goes back to when the palette or the sheet closes: captured as the first opens. */
const returnTo = shallowRef(null)

/** Open the palette or the `?` sheet in place of the other; the focus target stays the first one's. */
function open(which) {
  if (!palette.value && !sheet.value) returnTo.value = document.activeElement
  palette.value = which === 'palette'
  sheet.value = which === 'sheet'
}
const topLine = ref(null)
const dock = ref(null)

/** `/`: the search field where this page has one, else the palette (it finds todos too). */
function search() {
  if (!props.searchable) open('palette')
  else if (phone.value) dock.value?.openSearch()
  else topLine.value?.focus()
}

useKeymap(
  {
    ...Object.fromEntries([...LISTS, ...PLACES].map((item) => [`go.${item.key}`, () => router.push(item.to)])),
    shortcuts: () => open('sheet'),
    search,
    'theme.light': () => emit('theme', 'light'),
    'theme.dark': () => emit('theme', 'dark'),
    'theme.system': () => emit('theme', 'system'),
    retry: () => emit('retry'),
  },
  [],
  () => ({ retry: props.failedCount > 0 && { n: props.failedCount } }),
)

// ⌘K / Ctrl+K from anywhere, also while typing; the open sheet gives way to the palette. A held
// key's auto-repeat toggles nothing. Closing unmounts the palette, which gives the focus back.
function onPaletteKey(event) {
  const action = paletteKeyAction(event)
  if (!action) return
  event.preventDefault()
  if (action !== 'toggle') return
  if (palette.value) palette.value = false
  else open('palette')
}
onMounted(() => window.addEventListener('keydown', onPaletteKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onPaletteKey))
</script>

<template>
  <!-- 761-1180 px with a panel: it docks beside the page -->
  <div class="rw frame" :class="{ phone, wide, docked: !phone && !wide && !!$slots.panel }" :style="phoneBox">
    <RailNav
      v-if="!phone" :view="view" :counts="counts" :flags="flags" :stand="stand" :offline="offline"
      :failed-count="failedCount" :user="user" @retry="emit('retry')" @palette="open('palette')" @shortcuts="open('sheet')"
    />
    <div class="page">
      <main class="scroll">
        <div class="col">
          <TopLine v-if="!phone" ref="topLine" :searchable="searchable" :stand="stand" @palette="open('palette')" @enter="emit('searchEnter')" />
          <header class="head">
            <slot name="head" />
            <div v-if="!phone && $slots.chips" class="chips"><slot name="chips" /></div>
          </header>
          <slot />
        </div>
      </main>
      <template v-if="!phone">
        <div class="notice-region" role="status" aria-live="polite"><slot name="notice" /></div>
        <slot name="capture" />
      </template>
      <PhoneDock
        v-else ref="dock" :view="view" :counts="counts" :flags="flags" :failed-count="failedCount" :theme-choice="themeChoice"
        :searchable="searchable" @theme="emit('theme', $event)" @signout="emit('signout')" @retry="emit('retry')"
        @palette="open('palette')" @search-enter="emit('searchEnter')"
      >
        <template #notice>
          <div class="notice-region" role="status" aria-live="polite"><slot name="notice" /></div>
        </template>
        <template v-if="$slots.chips" #chips><div class="dock-chips"><slot name="chips" /></div></template>
        <template v-if="$slots.capture" #capture><slot name="capture" /></template>
        <template v-if="$slots.margin" #more><slot name="margin" /></template>
      </PhoneDock>
    </div>
    <MarginColumn v-if="wide || (!phone && $slots.panel)">
      <slot v-if="$slots.panel" name="panel" />
      <slot v-else name="margin" />
    </MarginColumn>
    <template v-if="phone && $slots.panel">
      <div class="scrim" aria-hidden="true" @click="emit('closePanel')" />
      <section class="sheet" role="dialog" :aria-label="panelLabel"><slot name="panel" /></section>
    </template>
    <CommandPalette v-if="palette" :return-to="returnTo" @close="palette = false" />
    <ShortcutsSheet v-if="sheet" :return-to="returnTo" @close="sheet = false" />
    <BeadFlight />
  </div>
</template>

<style scoped>
.frame {
  position: fixed; inset: 0; display: grid; grid-template-columns: 208px minmax(0, 1fr);
  background: var(--rw-bg); color: var(--rw-text);
}
.frame.wide { grid-template-columns: 224px minmax(0, 1fr) 376px; }
.frame.phone { display: flex; flex-direction: column; bottom: auto; height: 100dvh; }
.page { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; flex: 1; }
/* 06 web.css: the top line sits in the top padding */
.scroll { flex: 1; min-height: 0; overflow: auto; padding: 22px 48px 48px; scroll-padding: 80px; }
.col { max-width: 760px; container: page / inline-size; }
.head { margin-bottom: 22px; }
.chips { margin-top: 22px; }
.phone .scroll { padding: 18px 16px 24px; }
.phone .head { margin-bottom: 8px; }
.dock-chips { padding: 10px 14px 2px; }
.frame.docked { grid-template-columns: 208px minmax(0, 1fr) 360px; }
.docked .scroll { padding-left: 32px; padding-right: 32px; }
.docked :deep(.margin) { padding: 30px 24px 40px; }
/* the phone sheet (06 web.css .margin at <= 760 px): over the dock, inside the visual viewport */
.scrim { position: absolute; inset: 0; z-index: 54; background: var(--rw-scrim); }
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 55; max-height: 86%; overflow: auto; overscroll-behavior: contain;
  padding: 26px 18px calc(30px + env(safe-area-inset-bottom)); border-radius: var(--rw-radius-xl) var(--rw-radius-xl) 0 0;
  background: var(--rw-surface); box-shadow: var(--ar-shadow-xl); animation: rw-sheet-in var(--rw-dur-slow) var(--rw-ease);
}
.sheet::before {
  content: ''; position: absolute; top: 9px; left: 50%; width: 36px; height: 4px; margin-left: -18px;
  border-radius: 4px; background: var(--rw-rule-strong);
}
@keyframes rw-sheet-in { from { transform: translateY(105%); } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
</style>
