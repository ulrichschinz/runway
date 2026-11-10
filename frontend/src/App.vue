<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import NewUiHost from './router/NewUiHost.vue'
import { UI_NEW, currentUi } from './shared/uiFlag.js'

const route = useRoute()
const newUi = computed(() => currentUi(route.query.ui) === UI_NEW)
// The new UI's pages read the frame from the host (brief 0050). Only routes that need a session
// get it, and the old UI never does, so it never creates the new UI's store.
const hosted = computed(() => newUi.value && route.matched.length > 0 && !route.meta.public)

// Development builds only: `?ui=neu&debug=store` shows what the new UI's store computes
// (brief 0049). Behind `import.meta.env.DEV` the production build drops the condition and
// the page's chunk entirely.
const StoreDebugPage = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./tasks/views/StoreDebugPage.vue'))
  : null
const debugPage = import.meta.env.DEV
  ? computed(() => route.query.debug === 'store' && newUi.value ? StoreDebugPage : null)
  : null
</script>

<template>
  <component :is="debugPage" v-if="debugPage" />
  <NewUiHost v-else-if="hosted"><RouterView /></NewUiHost>
  <RouterView v-else />
</template>
