<script setup>
/**
 * The new UI's composition root (brief 0050): mounted by App.vue around the RouterView only while
 * the new UI is on and the route needs a session, so the old UI never creates the gtd store.
 *
 * It assembles what `layout/AppFrame.vue` shows — counts, Stand, the outbox line, the user, the
 * colour scheme — from the stores and provides it to every page (`useFrame`). Pages in any feature
 * unit read it there, so no page has to reach into another feature's store. It also reads the todo
 * a `?task=<uuid>` link names (Android's Custom Tab; the list pages open their detail from the same
 * query) — a deferred one the lists leave out is held for the detail — and keeps the document title.
 * It registers the task search the command palette offers (`useTaskSearch`, plan M9), so the
 * layout's palette finds todos and projects without importing a feature.
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
import { useTaskSearch } from '../tasks/useTaskSearch.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const gtd = useGtdStore()
const theme = useTheme()
useTaskSearch()

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
    inboxDot: gtd.inboxDot,
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

// A capture made elsewhere marks the Inbox until it is on screen.
watch([view, () => gtd.inboxDot], ([v, dot]) => {
  if (v === 'inbox' && dot) gtd.seeInbox()
}, { immediate: true })

// ?task=<uuid>: the todo whose detail is open. Read once the link names one (the detail shows
// a todo the snapshot does not hold by this); a later link replaces it.
const taskId = computed(() => taskParam(route.query.task))
const task = ref(null)
let asked = null
watch(
  taskId,
  async (uuid) => {
    asked = uuid
    if (!uuid) {
      task.value = null
      return
    }
    let found = null
    try {
      const { data } = await client.get(`/tasks/${uuid}`)
      if (data.status === 'deleted') found = { uuid, missing: true }
      else if (data.status === 'completed') found = { uuid, description: data.description, done: true }
      else {
        found = { uuid, description: data.description }
        // Deferred by a future `wait`, it is in no list; the store holds it for the detail.
        gtd.keepAside(data)
      }
    } catch (error) {
      // The API answers an unknown uuid with 400; a network failure says nothing about the todo.
      const status = error.response?.status
      if (status === 400 || status === 404) found = { uuid, missing: true }
    }
    if (asked === uuid) task.value = found
  },
  { immediate: true },
)

/** Open a todo's detail: the address carries it, so a reload or Android's link means the same. */
function openTask(uuid) {
  if (taskId.value === uuid) return
  router.replace({ query: { ...route.query, task: uuid } })
}

function closeTask() {
  const query = { ...route.query }
  delete query.task
  router.replace({ query })
}

provideFrame({ props, on, taskId, task, openTask, closeTask })

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
