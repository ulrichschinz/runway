import { watch, onBeforeUnmount } from 'vue'

// Ref-counted body scroll lock so stacked overlays (modal + sheet + drawer)
// don't unlock the page until the last one closes.
let count = 0
let prevOverflow = ''

function lock() {
  if (count === 0) {
    prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  count++
}

function unlock() {
  if (count === 0) return
  count--
  if (count === 0) document.body.style.overflow = prevOverflow
}

// Locks page scroll while `isOpen` (a ref or getter) is truthy.
export function useScrollLock(isOpen) {
  let locked = false

  const stop = watch(
    () => (typeof isOpen === 'function' ? isOpen() : isOpen.value),
    (open) => {
      if (open && !locked) { lock(); locked = true }
      else if (!open && locked) { unlock(); locked = false }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stop()
    if (locked) { unlock(); locked = false }
  })
}
