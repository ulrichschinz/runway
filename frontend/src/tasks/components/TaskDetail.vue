<script setup>
/**
 * A todo's detail (plan M7, brief 0053; 06 `detailPanel`): the text, edited in place (`e`);
 * running or not with Starten/Pausieren; Liste, Kontext, Projekt, Heute, Fällig, Priorität;
 * "Mehr" (`DetailMore.vue`); the notes; Abhaken and Löschen. The frame places it — margin
 * column, docked panel or sheet — and ListFrame passes it the todo's uuid.
 *
 * Every change goes out at once through the store: list and context moves with their exact
 * inverse and a notice with Rückgängig, field edits as `fieldEdit` bodies (tags never, only as
 * deltas). "Nächste" for a todo without a context asks for one first and moves it once one is
 * chosen (06 `needCtx`); a write the server refused is shown here with its message.
 *
 * Emits `close`, `check`, `delete` and `plan` (the list page's own actions, with their notices).
 */
import { computed, nextTick, ref, watch } from 'vue'
import PillButton from '../../layout/ui/PillButton.vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import { committingEnter, deferredUntil, detailFields, extraTagsOf, fieldEdit, formOf, noteDay, runningSince } from '../../shared/detailFields.js'
import { NeedsAnswer, contextTagsOf, projectNameError } from '../../shared/gtdRules.js'
import { t } from '../../shared/i18n.js'
import { dueInfo, entryInfo } from '../../shared/rowMeta.js'
import { showNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'
import DayInput from './DayInput.vue'
import DetailField from './DetailField.vue'
import DetailMore from './DetailMore.vue'
import OptToggle from './OptToggle.vue'

const props = defineProps({
  uuid: { type: String, required: true },
  /** what the host read for a `?task=` link the snapshot does not hold: `{missing}`, `{description}` or `{description, done}` */
  fallback: { type: Object, default: null },
  /** how the person opened it: 'focus' moves the focus in, 'edit' also edits the text (`e`) */
  arrive: { type: String, default: null },
})
const emit = defineEmits(['close', 'check', 'delete', 'plan', 'arrived'])

const gtd = useGtdStore()
const LISTS = ['next', 'waiting', 'someday']
const PRIORITIES = [['H', 'd.prioH'], ['M', 'd.prioM'], ['L', 'd.prioL']]

// A todo hidden by a future `wait` is not in the lists, but its detail still opens (`taskOf`).
const task = computed(() => gtd.taskOf(props.uuid))
const fields = computed(() => (task.value && gtd.today ? detailFields(task.value, gtd.today) : null))
const form = computed(() => (task.value ? formOf(task.value) : null))
const id = (name) => `d-${name}-${props.uuid.slice(-8)}`

const contexts = computed(() => (task.value ? contextTagsOf(task.value) : []))
// The contexts present in open todos (D1), the todo's own among them.
const contextChoices = computed(() => gtd.contexts)
const planned = computed(() => !!fields.value?.planned)
const due = computed(() => (task.value && gtd.today ? dueInfo(task.value, gtd.today) : null))
const deferred = computed(() => (task.value ? deferredUntil(task.value, gtd.today) : ''))
const running = computed(() => (task.value && gtd.today ? runningSince(task.value, gtd.today) : ''))
/** Writes for this todo the server did not take, with its reason. */
const failed = computed(() => gtd.failed.filter((op) => op.uuid === props.uuid))

const more = ref(false)
const needCtx = ref(false)
const problem = ref('')
const projectError = ref('')
// "Mehr" starts open when the todo uses one of its fields, so nothing set is hidden.
watch(() => !!task.value, (shown) => {
  const f = form.value
  if (shown) more.value = !!(f.wait || f.until || f.recur || f.depends.length || (f.scheduled && !planned.value) || extraTagsOf(task.value).length)
}, { immediate: true })

// ── the text ─────────────────────────────────────────────────────────────────────────
const editing = ref(false)
const titleInput = ref(null)
const heading = ref(null)

function startEdit() {
  if (!task.value) return
  editing.value = true
  nextTick(() => {
    titleInput.value?.focus()
    titleInput.value?.setSelectionRange(titleInput.value.value.length, titleInput.value.value.length)
  })
}

/** Enter saves, Esc cancels (both give the focus back to the text), leaving the field saves. */
function endEdit(save, { refocus = true } = {}) {
  if (!editing.value) return
  const text = titleInput.value?.value ?? ''
  editing.value = false
  if (save) edit({ description: text })
  if (refocus) nextTick(() => heading.value?.focus())
}

/** Focus moves into the detail when the person opened it, so the keyboard and screen readers follow. */
function focus() {
  nextTick(() => (editing.value ? titleInput.value : heading.value)?.focus({ preventScroll: true }))
}

watch(() => props.arrive && !!task.value, (go) => {
  if (!go) return
  if (props.arrive === 'edit') startEdit()
  else focus()
  emit('arrived')
}, { immediate: true })

// ── writes ───────────────────────────────────────────────────────────────────────────
function edit(changes) {
  const body = task.value && fieldEdit(task.value, changes)
  if (body) gtd.update(props.uuid, body)
}

/** A move whose rule may ask first: Nächste needs a context, a legacy tag may block it. */
function attempt(fn) {
  problem.value = ''
  try {
    return fn()
  } catch (error) {
    if (!(error instanceof NeedsAnswer)) throw error
    if (error.what === 'context') needCtx.value = true
    else problem.value = 'd.legacyTag'
    return null
  }
}

function moveTo(list) {
  if (!task.value || fields.value.list === list) return
  const op = attempt(() => gtd.setList(props.uuid, list))
  if (!op) return
  needCtx.value = false
  showNotice(t('notice.moved', { list: t(`list.${list}`) }), () => gtd.undo(op))
}

function toggleContext(ctx) {
  if (!attempt(() => gtd.setContext(props.uuid, ctx))) return
  if (needCtx.value && contexts.value.length) moveTo('next')
}

function toggleTag(tag) {
  attempt(() => gtd.toggleTag(props.uuid, tag))
}

function setProject(event) {
  const name = event.target.value.trim()
  projectError.value = name ? projectNameError(name) : ''
  if (!projectError.value) edit({ project: name })
}

function toggleStart() {
  if (task.value) (task.value.start ? gtd.stop : gtd.start)(props.uuid)
}

function addNote(event) {
  if (gtd.annotate(props.uuid, event.target.value)) event.target.value = ''
}

/** Enter in a text field, but not the one that confirms an IME conversion. */
function onEnter(event, fn) {
  if (!committingEnter(event)) return
  event.preventDefault()
  fn(event)
}

function onTitleEscape(event) {
  if (event.isComposing) return
  event.preventDefault()
  endEdit(false)
}

/**
 * Esc closes the detail, except in a field: there it first leaves the field, which commits
 * what was typed (a project, a day), and a second Esc closes.
 */
function onEscape(event) {
  if (editing.value || event.isComposing) return
  event.preventDefault()
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) {
    event.target.blur()
    return
  }
  emit('close')
}
</script>

