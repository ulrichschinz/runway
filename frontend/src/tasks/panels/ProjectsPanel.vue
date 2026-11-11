<script setup>
/**
 * "Projekte" in the margin column (plan M12; 06 `todayPanel`): the active projects that are stuck
 * — no next action and nothing waited for (`stalled`, from `/gtd/projects/overview`) — with the
 * yellow ring, each a link to its project; or, when none is, "Alle N aktiven Projekte haben eine
 * nächste Aktion."
 */
import { computed } from 'vue'
import { t } from '../../shared/i18n.js'
import { useGtdStore } from '../stores/gtd.js'
import PanelSection from './PanelSection.vue'

const gtd = useGtdStore()
const active = computed(() => gtd.projects.filter((p) => p.status === 'active'))
const stalled = computed(() => active.value.filter((p) => p.stalled))
</script>

<template>
  <PanelSection :eyebrow="[t('list.projects')]">
    <RouterLink v-for="p in stalled" :key="p.name" :to="`/projects/${encodeURIComponent(p.name)}`" class="mrow">
      <span class="t"><span class="ring-mark" aria-hidden="true" />{{ p.name }}</span>
      <span class="m">{{ t('proj.stalled') }}</span>
    </RouterLink>
    <p v-if="!stalled.length" class="mnote">{{ t('m.projOk', { n: active.length }) }}</p>
  </PanelSection>
</template>
