<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { UI_NEW, currentUi } from './shared/uiFlag.js'

// Development builds only: `?ui=neu&debug=store` shows what the new UI's store computes
// (brief 0049). Behind `import.meta.env.DEV` the production build drops the condition and
// the page's chunk entirely.
const route = useRoute()
const StoreDebugPage = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./tasks/views/StoreDebugPage.vue'))
  : null
const debugPage = import.meta.env.DEV
  ? computed(() => route.query.debug === 'store' && currentUi(route.query.ui) === UI_NEW ? StoreDebugPage : null)
  : null
</script>

<template>
  <component :is="debugPage" v-if="debugPage" />
  <RouterView v-else />
</template>
