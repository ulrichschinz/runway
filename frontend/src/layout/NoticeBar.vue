<script setup>
/**
 * The notice (06 `.notice`): an inverse pill with the message and, while the action can still
 * be taken back, "Rückgängig" and the undo window as a draining 1 px yellow line. The frame
 * renders it inside its one `aria-live="polite"` region — at the bottom of the page column on
 * wide screens, inside the dock on the phone — so it never covers a row. Re-key it per notice
 * to restart the line.
 */
import { t } from '../shared/i18n.js'

defineProps({
  text: { type: String, required: true },
  /** offer Rückgängig */
  undo: { type: Boolean, default: false },
  /** the undo window, for the line */
  ms: { type: Number, default: 6000 },
})
defineEmits(['undo'])
</script>

<template>
  <div class="notice">
    <span class="what">{{ text }}</span>
    <template v-if="undo">
      <button type="button" class="undo" @click="$emit('undo')">{{ t('undo') }}</button>
      <span class="timer" :style="{ animationDuration: `${ms}ms` }" aria-hidden="true" />
    </template>
  </div>
</template>

<style scoped>
.notice {
  position: relative; display: flex; align-items: center; gap: 14px; width: fit-content; max-width: 100%;
  margin: 0 auto 12px; padding: 6px 6px 6px 20px; min-height: 44px; border-radius: var(--rw-radius-pill);
  background: var(--rw-inverse); color: var(--rw-on-inverse); font-size: 13.5px;
  animation: rw-notice-in var(--rw-dur-base) var(--rw-ease);
}
.what { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.undo {
  display: inline-flex; align-items: center; flex: none; min-height: 32px; padding: 0 12px;
  border-radius: var(--rw-radius-pill); color: var(--rw-inverse-action); font-weight: 500;
}
.undo:hover { background: color-mix(in srgb, var(--rw-on-inverse) 10%, transparent); }
.timer {
  position: absolute; left: 20px; right: 20px; bottom: 5px; height: 1px; background: var(--rw-marker);
  transform-origin: left; animation: rw-drain linear forwards;
}
@keyframes rw-drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes rw-notice-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (max-width: 760px) {
  .notice { width: auto; margin: 8px 14px 0; justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) {
  .timer { display: none; }
}
</style>
