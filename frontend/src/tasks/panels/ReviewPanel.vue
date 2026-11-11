<script setup>
/**
 * "Rückblick" in the margin column (plan M12; 06 `todayPanel`): the day of the last weekly review
 * and how long ago it was ("Zuletzt Di 03.11., vor 7 Tagen.", "…, gestern.", "…, heute."); once it is due (seven days, or
 * never recorded: the rail's yellow ring, `reviewDue`) a way to begin it, with its keys `g` `r`.
 */
import { computed } from 'vue'
import { reviewAgoKey } from '../../shared/gtdRules.js'
import { t } from '../../shared/i18n.js'
import { useGtdStore } from '../stores/gtd.js'
import PanelSection from './PanelSection.vue'

const gtd = useGtdStore()
const age = computed(() => gtd.reviewAge)
/** `['Zuletzt ', 'Di 03.11.', ', vor 7 Tagen.']`: the day in the text's colour. */
const last = computed(() => {
  const a = age.value
  if (!a?.day) return null
  const [before, day, after] = t('m.reviewLast', { d: t('m.followDay', { day: a.day }) })
  return [before, day, after + t(reviewAgoKey(a.days), { n: a.days })]
})
</script>

<template>
  <PanelSection :eyebrow="[t('nav.review')]">
    <p v-if="last" class="mnote">{{ last[0] }}<b>{{ last[1] }}</b>{{ last[2] }}</p>
    <p v-else-if="age" class="mnote">{{ t('m.reviewNever') }}</p>
    <div v-if="age?.due" class="go">
      <RouterLink to="/review" class="pill">
        {{ t('m.reviewStart') }} <span class="keys" aria-hidden="true"><kbd>g</kbd><kbd>r</kbd></span>
      </RouterLink>
    </div>
  </PanelSection>
</template>

<style scoped>
.go { margin-top: 12px; }
/* PillButton's look, as a link: it goes to the Rückblick page */
.pill {
  display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 18px;
  border-radius: var(--rw-radius-pill); border: 1px solid var(--rw-rule-strong);
  font-size: 13.5px; font-weight: 500; white-space: nowrap; color: var(--rw-text); text-decoration: none;
  transition: background var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.pill:hover { background: var(--rw-hover); }
.keys { display: inline-flex; gap: 4px; }
</style>
