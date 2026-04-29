import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import client from '../api/client.js'

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref([])
  const projects = ref([])
  const loading = ref(false)
  const error = ref(null)
  const activeContext = ref(null)
  const _allContextTags = ref([])

  const contextTags = computed(() => _allContextTags.value)

  async function fetchContextTags() {
    try {
      const { data } = await client.get('/tasks', { params: { include_done: false } })
      const seen = new Set()
      data.forEach(t => (t.tags || []).forEach(tag => { if (tag.startsWith('@')) seen.add(tag) }))
      _allContextTags.value = [...seen].sort()
    } catch { /* non-critical */ }
  }

  function setContext(tag) {
    activeContext.value = activeContext.value === tag ? null : tag
  }

  async function fetchView(view) {
    loading.value = true
    error.value = null
    try {
      const { data } = await client.get(`/gtd/${view}`)
      tasks.value = data
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchAll(showDone = false) {
    loading.value = true
    error.value = null
    try {
      const { data } = await client.get('/tasks', { params: { include_done: showDone } })
      tasks.value = data
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchProjects() {
    const { data } = await client.get('/gtd/projects')
    projects.value = data
  }

  async function createProject(name) {
    await client.post('/projects', { name })
    await fetchProjects()
  }

  async function fetchProject(name) {
    loading.value = true
    error.value = null
    try {
      const { data } = await client.get(`/gtd/projects/${encodeURIComponent(name)}`)
      tasks.value = data
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createTask(payload) {
    const { data } = await client.post('/tasks', payload)
    tasks.value = [data, ...tasks.value].sort((a, b) => b.urgency - a.urgency)
    return data
  }

  async function updateTask(uuid, payload) {
    const { data } = await client.put(`/tasks/${uuid}`, payload)
    const idx = tasks.value.findIndex((t) => t.uuid === uuid)
    if (idx !== -1) tasks.value.splice(idx, 1, data)
    return data
  }

  async function completeTask(uuid) {
    await client.post(`/tasks/${uuid}/done`)
    tasks.value = tasks.value.filter((t) => t.uuid !== uuid)
  }

  async function deleteTask(uuid) {
    await client.delete(`/tasks/${uuid}`)
    tasks.value = tasks.value.filter((t) => t.uuid !== uuid)
  }

  async function startTask(uuid) {
    const idx = tasks.value.findIndex((t) => t.uuid === uuid)
    if (idx !== -1) tasks.value.splice(idx, 1, { ...tasks.value[idx], start: 'pending' })
    await client.post(`/tasks/${uuid}/start`)
  }

  async function stopTask(uuid) {
    const idx = tasks.value.findIndex((t) => t.uuid === uuid)
    if (idx !== -1) tasks.value.splice(idx, 1, { ...tasks.value[idx], start: null })
    await client.post(`/tasks/${uuid}/stop`)
  }

  async function annotateTask(uuid, text) {
    const { data } = await client.post(`/tasks/${uuid}/annotate`, { text })
    const idx = tasks.value.findIndex((t) => t.uuid === uuid)
    if (idx !== -1) tasks.value.splice(idx, 1, data)
  }

  return {
    tasks, projects, loading, error,
    activeContext, contextTags,
    fetchView, fetchAll, fetchProjects, fetchProject, createProject,
    createTask, updateTask, completeTask, deleteTask,
    startTask, stopTask, annotateTask,
    fetchContextTags, setContext,
  }
})
