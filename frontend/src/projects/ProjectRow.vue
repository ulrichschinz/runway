<script setup>
/**
 * One project on Projekte (06 `renderProjects` `.proj`): the yellow ring when it is stuck, its name
 * and whether it has a plan, its state ("steckt fest", "in Bewegung", "ruht", "abgeschlossen") and
 * its counts ("2 nächste · 1 wartet"). A link to the project's page; `data-project` lets the
 * page's cursor (`j` `k`) find it.
 */
import { computed } from 'vue'
import { t } from '../shared/i18n.js'
import { projectState } from '../shared/projectOverview.js'

const props = defineProps({
  /** an overview row with the snapshot's reading (`withSnapshot`) */
  project: { type: Object, required: true },
  /** the keyboard cursor is on this row */
  cursor: { type: Boolean, default: false },
})

const state = computed(() => projectState(props.project))
const counts = computed(() => props.project.counts ?? { next: 0, waiting: 0 })
const to = computed(() => `/projects/${encodeURIComponent(props.project.name)}`)
</script>

<template>
  <RouterLink :to="to" class="proj" :class="{ cursor }" :data-project="project.name">
    <span class="mark">
      <span v-if="state === 'stalled'" class="ring-mark" aria-hidden="true" />
    </span>
    <span class="main">
      <span class="name">{{ project.name }}</span>
      <span class="plan">{{ project.has_plan ? t('proj.plan') : t('proj.noPlan') }}</span>
    </span>
    <span class="state" :class="{ stalled: state === 'stalled' }">
      {{ state === 'stalled' ? t('proj.stalled') : t(`proj.row.${state}`) }}
    </span>
    <span class="counts">{{ t('proj.counts', { n: counts.next, w: counts.waiting }) }}</span>
  </RouterLink>
</template>

<style scoped>
/* 06 web.css .proj */
.proj {
  display: grid; grid-template-columns: 22px minmax(0, 1fr) 128px 150px; align-items: center; column-gap: 14px;
  min-height: 64px; padding: 8px 4px; border-bottom: 1px solid var(--rw-rule); text-align: left; width: 100%;
  color: var(--rw-text); text-decoration: none;
}
.proj:hover { background: var(--rw-hover); }
.proj.cursor { background: var(--rw-focus); }
.proj:focus-visible { outline-offset: -2px; }
.main { min-width: 0; }
.name { display: block; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.plan { display: block; margin-top: 3px; font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.state { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.state.stalled { color: var(--rw-text); }
.counts { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); text-align: right; }
.ring-mark {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--rw-marker);
}
@media (max-width: 760px) {
  .proj { grid-template-columns: 18px minmax(0, 1fr) auto; }
  .counts { display: none; }
}
</style>
