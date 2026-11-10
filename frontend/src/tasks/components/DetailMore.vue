<script setup>
/**
 * The detail's "Mehr" (06 `detailPanel` with `ui.more`): the fields a todo rarely needs —
 * Nachhaken or Geplant, Zurückstellen, Läuft ab, Wiederholen, Tags, Hängt ab von. Each change
 * leaves as one event: `edit` with form fields (`detailFields.js` turns them into the PUT body),
 * `tag` with one tag to toggle.
 */
import { computed, ref } from 'vue'
import { t } from '../../shared/i18n.js'
import { RECUR_PRESETS, committingEnter, extraTagsOf, formOf, readTag } from '../../shared/detailFields.js'
import DayInput from './DayInput.vue'
import DetailField from './DetailField.vue'
import OptToggle from './OptToggle.vue'

const props = defineProps({
  task: { type: Object, required: true },
  /** `detailFields(task, today)` */
  fields: { type: Object, required: true },
  /** every open todo, for "Hängt ab von" */
  others: { type: Array, required: true },
})
const emit = defineEmits(['edit', 'tag'])

const form = computed(() => formOf(props.task))
const tags = computed(() => extraTagsOf(props.task))
const tagError = ref('')
const id = (name) => `d-${name}-${props.task.uuid.slice(-8)}`

const depends = computed(() =>
  form.value.depends.map((uuid) => ({
    uuid, label: props.others.find((o) => o.uuid === uuid)?.description ?? t('d.id', { id: uuid.slice(-8) }),
  })),
)
const addable = computed(() => props.others.filter((o) => o.uuid !== props.task.uuid && !form.value.depends.includes(o.uuid)))

function setRecur(value) {
  const recur = value.trim()
  if (recur === form.value.recur || (!recur && !props.fields.clearRecur)) return
  emit('edit', { recur })
}

function addTag(event) {
  // readTag refuses a tag or context the todo already has, so `tag` only ever adds here.
  const read = readTag(event.target.value, props.task)
  tagError.value = read.error ?? ''
  if (read.error) return
  emit('tag', read.tag)
  event.target.value = ''
}

/** Enter in a text field, but not the one that confirms an IME conversion. */
function onEnter(event, fn) {
  if (!committingEnter(event)) return
  event.preventDefault()
  fn(event)
}

function addDependency(event) {
  if (event.target.value) emit('edit', { depends: [...form.value.depends, event.target.value] })
  event.target.value = ''
}
</script>

<template>
  <DetailField :label="t(fields.scheduled === 'follow' ? 'd.follow' : 'd.scheduled')" :for="id('sched')">
    <DayInput :id="id('sched')" class="date" :value="form.scheduled" @commit="emit('edit', { scheduled: $event })" />
  </DetailField>
  <DetailField :label="t('d.defer')" :for="id('wait')">
    <DayInput :id="id('wait')" class="date" :value="form.wait" @commit="emit('edit', { wait: $event })" />
    <span class="hint">{{ t('d.deferHint') }}</span>
  </DetailField>
  <DetailField :label="t('d.until')" :for="id('until')">
    <DayInput :id="id('until')" class="date" :value="form.until" @commit="emit('edit', { until: $event })" />
  </DetailField>
  <DetailField :label="t('d.recur')">
    <OptToggle
      v-for="r in RECUR_PRESETS" :key="r" :pressed="form.recur === r"
      @click="setRecur(form.recur === r ? '' : r)"
    >{{ t(`d.recur.${r}`) }}</OptToggle>
    <input
      class="text short" :value="RECUR_PRESETS.includes(form.recur) ? '' : form.recur" :placeholder="t('d.recurPh')"
      :aria-label="t('d.recurPh')" @keydown.enter="onEnter($event, (e) => setRecur(e.target.value))"
    >
    <span v-if="!fields.clearRecur" class="hint">{{ t('d.recurKeeps') }}</span>
  </DetailField>
  <DetailField :label="t('d.tags')">
    <span v-for="tag in tags" :key="tag" class="item">
      {{ tag }}<button type="button" class="x" :aria-label="t('d.remove', { x: tag })" @click="emit('tag', tag)">×</button>
    </span>
    <input
      class="text short" :placeholder="t('d.tagPh')" :aria-label="t('d.tagPh')" :aria-invalid="!!tagError || undefined"
      @keydown.enter="onEnter($event, addTag)" @input="tagError = ''"
    >
    <span v-if="tagError" class="err" role="alert">{{ t(tagError) }}</span>
  </DetailField>
  <DetailField :label="t('d.dep')" :for="id('dep')">
    <span v-for="d in depends" :key="d.uuid" class="item">
      <span class="dep">{{ d.label }}</span>
      <button type="button" class="x" :aria-label="t('d.remove', { x: d.label })" @click="emit('edit', { depends: form.depends.filter((u) => u !== d.uuid) })">×</button>
    </span>
    <span v-if="!depends.length" class="hint">{{ t('d.depNone') }}</span>
    <select v-if="addable.length" :id="id('dep')" class="select" @change="addDependency">
      <option value="">{{ t('d.depAdd') }}</option>
      <option v-for="o in addable" :key="o.uuid" :value="o.uuid">{{ o.description }}</option>
    </select>
  </DetailField>
</template>

<style scoped>
.date, .select { border: 0; background: transparent; font-family: var(--rw-font-mono); font-size: 12.5px; color: var(--rw-text); padding: 0; min-height: 30px; }
.select { max-width: 100%; color: var(--rw-mute); }
.text { border: 0; border-bottom: 1px solid var(--rw-rule-strong); background: transparent; font-size: 13px; padding: 4px 0; outline: 0; min-width: 0; }
.text:focus { border-bottom-color: var(--rw-marker); }
.text.short { flex: 1 1 140px; }
.hint { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.item { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; font-family: var(--rw-font-mono); font-size: 12px; }
.dep { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--rw-font-sans); font-size: 13.5px; }
.x { width: 28px; height: 28px; display: inline-grid; place-items: center; color: var(--rw-mute); border-radius: 50%; flex: none; }
.x:hover { color: var(--rw-text); background: var(--rw-hover); }
.err { flex-basis: 100%; font-size: 12.5px; color: var(--rw-overdue); }
@media (max-width: 760px) {
  .x { width: 44px; height: 44px; }
  .date, .select { min-height: 44px; font-size: 16px; }
  .text { font-size: 16px; min-height: 44px; }
}
</style>
