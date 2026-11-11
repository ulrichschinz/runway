<script setup>
/**
 * Alle (06 `sectionsFor('all')`, `renderHead('all')`): every open todo by list, and on demand (`d`)
 * what was done in the last seven days, struck through. The toggle names its key as 06 does (plan
 * M14); Rückblick's "in Alle zeigen" opens the page with it on.
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
      <div class="bar" data-fold>
        <button type="button" class="toggle" :aria-pressed="showDone" aria-keyshortcuts="d" @click="toggleDone">
          <span class="pill">{{ t('all.showDone') }} <kbd aria-hidden="true">d</kbd></span>
        </button>
      </div>
    </template>
  </ListFrame>
</template>

<style scoped>
.bar { margin-top: 20px; }
/* 06 `.ctx` with its key (`ContextBar`'s chip): the pill is what shows, the button around it the touch target */
.toggle { display: inline-flex; align-items: center; border-radius: var(--rw-radius-pill); }
.pill {
  display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 6px 0 12px; border-radius: var(--rw-radius-pill);
  border: 1px solid var(--rw-rule); font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute);
}
.toggle:hover .pill { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.toggle[aria-pressed='true'] .pill { background: var(--rw-inverse); color: var(--rw-on-inverse); border-color: var(--rw-inverse); }
.pill kbd { border-color: color-mix(in srgb, currentColor 30%, transparent); color: inherit; }
@media (max-width: 760px) {
  .toggle { min-height: 44px; }
  .pill { min-height: 32px; padding-right: 12px; }
}
@media (hover: none) and (pointer: coarse) {
  .pill { padding-right: 12px; }
}
</style>
