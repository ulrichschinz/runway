<script setup>
/**
 * The margin column's panels (plan M12, brief 0059; 06 `todayPanel`): Heute, Nachhaken, Projekte,
 * Rückblick. Every page puts them into `AppFrame`'s `margin` slot — the column on wide screens, the
 * Mehr sheet on the phone — and Nächste's lens box opens them as its panel. The composition root
 * provides this component as `frame.margin` (a chunk of its own), so a page of any unit shows it
 * without importing `fe/tasks`.
 *
 * `view` is the page's (`meta.view`), or `null` while the `/` search replaces the page: on Nächste
 * the head carries the lens and "3 von 7", on Warten auf the page lists the follow-ups, and the Rückblick
 * page is the review its panel would offer to begin (plan M14).
 */
import ProjectsPanel from './ProjectsPanel.vue'
import ReviewPanel from './ReviewPanel.vue'
import TodayPanel from './TodayPanel.vue'
import WaitingPanel from './WaitingPanel.vue'

defineProps({
  view: { type: String, default: null },
})
</script>

<template>
  <div class="panels">
    <TodayPanel :lens="view !== 'next'" />
    <WaitingPanel v-if="view !== 'waiting'" />
    <ProjectsPanel />
    <ReviewPanel v-if="view !== 'review'" />
  </div>
</template>
