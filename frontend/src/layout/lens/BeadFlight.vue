<script setup>
/**
 * The bead's overlay (plan M11; 06 `#flight`, `.bead`): one fixed SVG above everything, empty unless
 * a bead flies (`useBeadFlight.js`). Mounted once by the frame. Pointer events pass through it.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { setOverlay } from './useBeadFlight.js'

const svg = ref(null)
onMounted(() => setOverlay(svg.value))
onBeforeUnmount(() => setOverlay(null))
</script>

<template>
  <svg ref="svg" class="rw-flight" aria-hidden="true" />
</template>

<style>
.rw-flight { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 45; overflow: visible; }
.rw-flight path { fill: none; stroke: var(--rw-action); stroke-width: 1.5; stroke-linecap: round; opacity: 0.9; }
.rw-bead {
  position: fixed; left: 0; top: 0; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; z-index: 46; pointer-events: none;
  background: radial-gradient(
    circle at 34% 30%, var(--ar-paper) 0 9%, color-mix(in srgb, var(--ar-coral) 70%, var(--ar-paper)) 24%,
    var(--ar-coral) 58%, color-mix(in srgb, var(--ar-coral) 72%, var(--ar-plum)) 100%
  );
  opacity: 0; will-change: transform;
}
</style>
