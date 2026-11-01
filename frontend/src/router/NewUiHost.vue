<script setup>
/**
 * The new UI's composition root (brief 0050): mounted by App.vue around the RouterView only while
 * the new UI is on and the route needs a session, so the old UI never creates the gtd store.
 *
 * It assembles what `layout/AppFrame.vue` shows — counts, Stand, the outbox line, the user, the
 * colour scheme — from the stores and provides it to every page (`useFrame`). Pages in any feature
 * unit read it there, so no page has to reach into another feature's store. It also reads the todo
 * a `?task=<uuid>` link names (Android's Custom Tab) and keeps the document title.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import client from '../api/client.js'
import { provideFrame } from '../composables/useFrame.js'
import { useTheme } from '../composables/useTheme.js'
import { t } from '../shared/i18n.js'
import { taskParam } from '../shared/returnPath.js'
import { useAuthStore } from '../stores/auth.js'
import { useGtdStore } from '../tasks/stores/gtd.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const gtd = useGtdStore()
const theme = useTheme()

const view = computed(() => route.meta.view ?? null)

const props = computed(() => ({
  view: view.value,
  counts: {
    inbox: gtd.inbox.length,
    next: gtd.next.length,
    waiting: gtd.waiting.length,
    projects: gtd.projects.filter((p) => p.status === 'active').length,
    someday: gtd.someday.length,
  },
  flags: {
    stalled: gtd.projects.some((p) => p.status === 'active' && p.stalled),
    reviewDue: gtd.reviewDue,
  },
  stand: gtd.stand,
  offline: gtd.offline,
  failedCount: gtd.failed.length,
  user: auth.username ?? '',
  themeChoice: theme.choice.value,
}))

const on = {
  retry: () => gtd.retry(),
  theme: (choice) => theme.setChoice(choice),
  // A full load, as on a session's end (`shared/sessionEnd.js`): the store's snapshot and its
  // listeners belong to this account and go with the page.
  signout: () => {
    auth.logout()
    window.location.assign('/login')
  },
}

// ?task=<uuid>: read the todo once the link names one; a later link replaces it.
const task = ref(null)
let asked = null
watch(
  () => taskParam(route.query.task),
  async (uuid) => {
    asked = uuid
    if (!uuid) {
      task.value = null
      return
    }
    let found = null
    try {
      const { data } = await client.get(`/tasks/${uuid}`)
      found = data.status === 'deleted' ? { uuid, missing: true } : { uuid, description: data.description }
    } catch (error) {
      // The API answers an unknown uuid with 400; a network failure says nothing about the todo.
      const status = error.response?.status
      if (status === 400 || status === 404) found = { uuid, missing: true }
    }
    if (asked === uuid) task.value = found
  },
  { immediate: true },
)

function closeTask() {
  const query = { ...route.query }
  delete query.task
  router.replace({ query })
}

provideFrame({ props, on, task, closeTask })

// The tab says where you are; the old UI keeps the page's own title.
const oldTitle = document.title
watch(view, (v) => {
  document.title = v ? `${t(`title.${v === 'project' ? 'projects' : v}`)} · ${t('brand.product')}` : oldTitle
}, { immediate: true })
onBeforeUnmount(() => {
  document.title = oldTitle
})
</script>

<template>
  <slot />
</template>
