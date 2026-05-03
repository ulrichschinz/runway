<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close" />

    <div class="relative z-10 bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700">
        <div class="flex-1 min-w-0">
          <h2 class="font-semibold text-gray-900 dark:text-white">{{ isEdit ? 'Edit task' : 'New task' }}</h2>
          <span v-if="isActive" class="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"></span>
            In Progress
          </span>
        </div>
        <!-- Start / Pause button (edit mode only) -->
        <button
          v-if="isEdit"
          @click="toggleActive"
          :disabled="toggling"
          :class="isActive
            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          <svg v-if="isActive" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          <svg v-else class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span>{{ toggling ? '…' : isActive ? 'Pause' : 'Start' }}</span>
        </button>
        <!-- Done button only when in progress -->
        <button
          v-if="isEdit && isActive"
          @click="complete"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors shrink-0"
        >
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <span>Done</span>
        </button>
        <button @click="close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none shrink-0">&times;</button>
      </div>

      <!-- Scrollable form -->
      <div class="overflow-y-auto flex-1 px-4 py-4 space-y-4">

        <!-- Description -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description *</label>
          <textarea
            ref="descriptionRef"
            v-model="form.description"
            rows="2"
            class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="What needs to be done?"
          />
        </div>

        <!-- Project -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Project</label>
          <input
            v-model="form.project"
            list="project-list"
            class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Home, Work"
          />
          <datalist id="project-list">
            <option v-for="p in store.projects" :key="p" :value="p" />
          </datalist>
        </div>

        <!-- Priority -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Priority</label>
          <div class="flex gap-2">
            <button
              v-for="p in ['H', 'M', 'L']"
              :key="p"
              @click="form.priority = form.priority === p ? null : p"
              :class="priorityBtn(p)"
              class="flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors"
            >{{ priorityLabel(p) }}</button>
          </div>
        </div>

        <!-- Tags -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Contexts <span class="font-normal text-gray-400">(@wo / womit)</span></label>
          <div class="flex flex-wrap gap-1 mb-3">
            <button
              v-for="tag in suggestedContexts"
              :key="tag"
              @click="toggleTag(tag)"
              :class="form.tags.includes(tag) ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
              class="text-xs px-2 py-1 rounded-full border border-transparent transition-colors"
            >{{ tag }}</button>
          </div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Tags</label>
          <div class="flex flex-wrap gap-1 mb-2">
            <button
              v-for="tag in suggestedTags"
              :key="tag"
              @click="toggleTag(tag)"
              :class="form.tags.includes(tag) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'"
              class="text-xs px-2 py-1 rounded-full border border-transparent transition-colors"
            >+{{ tag }}</button>
          </div>
          <div class="flex gap-2">
            <input
              v-model="customTag"
              @keydown.enter.prevent="addCustomTag"
              class="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="@kontext oder tag + Enter"
            />
            <button @click="addCustomTag" class="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium">Add</button>
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="tag in form.tags"
              :key="tag"
              :class="tag.startsWith('@') ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'"
              class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            >
              {{ tag.startsWith('@') ? tag : '+' + tag }}
              <button @click="removeTag(tag)" class="opacity-60 hover:opacity-100 leading-none">&times;</button>
            </span>
          </div>
        </div>

        <!-- Advanced toggle -->
        <button
          @click="showAdvanced = !showAdvanced"
          class="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg transition-colors"
        >
          <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvanced ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          {{ showAdvanced ? 'Weniger Optionen' : 'Mehr Optionen (Datum, Wiederholung, …)' }}
        </button>

        <template v-if="showAdvanced">
          <!-- Dates row -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Due</label>
              <input type="date" v-model="form.due" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Scheduled</label>
              <input type="date" v-model="form.scheduled" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Wait until</label>
              <input type="date" v-model="form.wait" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Expires</label>
              <input type="date" v-model="form.until" class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <!-- Recur -->
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Repeat</label>
            <div class="flex gap-2 mb-2 flex-wrap">
              <button
                v-for="r in recurPresets"
                :key="r"
                @click="form.recur = form.recur === r ? '' : r"
                :class="form.recur === r ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'"
                class="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
              >{{ r }}</button>
            </div>
            <input
              v-model="form.recur"
              class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="or type: daily, weekly, 2weeks…"
            />
          </div>

          <!-- Dependencies -->
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              Blocked by
              <span class="text-gray-400 dark:text-gray-500 font-normal">(task must wait for these)</span>
            </label>
            <div v-if="!allTasks.length" class="text-xs text-gray-400 dark:text-gray-500">No other tasks available.</div>
            <div v-else class="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
              <label
                v-for="t in allTasks"
                :key="t.uuid"
                class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <input type="checkbox" :value="t.uuid" v-model="form.depends" class="rounded text-indigo-600" />
                <span class="text-xs text-gray-800 dark:text-gray-200 truncate">{{ t.description }}</span>
                <span v-if="t.project" class="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0">{{ t.project }}</span>
              </label>
            </div>
          </div>

          <!-- Annotations (edit mode only) -->
          <div v-if="isEdit">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Notes / Annotations</label>
            <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-2">
              <li v-for="a in form.annotations" :key="a.entry" class="bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                <span class="text-gray-400 dark:text-gray-500 text-xs mr-2">{{ a.entry?.slice(0,10) }}</span>{{ a.description }}
              </li>
            </ul>
            <div class="flex gap-2">
              <input
                v-model="newAnnotation"
                @keydown.enter.prevent="addAnnotation"
                class="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add note + Enter"
              />
              <button @click="addAnnotation" class="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium">Add</button>
            </div>
          </div>
        </template>

        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
      </div>

      <!-- Footer actions -->
      <div class="px-4 py-3 border-t dark:border-gray-700 flex gap-2">
        <button
          v-if="isEdit"
          @click="complete"
          class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >Mark Done</button>
        <button
          @click="save"
          :disabled="saving"
          class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >{{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useTaskStore } from '../stores/tasks.js'
import client from '../api/client.js'

const store = useTaskStore()

const props = defineProps({ task: Object })
const emit = defineEmits(['close', 'saved', 'completed'])

const visible = ref(false)
const descriptionRef = ref(null)
const saving = ref(false)
const toggling = ref(false)
const errorMsg = ref('')
const newAnnotation = ref('')
const customTag = ref('')
const allTasks = ref([])

const isEdit = computed(() => !!props.task?.uuid)
const taskStart = ref(props.task?.start ?? null)
const isActive = computed(() => !!taskStart.value)

const suggestedContexts = computed(() => {
  const base = ['@home', '@work', '@computer', '@phone', '@errands']
  const stored = store.contextTags
  return [...new Set([...stored, ...base])]
})
const suggestedTags = ['next', 'waiting', 'someday']
const recurPresets = ['daily', 'weekly', 'monthly', 'yearly']
const showAdvanced = ref(false)

const blankForm = () => ({
  description: '',
  project: '',
  tags: [],
  priority: null,
  due: '',
  scheduled: '',
  wait: '',
  until: '',
  recur: '',
  depends: [],
  annotations: [],
})

const form = ref(blankForm())

onMounted(async () => {
  try {
    const res = await client.get('/tasks')
    allTasks.value = res.data.filter(t => t.uuid !== props.task?.uuid)
  } catch { /* non-critical */ }
})

watch(() => props.task, (t) => {
  taskStart.value = t?.start ?? null
  showAdvanced.value = !!t?.uuid
  if (t) {
    form.value = {
      description: t.description || '',
      project: t.project || '',
      tags: (t.tags || []).flatMap(tag => tag.split(',').map(p => p.trim())).filter(Boolean),
      priority: t.priority || null,
      due: formatForInput(t.due),
      scheduled: formatForInput(t.scheduled),
      wait: formatForInput(t.wait),
      until: formatForInput(t.until),
      recur: t.recur || '',
      depends: [...(t.depends || [])],
      annotations: t.annotations || [],
    }
  } else {
    form.value = blankForm()
  }
  visible.value = true
  nextTick(() => descriptionRef.value?.focus())
}, { immediate: true })

function formatForInput(raw) {
  if (!raw) return ''
  const m = raw.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

function toggleTag(tag) {
  const idx = form.value.tags.indexOf(tag)
  if (idx === -1) form.value.tags.push(tag)
  else form.value.tags.splice(idx, 1)
}

function addCustomTag() {
  const raw = customTag.value.trim()
  if (!raw) return
  raw.split(',').forEach(part => {
    const t = part.trim().replace(/^\+/, '')
    if (!t || t === '@') return
    if (!form.value.tags.includes(t)) form.value.tags.push(t)
  })
  customTag.value = ''
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter(t => t !== tag)
}

async function addAnnotation() {
  const text = newAnnotation.value.trim()
  if (!text || !props.task?.uuid) return
  await store.annotateTask(props.task.uuid, text)
  newAnnotation.value = ''
}

async function toggleActive() {
  if (!props.task?.uuid) return
  toggling.value = true
  try {
    if (isActive.value) {
      await store.stopTask(props.task.uuid)
      taskStart.value = null
    } else {
      await store.startTask(props.task.uuid)
      taskStart.value = 'active'
    }
    emit('saved')
  } finally {
    toggling.value = false
  }
}

function close() {
  visible.value = false
  emit('close')
}

function onEscape(e) {
  if (e.key === 'Escape' && visible.value) close()
}

onMounted(() => window.addEventListener('keydown', onEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))

function priorityLabel(p) {
  return { H: 'High', M: 'Medium', L: 'Low' }[p]
}

function priorityBtn(p) {
  if (form.value.priority === p) {
    return { H: 'bg-red-500 text-white border-red-500', M: 'bg-amber-400 text-white border-amber-400', L: 'bg-gray-400 text-white border-gray-400' }[p]
  }
  return 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
}

function buildPayload() {
  return {
    description: form.value.description.trim(),
    project: form.value.project?.trim() || null,
    tags: form.value.tags,
    priority: form.value.priority,
    due: form.value.due || null,
    scheduled: form.value.scheduled || null,
    wait: form.value.wait || null,
    until: form.value.until || null,
    recur: form.value.recur || null,
    depends: form.value.depends,
  }
}

async function save() {
  errorMsg.value = ''
  if (!form.value.description.trim()) { errorMsg.value = 'Description is required.'; return }
  saving.value = true
  try {
    if (isEdit.value) {
      await store.updateTask(props.task.uuid, buildPayload())
    } else {
      await store.createTask(buildPayload())
    }
    emit('saved')
    close()
  } catch (e) {
    errorMsg.value = e.response?.data?.detail || e.message
  } finally {
    saving.value = false
  }
}

async function complete() {
  await store.completeTask(props.task.uuid)
  emit('completed')
  close()
}

function open() { visible.value = true }
defineExpose({ open })
</script>
