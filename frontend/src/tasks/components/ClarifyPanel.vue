<script setup>
/**
 * The clarify panel (06 `clarifyPanel`, plan M8, brief 0054): one Inbox item, "Was ist es?", and
 * six places for it — Nächste Aktion (`a`, then its context), Warten auf (`w`, then when to follow
 * up), Irgendwann (`v`), Zu einem Projekt (`p`, then the project or a new one, then the first
 * action's context), Gleich erledigt (`x`), Löschen (`Entf`). The open question shows its answers
 * under its choice; nothing is filed without them. The page holds the state (`useClarify`) and the
 * keys; this only shows them and reports clicks.
 */
import { computed, nextTick, ref, watch } from 'vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import ErrorRow from '../../layout/ui/ErrorRow.vue'
import { t } from '../../shared/i18n.js'
import { entryInfo, noteDay } from '../../shared/rowMeta.js'

const props = defineProps({
  task: { type: Object, required: true },
  today: { type: String, required: true },
  /** how many items the Inbox still holds */
  left: { type: Number, required: true },
  /** `{step, project}` (`shared/clarify.js`) */
  state: { type: Object, required: true },
  /** the open question's answers (`stepChoices`) */
  choices: { type: Array, required: true },
  /** a message key: why the typed project name cannot be taken */
  nameError: { type: String, default: '' },
})
const emit = defineEmits(['ask', 'pick', 'file', 'back', 'newProject', 'name', 'edit', 'retry'])

/** The first question's choices, 06's order; `step` is the question it opens. */
const CHOICES = [
  { kind: 'next', key: 'a', label: 'cl.next', why: 'cl.nextWhy', step: 'ctx' },
  { kind: 'waiting', key: 'w', label: 'list.waiting', why: 'cl.waitWhy', step: 'follow' },
  { kind: 'someday', key: 'v', label: 'list.someday', why: 'cl.somedayWhy' },
  { kind: 'project', key: 'p', label: 'cl.project', why: 'cl.projectWhy', step: 'project' },
  { kind: 'done', key: 'x', label: 'cl.done', why: 'cl.doneWhy' },
  { kind: 'delete', key: 'Entf', label: 'cl.delete', why: 'cl.deleteWhy', danger: true },
]
const PROJECT_STEPS = ['project', 'projctx', 'newproject']

const isOpen = (c) => !!c.step && (props.state.step === c.step || (c.step === 'project' && PROJECT_STEPS.includes(props.state.step)))

function choose(c) {
  if (c.step) emit('ask', c.kind)
  else emit('file', c.kind)
}

const question = computed(() => {
  if (props.state.step === 'ctx') return t('cl.whereQ')
  if (props.state.step === 'follow') return t('cl.followQ')
  if (props.state.step === 'projctx') return t('cl.projCtxQ', { p: props.state.project })
  return ''
})

const nameInput = ref(null)
const setNameInput = (el) => {
  nameInput.value = el
}
watch(() => props.state.step === 'newproject', (naming) => {
  if (naming) nextTick(() => nameInput.value?.focus())
})

/** Enter takes the name, Esc goes back to the projects; an IME's own Enter is left alone. */
function onNameKey(event) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('name', event.target.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('back')
  }
}
</script>

<template>
  <div class="clarify">
    <div class="mhead">
      <EyebrowLine :parts="[t('cl.title'), t('cl.left', { n: left })]" />
      <span class="mono">{{ t('d.id', { id: task.uuid.slice(-8) }) }}</span>
    </div>
    <h2 class="title">{{ task.description }}</h2>
    <div class="sub">
      <span>{{ t('row.captured', { d: entryInfo(task, today) }) }}</span>
      <button type="button" class="ulink" @click="emit('edit')">{{ t('keys.edit') }} <kbd class="key" aria-hidden="true">e</kbd></button>
    </div>
    <ul v-if="task.annotations?.length" class="notes">
      <li v-for="(a, i) in task.annotations" :key="`${a.entry}-${i}`"><span class="m">{{ noteDay(a) }}</span><span>{{ a.description }}</span></li>
    </ul>
    <ErrorRow v-if="task.sync === 'failed'" class="unsent" @retry="emit('retry', task.opId)" />

    <p class="question">{{ t('cl.q') }}</p>
    <template v-for="c in CHOICES" :key="c.kind">
      <button
        type="button" class="choice" :class="{ on: isOpen(c), danger: c.danger }"
        :aria-expanded="c.step ? isOpen(c) : undefined" @click="choose(c)"
      >
        <kbd class="key" aria-hidden="true">{{ c.key }}</kbd>
        <span class="lab">{{ t(c.label) }}</span>
        <span class="why">{{ t(c.why) }}</span>
      </button>
      <div v-if="isOpen(c) && state.step === 'newproject'" class="sub-choices naming">
        <input
          :ref="setNameInput" class="name" :placeholder="t('proj.newPh')" :aria-label="t('proj.newPh')" maxlength="100"
          :aria-invalid="!!nameError || undefined" aria-describedby="cl-name-hint" @keydown="onNameKey"
        >
        <span id="cl-name-hint" class="hint" :class="{ bad: nameError }" aria-live="polite">{{ nameError ? t(nameError) : t('cl.newProjHint') }}</span>
      </div>
      <div v-else-if="isOpen(c)" class="sub-choices" role="group" :aria-label="question || t(c.label)">
        <p v-if="question" class="subq">{{ question }}</p>
        <button v-for="ch in choices" :key="ch.value" type="button" class="answer" @click="emit('pick', ch)">
          <kbd v-if="ch.key" class="key" aria-hidden="true">{{ ch.key }}</kbd>{{ ch.label }}<span v-if="ch.hint" class="hint">{{ ch.hint }}</span>
        </button>
        <button v-if="state.step === 'project'" type="button" class="answer new" @click="emit('newProject')">
          <kbd class="key" aria-hidden="true">n</kbd>{{ t('cl.newProject') }}
        </button>
      </div>
    </template>

    <p class="keyhints">
      <span><kbd class="key">j</kbd> <kbd class="key">k</kbd> {{ t('cl.k.move') }}</span>
      <span><kbd class="key">e</kbd> {{ t('cl.k.edit') }}</span>
      <span><kbd class="key">z</kbd> {{ t('cl.k.undo') }}</span>
    </p>
  </div>
