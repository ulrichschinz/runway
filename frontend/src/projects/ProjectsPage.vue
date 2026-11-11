<script setup>
/**
 * Projekte (plan M13, brief 0060; 06 `renderProjects`, `renderHead('projects')`): every project from
 * `/gtd/projects/overview` in three sections — Aktiv (the stuck ones first, with the yellow ring),
 * Ruht, Abgeschlossen — and "+ Projekt" under Aktiv. `n` opens the name field (06 `openProjAdd`):
 * the name is checked as the API checks it (`projectNameError`) before anything is sent, `⏎`
 * creates the project (`POST /projects`, through the outbox) and opens it, `Esc` closes the field.
 * `j` / `k` move the cursor over the projects, `⏎` / `o` open the one under it. The margin column's
 * panels stand beside it as on every page (plan M12).
 */
import './texts.js'
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppFrame from '../layout/AppFrame.vue'
import EmptyState from '../layout/ui/EmptyState.vue'
import EyebrowLine from '../layout/ui/EyebrowLine.vue'
import PageHeading from '../layout/ui/PageHeading.vue'
import SectionRule from '../layout/ui/SectionRule.vue'
import { useFrame } from '../composables/useFrame.js'
import { useKeymap } from '../composables/useKeymap.js'
import { t } from '../shared/i18n.js'
import { overviewCounts, overviewSections } from '../shared/projectOverview.js'
import { useGtdStore } from '../tasks/stores/gtd.js'
import ProjectRow from './ProjectRow.vue'

const frame = useFrame()
const gtd = useGtdStore()
const router = useRouter()

const sections = computed(() => overviewSections(gtd.projects))
const counts = computed(() => overviewCounts(gtd.projects))
const eyebrow = computed(() => [
  t('list.projects'),
  gtd.loaded ? t('proj.active', { n: counts.value.active }) : '',
  gtd.loaded ? (counts.value.stalled ? t('proj.stalledN', { n: counts.value.stalled }) : t('proj.allMoving')) : '',
])
/** The sections as shown: Aktiv always (it holds "+ Projekt"), the other two when they have projects. */
const shown = computed(() => [
  { key: 'active', label: t('proj.secActive'), projects: sections.value.active },
  { key: 'on_hold', label: t('proj.secResting'), projects: sections.value.on_hold },
  { key: 'done', label: t('proj.secDone'), projects: sections.value.done },
].filter((s) => s.key === 'active' || s.projects.length))
const names = computed(() => shown.value.flatMap((s) => s.projects.map((p) => p.name)))

// ── the cursor ──────────────────────────────────────────────────────────────────────
const cursor = ref(null)
/** The cursor's project while it is on screen (as `visibleCursor` reads a row). */
const current = () => (names.value.includes(cursor.value) ? cursor.value : null)
const rowEl = (name) => document.querySelector(`[data-project="${CSS.escape(name)}"]`)

function moveCursor(step) {
  const list = names.value
  if (!list.length) return
  const i = list.indexOf(current())
  cursor.value = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + step))]
  nextTick(() => {
    const el = rowEl(cursor.value)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest' })
  })
}

const openProject = (name) => router.push(`/projects/${encodeURIComponent(name)}`)

// ── "+ Projekt" ─────────────────────────────────────────────────────────────────────
const adding = ref(false)
const name = ref('')
/** A message key: why the typed name cannot be taken. */
const nameError = ref('')
/** The name field and the "+ Projekt" button (function refs: they sit inside the sections' `v-for`). */
let input = null
let addButton = null

async function openAdd() {
  adding.value = true
  nameError.value = ''
  await nextTick()
  input?.focus()
}

/** Close the name field; with `refocus` (`Esc`) the focus goes back to "+ Projekt", not to the page's body. */
async function closeAdd(refocus = false) {
  adding.value = false
  name.value = ''
  nameError.value = ''
  if (!refocus) return
  await nextTick()
  addButton?.focus()
}

