<script setup>
/**
 * Warten auf (06 `waitingSplit`): Nachhaken (the follow-up day has come, with the yellow ring),
 * Diese Woche, Später oder ohne Datum; sorted by follow-up day; never filtered by context.
 */
import { computed } from 'vue'
import { t } from '../../shared/i18n.js'
import { waitingSections } from '../../shared/sections.js'
import ListFrame from '../components/ListFrame.vue'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()

const sections = computed(() => {
  if (!gtd.today) return []
  if (gtd.waiting.length === 0) return [{ key: 'none', kind: 'waiting', tasks: [], empty: t('empty.waiting') }]
  const w = waitingSections(gtd.waiting, gtd.today)
  return [
    { key: 'due', label: t('m.follow'), strong: true, kind: 'waiting', tasks: w.due, empty: t('empty.wdue') },
    { key: 'soon', label: t('sec.wsoon'), kind: 'waiting', tasks: w.soon },
    { key: 'later', label: t('sec.wlater'), kind: 'waiting', tasks: w.later },
  ].filter((x) => x.tasks.length || x.empty)
})
</script>

<template>
  <ListFrame :eyebrow="[t('list.waiting'), gtd.today ? gtd.waiting.length : '', t('waiting.sorted')]" :heading="t('h.waiting')" :sections="sections" />
</template>