<template>
  <div class="detail" @keydown.esc="onEscape">
    <div class="mhead">
      <EyebrowLine :parts="[t('d.title'), task ? t(`status.${fields?.list ?? 'none'}`) : '']" />
      <button type="button" class="mclose" @click="emit('close')"><kbd class="key" aria-hidden="true">Esc</kbd> {{ t('close') }}</button>
    </div>

    <template v-if="task && fields">
      <textarea
        v-if="editing" ref="titleInput" class="title edit" rows="2" :value="task.description" :aria-label="t('d.titleField')"
        @keydown.enter="onEnter($event, () => endEdit(true))" @keydown.esc.stop="onTitleEscape" @blur="endEdit(true, { refocus: false })"
      />
      <h2 v-else ref="heading" class="title" tabindex="-1" @dblclick="startEdit">{{ task.description }}</h2>
      <div class="sub">
        <span>{{ t('d.id', { id: task.uuid.slice(-8) }) }} · {{ t('row.captured', { d: entryInfo(task, gtd.today) }) }}</span>
        <button v-if="!editing" type="button" class="ulink" @click="startEdit">{{ t('keys.edit') }} <kbd class="key" aria-hidden="true">e</kbd></button>
      </div>

      <p v-if="deferred" class="deferred"><span class="ring-mark" aria-hidden="true" />{{ t('d.deferredUntil', { d: deferred }) }}</p>

      <div class="livebar">
        <template v-if="running"><i class="pulse" aria-hidden="true" />{{ t('d.runningSince', { t: running }) }}</template>
        <span v-else>{{ t('d.notStarted') }}</span>
        <PillButton class="small" @click="toggleStart">{{ task.start ? t('d.pause') : t('d.start') }} <kbd class="key" aria-hidden="true">s</kbd></PillButton>
      </div>

      <div v-for="op in failed" :key="op.id" class="failed" role="alert">
        <span>{{ op.failure?.message ? t('notice.failed', { d: op.failure.message }) : t('sync.unsent') }}</span>
        <button type="button" class="ulink" @click="gtd.retry(op.id)">{{ t('sync.retry') }}</button>
        <button type="button" class="ulink" @click="gtd.undo(op)">{{ t('d.discard') }}</button>
      </div>

      <DetailField :label="t('d.list')">
        <OptToggle v-for="l in LISTS" :key="l" :pressed="fields.list === l" @click="moveTo(l)">{{ t(`list.${l}`) }}</OptToggle>
      </DetailField>
      <p v-if="needCtx" class="ask" role="alert"><span class="ring-mark" aria-hidden="true" />{{ t('d.needCtx') }}</p>
      <p v-if="problem" class="ask" role="alert">{{ t(problem) }}</p>
      <DetailField :label="t('d.context')" :ask="needCtx">
        <OptToggle v-for="c in contextChoices" :key="c" :pressed="contexts.includes(c)" @click="toggleContext(c)">{{ c }}</OptToggle>
      </DetailField>
      <DetailField :label="t('d.project')" :for="id('project')">
        <input
          :id="id('project')" class="text" list="d-projects" :value="form.project" :placeholder="t('d.noProject')"
          :aria-invalid="!!projectError || undefined" @change="setProject" @keydown.enter="onEnter($event, (e) => e.target.blur())"
        >
        <datalist id="d-projects"><option v-for="p in gtd.projects" :key="p.name" :value="p.name" /></datalist>
        <span v-if="projectError" class="err" role="alert">{{ t(projectError) }}</span>
      </DetailField>
      <DetailField v-if="fields.plan" :label="t('d.today')">
        <OptToggle :pressed="planned" @click="emit('plan', uuid)">{{ planned ? t('d.plannedOn') : t('d.plannedOff') }}</OptToggle>
        <kbd class="key" aria-hidden="true">t</kbd>
      </DetailField>
      <DetailField :label="t('d.due')" :for="id('due')">
        <DayInput :id="id('due')" class="date" :value="form.due" :required="!fields.clearDue" @commit="edit({ due: $event })" />
        <span v-if="due && (due.tone === 'overdue' || due.tone === 'today')" class="tone" :class="due.tone">
          {{ due.tone === 'overdue' ? t('status.overdue') : t('due.today') }}
        </span>
      </DetailField>
      <DetailField :label="t('d.prio')">
        <OptToggle
          v-for="[p, label] in PRIORITIES" :key="p" :pressed="task.priority === p"
          @click="edit({ priority: task.priority === p ? null : p })"
        >{{ t(label) }}</OptToggle>
      </DetailField>
      <DetailMore v-if="more" :task="task" :fields="fields" :others="gtd.open" @edit="edit" @tag="toggleTag" />
      <DetailField :label="t('d.more')">
        <button type="button" class="morelink" :aria-expanded="more" @click="more = !more">
          {{ more ? t('d.less') : [t('d.follow'), t('d.defer'), t('d.until'), t('d.recur'), t('d.tags'), t('d.dep')].join(' · ') }}
        </button>
      </DetailField>

      <section class="notes-sec" :aria-label="t('d.notes')">
        <EyebrowLine :parts="[t('d.notes'), task.annotations?.length || 0]" />
        <ul v-if="task.annotations?.length" class="notes">
          <li v-for="(a, i) in task.annotations" :key="`${a.entry}-${i}`">
            <span class="m">{{ noteDay(a) }}</span><span>{{ a.description }}</span>
          </li>
        </ul>
        <input class="noteadd" :placeholder="t('d.notePh')" :aria-label="t('d.notePh')" @keydown.enter="onEnter($event, addNote)">
      </section>

      <div class="actions">
        <PillButton action @click="emit('check', uuid)">{{ t('d.check') }} <kbd class="key" aria-hidden="true">x</kbd></PillButton>
        <PillButton @click="emit('delete', uuid)">{{ t('cl.delete') }} <kbd class="key" aria-hidden="true">Entf</kbd></PillButton>
      </div>
    </template>

    <p v-else-if="gtd.recurred.includes(uuid)" class="gone">{{ t('d.recurring') }}</p>
    <template v-else-if="gtd.loaded && fallback">
      <h2 v-if="fallback.description" class="title">{{ fallback.description }}</h2>
      <p class="gone">{{ t(fallback.done ? 'shell.taskDone' : 'shell.taskMissing') }}</p>
    </template>
  </div>
