<script setup>
/** One quiet line where a list or a page has nothing to show (06 `.empty-line`). */
defineProps({
  text: { type: String, required: true },
})
</script>

<template>
  <p class="empty">{{ text }}</p>
</template>

<style scoped>
.empty { margin: 0; padding: 18px 4px; color: var(--rw-mute); font-size: 14px; border-bottom: 1px solid var(--rw-rule); }
</style>