function submit() {
  const result = gtd.createProject(name.value.trim())
  if (result.error) {
    nameError.value = result.error
    return
  }
  closeAdd()
  openProject(result.name)
}

/** `⏎` creates, `Esc` closes the field; an IME's own Enter is left alone. */
function onKey(event) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    submit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeAdd(true)
  }
}

useKeymap(
  {
    'cursor.down': () => moveCursor(1),
    'cursor.up': () => moveCursor(-1),
    open: () => {
      const n = current()
      if (n) openProject(n)
    },
    // `n` here is a new project (03: "neu, hier")
    capture: openAdd,
  },
  ['rows'],
  () => {
    const n = current()
    return { capture: { label: 'cl.newProject' }, open: n ? { d: n } : false }
  },
)
</script>

<template>
  <AppFrame v-bind="frame.props.value" v-on="frame.on">
    <template #head>
      <div class="text">
        <EyebrowLine :parts="eyebrow" />
        <PageHeading :parts="t('h.projects')" />
      </div>
    </template>
    <template v-if="gtd.loaded">
      <section v-for="s in shown" :key="s.key" :aria-label="s.label">
        <SectionRule :parts="[s.label, s.projects.length]" />
        <ProjectRow v-for="p in s.projects" :key="p.name" :project="p" :cursor="cursor === p.name" @focus="cursor = p.name" />
        <template v-if="s.key === 'active'">
          <div v-if="adding" class="proj-add on">
            <span class="plus" aria-hidden="true">+</span>
            <input
              :ref="(el) => (input = el)" v-model="name" :placeholder="t('proj.newPh')" :aria-label="t('proj.newPh')" maxlength="100"
              :aria-invalid="!!nameError" aria-describedby="proj-add-hint" enterkeyhint="done" autocomplete="off"
              @keydown="onKey" @blur="!name.trim() && closeAdd()"
            >
            <span id="proj-add-hint" class="hint" :class="{ bad: nameError }" aria-live="polite">
              {{ nameError ? t(nameError) : t('proj.newHint') }}
            </span>
          </div>
          <button v-else :ref="(el) => (addButton = el)" type="button" class="proj-add" @click="openAdd">
            <span class="plus" aria-hidden="true">+</span><span>{{ t('proj.new') }}</span><kbd aria-hidden="true">n</kbd>
          </button>
          <EmptyState v-if="!gtd.projects.length && !adding" :text="t('proj.none')" />
        </template>
      </section>
    </template>
    <template #margin><component :is="frame.margin" :view="frame.props.value.view" /></template>
  </AppFrame>
</template>

<style scoped>
.text { display: grid; row-gap: 12px; }
/* 06 web.css .proj-add */
.proj-add {
  display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 4px;
  border-bottom: 1px solid var(--rw-rule); color: var(--rw-mute); font-size: 14.5px; text-align: left;
}
.proj-add:hover { color: var(--rw-text); background: var(--rw-hover); }
.proj-add kbd { margin-left: auto; }
.proj-add.on { flex-wrap: wrap; border-bottom-color: var(--rw-rule-strong); color: var(--rw-text); padding: 6px 4px; }
/* the name field's focus is the marker rule, as on the capture line (its focus box is off) */
.proj-add.on:has(input:focus) { border-bottom-color: var(--rw-marker); }
.proj-add.on:hover { background: transparent; }
.proj-add input {
  flex: 1 1 200px; min-width: 0; min-height: 36px; border: 0; outline: 0; background: transparent; color: var(--rw-text);
  font: inherit; font-size: 15px;
}
.proj-add input::placeholder { color: var(--rw-soft); }
.plus { font-family: var(--rw-font-mono); color: var(--rw-mute); }
.hint { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.hint.bad { color: var(--rw-overdue); }
@media (max-width: 760px) {
  .text { row-gap: 8px; }
  .proj-add kbd { display: none; }
}
</style>
