<script setup>
/**
 * The mono eyebrow above a heading: a coral `//`, then the parts joined by a soft `·` (06 base.css).
 * Empty parts are left out, so a caller can pass a count that is not there yet.
 */
import { computed } from 'vue'

const props = defineProps({
  /** @type {Array<string|number|null|undefined>} */
  parts: { type: Array, required: true },
})
const shown = computed(() => props.parts.filter((part) => part !== '' && part != null))
</script>

<template>
  <div class="eyebrow">
    <span class="slash" aria-hidden="true">//</span>
    <template v-for="(part, i) in shown" :key="i">
      <span v-if="i" class="sep" aria-hidden="true">·</span>
      <span>{{ part }}</span>
    </template>
  </div>
</template>

<style scoped>
.eyebrow {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.6em;
  font-family: var(--rw-font-mono); font-size: var(--rw-type-eyebrow-size); line-height: var(--rw-type-eyebrow-line);
  letter-spacing: var(--rw-type-eyebrow-tracking); color: var(--rw-mute);
}
.slash { color: var(--rw-action); letter-spacing: 0; }
.sep { color: var(--rw-soft); }
</style>
