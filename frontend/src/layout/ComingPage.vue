<script setup>
/**
 * What every route of the new UI shows until its own page lands (plan M4): the frame, the view's
 * eyebrow and heading, and "kommt". A todo opened by a `?task=` link (Android's Custom Tab) is
 * shown by its description until M7's detail replaces this.
 */
import { computed } from 'vue'
import AppFrame from './AppFrame.vue'
import EmptyState from './ui/EmptyState.vue'
import EyebrowLine from './ui/EyebrowLine.vue'
import PageHeading from './ui/PageHeading.vue'
import PillButton from './ui/PillButton.vue'
import SectionRule from './ui/SectionRule.vue'
import { useFrame } from '../composables/useFrame.js'
import { t } from '../shared/i18n.js'

const frame = useFrame()
const view = computed(() => frame.props.value.view)
// A project's page has no heading of its own yet: it borrows Projekte's.
const key = computed(() => (view.value === 'project' ? 'projects' : view.value))
const stand = computed(() => frame.props.value.stand)
</script>

<template>
  <AppFrame v-bind="frame.props.value" v-on="frame.on">
    <template #head>
      <EyebrowLine :parts="[t(`title.${key}`), stand ? t('stand', { t: stand }) : '']" class="eyebrow" />
      <PageHeading :parts="t(`h.${key}`)" />
    </template>
    <section v-if="frame.task.value" class="task" :aria-label="t('d.title')">
      <SectionRule :parts="[t('d.title')]" />
      <p v-if="frame.task.value.missing" class="desc mute">{{ t('shell.taskMissing') }}</p>
      <p v-else class="desc">{{ frame.task.value.description }}</p>
      <PillButton quiet @click="frame.closeTask">{{ t('close') }}</PillButton>
    </section>
    <EmptyState :text="t('shell.coming')" />
  </AppFrame>
</template>

<style scoped>
.eyebrow { margin-bottom: 12px; }
.task { margin-bottom: 28px; }
.desc { margin: 14px 0 8px; font-size: 20px; line-height: 1.35; font-weight: 500; letter-spacing: -0.01em; }
.desc.mute { color: var(--rw-mute); font-size: 16px; font-weight: 400; }
</style>
