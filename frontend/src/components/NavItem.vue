<template>
  <RouterLink
    :to="to"
    class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
    :class="isActive ? 'nav-active' : 'nav-inactive'"
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

<style scoped>
.nav-active {
  background: color-mix(in srgb, var(--ar-coral) 10%, transparent);
  color: var(--ar-plum);
}

.nav-inactive {
  color: #4b5563;
}

.nav-inactive:hover {
  background: #f9fafb;
}

:global(.dark) .nav-active {
  background: color-mix(in srgb, var(--ar-coral) 18%, transparent);
  color: #f8c4be;
}

:global(.dark) .nav-inactive {
  color: #d1d5db;
}

:global(.dark) .nav-inactive:hover {
  background: #374151;
}
</style>
