<script setup>
/**
 * Development only (`?ui=neu&debug=store`, mounted by App.vue when `import.meta.env.DEV`):
 * what the gtd store computes, as data, beside the server's own lists — the plan's M3
 * acceptance (brief 0049). Not a view of the new UI and never in a production build.
 *
 * `parity` compares the client's lists with `GET /gtd/inbox|next|waiting|someday`. Expected
 * differences (brief 0048): F4 dual-tagged todos (the server lists them in Nächste too) and
 * legacy comma tags holding a status tag (the server misses them). The tags are shown so a
 * reader can check each one.
 *
 * `window.__runway.gtd` is the store, for driving it from a browser console or a script.
 */
import { computed, ref, watch } from 'vue'
import client from '../../api/client.js'
import { useTheme } from '../../composables/useTheme.js'
import { useGtdStore } from '../stores/gtd.js'

useTheme()
const store = useGtdStore()
window.__runway = { ...window.__runway, gtd: store }

const LISTS = ['inbox', 'next', 'waiting', 'someday']
const server = ref(null)

async function readServerLists() {
  const replies = await Promise.all(LISTS.map((list) => client.get(`/gtd/${list}`)))
  server.value = Object.fromEntries(LISTS.map((list, i) => [list, replies[i].data]))
}
// After every successful snapshot, so both sides are read at the same moment.
watch(() => store.stand, readServerLists)

const row = (t) => [t.description, t.tags.join(' '), t.sync].filter(Boolean).join(' | ')

const parity = computed(() => {
  if (!server.value) return null
  return Object.fromEntries(LISTS.map((list) => {
    const mine = store[list]
    const theirs = server.value[list]
    const mineIds = new Set(mine.map((t) => t.uuid))
    const theirIds = new Set(theirs.map((t) => t.uuid))
    return [list, {
      client: mine.length,
      server: theirs.length,
      serverOnly: theirs.filter((t) => !mineIds.has(t.uuid)).map(row),
      clientOnly: mine.filter((t) => !theirIds.has(t.uuid)).map(row),
    }]
  }))
})

const dump = computed(() => {
  const sections = store.today ? store.sectionsFor() : null
  return {
    today: store.today,
    stand: store.stand,
    offline: store.offline,
    caption: store.caption,
    progress: store.progress,
    lists: Object.fromEntries(
      ['inbox', 'next', 'waiting', 'someday', 'unlisted', 'doneToday'].map((list) => [list, store[list].map(row)]),
    ),
    sections: sections && Object.fromEntries(
      ['faellig', 'jetzt', 'bald', 'spaeter'].map((key) => [key, sections[key].map((t) => t.description)]),
    ),
    contexts: store.contexts,
    contextCount: store.contextCount,
    parity: parity.value,
    ops: store.ops,
  }
})
</script>

<template>
  <main class="store-debug">
    <pre data-store-dump>{{ JSON.stringify(dump, null, 2) }}</pre>
  </main>
</template>

<style scoped>
.store-debug {
  min-height: 100vh;
  padding: 24px;
  background: var(--rw-bg);
  color: var(--rw-text);
}
pre {
  margin: 0;
  font-family: var(--rw-font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
