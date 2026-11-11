<script setup>
/**
 * A project's plan as one document (plan M13, brief 0060; 06 `planPanel`, the old
 * `ProjectPlanModal`'s five tabs): GTD's Natural Planning Model in German, step after step —
 * 01 Warum (Zweck, Werte und Prinzipien), 02 Vision, 03 Ideen, 04 Ordnen (`Alt ↑` `Alt ↓` move a
 * step, "Aus Ideen übernehmen"), 05 Aktionen ("→ Nächste" makes a step the project's next action:
 * the page's field asks for its context).
 *
 * Saved explicitly: "Speichern", or `⌘S` / `Ctrl+S` inside the document. `Esc` inside it with
 * changes asks "Änderungen am Plan verwerfen?" (Verwerfen · Weiter bearbeiten) and discards only on
 * the answer; without changes it leaves the field. The page holds the draft (`usePlan`), so this
 * document can come and go (a todo's detail takes the margin's place) without losing a word.
 */
import { computed, nextTick, ref } from 'vue'
import EyebrowLine from '../layout/ui/EyebrowLine.vue'
import PillButton from '../layout/ui/PillButton.vue'
import { t } from '../shared/i18n.js'
import { ideasToOrganized, moveItem, withItem, withoutItem } from '../shared/projectPlan.js'

const props = defineProps({
  /** `usePlan`'s state */
  plan: { type: Object, required: true },
  name: { type: String, required: true },
  /** ids of the steps made into next actions on this visit: "✓ angelegt" */
  made: { type: Array, default: () => [] },
})
const emit = defineEmits(['toNext'])

const root = ref(null)
const asking = ref(false)
const keepBtn = ref(null)
const idea = ref('')
const step = ref('')

const draft = computed(() => props.plan.draft)
const ready = computed(() => props.plan.state === 'ready')
/** Ideas "Aus Ideen übernehmen" would add (those not yet among the steps). */
const importable = computed(() => ideasToOrganized(draft.value.brainstorm, draft.value.organized, () => '').length > draft.value.organized.length)
const status = computed(() => {
  const p = props.plan
  if (p.saving) return t('plan.saving')
  if (p.error) return t(p.error.key, { m: p.error.m })
  if (p.dirty) return t('plan.unsaved')
  if (p.savedAt) return t('plan.saved')
  return ''
})

function addIdea() {
  props.plan.set('brainstorm', withItem(draft.value.brainstorm, idea.value, props.plan.newId()))
  idea.value = ''
}
function addStep() {
  props.plan.set('organized', withItem(draft.value.organized, step.value, props.plan.newId()))
  step.value = ''
}
const removeIdea = (id) => props.plan.set('brainstorm', withoutItem(draft.value.brainstorm, id))
const removeStep = (id) => props.plan.set('organized', withoutItem(draft.value.organized, id))
const importIdeas = () => props.plan.set('organized', ideasToOrganized(draft.value.brainstorm, draft.value.organized, props.plan.newId))

/** ↑ / ↓ (and `Alt ↑` / `Alt ↓` on a step's button): the step moves and keeps the focus. */
async function move(i, by, event) {
  const list = draft.value.organized
  const next = moveItem(list, i, by)
  if (next === list) return
  const id = list[i].id
  props.plan.set('organized', next)
  if (!event) return
  await nextTick()
  root.value?.querySelector(`[data-step="${CSS.escape(id)}"] [data-dir="${by < 0 ? 'up' : 'down'}"]`)?.focus()
}
function onStepKey(i, event) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  move(i, event.key === 'ArrowUp' ? -1 : 1, event)
}

async function save() {
  await props.plan.save()
}

/** Where the person was when the question came: the focus goes back there after the answer. */
let askedFrom = null

async function ask() {
  if (!asking.value) askedFrom = document.activeElement
  asking.value = true
  await nextTick()
  keepBtn.value?.$el?.focus?.()
}
/** Close the question and put the focus back (the field typed in), or on the document when that is gone. */
async function answered() {
  const back = askedFrom
  askedFrom = null
  asking.value = false
  await nextTick()
  if (back?.isConnected && root.value?.contains(back) && !back.disabled) back.focus()
  else root.value?.focus()
}
function keep() {
  answered()
}
function discard() {
  props.plan.discard()
  answered()
}

/** Keys inside the document: `⌘S` / `Ctrl+S` saves, `Esc` asks before it discards (see the header). */
function onKey(event) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
    event.preventDefault()
    save()
    return
  }
  if (event.key !== 'Escape' || event.isComposing) return
  if (asking.value) {
    event.stopPropagation()
    keep()
    return
  }
  if (props.plan.dirty) {
    event.preventDefault()
    event.stopPropagation()
    ask()
    return
  }
  if (event.target.matches?.('input, textarea')) {
    event.stopPropagation()
    event.target.blur()
  }
}

