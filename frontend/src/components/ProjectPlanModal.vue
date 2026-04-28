<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close" />

    <div class="relative z-10 bg-white dark:bg-gray-800 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700 shrink-0">
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">Plan: {{ projectName }}</h2>
          <p class="text-xs text-gray-400 dark:text-gray-500">Natürliche Planung · GTD</p>
        </div>
        <button @click="close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
      </div>

      <!-- Tab bar -->
      <div class="flex border-b dark:border-gray-700 shrink-0 overflow-x-auto">
        <button
          v-for="(tab, i) in tabs"
          :key="i"
          @click="activeTab = i"
          :class="[
            'flex-1 min-w-0 px-2 py-2 text-center transition-colors',
            activeTab === i
              ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          ]"
        >
          <div class="text-base leading-none mb-0.5">{{ tab.icon }}</div>
          <div class="text-xs font-medium whitespace-nowrap">{{ tab.label }}</div>
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto px-4 py-4">

        <!-- Step 1: Warum & Werte -->
        <div v-if="activeTab === 0" class="space-y-4">
          <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            Definiere den Sinn und die Grenzen des Projekts. Das gibt dir einen klaren Rahmen für alle Entscheidungen.
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Zweck — Warum mache ich das?</label>
            <textarea
              v-model="form.purpose"
              rows="4"
              class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="z.B. Ich möchte unsere Webseite modernisieren, damit Kunden uns leichter finden…"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Werte & Prinzipien</label>
            <textarea
              v-model="form.principles"
              rows="3"
              class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="z.B. Budget max. 2000 €. Kein Outsourcing. Qualität geht vor Tempo."
            />
          </div>
        </div>

        <!-- Step 2: Vision -->
        <div v-if="activeTab === 1" class="space-y-4">
          <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            Stell dir das beste mögliche Ergebnis vor. Je konkreter dein Bild, desto besser arbeitet dein Gehirn darauf hin.
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Outcome-Vision — Wie sieht Erfolg aus?</label>
            <textarea
              v-model="form.vision"
              rows="7"
              class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="z.B. Die neue Webseite ist live. Kunden finden in 3 Klicks, was sie brauchen. Das Team ist stolz auf das Ergebnis. Die Absprungrate ist unter 40 %."
            />
          </div>
        </div>

        <!-- Step 3: Brainstorming -->
        <div v-if="activeTab === 2" class="space-y-3">
          <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            Alles raus, was dir einfällt — kein Filter, keine Reihenfolge. Quantität vor Qualität.
          </div>
          <div class="flex gap-2">
            <input
              v-model="newIdea"
              @keydown.enter.prevent="addIdea"
              class="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Neue Idee + Enter"
            />
            <button @click="addIdea" class="px-3 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium">Hinzu</button>
          </div>
          <p v-if="!form.brainstorm.length" class="text-xs text-gray-400 dark:text-gray-500 text-center py-6">Noch keine Ideen — einfach losschreiben.</p>
          <ul class="space-y-2">
            <li
              v-for="item in form.brainstorm"
              :key="item.id"
              class="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2"
            >
              <span class="flex-1 text-sm text-gray-800 dark:text-gray-200">{{ item.text }}</span>
              <button @click="removeIdea(item.id)" class="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0">&times;</button>
            </li>
          </ul>
        </div>

        <!-- Step 4: Organisieren -->
        <div v-if="activeTab === 3" class="space-y-3">
          <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            Jetzt bewerten und ordnen: Was ist wichtig? Was kommt zuerst? Unwichtiges streichen.
          </div>
          <div v-if="!form.organized.length" class="text-center py-6 space-y-3">
            <p class="text-xs text-gray-400 dark:text-gray-500">
              {{ form.brainstorm.length ? 'Ideen aus dem Brainstorming übernehmen und dann sortieren.' : 'Erst im Brainstorming Ideen sammeln.' }}
            </p>
            <button
              v-if="form.brainstorm.length"
              @click="importFromBrainstorm"
              class="px-4 py-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium"
            >
              Aus Brainstorming übernehmen
            </button>
          </div>
          <ul class="space-y-2">
            <li
              v-for="(item, idx) in form.organized"
              :key="item.id"
              draggable="true"
              @dragstart="onDragStart(idx)"
              @dragover.prevent="onDragOver(idx)"
              @drop.prevent="onDrop(idx)"
              @dragend="onDragEnd"
              :class="[
                'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
                dragOverIndex === idx && dragIndex !== idx
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-1 ring-indigo-400'
                  : 'bg-gray-50 dark:bg-gray-700/50',
                dragIndex === idx ? 'opacity-40' : ''
              ]"
            >
              <span class="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing shrink-0 select-none text-base">⠿</span>
              <span class="text-xs text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">{{ idx + 1 }}.</span>
              <span class="flex-1 text-sm text-gray-800 dark:text-gray-200">{{ item.text }}</span>
              <div class="flex flex-col gap-0.5 shrink-0">
                <button
                  @click="moveUp(idx)"
                  :disabled="idx === 0"
                  class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 leading-none px-1 text-xs"
                >▲</button>
                <button
                  @click="moveDown(idx)"
                  :disabled="idx === form.organized.length - 1"
                  class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 leading-none px-1 text-xs"
                >▼</button>
              </div>
              <button @click="removeOrganized(item.id)" class="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0">&times;</button>
            </li>
          </ul>
        </div>

        <!-- Step 5: Nächste Aktionen -->
        <div v-if="activeTab === 4" class="space-y-3">
          <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
            Jetzt Ressourcen zuweisen: Für jeden beweglichen Teil die nächste konkrete Aktion bestimmen und als Task anlegen.
          </div>
          <p v-if="!form.organized.length" class="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
            Erst im Schritt "Ordnen" die Ideen organisieren.
          </p>
          <ul class="space-y-2">
            <li
              v-for="item in form.organized"
              :key="item.id"
              class="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2.5"
            >
              <span class="flex-1 text-sm text-gray-800 dark:text-gray-200">{{ item.text }}</span>
              <span v-if="createdIds.has(item.id)" class="text-green-500 text-sm shrink-0 font-medium">✓ erstellt</span>
              <button
                v-else
                @click="createTask(item)"
                :disabled="creating === item.id"
                class="shrink-0 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >{{ creating === item.id ? '…' : '→ Task' }}</button>
            </li>
          </ul>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t dark:border-gray-700 shrink-0 flex items-center gap-3">
        <span v-if="savedAt" class="text-xs text-green-500">Gespeichert</span>
        <span v-if="errorMsg" class="text-xs text-red-500">{{ errorMsg }}</span>
        <button
          @click="save"
          :disabled="saving"
          class="ml-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >{{ saving ? 'Speichern…' : 'Speichern' }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const dragIndex = ref(null)
