<script setup>
/**
 * A project's page (plan M13, brief 0060; 06 `renderHead('project')`, `sectionsFor('project')`,
 * `planPanel`). The name comes from the route (`/projects/:name`), so a link to a project opens it.
 *
 * - **Head:** "← Projekte", `// Projekt · steckt fest · 0 nächste · 1 wartet`, the name, the plan's
 *   vision as the outcome line; the status pills (`PUT /projects/{name}/status`, Rückgängig on the
 *   notice), and for a stuck project 06's callout with "Nächste Aktion festlegen" (`n`).
 * - **Todos:** from the snapshot, by list — Nächste Aktionen, Warten auf, Irgendwann, Ohne Liste —
 *   with every row action of the lists (`ListFrame`).
 * - **A next action:** the inline field asks for its context and creates the todo in the project
 *   (`addNextAction`: `POST /tasks` with `next` and the context), Rückgängig a DELETE.
 * - **The plan** (`PlanDocument`): the margin column on wide screens (a todo's detail takes its
 *   place while open), under the todos elsewhere. The page holds the draft (`usePlan`); leaving the
 *   project or the tab with unsaved changes asks first.
 */
import './texts.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import PillButton from '../layout/ui/PillButton.vue'
import { WIDE, useMedia } from '../composables/useMedia.js'
import { t } from '../shared/i18n.js'
import { projectSections, projectState } from '../shared/projectOverview.js'
import { outcomeOf } from '../shared/projectPlan.js'
import ListFrame from '../tasks/components/ListFrame.vue'
import { showNotice } from '../tasks/notice.js'
import { useGtdStore } from '../tasks/stores/gtd.js'
import NextActionAdd from './NextActionAdd.vue'
import PlanDocument from './PlanDocument.vue'
import ProjectStatus from './ProjectStatus.vue'
import { usePlan } from './usePlan.js'

const route = useRoute()
const gtd = useGtdStore()
const wide = useMedia(WIDE)

const name = computed(() => String(route.params.name ?? ''))
const project = computed(() => {
  const found = gtd.projects.find((p) => p.name === name.value)
  if (found) return found
  // A name only todos carry the overview has not caught up with yet (a project set in the detail).
  return gtd.open.some((x) => x.project === name.value)
    ? { name: name.value, status: 'active', stalled: false, counts: null, has_plan: false }
    : null
})
const lists = computed(() => projectSections(gtd, name.value))
const state = computed(() => (project.value ? projectState(project.value) : null))
/** A next action belongs to an active project: resting and finished ones offer none (the pill, `n`, the palette). */
const canAdd = computed(() => project.value?.status === 'active')

const eyebrow = computed(() => {
  if (!project.value) return [t('proj.one')]
  return [
    t('proj.one'),
    state.value === 'stalled' ? t('proj.stalled') : t(`proj.state.${state.value}`),
    t('proj.nextN', { n: lists.value.next.length }),
    t('proj.waitN', { n: lists.value.waiting.length }),
  ]
})

const sections = computed(() => {
  if (!gtd.today) return []
  if (!project.value) return [{ key: 'missing', kind: 'next', tasks: [], empty: t('proj.missing') }]
  const s = lists.value
  return [
    { key: 'p-next', label: t('sec.nextActions'), kind: 'next', tasks: s.next, empty: t('empty.projNext') },
    { key: 'p-waiting', label: t('list.waiting'), kind: 'waiting', tasks: s.waiting },
    { key: 'p-someday', label: t('list.someday'), kind: 'someday', tasks: s.someday },
    { key: 'p-none', label: t('sec.unlisted'), kind: 'next', tasks: s.none },
  ].filter((x) => x.tasks.length || x.empty)
})

// ── the plan ────────────────────────────────────────────────────────────────────────
// After a save the overview is read again: Projekte says "mit Plan".
const plan = usePlan(() => name.value, { onSaved: () => gtd.refresh({ force: true }) })
const outcome = computed(() => outcomeOf(plan.saved))
/** Steps of the plan made into next actions on this visit. */
const made = ref([])

// Leaving the project, or the tab, with unsaved changes asks first.
const leaveOk = () => !plan.dirty || window.confirm(t('plan.leaveQ'))
onBeforeRouteLeave(() => leaveOk())
onBeforeRouteUpdate((to, from) => (to.params.name === from.params.name ? true : leaveOk()))
function onUnload(event) {
  if (!plan.dirty) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))

// ── status ──────────────────────────────────────────────────────────────────────────
function setStatus(status) {
  const p = project.value
  if (!p) return
  const before = p.status
  const op = gtd.setProjectStatus(p.name, status)
  if (!op) return
  showNotice(t(`notice.proj.${status}`, { p: p.name }), () => {
    // Not sent yet: it is dropped. Sent: the status before is set again.
    if (!gtd.undo(op)) gtd.setProjectStatus(p.name, before)
  })
}

// ── the next action ─────────────────────────────────────────────────────────────────
const adding = ref(false)
const addField = ref(null)
/** The plan step the field was opened from, so it is marked once its action exists. */
let fromStep = null
/** What had the focus when the field opened: it gets it back when the field closes. */
let opener = null

