<script setup>
/**
 * One line of the task detail (06 `.field`): a mono label, then the value or the toggles. `for`
 * makes the label a `<label>` of that input; `ask` marks the field the detail is asking for
 * (06 `.field.ask`: a 1 px yellow line).
 */
defineProps({
  label: { type: String, required: true },
  for: { type: String, default: null },
  ask: { type: Boolean, default: false },
})
</script>

<template>
  <div class="field" :class="{ ask }">
    <label v-if="$props.for" :for="$props.for" class="lab">{{ label }}</label>
    <span v-else class="lab">{{ label }}</span>
    <div class="val"><slot /></div>
  </div>
</template>

<style scoped>
.field {
  display: grid; grid-template-columns: 84px minmax(0, 1fr); column-gap: 12px; align-items: center;
  min-height: 44px; padding: 8px 0; border-bottom: 1px solid var(--rw-rule);
}
.field.ask { box-shadow: inset 0 -1px 0 var(--rw-marker); }
.lab { font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.02em; color: var(--rw-mute); }
.val { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 14px; }
</style>
