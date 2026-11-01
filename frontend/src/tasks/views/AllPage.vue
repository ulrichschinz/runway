<script setup>
/**
 * Alle (06 `sectionsFor('all')`): every open todo by list, and on demand (`d`) what was done
 * in the last seven days, struck through.
 */
import { computed } from 'vue'
import { t } from '../../shared/i18n.js'
import ListFrame from '../components/ListFrame.vue'
import { showDone } from '../listState.js'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()

const eyebrow = computed(() => [
  t('nav.all'),
  gtd.today ? t('all.open', { n: gtd.open.length }) : '',
  showDone.value && gtd.today ? t('all.doneN', { n: gtd.doneWeek.length }) : '',
])

const sections = computed(() => {
  if (!gtd.today) return []
  const lists = [
    { key: 'inbox', label: t('list.inbox'), kind: 'next', tasks: gtd.inbox },
    { key: 'next', label: t('list.next'), kind: 'next', tasks: gtd.next },
    { key: 'waiting', label: t('list.waiting'), kind: 'next', tasks: gtd.waiting },
    { key: 'someday', label: t('list.someday'), kind: 'next', tasks: gtd.someday },
    { key: 'unlisted', label: t('sec.unlisted'), kind: 'next', tasks: gtd.unlisted },
  ].filter((s) => s.tasks.length)
  return showDone.value ? [...lists, { key: 'done', label: t('sec.doneWeek'), kind: 'done', tasks: gtd.doneWeek }] : lists
})

const toggleDone = () => {
  showDone.value = !showDone.value
}
</script>

<template>
  <ListFrame :eyebrow="eyebrow" :heading="t('h.all')" :sections="sections" :scopes="['all']" :keys="{ toggleDone }">
    <template #head>
      <div class="bar">
        <button type="button" class="toggle" :aria-pressed="showDone" :title="t('key.n', { k: 'd' })" @click="toggleDone">
          {{ t('all.showDone') }}
        </button>
      </div>
    </template>
  </ListFrame>
</template>

<style scoped>
.bar { margin-top: 20px; }
.toggle {
  display: inline-flex; align-items: center; min-height: 30px; padding: 0 12px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule); font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.toggle:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.toggle[aria-pressed='true'] { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
@media (max-width: 760px) {
  .toggle { min-height: 44px; }
}
</style>