async function openAdd(seed = null, step = null) {
  if (!canAdd.value) return
  fromStep = step
  if (!adding.value) opener = document.activeElement
  adding.value = true
  // the field mounts first, then takes the focus (and the step's text)
  await nextTick()
  addField.value?.focus(seed)
}

/**
 * Close the field. With `refocus`, the focus goes back where the person was (the button or row
 * that opened it), or, when that is gone (the callout's button once the project moves, a step now
 * "✓ angelegt"), to the status line's "Nächste Aktion festlegen" — never to the page's body.
 */
async function closeAdd(refocus = false) {
  const back = opener
  adding.value = false
  fromStep = null
  opener = null
  if (!refocus) return
  await nextTick()
  const el = back?.isConnected && back !== document.body ? back : document.querySelector('[data-set-next]')
  el?.focus()
}

function add({ text, ctx }) {
  const op = gtd.addNextAction(name.value, text, ctx)
  if (!op) return
  const step = fromStep
  if (step) made.value = [...made.value, step]
  showNotice(t('notice.nextAdded', { d: op.body.description, ctx }), () => {
    // Exact: the step can be made into an action again once its action is gone.
    if (gtd.undo(op) && step) made.value = made.value.filter((id) => id !== step)
  })
  closeAdd(true)
}

const toNext = (item) => openAdd(item.text, item.id)

// Another project in the same page (a link from one project to the next): its own field and marks.
watch(name, () => {
  closeAdd()
  made.value = []
})
</script>

<template>
  <ListFrame
    :eyebrow="eyebrow" :heading="[name, '', '']" :sections="sections"
    :keys="{ capture: () => openAdd() }" :offers="() => ({ capture: canAdd ? { label: 'proj.setNext' } : false })"
    :panel-label="`${t('plan.title')}: ${name}`"
  >
    <template #top>
      <RouterLink to="/projects" class="back" data-fold>← {{ t('list.projects') }}</RouterLink>
    </template>
    <template #byline>
      <template v-if="project">
        <p v-if="outcome" class="outcome" data-fold>{{ outcome }}</p>
        <p v-else-if="plan.state === 'ready'" class="lead" data-fold>{{ wide ? t('proj.noOutcome') : t('proj.noOutcomeBelow') }}</p>
      </template>
    </template>
    <template v-if="project" #head>
      <div v-if="state === 'stalled'" class="callout" data-fold>
        <span class="ring-mark" aria-hidden="true" />
        <p><b>{{ t('proj.stalledB') }}</b> {{ t('proj.stalledP') }}</p>
        <div class="acts" role="group" :aria-label="t('proj.statusOf', { p: name })">
          <PillButton action data-set-next @click="openAdd()">{{ t('proj.setNext') }} <kbd aria-hidden="true">n</kbd></PillButton>
          <ProjectStatus :status="project.status" @set="setStatus" />
        </div>
      </div>
      <div v-else class="pstatus" role="group" :aria-label="t('proj.statusOf', { p: name })">
        <span class="mono">{{ t('proj.status') }}</span>
        <ProjectStatus :status="project.status" @set="setStatus" />
        <PillButton v-if="canAdd" quiet data-set-next @click="openAdd()">
          {{ t('proj.setNext') }} <kbd aria-hidden="true">n</kbd>
        </PillButton>
      </div>
      <NextActionAdd
        v-if="adding" ref="addField" :project="name" :contexts="gtd.contextChoices" @add="add" @close="closeAdd(true)"
      />
    </template>
    <template v-if="project && !wide" #after>
      <div class="plan-below">
        <PlanDocument :key="name" :plan="plan" :name="name" :made="made" @to-next="toNext" />
      </div>
    </template>
    <template v-if="project && wide" #panel>
      <PlanDocument :key="name" :plan="plan" :name="name" :made="made" @to-next="toNext" />
    </template>
  </ListFrame>
</template>

<style scoped>
.back {
  display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0 4px; font-family: var(--rw-font-mono);
  font-size: 11px; color: var(--rw-mute); text-decoration: none;
}
.back:hover { color: var(--rw-text); }
/* 06 web.css .outcome-lead: the one Fraunces line besides the heading's word (03 deviation 6) */
.outcome {
  margin: 0; max-width: 560px; font-family: var(--rw-font-serif); font-style: italic; font-weight: 300; font-size: 20px;
  line-height: 1.4; color: var(--rw-accent); text-wrap: pretty;
}
.lead { margin: 0; max-width: 560px; font-size: 16px; line-height: 1.55; color: var(--rw-mute); text-wrap: pretty; }
.callout {
  display: flex; gap: 10px 14px; align-items: center; flex-wrap: wrap; margin: 18px 0 4px; padding: 14px 0;
  border-top: 1px solid var(--rw-marker); border-bottom: 1px solid var(--rw-rule);
}
.callout p { margin: 0; flex: 1 1 260px; font-size: 14.5px; }
.callout b { font-weight: 500; }
.acts, .pstatus { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pstatus { margin-top: 16px; }
.mono { margin-right: 6px; font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.ring-mark {
  display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--rw-marker);
}
.plan-below { margin-top: 36px; padding-top: 6px; border-top: 1px solid var(--rw-rule); }
@media (max-width: 760px) {
  .outcome { font-size: 17px; }
  .lead { font-size: 15px; }
}
</style>
