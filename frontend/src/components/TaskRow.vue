<template>
  <div
    class="relative overflow-hidden"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Swipe action backdrop -->
    <div
      v-if="swipeX < 0"
      class="absolute right-0 top-0 h-full flex items-stretch"
      :style="{ width: Math.min(-swipeX, 160) + 'px' }"
    >
      <button @click="$emit('complete', task.uuid)" class="flex-1 bg-green-500 text-white text-xs font-semibold flex items-center justify-center">Done</button>
      <button @click="$emit('delete', task.uuid)" class="flex-1 bg-red-500 text-white text-xs font-semibold flex items-center justify-center">Delete</button>
    </div>

    <!-- Task card -->
    <div
      :class="[
        isDone ? 'opacity-50' : 'active:bg-gray-50 dark:active:bg-gray-700',
        isActive
          ? 'border-l-4 border-l-green-500 bg-green-100 dark:bg-green-900/30 dark:border-l-green-400'
          : 'border-l-4 border-l-transparent bg-white dark:bg-gray-800'
      ]"
      class="border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-start gap-3 transition-transform touch-pan-y cursor-pointer"
      :style="{ transform: `translateX(${Math.max(swipeX, -160)}px)` }"
      @click="$emit('open', task)"
    >
      <UrgencyBadge :score="task.urgency" class="mt-0.5 shrink-0" />

      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate" :class="isDone ? 'line-through' : ''">{{ task.description }}</p>
        <div class="flex flex-wrap gap-1 mt-1">
          <span v-if="task.project" class="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">{{ task.project }}</span>
          <span
            v-for="tag in task.tags"
            :key="tag"
            :class="tagClass(tag)"
            class="text-xs px-1.5 py-0.5 rounded"
          >+{{ tag }}</span>
          <span v-if="task.recur" class="text-xs bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded" title="Recurring">↻ {{ task.recur }}</span>
        </div>
        <p v-if="task.due" :class="dueClass" class="text-xs mt-1">Due {{ formatDate(task.due) }}</p>
      </div>

      <!-- Start/pause button -->
      <button
        v-if="!isDone"
        @click.stop="$emit('toggle-active', task)"
        :class="isActive
          ? 'text-amber-400 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300'
          : 'text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400'"
        class="shrink-0 transition-colors active:scale-90"
        :title="isActive ? 'Pause' : 'Start'"
      >
        <!-- Pause icon -->
        <svg v-if="isActive" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <!-- Play icon -->
        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <!-- Done button (only when in progress) -->
      <button
        v-if="isActive"
        @click.stop="$emit('complete', task.uuid)"
        class="shrink-0 text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors active:scale-90"
        title="Done"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </button>

      <!-- Priority dot -->
      <span v-if="task.priority" :class="priorityClass" class="w-2 h-2 rounded-full shrink-0 mt-1.5" :title="'Priority ' + task.priority" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import UrgencyBadge from './UrgencyBadge.vue'

const props = defineProps({ task: Object })
defineEmits(['open', 'complete', 'delete', 'toggle-active'])

const isDone = computed(() => props.task.status === 'completed' || props.task.status === 'deleted')
const isActive = computed(() => !!props.task.start)

const swipeX = ref(0)
let startX = 0

function onTouchStart(e) { startX = e.touches[0].clientX }
function onTouchMove(e) {
  const dx = e.touches[0].clientX - startX
  if (dx < 0) swipeX.value = dx
}
function onTouchEnd() {
  if (swipeX.value < -80) swipeX.value = -160
  else swipeX.value = 0
}

const dueClass = computed(() => {
  if (!props.task.due) return ''
  const due = new Date(props.task.due.replace(/(\d{4})(\d{2})(\d{2})T.*/, '$1-$2-$3'))
  return due < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'
})

const priorityClass = computed(() => ({
  H: 'bg-red-500',
  M: 'bg-amber-400',
  L: 'bg-gray-300',
}[props.task.priority] || 'bg-transparent'))

function tagClass(tag) {
  if (tag === 'next') return 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
  if (tag === 'waiting') return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
  if (tag === 'someday') return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
  if (tag.startsWith('@')) return 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
}

function formatDate(raw) {
  if (!raw) return ''
  const m = raw.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw
}
</script>