/** Enter in a list's field adds the item; an IME's own Enter is left alone. */
function onEnter(add, event) {
  if (event.isComposing) return
  event.preventDefault()
  add()
}
</script>

<template>
  <section ref="root" class="plan" tabindex="-1" :aria-label="`${t('plan.title')}: ${name}`" @keydown="onKey">
    <div class="phead">
      <EyebrowLine :parts="[t('plan.title'), name, t('plan.natural')]" />
      <div v-if="ready" class="bar">
        <PillButton :action="plan.dirty" :disabled="!plan.dirty || plan.saving" @click="save">
          {{ plan.saving ? t('plan.saving') : t('plan.save') }}
        </PillButton>
        <PillButton v-if="plan.dirty && !plan.saving" quiet @click="ask">{{ t('plan.discard') }}</PillButton>
        <span class="status" :class="{ bad: plan.error }" role="status" aria-live="polite">{{ status }}</span>
      </div>
      <p v-if="ready" class="keys">{{ t('plan.keys') }}</p>
      <div v-if="asking" class="ask" role="group" :aria-label="t('plan.discardQ')">
        <p>{{ t('plan.discardQ') }}</p>
        <PillButton @click="discard">{{ t('plan.discard') }}</PillButton>
        <PillButton ref="keepBtn" quiet @click="keep">{{ t('plan.keep') }}</PillButton>
      </div>
    </div>

    <p v-if="plan.state === 'loading'" class="note">{{ t('plan.loading') }}</p>
    <div v-else-if="plan.state === 'failed'" class="note">
      <p>{{ t('plan.loadFailed') }}</p>
      <PillButton quiet @click="plan.load()">{{ t('plan.reload') }}</PillButton>
    </div>

    <template v-else>
      <h3><span class="num">01</span> {{ t('plan.why') }}</h3>
      <p class="hint">{{ t('plan.whyHint') }}</p>
      <label class="field">
        <span class="lab">{{ t('plan.purpose') }}</span>
        <textarea :value="draft.purpose" rows="3" :placeholder="t('plan.purposePh')" @input="plan.set('purpose', $event.target.value)" />
      </label>
      <label class="field">
        <span class="lab">{{ t('plan.principles') }}</span>
        <textarea :value="draft.principles" rows="2" :placeholder="t('plan.principlesPh')" @input="plan.set('principles', $event.target.value)" />
      </label>

      <h3><span class="num">02</span> {{ t('plan.vision') }}</h3>
      <p class="hint">{{ t('plan.visionHint') }}</p>
      <label class="field">
        <span class="lab">{{ t('plan.visionLabel') }}</span>
        <textarea :value="draft.vision" rows="4" class="vision" :placeholder="t('plan.visionPh')" @input="plan.set('vision', $event.target.value)" />
      </label>

      <h3><span class="num">03</span> {{ t('plan.ideas') }}</h3>
      <p class="hint">{{ t('plan.ideasHint') }}</p>
      <ul v-if="draft.brainstorm.length" class="ideas">
        <li v-for="item in draft.brainstorm" :key="item.id">
          <span>{{ item.text }}</span>
          <button type="button" class="x" :aria-label="t('d.remove', { x: item.text })" @click="removeIdea(item.id)">×</button>
        </li>
      </ul>
      <p v-else class="none">{{ t('plan.ideasNone') }}</p>
      <input v-model="idea" class="add" :placeholder="t('plan.ideaPh')" :aria-label="t('plan.ideaPh')" enterkeyhint="done" @keydown.enter="onEnter(addIdea, $event)">

      <h3><span class="num">04</span> {{ t('plan.organize') }} <span class="mute">· Alt ↑ ↓</span></h3>
      <p class="hint">{{ t('plan.organizeHint') }}</p>
      <ol v-if="draft.organized.length" class="steps">
        <li v-for="(item, i) in draft.organized" :key="item.id" :data-step="item.id">
          <span class="txt">{{ item.text }}</span>
          <span class="acts">
            <button
              type="button" data-dir="up" :disabled="i === 0" :aria-label="`${t('plan.up')}: ${item.text}`"
              @click="move(i, -1, $event)" @keydown="onStepKey(i, $event)"
            >↑</button>
            <button
              type="button" data-dir="down" :disabled="i === draft.organized.length - 1" :aria-label="`${t('plan.down')}: ${item.text}`"
              @click="move(i, 1, $event)" @keydown="onStepKey(i, $event)"
            >↓</button>
            <button type="button" class="x" :aria-label="t('d.remove', { x: item.text })" @click="removeStep(item.id)">×</button>
          </span>
        </li>
      </ol>
      <p v-else class="none">{{ t('plan.organizeNone') }}</p>
      <input v-model="step" class="add" :placeholder="t('plan.orderPh')" :aria-label="t('plan.orderPh')" enterkeyhint="done" @keydown.enter="onEnter(addStep, $event)">
      <div v-if="importable" class="more">
        <PillButton quiet @click="importIdeas">{{ t('plan.import') }}</PillButton>
      </div>

      <h3><span class="num">05</span> {{ t('plan.actions') }}</h3>
      <p class="hint">{{ t('plan.actionsP') }}</p>
      <ol v-if="draft.organized.length" class="steps actions">
        <li v-for="item in draft.organized" :key="item.id">
          <span class="txt">{{ item.text }}</span>
          <span v-if="made.includes(item.id)" class="made">{{ t('plan.made') }}</span>
          <button v-else type="button" class="tonext" @click="emit('toNext', item)">{{ t('plan.toNext') }}<span class="sr">: {{ item.text }}</span></button>
        </li>
      </ol>
      <p v-else class="none">{{ t('plan.actionsNone') }}</p>
    </template>
  </section>
