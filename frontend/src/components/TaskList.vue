<template>
  <div>
    <div v-if="loading" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
    <div v-else-if="!tasks.length" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No tasks here.</div>
    <div v-else>
      <TaskRow
        v-for="task in tasks"
        :key="task.uuid"
        :task="task"
        @open="$emit('open', $event)"
        @complete="$emit('complete', $event)"
        @delete="$emit('delete', $event)"
        @toggle-active="$emit('toggle-active', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import TaskRow from './TaskRow.vue'
defineProps({ tasks: Array, loading: Boolean })
defineEmits(['open', 'complete', 'delete', 'toggle-active'])
</script>
