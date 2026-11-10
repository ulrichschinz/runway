<script setup>
/**
 * The coral ink line drawn across a ticked-off title (06 `strikeSVG`). Its wobble is seeded by
 * the todo's uuid, so every strike looks hand-drawn but stays the same for a todo. The row
 * draws it (`is-struck`, `is-deleted`, a done row); at rest it is invisible.
 */
import { computed } from 'vue'

const props = defineProps({
  seed: { type: String, required: true },
})

/** 06's seeded generator, on a number derived from the uuid. */
function generator(text) {
  let seed = 0
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 233280
  return () => (seed = (seed * 9301 + 49297) % 233280) / 233280
}

const d = computed(() => {
  const r = generator(props.seed)
  const y0 = 6.2 + (r() - 0.5) * 1.4
  const y3 = 5.4 + (r() - 0.5) * 1.6
  const c1 = 5 + (r() - 0.5) * 2.2
  const c2 = 6.4 + (r() - 0.5) * 2.2
  return `M0.6 ${y0.toFixed(2)} C 30 ${c1.toFixed(2)}, 62 ${c2.toFixed(2)}, 99.4 ${y3.toFixed(2)}`
})
</script>

<template>
  <svg class="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
    <path pathLength="1" :d="d" />
  </svg>
</template>

<style scoped>
.strike {
  position: absolute; left: -3px; top: 50%; width: calc(100% + 6px); height: 12px; margin-top: -5px;
  overflow: visible; pointer-events: none;
}
path {
  fill: none; stroke: var(--rw-action); stroke-width: 2.1; stroke-linecap: round;
  stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0;
}
</style>
