<template>
  <div>
    <!-- ===================== Mobile layout (< sm) ===================== -->
    <div
      :class="[
        isDone ? 'opacity-50' : 'active:bg-gray-50 dark:active:bg-gray-700',
        isActive
          ? 'border-l-4 border-l-green-500 bg-green-50 dark:bg-green-900/30 dark:border-l-green-400'
          : 'border-l-4 border-l-transparent bg-white dark:bg-gray-800'
      ]"
      class="sm:hidden border-b border-gray-100 dark:border-gray-700 flex items-stretch"
    >
      <!-- Complete circle: 44px tap target -->
      <button
        @click="$emit('complete', task.uuid)"
        :disabled="isDone"
        class="shrink-0 w-12 self-stretch flex items-center justify-center"
        :aria-label="isDone ? 'Erledigt' : 'Als erledigt markieren'"
      >
        <span
          :class="isDone
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-500 text-transparent'"
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </span>
      </button>

      <!-- Body: tap = open detail -->
      <div class="flex-1 min-w-0 py-3 pr-1 cursor-pointer" @click="$emit('open', task)">
        <p
          :class="isDone ? 'line-through' : ''"
          class="text-[15px] font-medium text-gray-900 dark:text-white leading-snug line-clamp-2"
        >{{ task.description }}</p>
        <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs">
          <span v-if="isActive" class="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />läuft
          </span>
          <UrgencyBadge :score="task.urgency" />
          <span v-if="task.due" :class="dueClass">Fällig {{ formatDate(task.due) }}</span>
          <span v-if="task.project" class="text-gray-400 dark:text-gray-500 truncate max-w-[40%]">{{ task.project }}</span>
        </div>
      </div>

      <!-- Overflow menu: 44px tap target -->
      <button
        @click="sheetOpen = true"
        class="shrink-0 w-11 self-stretch flex items-center justify-center text-gray-400 dark:text-gray-500 active:text-gray-700 dark:active:text-gray-200"
        aria-label="Aktionen"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
    </div>

    <!-- ===================== Desktop layout (>= sm) ===================== -->
    <div
      :class="[
        isDone ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-700',
        isActive
          ? 'border-l-4 border-l-green-500 bg-green-100 dark:bg-green-900/30 dark:border-l-green-400'
          : 'border-l-4 border-l-transparent bg-white dark:bg-gray-800'
      ]"
      class="hidden sm:flex border-b border-gray-100 dark:border-gray-700 px-4 py-3 items-start gap-3 cursor-pointer"
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

      <button
        v-if="!isDone"
        @click.stop="$emit('toggle-active', task)"
        :class="isActive
          ? 'text-amber-400 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300'
          : 'text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400'"
        class="shrink-0 transition-colors active:scale-90"
        :title="isActive ? 'Pause' : 'Start'"
      >
        <svg v-if="isActive" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button
        v-if="isActive"
        @click.stop="$emit('complete', task.uuid)"
        class="shrink-0 text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors active:scale-90"
        title="Done"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </button>

      <span v-if="task.priority" :class="priorityClass" class="w-2 h-2 rounded-full shrink-0 mt-1.5" :title="'Priority ' + task.priority" />
    </div>

    <!-- Mobile action sheet -->
    <TaskActionSheet
      :visible="sheetOpen"
      :task="task"
      :is-active="isActive"
      :is-done="isDone"
      @close="sheetOpen = false"
      @toggle-active="$emit('toggle-active', task)"
      @open="$emit('open', task)"
      @delete="$emit('delete', task.uuid)"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import UrgencyBadge from './UrgencyBadge.vue'
import TaskActionSheet from './TaskActionSheet.vue'

const props = defineProps({ task: Object })
defineEmits(['open', 'complete', 'delete', 'toggle-active'])

const isDone = computed(() => props.task.status === 'completed' || props.task.status === 'deleted')
const isActive = computed(() => !!props.task.start)

const sheetOpen = ref(false)

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
