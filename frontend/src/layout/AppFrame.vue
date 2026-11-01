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
 * dock), `capture` (bottom of the page column, or the dock), `margin` (the margin column), `panel`
 * (a todo's detail, plan M7: it takes the margin column's place on wide screens, docks as a 360 px
 * column beside the page at 761-1180 px, and is a sheet from the bottom on the phone; a tap on the
 * sheet's scrim emits `closePanel`).
 */
import { computed } from 'vue'
import MarginColumn from './MarginColumn.vue'
import PhoneDock from './PhoneDock.vue'
import RailNav from './RailNav.vue'
import { PHONE, WIDE, useMedia, useVisualViewport } from '../composables/useMedia.js'

defineProps({
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
})
defineEmits(['retry', 'theme', 'signout', 'closePanel'])

const phone = useMedia(PHONE)
const wide = useMedia(WIDE)
const viewport = useVisualViewport()

// On the phone the frame is exactly the visual viewport, so the dock sits above the keyboard.
const phoneBox = computed(() =>
  phone.value && viewport.value ? { top: `${viewport.value.top}px`, height: `${viewport.value.height}px` } : null,
)
</script>

<template>
  <!-- 761-1180 px with a panel: it docks beside the page -->
  <div class="rw frame" :class="{ phone, wide, docked: !phone && !wide && !!$slots.panel }" :style="phoneBox">
    <RailNav
      v-if="!phone" :view="view" :counts="counts" :flags="flags" :stand="stand" :offline="offline"
      :failed-count="failedCount" :user="user" @retry="$emit('retry')"
    />
    <div class="page">
      <main class="scroll">
        <div class="col">
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
        v-else :view="view" :counts="counts" :flags="flags" :failed-count="failedCount" :theme-choice="themeChoice"
        @theme="$emit('theme', $event)" @signout="$emit('signout')" @retry="$emit('retry')"
      >
        <template #notice>
          <div class="notice-region" role="status" aria-live="polite"><slot name="notice" /></div>
        </template>
        <template v-if="$slots.chips" #chips><div class="dock-chips"><slot name="chips" /></div></template>
        <template v-if="$slots.capture" #capture><slot name="capture" /></template>
      </PhoneDock>
    </div>
    <MarginColumn v-if="wide || (!phone && $slots.panel)">
      <slot v-if="$slots.panel" name="panel" />
      <slot v-else name="margin" />
    </MarginColumn>
    <template v-if="phone && $slots.panel">
      <div class="scrim" aria-hidden="true" @click="$emit('closePanel')" />
      <section class="sheet" role="dialog" :aria-label="panelLabel"><slot name="panel" /></section>
    </template>
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
.scroll { flex: 1; min-height: 0; overflow: auto; padding: 48px 48px 48px; scroll-padding: 80px; }
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
