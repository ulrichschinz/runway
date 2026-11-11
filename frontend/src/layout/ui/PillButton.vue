<script setup>
/**
 * Every button of the new UI is a pill (brand kit). `action` is the one coral primary action of
 * a view, `quiet` a borderless secondary one; `pressed` makes it a toggle (`aria-pressed`).
 * A button busy with its own request takes `aria-disabled="true"` rather than `disabled`, and its
 * handler ignores the click: a focused button that disables itself drops the focus to the page.
 */
defineProps({
  action: { type: Boolean, default: false },
  quiet: { type: Boolean, default: false },
  pressed: { type: Boolean, default: undefined },
  type: { type: String, default: 'button' },
})
</script>

<template>
  <button :type="type" class="pill" :class="{ action, quiet }" :aria-pressed="pressed">
    <slot />
  </button>
</template>

<style scoped>
.pill {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 44px; padding: 0 18px;
  border-radius: var(--rw-radius-pill); border: 1px solid var(--rw-rule-strong);
  font-size: 13.5px; font-weight: 500; white-space: nowrap; color: var(--rw-text);
  transition: background var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.pill:hover { background: var(--rw-hover); }
.pill:disabled, .pill[aria-disabled='true'] { opacity: 0.55; cursor: default; }
.pill.action { background: var(--rw-action); color: var(--rw-on-action); border-color: transparent; }
.pill.action:hover:not(:disabled, [aria-disabled='true']) { box-shadow: var(--ar-shadow-md); }
.pill.quiet { border-color: transparent; color: var(--rw-mute); padding: 0 12px; }
.pill.quiet:hover { color: var(--rw-text); }
.pill[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
</style>
