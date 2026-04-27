<template>
  <AppShell>
    <div class="flex flex-col h-full">
      <!-- Project list -->
      <template v-if="!activeProject">
        <header class="px-4 py-4 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
          <div class="flex items-center justify-between mb-0.5">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">Projects</h2>
            <button @click="startNewProject" class="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xl shadow-sm">+</button>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500">Select a project to see its tasks</p>
        </header>
        <!-- New project inline input -->
        <div v-if="creatingProject" class="px-4 py-3 border-b bg-indigo-50 dark:bg-indigo-900/30 dark:border-gray-700 flex gap-2 items-center">
          <input
            ref="newProjectInputRef"
            v-model="newProjectName"
            @keydown.enter.prevent="confirmNewProject"
            @keydown.escape.prevent="cancelNewProject"
            class="flex-1 border border-indigo-300 dark:border-indigo-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Project name…"
          />
          <button @click="confirmNewProject" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Create</button>
          <button @click="cancelNewProject" class="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm">Cancel</button>
        </div>
        <div class="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          <div v-if="loadingProjects" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
          <div v-else-if="!store.projects.length" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">No projects yet. Create one with +</div>
          <div
            v-for="p in store.projects"
            :key="p"
            class="flex items-center bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <button
              @click="openProject(p)"
              class="flex-1 flex items-center gap-3 px-4 py-3 text-left"
            >
              <span class="text-lg">📁</span>
              <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ p }}</span>
              <span class="ml-auto text-gray-400 dark:text-gray-500 text-lg">›</span>
            </button>
            <button
              @click.stop="openPlan(p)"
              class="px-3 py-3 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="Projekt planen"
            >🗂</button>
          </div>
        </div>
      </template>

      <!-- Project tasks -->
      <template v-else>
        <header class="px-4 py-3 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
          <div class="flex items-center gap-3 mb-2">
            <button @click="activeProject = null; projectSearch = ''" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">‹</button>
            <div class="flex-1">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">{{ activeProject }}</h2>
              <p class="text-xs text-gray-400 dark:text-gray-500">Project tasks sorted by urgency</p>
            </div>
            <button @click="newTask" class="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xl shadow-sm">+</button>
          </div>
          <input ref="projectSearchRef" v-model="projectSearch" type="search" placeholder="Search tasks…" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </header>
        <div class="flex-1 overflow-y-auto">
          <TaskList :tasks="filteredProjectTasks" :loading="store.loading" @open="openTask" @complete="onComplete" @delete="onDelete" @toggle-active="onToggleActive" />
        </div>
      </template>
    </div>

    <TaskModal v-if="selectedTask" :task="selectedTask.uuid ? selectedTask : null" @close="closeModal" @saved="onSaved" @completed="onSaved" />
    <ProjectPlanModal v-if="planningProject" :project-name="planningProject" @close="planningProject = null" />
  </AppShell>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import AppShell from '../components/AppShell.vue'
import TaskList from '../components/TaskList.vue'
import TaskModal from '../components/TaskModal.vue'
import ProjectPlanModal from '../components/ProjectPlanModal.vue'
import { useTaskStore } from '../stores/tasks.js'

const store = useTaskStore()
const activeProject = ref(null)
const loadingProjects = ref(false)
const selectedTask = ref(null)
const projectSearch = ref('')
const projectSearchRef = ref(null)
const planningProject = ref(null)
const creatingProject = ref(false)
const newProjectName = ref('')
const newProjectInputRef = ref(null)

function onKeyDown(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
  if (e.target.isContentEditable) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'n' && activeProject.value && !selectedTask.value) {
    e.preventDefault()
    newTask()
  } else if (e.key === '/') {
    e.preventDefault()
    projectSearchRef.value?.focus()
  }
}

const filteredProjectTasks = computed(() => {
  const q = projectSearch.value.trim().toLowerCase()
  if (!q) return store.tasks
  return store.tasks.filter(t =>
    t.description.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.toLowerCase().includes(q))
  )
})

onMounted(async () => {
  loadingProjects.value = true
  await store.fetchProjects()
  loadingProjects.value = false
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})

async function openProject(name) {
  activeProject.value = name
  await store.fetchProject(name)
}

function openTask(task) { selectedTask.value = task }
function newTask() { selectedTask.value = { uuid: null } }
function closeModal() { selectedTask.value = null }
function openPlan(name) { planningProject.value = name }

async function startNewProject() {
  creatingProject.value = true
  newProjectName.value = ''
  await nextTick()
  newProjectInputRef.value?.focus()
}

async function confirmNewProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  creatingProject.value = false
  newProjectName.value = ''
  await store.createProject(name)
  planningProject.value = name
}

function cancelNewProject() {
  creatingProject.value = false
  newProjectName.value = ''
}
async function onComplete(uuid) { await store.completeTask(uuid) }
async function onDelete(uuid) { await store.deleteTask(uuid) }
async function onToggleActive(task) {
  if (task.start) await store.stopTask(task.uuid)
  else await store.startTask(task.uuid)
  if (activeProject.value) store.fetchProject(activeProject.value)
}
function onSaved() {
  if (activeProject.value) store.fetchProject(activeProject.value)
  store.fetchProjects()
}
</script>
