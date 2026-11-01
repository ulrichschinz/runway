<script setup>
/** A small toggle pill in a detail field (06 `.field .opts .ctx`): Liste, Kontext, Priorität, Rhythmus. */
defineProps({
  pressed: { type: Boolean, required: true },
})
</script>

<template>
  <button type="button" class="opt" :aria-pressed="pressed"><slot /></button>
</template>

<style scoped>
.opt {
  display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px;
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute); white-space: nowrap;
  transition: background var(--rw-dur-fast), color var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.opt:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.opt[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
@media (max-width: 760px) {
  .opt { min-height: 44px; padding: 0 14px; }
}
</style>
