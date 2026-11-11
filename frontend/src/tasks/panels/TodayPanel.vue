<script setup>
/**
 * "Heute" in the margin column (plan M12; 06 `todayPanel`): the day written out, the Tageslinse
 * (72 px) with "3 von 7" and "geplant und erledigt · 1 zusätzlich", then today's done todos struck
 * through with the time they were done ("gerade" while a tick is still held). On Nächste the head
 * carries the lens and its caption, so here only the list shows and "3 von 7" appears once per
 * screen (`lens: false`). The numbers are held while a bead flies, as in the head.
 */
import { computed } from 'vue'
import LensSlot from '../../layout/lens/LensSlot.vue'
import { useShownProgress } from '../../layout/lens/useBeadFlight.js'
import { longDay, parseStamp, timeOf } from '../../shared/dates.js'
import { t } from '../../shared/i18n.js'
import InkStrike from '../components/InkStrike.vue'
import { useGtdStore } from '../stores/gtd.js'
import PanelSection from './PanelSection.vue'

defineProps({
  /** the lens and its numbers (everywhere but Nächste) */
  lens: { type: Boolean, default: true },
})

const gtd = useGtdStore()
const shown = useShownProgress(() => gtd.progress)
const doneAt = (task) => {
  const at = parseStamp(task.end)
  return at ? timeOf(at) : t('done.now')
}
const done = computed(() => gtd.doneToday.map((task) => ({ uuid: task.uuid, text: task.description, at: doneAt(task) })))
</script>

<template>
  <PanelSection :eyebrow="[t('m.today'), gtd.today ? longDay(gtd.today) : '']">
    <div v-if="lens && shown" class="lensline">
      <LensSlot :size="72" :level="shown.level" />
      <p class="lensread">
        <span class="big">{{ t('lens.of', { done: shown.done, total: shown.total }) }}</span>
        <span class="sub">{{ t('lens.sub') }}{{ shown.extra ? t('lens.extra', { n: shown.extra }) : '' }}</span>
      </p>
    </div>
    <ul v-if="done.length" class="donelist" :aria-label="t('m.doneToday')">
      <li v-for="x in done" :key="x.uuid">
        <span class="desc"><span class="txt">{{ x.text }}</span><InkStrike :seed="x.uuid" /></span>
        <span class="m">{{ x.at }}</span>
      </li>
    </ul>
  </PanelSection>
</template>

<style scoped>
/* 06 combo.css .lensline, .lensread */
.lensline { display: flex; align-items: center; gap: 16px; margin: 6px 0 4px; }
.lensread { display: grid; gap: 3px; margin: 0; }
.big { font-size: 22px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.1; color: var(--rw-text); }
.sub { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
/* 06 base.css .donelist: the ink strike drawn and at rest */
.donelist { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 7px; }
.donelist li { display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: var(--rw-mute); }
.desc { position: relative; min-width: 0; }
.donelist :deep(.strike path) { opacity: 1; stroke-dashoffset: 0; }
.m { margin-left: auto; font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); white-space: nowrap; }
</style>
