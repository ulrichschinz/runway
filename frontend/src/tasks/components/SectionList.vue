<script setup>
/**
 * A list page's body: section heads, empty lines and rows as one keyed sequence, so a todo
 * that changes section moves instead of being rebuilt, and a todo that leaves keeps its
 * element long enough to be struck through (plan M5: strike 160 ms, collapse 120 ms, out of
 * the DOM and the accessibility tree well within 1 s).
 *
 * A section: `{key, label?, count?, note?, strong?, empty?, kind, tasks}` — no `label`, no head;
 * `empty` is the line shown when it has no tasks.
 */
import { computed } from 'vue'
import EmptyState from '../../layout/ui/EmptyState.vue'
import ListSection from './ListSection.vue'
import TaskLine from './TaskLine.vue'

/** Plan M5's ink strike and collapse. */
const STRIKE_MS = 160
const COLLAPSE_MS = 120

const props = defineProps({
  sections: { type: Array, required: true },
  today: { type: String, required: true },
  cursor: { type: String, default: null },
  /** uuid → 'done' | 'delete': how a row that leaves now goes (`useListPage`) */
  leaving: { type: Map, required: true },
})
defineEmits(['check', 'select', 'retry'])

const items = computed(() =>
  props.sections.flatMap((s) => [
    ...(s.label ? [{ type: 'head', key: `head:${s.key}`, section: s }] : []),
    ...(s.tasks.length === 0 && s.empty ? [{ type: 'empty', key: `empty:${s.key}`, text: s.empty }] : []),
    ...s.tasks.map((task) => ({ type: 'row', key: task.uuid, task, kind: s.kind })),
  ]),
)

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A ticked-off or deleted row: out of the accessibility tree at once, struck, then collapsed. */
function onLeave(el, done) {
  const uuid = el.dataset?.row
  const how = uuid && props.leaving.get(uuid)
  if (!how) {
    done()
    return
  }
  props.leaving.delete(uuid)
  el.setAttribute('aria-hidden', 'true')
  el.inert = true
  el.style.transform = ''
  el.classList.add(how === 'delete' ? 'is-deleted' : 'is-struck')
  setTimeout(() => {
    el.style.height = `${el.offsetHeight}px`
    void el.offsetHeight
    el.classList.add('is-gone')
    setTimeout(done, reduced() ? 0 : COLLAPSE_MS)
  }, STRIKE_MS)
}
</script>

<template>
  <TransitionGroup tag="div" class="list" :css="false" @leave="onLeave">
    <template v-for="item in items" :key="item.key">
      <ListSection
        v-if="item.type === 'head'" :label="item.section.label"
        :count="item.section.count ?? item.section.tasks.length" :note="item.section.note" :strong="item.section.strong"
      />
      <EmptyState v-else-if="item.type === 'empty'" :text="item.text" />
      <TaskLine
        v-else :task="item.task" :kind="item.kind" :today="today" :cursor="cursor === item.task.uuid"
        @check="$emit('check', item.task.uuid)" @select="$emit('select', item.task.uuid)" @retry="$emit('retry', $event)"
      />
    </template>
  </TransitionGroup>
</template>
