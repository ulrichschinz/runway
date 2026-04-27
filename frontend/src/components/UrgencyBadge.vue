<template>
  <span :class="badgeClass" class="inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums">
    {{ score.toFixed(1) }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ score: { type: Number, default: 0 } })

const badgeClass = computed(() => {
  if (props.score >= 15) return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
  if (props.score >= 8)  return 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
  if (props.score >= 0)  return 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
})
</script>
