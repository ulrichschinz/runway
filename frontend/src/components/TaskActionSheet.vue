<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-end justify-center sm:hidden">
    <div class="absolute inset-0 bg-black/50" @click="$emit('close')" />

    <div class="relative z-10 bg-white dark:bg-gray-800 w-full rounded-t-2xl shadow-2xl pb-safe">
      <!-- Grab handle -->
      <div class="flex justify-center pt-3 pb-1">
        <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
      </div>

      <!-- Task title -->
      <div class="px-5 py-2 border-b dark:border-gray-700">
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ task.description }}</p>
      </div>

      <div class="py-2">
        <button
          v-if="!isDone"
          @click="emitAction('toggle-active')"
          class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-gray-800 dark:text-gray-100 active:bg-gray-100 dark:active:bg-gray-700"
        >
          <svg v-if="isActive" class="w-5 h-5 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          <svg v-else class="w-5 h-5 shrink-0 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span class="text-sm font-medium">{{ isActive ? 'Pausieren' : 'Starten' }}</span>
        </button>

        <button
          @click="emitAction('open')"
          class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-gray-800 dark:text-gray-100 active:bg-gray-100 dark:active:bg-gray-700"
        >
          <svg class="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          <span class="text-sm font-medium">Bearbeiten</span>
        </button>

        <button
          @click="emitAction('delete')"
          class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-900/30"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span class="text-sm font-medium">Löschen</span>
        </button>
      </div>

      <div class="px-3 pb-2 border-t dark:border-gray-700 pt-2">
        <button
          @click="$emit('close')"
          class="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold active:bg-gray-200 dark:active:bg-gray-600"
        >Abbrechen</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toRef } from 'vue'
import { useScrollLock } from '../composables/useScrollLock.js'

const props = defineProps({
  visible: Boolean,
  task: { type: Object, default: () => ({}) },
  isActive: Boolean,
  isDone: Boolean,
})
const emit = defineEmits(['close', 'toggle-active', 'open', 'delete'])

useScrollLock(toRef(props, 'visible'))

function emitAction(name) {
  emit(name)
  emit('close')
}
</script>
