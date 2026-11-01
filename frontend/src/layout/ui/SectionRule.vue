<script setup>
/** A section head: a mono eyebrow, then a hairline to the edge (06 `.sec`). */
import EyebrowLine from './EyebrowLine.vue'

defineProps({
  parts: { type: Array, required: true },
})
</script>

<template>
  <div class="sec">
    <EyebrowLine :parts="parts" class="label" />
  </div>
</template>

<style scoped>
.sec { display: flex; align-items: center; gap: 12px; margin: 26px 0 2px; }
.sec::after { content: ''; flex: 1; height: 1px; background: var(--rw-rule); }
.label { flex: none; }
</style>