</template>

<style scoped>
.mhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mono { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.title {
  margin: 10px 0 4px; font-size: var(--rw-type-title-size); line-height: var(--rw-type-title-line);
  letter-spacing: var(--rw-type-title-tracking); font-weight: var(--rw-type-title-weight); overflow-wrap: anywhere;
}
.sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.ulink { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; color: var(--rw-mute); }
.ulink:hover { color: var(--rw-text); }
.notes { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; }
.notes li { display: grid; grid-template-columns: 76px 1fr; gap: 10px; font-size: 13.5px; overflow-wrap: anywhere; }
.notes .m { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); padding-top: 2px; }
.unsent { margin-top: 10px; }
.question { margin: 22px 0 6px; font-size: 15px; font-weight: 500; }
.choice {
  display: grid; grid-template-columns: 40px auto minmax(0, 1fr); column-gap: 8px; align-items: center;
  width: 100%; min-height: 44px; padding: 0 4px; border-bottom: 1px solid var(--rw-rule); text-align: left;
  transition: background var(--rw-dur-fast);
}
.choice:hover, .choice.on { background: var(--rw-hover); }
.choice .lab { font-size: 14.5px; font-weight: 500; white-space: nowrap; }
.choice .why {
  justify-self: end; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;
  font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute);
}
.choice.danger .lab { color: var(--rw-mute); }
.sub-choices { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 0 14px 38px; border-bottom: 1px solid var(--rw-rule); }
.subq { flex-basis: 100%; margin: 0 0 4px; font-size: 13px; color: var(--rw-mute); }
.answer {
  display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 12px;
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 11.5px; letter-spacing: 0.02em; color: var(--rw-mute); white-space: nowrap;
  transition: background var(--rw-dur-fast), color var(--rw-dur-fast), border-color var(--rw-dur-fast);
}
.answer:hover { color: var(--rw-text); border-color: var(--rw-rule-strong); }
.answer .hint { margin-left: 2px; color: var(--rw-mute); }
.answer.new { border-style: dashed; border-color: var(--rw-rule-strong); color: var(--rw-text); }
.answer .key { min-width: 16px; height: 16px; padding: 0 4px; font-size: 10px; }
.naming { flex-direction: column; align-items: stretch; gap: 8px; }
.name { padding: 6px 0; border: 0; border-bottom: 1px solid var(--rw-marker); outline: 0; background: transparent; font-size: 15px; }
.naming .hint { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.naming .hint.bad { color: var(--rw-overdue); }
.keyhints { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 16px 0 0; font-size: 13px; color: var(--rw-mute); }
.key {
  display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px;
  border: 1px solid var(--rw-rule-strong); border-radius: var(--rw-radius-pill);
  font-family: var(--rw-font-mono); font-size: 10.5px; line-height: 1; letter-spacing: 0.02em; color: var(--rw-mute);
}
.choice .key { justify-self: start; }
@media (hover: none) { .key, .keyhints { display: none; } }
@media (max-width: 760px) {
  .choice { grid-template-columns: auto minmax(0, 1fr); min-height: 52px; }
  .choice .key, .keyhints { display: none; }
  .sub-choices { padding-left: 0; }
  .answer { min-height: 44px; }
  .name { font-size: 16px; }
}
</style>
