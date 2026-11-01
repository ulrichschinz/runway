<script setup>
/** Irgendwann (06): the parked ideas, to look through in the weekly review. */
import { computed } from 'vue'
import { t } from '../../shared/i18n.js'
import ListFrame from '../components/ListFrame.vue'
import { useGtdStore } from '../stores/gtd.js'

const gtd = useGtdStore()

const sections = computed(() =>
  gtd.today ? [{ key: 'ideas', label: t('sec.ideas'), kind: 'someday', tasks: gtd.someday, empty: t('empty.someday') }] : [],
)
</script>

<template>
  <ListFrame :eyebrow="[t('list.someday'), gtd.today ? gtd.someday.length : '', t('someday.sub')]" :heading="t('h.someday')" :sections="sections" />
</template>

