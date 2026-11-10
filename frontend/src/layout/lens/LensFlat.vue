<script setup>
/**
 * The flat Tageslinse (06 `lens-flat.js`): the lens on the phone, with reduced motion, without
 * WebGL, after a lost context, and on first paint before Three.js has loaded. Same information as
 * the 3D lens: the liquid's level is today's planned progress, volume-true (`flatLensShape`); the
 * numbers are the caption beside it. Brand colours only, from the tokens.
 */
import { computed, useId } from 'vue'
import { flatLensShape } from '../../shared/lensMath.js'

const props = defineProps({
  /** 0..1 */
  level: { type: Number, required: true },
  /** px */
  size: { type: Number, required: true },
})
const id = useId()
const s = computed(() => flatLensShape(props.level, props.size))
const hi = computed(() => ({ x: s.value.c - s.value.r * 0.38, y: s.value.cy - s.value.r * 0.48 }))
</script>

<template>
  <svg class="lens-flat" :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" aria-hidden="true">
    <defs>
      <radialGradient :id="`${id}g`" cx="38%" cy="32%" r="75%">
        <stop offset="0" style="stop-color: var(--ar-paper)" stop-opacity=".95" />
        <stop offset=".55" style="stop-color: var(--ar-paper)" stop-opacity=".55" />
        <stop offset="1" style="stop-color: var(--ar-coral)" stop-opacity=".28" />
      </radialGradient>
      <clipPath :id="`${id}c`"><circle :cx="s.c" :cy="s.cy" :r="s.rl" /></clipPath>
    </defs>
    <ellipse class="lf-shadow" :cx="s.c" :cy="s.cy + s.r + size * 0.06" :rx="s.r * 0.82" :ry="size * 0.045" />
    <g :clip-path="`url(#${id}c)`">
      <rect v-if="s.liquid" class="lf-liquid" x="0" :y="s.top" :width="size" :height="size" />
      <ellipse v-if="s.surface" class="lf-surface" :cx="s.c" :cy="s.top" :rx="s.chord" :ry="Math.max(1.5, s.chord * 0.16)" />
    </g>
    <circle class="lf-glass" :cx="s.c" :cy="s.cy" :r="s.r" :fill="`url(#${id}g)`" stroke-width="1" />
    <ellipse
      class="lf-hi" :cx="hi.x" :cy="hi.y" :rx="s.r * 0.26" :ry="s.r * 0.14"
      :transform="`rotate(-28 ${hi.x} ${hi.y})`"
    />
  </svg>
</template>

<style scoped>
.lens-flat { position: absolute; left: 0; top: 0; display: block; }
.lf-shadow { fill: var(--ar-plum); opacity: 0.1; }
.lf-liquid { fill: color-mix(in srgb, var(--ar-coral) 84%, var(--ar-paper)); }
.lf-surface { fill: color-mix(in srgb, var(--ar-coral) 55%, var(--ar-paper)); }
.lf-glass { stroke: color-mix(in srgb, var(--ar-coral) 40%, transparent); }
.lf-hi { fill: var(--ar-paper); opacity: 0.85; }
</style>
