<template>
  <AppShell>
    <div class="flex flex-col h-full">
      <header class="px-4 py-3 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">All Tasks</h2>
            <p class="text-xs text-gray-400 dark:text-gray-500">{{ showDone ? 'Pending + completed' : 'Pending tasks' }}, sorted by urgency</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="toggleDone"
              :class="showDone ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
              class="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
              title="Erledigte Tasks anzeigen/ausblenden"
            >{{ showDone ? '✓ Done' : 'Done' }}</button>
            <button @click="newTask" class="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xl shadow-sm">+</button>
          </div>
        </div>
        <input ref="searchInputRef" v-model="searchQuery" type="search" placeholder="Search tasks…" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </header>
      <div class="flex-1 overflow-y-auto">
        <TaskList :tasks="filteredTasks" :loading="store.loading" @open="openTask" @complete="onComplete" @delete="onDelete" @toggle-active="onToggleActive" />
      </div>
    </div>
    <TaskModal v-if="selectedTask" :task="selectedTask.uuid ? selectedTask : null" @close="closeModal" @saved="onSaved" @completed="onSaved" />
  </AppShell>
</template>

<script setup>
import { ref, watch } from 'vue'
import AppShell from '../components/AppShell.vue'
import TaskList from '../components/TaskList.vue'
import TaskModal from '../components/TaskModal.vue'
import { useTaskView } from './_useTaskView.js'

const showDone = ref(false)

const { store, selectedTask, searchQuery, searchInputRef, filteredTasks, openTask, newTask, closeModal, onComplete, onDelete, onToggleActive, onSaved } =
  useTaskView((s) => s.fetchAll(showDone.value))

function toggleDone() {
  showDone.value = !showDone.value
  store.fetchAll(showDone.value)
}
</script>
