<script setup>
/**
 * The page's big heading with exactly one Fraunces italic word (06 `heading()`): `parts` is the
 * message table's `[before, accent, after]`.
 */
defineProps({
  /** @type {[string, string, string]} */
  parts: { type: Array, required: true },
})
</script>

<template>
  <h1 class="display">{{ parts[0] }}<em>{{ parts[1] }}</em>{{ parts[2] }}</h1>
</template>

<style scoped>
.display {
  margin: 0; text-wrap: balance;
  font-size: var(--rw-type-display-size); line-height: var(--rw-type-display-line);
  font-weight: var(--rw-type-display-weight); letter-spacing: var(--rw-type-display-tracking);
}
em {
  font-family: var(--rw-font-serif); font-style: italic; font-weight: 300; color: var(--rw-accent);
  letter-spacing: -0.02em; padding-right: 0.04em;
}
@media (max-width: 760px) {
  .display { font-size: 30px; }
}
</style>