const dragOverIndex = ref(null)

function onDragStart(idx) {
  dragIndex.value = idx
}

function onDragOver(idx) {
  dragOverIndex.value = idx
}

function onDrop(idx) {
  if (dragIndex.value === null || dragIndex.value === idx) return
  const arr = [...form.value.organized]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(idx, 0, moved)
  form.value.organized = arr
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}
import client from '../api/client.js'
import { useTaskStore } from '../stores/tasks.js'

const props = defineProps({ projectName: String })
const emit = defineEmits(['close'])

const store = useTaskStore()
const visible = ref(false)
const saving = ref(false)
const savedAt = ref(false)
const errorMsg = ref('')
const activeTab = ref(0)
const newIdea = ref('')
const creating = ref(null)
const createdIds = ref(new Set())

const tabs = [
  { icon: '🎯', label: 'Warum' },
  { icon: '🔭', label: 'Vision' },
  { icon: '💡', label: 'Ideen' },
  { icon: '🗂', label: 'Ordnen' },
  { icon: '▶', label: 'Aktionen' },
]

const blankForm = () => ({ purpose: '', principles: '', vision: '', brainstorm: [], organized: [] })
const form = ref(blankForm())

watch(() => props.projectName, async (name) => {
  if (!name) { visible.value = false; return }
  activeTab.value = 0
  createdIds.value = new Set()
  savedAt.value = false
  errorMsg.value = ''
  form.value = blankForm()
  try {
    const res = await client.get(`/projects/plans/${encodeURIComponent(name)}`)
    form.value = {
      purpose: res.data.purpose || '',
      principles: res.data.principles || '',
      vision: res.data.vision || '',
      brainstorm: res.data.brainstorm || [],
      organized: res.data.organized || [],
    }
  } catch { /* start fresh */ }
  visible.value = true
}, { immediate: true })

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function addIdea() {
  const text = newIdea.value.trim()
  if (!text) return
  form.value.brainstorm.push({ id: uid(), text })
  newIdea.value = ''
}

function removeIdea(id) {
  form.value.brainstorm = form.value.brainstorm.filter(i => i.id !== id)
}

function importFromBrainstorm() {
  form.value.organized = form.value.brainstorm.map(i => ({ ...i }))
}

function moveUp(idx) {
  if (idx === 0) return
  const arr = [...form.value.organized]
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  form.value.organized = arr
}

function moveDown(idx) {
  if (idx >= form.value.organized.length - 1) return
  const arr = [...form.value.organized]
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  form.value.organized = arr
}

function removeOrganized(id) {
  form.value.organized = form.value.organized.filter(i => i.id !== id)
}

async function save() {
  saving.value = true
  savedAt.value = false
  errorMsg.value = ''
  try {
    await client.put(`/projects/plans/${encodeURIComponent(props.projectName)}`, form.value)
    savedAt.value = true
    setTimeout(() => { savedAt.value = false }, 2000)
  } catch (e) {
    errorMsg.value = e.response?.data?.detail || 'Fehler beim Speichern'
  } finally {
    saving.value = false
  }
}

async function createTask(item) {
  creating.value = item.id
  try {
    await store.createTask({ description: item.text, project: props.projectName })
    createdIds.value = new Set([...createdIds.value, item.id])
  } finally {
    creating.value = null
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
</script>
