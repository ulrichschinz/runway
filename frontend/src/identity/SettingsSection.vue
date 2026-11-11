<script setup>
/**
 * One row of Einstellungen (06 `.set`): the section's name on the left, what it holds on the right;
 * one column on the phone. A labelled region, so a screen reader can jump between sections.
 */
defineProps({
  title: { type: String, required: true },
  /** the heading's id, for `aria-labelledby` */
  id: { type: String, required: true },
})
</script>

<template>
  <section class="set" :aria-labelledby="id">
    <h2 :id="id">{{ title }}</h2>
    <div class="body"><slot /></div>
  </section>
</template>

<style scoped>
.set {
  display: grid; grid-template-columns: 180px minmax(0, 1fr); column-gap: 24px;
  padding: 18px 0; border-bottom: 1px solid var(--rw-rule);
}
h2 { margin: 0; padding-top: 2px; font-size: 14.5px; font-weight: 500; }
.body { min-width: 0; }
.body > :deep(p) { margin: 0 0 10px; color: var(--rw-mute); font-size: 13.5px; line-height: 1.5; }
.body > :deep(p:last-child) { margin-bottom: 0; }
@media (max-width: 1180px) and (min-width: 761px) {
  .set { grid-template-columns: 150px minmax(0, 1fr); column-gap: 20px; }
}
@media (max-width: 760px) {
  .set { grid-template-columns: minmax(0, 1fr); row-gap: 8px; }
}
</style>