</template>

<style scoped>
.mhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mclose { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.mclose:hover { color: var(--rw-text); }
.title {
  margin: 10px 0 4px; font-size: var(--rw-type-title-size); line-height: var(--rw-type-title-line);
  letter-spacing: var(--rw-type-title-tracking); font-weight: var(--rw-type-title-weight); overflow-wrap: anywhere;
}
/* the heading takes the focus when the detail opens (tabindex -1): not a control, so no ring */
h2.title:focus { outline: none; }
.title.edit {
  display: block; width: 100%; resize: none; padding: 0 0 2px; border: 0; border-bottom: 1px solid var(--rw-marker);
  background: transparent; color: var(--rw-text); font-family: inherit;
}
.sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.ulink { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; border-bottom: 1px solid var(--rw-rule-strong); line-height: 1.2; color: var(--rw-text); }
.sub .ulink { border-bottom: 0; color: var(--rw-mute); }
.sub .ulink:hover { color: var(--rw-text); }
.livebar { display: flex; align-items: center; gap: 10px; margin: 12px 0 6px; font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
.livebar :deep(.pill.small) { min-height: 32px; padding: 0 12px; font-size: 12px; margin-left: auto; }
.pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--rw-action); animation: rw-pulse 2s ease-in-out infinite; }
@keyframes rw-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.45); opacity: 0.55; } }
.failed {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 8px 0; padding: 8px 0 8px 12px;
  border-left: 2px solid var(--rw-overdue-edge); font-size: 13px; color: var(--rw-overdue);
}
.deferred { display: flex; align-items: center; gap: 10px; margin: 10px 0 0; font-size: 13.5px; }
.ask { display: flex; align-items: center; gap: 10px; margin: 8px 0 0; font-size: 13.5px; }
.text { flex: 1 1 160px; min-width: 0; border: 0; border-bottom: 1px solid var(--rw-rule-strong); background: transparent; font-size: 14px; padding: 4px 0; outline: 0; }
.text:focus { border-bottom-color: var(--rw-marker); }
.date { border: 0; background: transparent; font-family: var(--rw-font-mono); font-size: 12.5px; color: var(--rw-text); padding: 0; min-height: 30px; }
.tone { font-family: var(--rw-font-mono); font-size: 11px; }
.tone.overdue { color: var(--rw-overdue); }
.err { flex-basis: 100%; font-size: 12.5px; color: var(--rw-overdue); }
.morelink { font-size: 13px; line-height: 1.7; text-align: left; color: var(--rw-mute); border-bottom: 1px dotted var(--rw-rule-strong); }
.morelink:hover { color: var(--rw-text); }
.notes-sec { margin-top: 28px; }
.notes { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
.notes li { display: grid; grid-template-columns: 76px 1fr; gap: 10px; font-size: 13.5px; overflow-wrap: anywhere; }
.notes .m { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); padding-top: 2px; }
.noteadd { width: 100%; margin-top: 8px; padding: 8px 0; border: 0; border-bottom: 1px solid var(--rw-rule-strong); background: transparent; font-size: 13.5px; outline: 0; }
.noteadd:focus { border-bottom-color: var(--rw-marker); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.gone { margin-top: 14px; color: var(--rw-mute); }
.key {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 10.5px; line-height: 1; letter-spacing: 0.02em; color: var(--rw-mute);
}
.pill.action .key { border-color: color-mix(in srgb, var(--rw-on-action) 45%, transparent); color: var(--rw-on-action); }
.ring-mark { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1.5px var(--rw-marker); }
@media (hover: none) { .key { display: none; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
@media (max-width: 760px) {
  .text, .noteadd, .title.edit { font-size: 16px; }
  .date { min-height: 44px; font-size: 16px; }
  .mclose { min-height: 44px; }
}
</style>