</template>

<style scoped>
/* 06 web.css .plan */
.plan:focus { outline: 0; }
.phead { display: grid; row-gap: 10px; }
.bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.status { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.status.bad { color: var(--rw-overdue); }
.keys { margin: 0; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.ask {
  display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; padding: 12px 0;
  border-top: 1px solid var(--rw-marker); border-bottom: 1px solid var(--rw-rule);
}
.ask p { margin: 0; flex: 1 1 100%; font-size: 14px; }
h3 {
  display: flex; gap: 10px; margin: 26px 0 6px; font-family: var(--rw-font-mono); font-size: 11px; font-weight: 400;
  letter-spacing: 0.02em; color: var(--rw-mute);
}
h3 .num { color: var(--rw-text); }
.mute { color: var(--rw-mute); }
.hint, .none, .note { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: var(--rw-mute); }
.note { margin-top: 18px; display: grid; justify-items: start; gap: 8px; }
.note p { margin: 0; }
.field { display: grid; gap: 4px; margin-bottom: 12px; }
.lab { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
textarea, .add {
  width: 100%; border: 0; border-bottom: 1px solid var(--rw-rule-strong); background: transparent; color: var(--rw-text);
  font: inherit; font-size: 14px; line-height: 1.5; padding: 6px 0; outline: 0; resize: vertical;
}
textarea { field-sizing: content; min-height: 3lh; }
/* the marker rule shows the focus, as on the capture line */
textarea:focus, .add:focus { border-bottom-color: var(--rw-marker); }
textarea:focus-visible, .add:focus-visible { outline: 0; }
textarea::placeholder, .add::placeholder { color: var(--rw-soft); }
.vision { font-family: var(--rw-font-serif); font-style: italic; font-weight: 300; font-size: 16px; color: var(--rw-accent); }
.add { min-height: 44px; margin-top: 4px; }
.ideas { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 6px; padding: 0; list-style: none; }
.ideas li {
  display: inline-flex; align-items: center; gap: 2px; padding-left: 10px; font-size: 12.5px; color: var(--rw-text);
  border: 1px solid var(--rw-rule); border-radius: var(--rw-radius-pill);
}
.steps { margin: 0 0 4px; padding: 0; list-style: none; counter-reset: o; }
.steps li {
  counter-increment: o; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 8px; align-items: center;
  min-height: 44px; padding: 4px 0; border-bottom: 1px solid var(--rw-rule); font-size: 13.5px;
}
.steps li::before { content: counter(o, decimal-leading-zero); font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); }
.txt { min-width: 0; overflow-wrap: anywhere; }
.acts { display: inline-flex; }
.acts button, .x, .tonext {
  min-width: 32px; min-height: 36px; padding: 0 6px; font-family: var(--rw-font-mono); font-size: 12px; color: var(--rw-mute);
  border-radius: var(--rw-radius-sm);
}
.acts button:hover:not(:disabled), .x:hover, .tonext:hover { color: var(--rw-text); background: var(--rw-hover); }
.acts button:disabled { opacity: 0.35; cursor: default; }
.x { min-width: 30px; font-size: 14px; }
.tonext { white-space: nowrap; }
.made { font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); white-space: nowrap; }
.more { margin-top: 6px; }
/* keys mean nothing on a touch screen (03: keycaps hidden there) */
@media (hover: none) and (pointer: coarse) { .keys { display: none; } }
@media (max-width: 760px) {
  .acts button, .x, .tonext { min-width: 44px; min-height: 44px; }
}
</style>
