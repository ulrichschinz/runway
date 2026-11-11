<script setup>
/**
 * "Nachhaken" in the margin column (plan M12; 06 `todayPanel`'s follow-up section): up to three
 * waiting todos whose follow-up day has come (yellow ring, "heute" or "seit Fr 30.10.") or comes
 * this week (its day), due ones first; the eyebrow counts the due ones ("1 heute"). A click opens
 * the todo's detail (`?task=`) with the focus in it: inside a list page, `frame.openTask` is
 * ListFrame's, which brings the focus back to the row's `data-follow` on closing. Not on Warten
 * auf, which shows the same rows itself.
 */
import { useFrame } from '../../composables/useFrame.js'
import { t } from '../../shared/i18n.js'
import { useGtdStore } from '../stores/gtd.js'
import PanelSection from './PanelSection.vue'

const gtd = useGtdStore()
const frame = useFrame()

function when(row) {
  if (!row.due) return t('m.followDay', { day: row.day })
  return row.day === gtd.today ? t('due.today') : t('m.sinceDay', { day: row.day })
}
</script>

<template>
  <PanelSection :eyebrow="[t('m.follow'), gtd.followUps.due ? t('m.followToday', { n: gtd.followUps.due }) : '']">
    <button
      v-for="row in gtd.followUps.rows" :key="row.task.uuid" type="button" class="mrow" :data-follow="row.task.uuid"
      @click="frame.openTask(row.task.uuid)"
    >
      <span class="t"><span v-if="row.due" class="ring-mark" aria-hidden="true" />{{ row.task.description }}</span>
      <span class="m">{{ when(row) }}</span>
    </button>
    <p v-if="!gtd.followUps.rows.length" class="mnote">{{ t('m.followNone') }}</p>
  </PanelSection>
</template>
