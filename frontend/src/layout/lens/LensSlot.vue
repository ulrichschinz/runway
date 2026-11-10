<script setup>
/**
 * A place for the Tageslinse (plan M11; 06 `lensSlot`): a sized box with the flat lens inside. The
 * controller (`lensController.js`) puts the one WebGL canvas into the first slot on screen when a
 * canvas is allowed; while it holds this slot, the flat lens steps aside. The level is what the
 * page shows (held while a bead flies, `useShownProgress`).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LensFlat from './LensFlat.vue'
import { liveSlot, registerSlot, setLevel, unregisterSlot } from './lensController.js'

const props = defineProps({
  /** px: 104 in the Nächste head, 52 on the phone, 72 in the margin (M12) */
  size: { type: Number, required: true },
  /** 0..1 */
  level: { type: Number, required: true },
})
const el = ref(null)

onMounted(() => {
  setLevel(props.level, { animate: false })
  registerSlot(el.value, props.size)
})
onBeforeUnmount(() => unregisterSlot(el.value))
watch(() => props.level, (level) => setLevel(level))
watch(() => props.size, (size) => {
  unregisterSlot(el.value)
  registerSlot(el.value, size)
})
</script>

<template>
  <div ref="el" class="lens-slot" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <LensFlat v-if="liveSlot !== el" :level="level" :size="size" />
  </div>
</template>

<style scoped>
.lens-slot { position: relative; display: block; flex: none; }
.lens-slot :deep(canvas) { position: absolute; left: 0; top: 0; display: block; }
</style>
