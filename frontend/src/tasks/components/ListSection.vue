<script setup>
/**
 * A section head in a list (06 `.sec`): `// Fällig · 1`, an optional note (`· andere Kontexte`),
 * then one hairline to the edge. A heading for screen readers, so sections can be jumped.
 */
defineProps({
  label: { type: String, required: true },
  /** shown when above 0 */
  count: { type: Number, default: 0 },
  note: { type: String, default: '' },
  /** the label in text colour (Fällig, Jetzt), else muted */
  strong: { type: Boolean, default: false },
})
</script>

<template>
  <div class="sec" role="heading" aria-level="2">
    <span class="slash" aria-hidden="true">//</span>
    <span :class="{ strong }">{{ label }}</span>
    <template v-if="count > 0"><span class="sep" aria-hidden="true">·</span><span>{{ count }}</span></template>
    <template v-if="note"><span class="sep" aria-hidden="true">·</span><span>{{ note }}</span></template>
  </div>
</template>

<style scoped>
.sec {
  display: flex; align-items: baseline; gap: 0.6em; margin: 26px 0 2px;
  font-family: var(--rw-font-mono); font-size: var(--rw-type-eyebrow-size); line-height: var(--rw-type-eyebrow-line);
  letter-spacing: var(--rw-type-eyebrow-tracking); color: var(--rw-mute);
}
.sec::after { content: ''; flex: 1; align-self: center; height: 1px; margin-left: 0.6em; background: var(--rw-rule); }
.sec:first-child { margin-top: 6px; }
.slash { color: var(--rw-action); letter-spacing: 0; }
.sep { color: var(--rw-soft); }
.strong { color: var(--rw-text); }
@media (max-width: 760px) {
  .sec { margin-top: 14px; }
}
</style>
