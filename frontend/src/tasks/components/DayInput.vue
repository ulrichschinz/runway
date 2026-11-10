<script setup>
/**
 * A day field of the detail (Fällig, Nachhaken/Geplant, Zurückstellen, Läuft ab) that sends
 * one clean value (plan 6.4, brief 0053). A browser's date field fires `change` on every
 * keystroke — an incomplete day, the year as `0002`, `0020`, `0202` — so a value is committed
 * only when `readDay` takes it, and only once it has settled: on leaving the field, on Enter,
 * after a short pause, or when the detail closes. An unfinished entry left behind is put back.
 *
 * Emits `commit` with `YYYY-MM-DD` or `''` (cleared on purpose); `fieldEdit` drops an unchanged one.
 */
import { onBeforeUnmount, ref } from 'vue'
import { committingEnter, readDay } from '../../shared/detailFields.js'

const props = defineProps({
  value: { type: String, default: '' },
})
const emit = defineEmits(['commit'])

/** How long a whole day may stand before it is sent without leaving the field (picker choice). */
const SETTLE_MS = 900

const input = ref(null)
let timer = null

const read = () => (input.value ? readDay(input.value.value, input.value.validity?.badInput) : null)

function cancel() {
  clearTimeout(timer)
  timer = null
}

function commit({ restore = false } = {}) {
  cancel()
  const r = read()
  if (r) {
    if (r.day !== props.value) emit('commit', r.day)
  } else if (restore && input.value) input.value.value = props.value
}

function onChange() {
  cancel()
  if (read()) timer = setTimeout(commit, SETTLE_MS)
}

function onEnter(event) {
  if (!committingEnter(event)) return
  event.preventDefault()
  commit()
}

onBeforeUnmount(() => {
  if (timer) commit()
})
</script>

<template>
  <input
    ref="input" type="date" :value="value"
    @change="onChange" @blur="commit({ restore: true })" @keydown.enter="onEnter"
  >
</template>
