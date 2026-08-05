import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTaskStore } from '../stores/tasks.js'
import { filterTasks } from '../shared/taskFilters.js'

export function useTaskView(loader) {
  const store = useTaskStore()
  const selectedTask = ref(null)
  const searchQuery = ref('')
  const searchInputRef = ref(null)

  const filteredTasks = computed(() =>
    filterTasks(store.tasks, { context: store.activeContext, query: searchQuery.value })
  )

  function onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
    if (e.target.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === 'n' && !selectedTask.value) {
      e.preventDefault()
      newTask()
    } else if (e.key === '/') {
      e.preventDefault()
      searchInputRef.value?.focus()
    }
  }

  onMounted(() => {
    loader(store)
    store.fetchProjects()
    window.addEventListener('keydown', onKeyDown)
  })

  watch(() => store.newTaskTrigger, (v) => { if (v > 0) newTask() })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
  })

  function openTask(task) { selectedTask.value = task }
  function newTask() { selectedTask.value = { uuid: null } }
  function closeModal() { selectedTask.value = null }
  async function onComplete(uuid) { await store.completeTask(uuid) }
  async function onDelete(uuid) { await store.deleteTask(uuid) }
  async function onToggleActive(task) {
    if (task.start) await store.stopTask(task.uuid)
    else await store.startTask(task.uuid)
    loader(store)
  }
  function onSaved() { loader(store) }

  return { store, selectedTask, searchQuery, searchInputRef, filteredTasks, openTask, newTask, closeModal, onComplete, onDelete, onToggleActive, onSaved }
}
