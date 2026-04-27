<template>
  <RouterLink
    :to="to"
    class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
    :class="isActive ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
    v-bind="$attrs"
  >
    <span>{{ icon }}</span>
    <slot />
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({ to: String, icon: String })
const route = useRoute()
const isActive = computed(() => route.path === props.to || route.path.startsWith(props.to + '/'))
</script>
