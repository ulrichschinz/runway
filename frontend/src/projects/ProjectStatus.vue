<script setup>
/**
 * A project's status pills (06 `renderHead('project')` `statusPills`): what the status can become —
 * an active project Ruhen lassen · Abschließen, a resting one Wieder aufnehmen · Abschließen, a
 * finished one Wieder aufnehmen (`statusChoices`), quiet pills as in 06. The page sends it and offers
 * Rückgängig.
 */
import { computed } from 'vue'
import PillButton from '../layout/ui/PillButton.vue'
import { t } from '../shared/i18n.js'
import { statusChoices } from '../shared/projectOverview.js'

const props = defineProps({
  status: { type: String, required: true },
})
defineEmits(['set'])

const LABEL = { active: 'proj.resume', on_hold: 'proj.rest', done: 'proj.finish' }
const choices = computed(() => statusChoices(props.status))
</script>

<template>
  <PillButton v-for="s in choices" :key="s" quiet @click="$emit('set', s)">{{ t(LABEL[s]) }}</PillButton>
</template>

